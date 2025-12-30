import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import WaveFile from 'wavefile';

// Word-level timestamp from transcription
export interface WordTimestamp {
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
}

export interface TranscriptionResult {
    text: string;
    words: WordTimestamp[];
    duration: number;
}

// Whisper model configuration - using tiny.en for speed and accuracy
const MODEL_NAME = 'Xenova/whisper-tiny.en';

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let modelInitializing = false;
let modelInitPromise: Promise<void> | null = null;

/**
 * Initialize Whisper model using Transformers.js
 * Model is automatically downloaded and cached by the library
 */
async function initializeModel(): Promise<void> {
    if (transcriber) return;
    
    if (modelInitializing && modelInitPromise) {
        return modelInitPromise;
    }

    modelInitializing = true;
    modelInitPromise = (async () => {
        try {
            console.log('[Transcription] Loading Whisper model (first run downloads ~40MB)...');
            
            // Create the ASR pipeline with Whisper
            transcriber = await pipeline(
                'automatic-speech-recognition',
                MODEL_NAME,
                { 
                    dtype: 'fp32',
                    device: 'cpu'
                }
            ) as AutomaticSpeechRecognitionPipeline;
            
            console.log('[Transcription] Whisper model loaded successfully');
        } catch (error) {
            console.error('[Transcription] Failed to initialize model:', error);
            throw error;
        } finally {
            modelInitializing = false;
        }
    })();

    return modelInitPromise;
}

/**
 * Convert audio file to WAV format required by Whisper (16kHz mono)
 */
async function convertToWav(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace(/\.[^.]+$/, '_converted.wav');
    
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-ar', '16000',      // 16kHz sample rate
            '-ac', '1',          // Mono
            '-f', 'wav',         // WAV format
            '-acodec', 'pcm_s16le', // 16-bit PCM
            '-y',                // Overwrite output
            outputPath
        ]);

        let stderr = '';
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`FFmpeg conversion failed: ${stderr}`));
            }
        });

        ffmpeg.on('error', reject);
    });
}

/**
 * Load WAV file and convert to Float32Array for Whisper
 */
function loadAudioData(wavPath: string): Float32Array {
    const buffer = fs.readFileSync(wavPath);
    const wav = new WaveFile.WaveFile(buffer);
    
    // Convert to 32-bit float
    wav.toBitDepth('32f');
    
    // Get samples
    let samples = wav.getSamples() as Float32Array | Float32Array[];
    
    // If stereo, merge channels
    if (Array.isArray(samples)) {
        if (samples.length > 1) {
            const SCALING_FACTOR = Math.sqrt(2);
            const merged = new Float32Array(samples[0].length);
            for (let i = 0; i < samples[0].length; i++) {
                merged[i] = SCALING_FACTOR * (samples[0][i] + samples[1][i]) / 2;
            }
            return merged;
        }
        return samples[0];
    }
    
    return samples;
}

/**
 * Download audio file from URL to local temp path
 * Returns { path, isTemporary } - isTemporary indicates if we created a new file that should be cleaned up
 */
async function downloadAudio(url: string, tempDir: string): Promise<{ path: string; isTemporary: boolean }> {
    const fileName = `audio_${Date.now()}.mp3`;
    const filePath = path.join(tempDir, fileName);

    // Handle local URLs (from our own server) - DO NOT mark as temporary since these are the original files
    if (url.startsWith('/temp/') || url.startsWith('/uploads/')) {
        const localPath = path.join(__dirname, '..', '..', url);
        if (existsSync(localPath)) {
            return { path: localPath, isTemporary: false };
        }
    }

    // Handle full URLs - these are downloaded copies that should be cleaned up
    const protocol = url.startsWith('https') ? https : http;
    
    return new Promise((resolve, reject) => {
        const file = createWriteStream(filePath);
        
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectProtocol = response.headers.location!.startsWith('https') ? https : http;
                redirectProtocol.get(response.headers.location!, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve({ path: filePath, isTemporary: true });
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve({ path: filePath, isTemporary: true });
                });
            }
        }).on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

/**
 * Transcribe audio file and return word-level timestamps
 * This is the main function to use for accurate caption alignment
 * Uses Whisper via Transformers.js for high accuracy transcription
 */
export async function transcribeAudio(
    audioSource: string,
    options?: {
        tempDir?: string;
    }
): Promise<TranscriptionResult> {
    const tempDir = options?.tempDir || path.join(__dirname, '..', '..', 'temp');
    
    // Ensure temp directory exists
    if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
    }

    // Initialize model if needed
    await initializeModel();

    if (!transcriber) {
        throw new Error('Whisper model not initialized');
    }

    console.log('[Transcription] Starting transcription for:', audioSource);

    // Download audio if it's a URL
    let audioPath = audioSource;
    let shouldCleanupAudio = false;
    
    if (audioSource.startsWith('http') || audioSource.startsWith('/temp/') || audioSource.startsWith('/uploads/')) {
        const result = await downloadAudio(audioSource, tempDir);
        audioPath = result.path;
        shouldCleanupAudio = result.isTemporary;
    }

    // Convert to WAV format required by Whisper
    const wavPath = await convertToWav(audioPath);
    
    try {
        // Load audio data as Float32Array
        const audioData = loadAudioData(wavPath);
        
        // Transcribe with word-level timestamps
        const result = await transcriber(audioData, {
            return_timestamps: 'word',
            chunk_length_s: 30,
            stride_length_s: 5
        });

        // Convert Whisper output to our WordTimestamp format
        const words: WordTimestamp[] = [];
        
        if (result.chunks && Array.isArray(result.chunks)) {
            for (const chunk of result.chunks) {
                if (chunk.text && chunk.timestamp) {
                    const [start, end] = chunk.timestamp;
                    words.push({
                        word: chunk.text.trim(),
                        startTime: start ?? 0,
                        endTime: end ?? start ?? 0,
                        confidence: 1.0 // Whisper doesn't provide per-word confidence
                    });
                }
            }
        }

        const fullText = result.text || words.map(w => w.word).join(' ');

        // Calculate duration from last word
        const duration = words.length > 0 
            ? words[words.length - 1].endTime 
            : 0;

        console.log(`[Transcription] Completed: ${words.length} words, ${duration.toFixed(2)}s`);

        return {
            text: fullText.trim(),
            words,
            duration
        };

    } finally {
        // Clean up temporary files - ONLY the WAV conversion and downloaded copies, NOT original voiceover files
        if (existsSync(wavPath)) {
            fs.unlinkSync(wavPath);
        }
        if (shouldCleanupAudio && existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
    }
}

/**
 * Get transcription status - useful for checking if model is ready
 */
export function getTranscriptionStatus(): {
    modelLoaded: boolean;
    modelPath: string;
    modelExists: boolean;
} {
    return {
        modelLoaded: transcriber !== null,
        modelPath: MODEL_NAME,
        modelExists: true // Transformers.js handles caching automatically
    };
}

/**
 * Pre-initialize model (call on server startup for faster first transcription)
 */
export async function preloadTranscriptionModel(): Promise<void> {
    try {
        await initializeModel();
    } catch (error) {
        console.warn('[Transcription] Failed to preload model:', error);
    }
}
