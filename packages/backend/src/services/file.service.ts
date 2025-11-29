import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const TEMP_DIR = path.join(__dirname, '../../temp');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// File tracking for cleanup
interface FileMetadata {
    path: string;
    createdAt: number;
    jobId?: string;
}

const files = new Map<string, FileMetadata>();

export function getTempFilePath(extension: string, jobId?: string): string {
    const filename = `${uuidv4()}.${extension}`;
    const filepath = path.join(TEMP_DIR, filename);

    files.set(filename, {
        path: filepath,
        createdAt: Date.now(),
        jobId
    });

    return filepath;
}

export function getUploadFilePath(extension: string): string {
    const filename = `${uuidv4()}.${extension}`;
    return path.join(UPLOADS_DIR, filename);
}

export function trackFile(filepath: string, jobId?: string): void {
    files.set(path.basename(filepath), {
        path: filepath,
        createdAt: Date.now(),
        jobId
    });
}

export function cleanupFile(filepath: string): void {
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        files.delete(path.basename(filepath));
    } catch (error) {
        console.error(`Failed to cleanup file ${filepath}:`, error);
    }
}

export function cleanupJobFiles(jobId: string): void {
    for (const [filename, metadata] of files.entries()) {
        if (metadata.jobId === jobId) {
            cleanupFile(metadata.path);
        }
    }
}

// Auto-cleanup files older than 1 hour
setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [filename, metadata] of files.entries()) {
        if (metadata.createdAt < oneHourAgo) {
            cleanupFile(metadata.path);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
