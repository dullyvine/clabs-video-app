/**
 * Transcription Worker using @huggingface/transformers (Whisper)
 * 
 * Uses the Xenova/whisper-tiny.en model for:
 * - Fast transcription (~40MB model)
 * - Accurate word-level timestamps
 * - Free and offline (no API keys needed)
 * - Cross-platform (works on Windows/Mac/Linux)
 * 
 * This worker runs in a separate thread to not block the main server process.
 */

import { parentPort } from 'worker_threads';
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { WaveFile } from 'wavefile';

// Word-level timestamp from transcription
interface WordTimestamp {
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
}

interface TranscriptionResult {
    text: string;
    words: WordTimestamp[];
    duration: number;
}

interface TranscriptionOptions {
    tempDir?: string;
}

interface WarmupMessage {
    type: 'warmup';
}

interface TranscriptionMessage {
    type: 'transcribe';
    id: string;
    audioSource: string;
    options?: TranscriptionOptions;
}

type WorkerMessage = WarmupMessage | TranscriptionMessage;

// Whisper model configuration - using tiny.en for speed and accuracy
const MODEL_NAME = 'Xenova/whisper-tiny.en';

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let modelReady = false;
let modelInitializing = false;
let modelInitPromise: Promise<void> | null = null;

function sendReady() {
    if (modelReady) return;
    modelReady = true;
    parentPort?.postMessage({ type: 'ready' });
}

/**
 * Initialize Whisper model using Transformers.js
 * Model is automatically downloaded and cached by the library
 */
async function initializeModel(): Promise<void> {
    if (transcriber && modelReady) return;

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
            sendReady();
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
async function convertToWav(inputPath: string, tempDir: string): Promise<string> {
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(tempDir, `${baseName}_converted_${Date.now()}.wav`);

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-ar', '16000',      // 16kHz sample rate (required by whisper)
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
                const redirectUrl = response.headers.location!;
                const redirectProtocol = redirectUrl.startsWith('https') ? https : http;
                redirectProtocol.get(redirectUrl, (redirectResponse) => {
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
 * Load WAV file and convert to Float32Array for Whisper
 */
function loadAudioData(wavPath: string): Float32Array {
    const buffer = fs.readFileSync(wavPath);
    const wav = new WaveFile(buffer);

    // Convert to 32-bit float
    wav.toBitDepth('32f');

    // Get samples - wavefile returns Float64Array after toBitDepth('32f'), we need to convert
    const rawSamples = wav.getSamples();

    // Handle stereo vs mono
    if (Array.isArray(rawSamples)) {
        // Stereo - merge channels
        const channel0 = rawSamples[0] as unknown as number[];
        const channel1 = rawSamples[1] as unknown as number[];

        if (rawSamples.length > 1 && channel1) {
            const SCALING_FACTOR = Math.sqrt(2);
            const merged = new Float32Array(channel0.length);
            for (let i = 0; i < channel0.length; i++) {
                merged[i] = SCALING_FACTOR * (channel0[i] + channel1[i]) / 2;
            }
            return merged;
        }
        // Mono in array form
        return new Float32Array(channel0);
    }

    // Single channel - convert to Float32Array
    return new Float32Array(rawSamples as unknown as number[]);
}

/**
 * Transcribe audio file and return word-level timestamps
 * This is the main function to use for accurate caption alignment
 * Uses Whisper via Transformers.js for high accuracy transcription
 */
async function transcribeAudio(
    audioSource: string,
    options?: TranscriptionOptions
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
    const wavPath = await convertToWav(audioPath, tempDir);

    try {
        // Load audio data as Float32Array
        const audioData = loadAudioData(wavPath);

        console.log('[Transcription] Running Whisper on:', path.basename(wavPath));
        console.log('[Transcription] Audio data length:', audioData.length, 'samples');

        // Transcribe with word-level timestamps
        const rawResult = await transcriber(audioData, {
            return_timestamps: 'word',
            chunk_length_s: 30,
            stride_length_s: 5
        });

        // Handle both single result and array result types
        const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

        // Debug: log the raw result structure
        console.log('[Transcription] Raw result keys:', Object.keys(result || {}));
        console.log('[Transcription] Result text:', (result as any)?.text?.substring(0, 200));

        // Convert Whisper output to our WordTimestamp format
        const words: WordTimestamp[] = [];
        if (result && 'chunks' in result && result.chunks && Array.isArray(result.chunks)) {
            console.log('[Transcription] Chunks count:', result.chunks.length);
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

        const fullText = (result && 'text' in result ? result.text : '') || words.map(w => w.word).join(' ');

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
        try {
            if (existsSync(wavPath)) {
                fs.unlinkSync(wavPath);
            }
            if (shouldCleanupAudio && existsSync(audioPath)) {
                fs.unlinkSync(audioPath);
            }
        } catch (cleanupError) {
            // Ignore cleanup errors - not critical
        }
    }
}

function serializeError(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return { message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}

// Handle messages from the main thread
parentPort?.on('message', async (message: WorkerMessage) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'warmup') {
        try {
            await initializeModel();
            sendReady();
        } catch (error) {
            parentPort?.postMessage({ type: 'error', error: serializeError(error) });
        }
        return;
    }

    if (message.type !== 'transcribe') return;

    try {
        const result = await transcribeAudio(message.audioSource, message.options);
        parentPort?.postMessage({ type: 'result', id: message.id, result });
    } catch (error) {
        parentPort?.postMessage({ type: 'error', id: message.id, error: serializeError(error) });
    }
});
