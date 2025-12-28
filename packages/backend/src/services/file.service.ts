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

// Auto-cleanup files older than 30 minutes
setInterval(() => {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    for (const [filename, metadata] of files.entries()) {
        if (metadata.createdAt < thirtyMinutesAgo) {
            cleanupFile(metadata.path);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes

/**
 * Clean up all files in temp and uploads directories
 * Preserves .gitkeep files to keep directories in git
 * Returns count of deleted files
 */
export function cleanupAllTempFiles(): { tempDeleted: number; uploadsDeleted: number } {
    let tempDeleted = 0;
    let uploadsDeleted = 0;

    // Clean temp directory
    try {
        if (fs.existsSync(TEMP_DIR)) {
            const tempFiles = fs.readdirSync(TEMP_DIR);
            for (const file of tempFiles) {
                // Skip .gitkeep and other git-related files
                if (file === '.gitkeep' || file.startsWith('.git')) {
                    continue;
                }
                
                const filePath = path.join(TEMP_DIR, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        fs.unlinkSync(filePath);
                        tempDeleted++;
                        files.delete(file);
                    }
                } catch (e) {
                    console.warn(`Failed to delete temp file ${file}:`, e);
                }
            }
        }
    } catch (e) {
        console.error('Error cleaning temp directory:', e);
    }

    // Clean uploads directory
    try {
        if (fs.existsSync(UPLOADS_DIR)) {
            const uploadFiles = fs.readdirSync(UPLOADS_DIR);
            for (const file of uploadFiles) {
                // Skip .gitkeep and other git-related files
                if (file === '.gitkeep' || file.startsWith('.git')) {
                    continue;
                }
                
                const filePath = path.join(UPLOADS_DIR, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        fs.unlinkSync(filePath);
                        uploadsDeleted++;
                    }
                } catch (e) {
                    console.warn(`Failed to delete upload file ${file}:`, e);
                }
            }
        }
    } catch (e) {
        console.error('Error cleaning uploads directory:', e);
    }

    // Clear file tracking map (but not .gitkeep)
    files.clear();

    console.log(`[File Service] Cleanup complete: ${tempDeleted} temp files, ${uploadsDeleted} upload files deleted`);
    return { tempDeleted, uploadsDeleted };
}

/**
 * Get stats about temp files
 */
export function getTempStats(): { tempCount: number; uploadsCount: number; totalSizeBytes: number } {
    let tempCount = 0;
    let uploadsCount = 0;
    let totalSizeBytes = 0;

    try {
        if (fs.existsSync(TEMP_DIR)) {
            const tempFiles = fs.readdirSync(TEMP_DIR);
            for (const file of tempFiles) {
                try {
                    const stat = fs.statSync(path.join(TEMP_DIR, file));
                    if (stat.isFile()) {
                        tempCount++;
                        totalSizeBytes += stat.size;
                    }
                } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* ignore */ }

    try {
        if (fs.existsSync(UPLOADS_DIR)) {
            const uploadFiles = fs.readdirSync(UPLOADS_DIR);
            for (const file of uploadFiles) {
                try {
                    const stat = fs.statSync(path.join(UPLOADS_DIR, file));
                    if (stat.isFile()) {
                        uploadsCount++;
                        totalSizeBytes += stat.size;
                    }
                } catch (e) { /* ignore */ }
            }
        }
    } catch (e) { /* ignore */ }

    return { tempCount, uploadsCount, totalSizeBytes };
}

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
