import Vosk from 'vosk';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import https from 'https';
import http from 'http';
import { createWriteStream, existsSync, mkdirSync, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { Extract } from 'unzipper';

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

// Model configuration - using small English model for speed
const MODEL_NAME = 'vosk-model-small-en-us-0.15';
const MODEL_URL = `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`;
const MODELS_DIR = path.join(__dirname, '..', '..', 'models');
const MODEL_PATH = path.join(MODELS_DIR, MODEL_NAME);

let model: Vosk.Model | null = null;
let modelInitializing = false;
let modelInitPromise: Promise<void> | null = null;

/**
 * Download and extract Vosk model if not present
 */
async function downloadModel(): Promise<void> {
    if (existsSync(MODEL_PATH)) {
        console.log('[Transcription] Model already exists at', MODEL_PATH);
        return;
    }

    console.log('[Transcription] Downloading Vosk model...');
    console.log('[Transcription] This is a one-time download (~40MB)');

    // Create models directory
    if (!existsSync(MODELS_DIR)) {
        mkdirSync(MODELS_DIR, { recursive: true });
    }

    const zipPath = path.join(MODELS_DIR, `${MODEL_NAME}.zip`);

    // Download the zip file
    await new Promise<void>((resolve, reject) => {
        const file = createWriteStream(zipPath);
        
        const request = https.get(MODEL_URL, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                https.get(response.headers.location!, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }
        });

        request.on('error', (err) => {
            fs.unlink(zipPath, () => {});
            reject(err);
        });
    });

    console.log('[Transcription] Download complete, extracting...');

    // Extract the zip file using unzipper
    await new Promise<void>((resolve, reject) => {
        createReadStream(zipPath)
            .pipe(Extract({ path: MODELS_DIR }))
            .on('close', resolve)
            .on('error', reject);
    });

    // Clean up zip file
    fs.unlinkSync(zipPath);
    console.log('[Transcription] Model ready at', MODEL_PATH);
}

/**
 * Initialize Vosk model (downloads if needed)
 */
async function initializeModel(): Promise<void> {
    if (model) return;
    
    if (modelInitializing && modelInitPromise) {
        return modelInitPromise;
    }

    modelInitializing = true;
    modelInitPromise = (async () => {
        try {
            // Set log level to errors only
            Vosk.setLogLevel(-1);

            await downloadModel();

            console.log('[Transcription] Loading Vosk model...');
            model = new Vosk.Model(MODEL_PATH);
            console.log('[Transcription] Model loaded successfully');
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
 * Convert audio file to WAV format required by Vosk (16kHz mono PCM)
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

    if (!model) {
        throw new Error('Vosk model not initialized');
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

    // Convert to WAV format required by Vosk
    const wavPath = await convertToWav(audioPath);
    
    try {
        // Create recognizer with word-level timestamps enabled
        const recognizer = new Vosk.Recognizer({
            model: model,
            sampleRate: 16000
        });
        recognizer.setWords(true);
        recognizer.setPartialWords(true);

        // Read and process audio file
        const audioBuffer = fs.readFileSync(wavPath);
        
        // Skip WAV header (44 bytes) and process audio data
        const audioData = audioBuffer.subarray(44);
        
        // Process in chunks for better memory efficiency
        const CHUNK_SIZE = 4000; // ~0.25 seconds at 16kHz
        const words: WordTimestamp[] = [];
        let fullText = '';
        
        for (let i = 0; i < audioData.length; i += CHUNK_SIZE) {
            const chunk = audioData.subarray(i, Math.min(i + CHUNK_SIZE, audioData.length));
            recognizer.acceptWaveform(chunk);
        }

        // Get final result
        const finalResult = recognizer.finalResult();
        
        if (finalResult.result) {
            for (const wordInfo of finalResult.result) {
                words.push({
                    word: wordInfo.word,
                    startTime: wordInfo.start,
                    endTime: wordInfo.end,
                    confidence: wordInfo.conf || 1.0
                });
            }
            fullText = finalResult.text || words.map(w => w.word).join(' ');
        }

        recognizer.free();

        // Calculate duration from last word or file
        const duration = words.length > 0 
            ? words[words.length - 1].endTime 
            : 0;

        console.log(`[Transcription] Completed: ${words.length} words, ${duration.toFixed(2)}s`);

        return {
            text: fullText,
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
        modelLoaded: model !== null,
        modelPath: MODEL_PATH,
        modelExists: existsSync(MODEL_PATH)
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
