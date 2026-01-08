import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db.service';

const TEMP_DIR = path.join(__dirname, '../../temp');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// In-memory file tracking for non-authenticated users (fallback)
interface FileMetadata {
    path: string;
    createdAt: number;
    jobId?: string;
    userId?: string;
}

const files = new Map<string, FileMetadata>();

/**
 * Get temp file path and optionally track in database for authenticated users
 */
export async function getTempFilePathAsync(
    extension: string, 
    options?: { jobId?: string; userId?: string; projectId?: string }
): Promise<string> {
    const filename = `${uuidv4()}.${extension}`;
    const filepath = path.join(TEMP_DIR, filename);

    // Track in memory (fallback)
    files.set(filename, {
        path: filepath,
        createdAt: Date.now(),
        jobId: options?.jobId,
        userId: options?.userId
    });

    // If user is authenticated, also track in database
    if (options?.userId) {
        try {
            await db.trackFile({
                id: filename,
                userId: options.userId,
                projectId: options.projectId,
                jobId: options.jobId,
                filePath: filepath,
                fileType: 'temp',
                mimeType: getMimeType(extension)
            });
        } catch (error) {
            console.warn('[File Service] Failed to track file in DB:', error);
            // Continue - file still tracked in memory
        }
    }

    return filepath;
}

/**
 * Sync version for backward compatibility (non-authenticated flows)
 */
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

/**
 * Track a file - with optional database persistence for authenticated users
 */
export async function trackFileAsync(
    filepath: string, 
    options?: { jobId?: string; userId?: string; projectId?: string; fileType?: 'temp' | 'upload' | 'output' }
): Promise<void> {
    const filename = path.basename(filepath);
    
    files.set(filename, {
        path: filepath,
        createdAt: Date.now(),
        jobId: options?.jobId,
        userId: options?.userId
    });

    if (options?.userId) {
        try {
            const ext = path.extname(filepath).slice(1);
            await db.trackFile({
                id: filename,
                userId: options.userId,
                projectId: options.projectId,
                jobId: options.jobId,
                filePath: filepath,
                fileType: options.fileType || 'temp',
                mimeType: getMimeType(ext)
            });
        } catch (error) {
            console.warn('[File Service] Failed to track file in DB:', error);
        }
    }
}

/**
 * Sync version for backward compatibility
 */
export function trackFile(filepath: string, jobId?: string): void {
    files.set(path.basename(filepath), {
        path: filepath,
        createdAt: Date.now(),
        jobId
    });
}

/**
 * Cleanup a single file - removes from disk and database
 */
export async function cleanupFileAsync(filepath: string, userId?: string): Promise<void> {
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
        const filename = path.basename(filepath);
        files.delete(filename);

        // If user provided, also remove from database
        if (userId) {
            try {
                await db.deleteFile(filename);
            } catch (error) {
                console.warn('[File Service] Failed to delete file from DB:', error);
            }
        }
    } catch (error) {
        console.error(`Failed to cleanup file ${filepath}:`, error);
    }
}

/**
 * Sync version for backward compatibility
 */
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

/**
 * Cleanup all files for a specific job
 */
export async function cleanupJobFilesAsync(jobId: string, userId?: string): Promise<void> {
    // Clean from in-memory tracking
    for (const [filename, metadata] of files.entries()) {
        if (metadata.jobId === jobId) {
            cleanupFile(metadata.path);
        }
    }

    // Clean from database if user specified
    if (userId) {
        try {
            const dbFiles = await db.getFilesByJobId(jobId);
            for (const file of dbFiles) {
                await cleanupFileAsync(file.file_path, userId);
            }
        } catch (error) {
            console.warn('[File Service] Failed to cleanup job files from DB:', error);
        }
    }
}

/**
 * Sync version for backward compatibility
 */
export function cleanupJobFiles(jobId: string): void {
    for (const [filename, metadata] of files.entries()) {
        if (metadata.jobId === jobId) {
            cleanupFile(metadata.path);
        }
    }
}

/**
 * Helper to determine mime type from extension
 */
function getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'json': 'application/json',
        'txt': 'text/plain'
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

// Auto-cleanup files older than 30 minutes (for non-authenticated files only)
setInterval(() => {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    for (const [filename, metadata] of files.entries()) {
        // Only auto-cleanup non-user files
        if (!metadata.userId && metadata.createdAt < thirtyMinutesAgo) {
            cleanupFile(metadata.path);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes

/**
 * Clean up all files for a specific user (user-scoped cleanup)
 * Only deletes files owned by the specified user
 */
export async function cleanupUserFiles(userId: string): Promise<{ tempDeleted: number; uploadsDeleted: number }> {
    let tempDeleted = 0;
    let uploadsDeleted = 0;

    try {
        // Get all files for this user from database
        const userFiles = await db.getFilesByUserId(userId);
        
        for (const file of userFiles) {
            try {
                if (fs.existsSync(file.file_path)) {
                    fs.unlinkSync(file.file_path);
                    if (file.file_type === 'temp' || file.file_type === 'output') {
                        tempDeleted++;
                    } else if (file.file_type === 'upload') {
                        uploadsDeleted++;
                    }
                }
                // Remove from memory tracking
                files.delete(file.id);
            } catch (e) {
                console.warn(`Failed to delete user file ${file.file_path}:`, e);
            }
        }

        // Delete all user's files from database
        await db.deleteUserFiles(userId);

        console.log(`[File Service] User cleanup complete for ${userId}: ${tempDeleted} temp files, ${uploadsDeleted} upload files deleted`);
    } catch (error) {
        console.error('[File Service] Error during user cleanup:', error);
    }

    return { tempDeleted, uploadsDeleted };
}

/**
 * Clean up all files in temp and uploads directories
 * For non-authenticated usage - cleans everything
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
