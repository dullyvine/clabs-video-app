import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';

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

interface TranscriptionOptions {
    tempDir?: string;
}

interface WorkerWarmupMessage {
    type: 'warmup';
}

interface WorkerTranscribeMessage {
    type: 'transcribe';
    id: string;
    audioSource: string;
    options?: TranscriptionOptions;
}

type WorkerRequestMessage = WorkerWarmupMessage | WorkerTranscribeMessage;

interface WorkerResultMessage {
    type: 'result';
    id: string;
    result: TranscriptionResult;
}

interface WorkerErrorMessage {
    type: 'error';
    id?: string;
    error: {
        message: string;
        stack?: string;
    };
}

interface WorkerReadyMessage {
    type: 'ready';
}

type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage | WorkerReadyMessage;

interface PendingJob {
    resolve: (result: TranscriptionResult) => void;
    reject: (error: Error) => void;
    request: WorkerTranscribeMessage;
}

// Whisper model configuration - using tiny.en for speed and accuracy
const MODEL_NAME = 'Xenova/whisper-tiny.en';

let worker: Worker | null = null;
let workerBusy = false;
let workerReady = false;
const queue: WorkerTranscribeMessage[] = [];
const pending = new Map<string, PendingJob>();

function getWorkerPath() {
    const tsPath = path.join(__dirname, '..', 'workers', 'transcription.worker.ts');
    if (fs.existsSync(tsPath)) {
        return tsPath;
    }
    return path.join(__dirname, '..', 'workers', 'transcription.worker.js');
}

function createWorker() {
    const workerPath = getWorkerPath();
    const execArgv = workerPath.endsWith('.ts') ? ['-r', 'tsx/cjs'] : [];
    const newWorker = new Worker(workerPath, { execArgv });

    newWorker.on('message', (message: WorkerResponseMessage) => {
        if (!message || typeof message !== 'object') return;

        if (message.type === 'ready') {
            workerReady = true;
            return;
        }

        if (message.type === 'error' && !message.id) {
            console.warn('[Transcription] Worker warmup failed:', message.error?.message || 'Unknown error');
            return;
        }

        const jobId = (message as WorkerResultMessage | WorkerErrorMessage).id;
        if (!jobId) return;

        const pendingJob = pending.get(jobId);
        if (!pendingJob) return;

        pending.delete(jobId);
        workerBusy = false;

        if (message.type === 'result') {
            pendingJob.resolve(message.result);
        } else if (message.type === 'error') {
            const error = new Error(message.error?.message || 'Transcription worker failed');
            if (message.error?.stack) {
                error.stack = message.error.stack;
            }
            pendingJob.reject(error);
        } else {
            pendingJob.reject(new Error('Unexpected transcription worker response'));
        }

        runNext();
    });

    newWorker.on('error', (error) => {
        console.error('[Transcription] Worker error:', error);
        resetWorker(error);
    });

    newWorker.on('exit', (code) => {
        if (code !== 0) {
            resetWorker(new Error(`Transcription worker exited with code ${code}`));
        } else {
            resetWorker(new Error('Transcription worker exited'));
        }
    });

    return newWorker;
}

function ensureWorker() {
    if (!worker) {
        worker = createWorker();
    }
    return worker;
}

function runNext() {
    if (!worker || workerBusy || queue.length === 0) return;

    const nextJob = queue.shift();
    if (!nextJob) return;

    workerBusy = true;
    worker.postMessage(nextJob);
}

function resetWorker(error: Error) {
    if (worker) {
        worker.removeAllListeners();
        worker = null;
    }

    workerBusy = false;
    workerReady = false;
    queue.length = 0;

    for (const pendingJob of pending.values()) {
        pendingJob.reject(error);
    }
    pending.clear();
}

/**
 * Transcribe audio file and return word-level timestamps
 * This is the main function to use for accurate caption alignment
 * Uses nodejs-whisper (native whisper.cpp) for fast, accurate transcription
 */
export async function transcribeAudio(
    audioSource: string,
    options?: TranscriptionOptions
): Promise<TranscriptionResult> {
    ensureWorker();

    const jobId = randomUUID();
    const request: WorkerTranscribeMessage = {
        type: 'transcribe',
        id: jobId,
        audioSource,
        options
    };

    return new Promise((resolve, reject) => {
        pending.set(jobId, { resolve, reject, request });
        queue.push(request);
        runNext();
    });
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
        modelLoaded: workerReady,
        modelPath: MODEL_NAME,
        modelExists: true // Transformers.js handles caching automatically
    };
}

/**
 * Pre-initialize model (call on server startup for faster first transcription)
 */
export async function preloadTranscriptionModel(): Promise<void> {
    try {
        const activeWorker = ensureWorker();
        if (workerReady) return;
        const message: WorkerRequestMessage = { type: 'warmup' };
        activeWorker.postMessage(message);
    } catch (error) {
        console.warn('[Transcription] Failed to preload model:', error);
    }
}
