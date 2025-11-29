import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../../temp');
const uploadsDir = path.join(__dirname, '../../uploads');

// Create directories if they don't exist
[tempDir, uploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

/**
 * General file upload storage (for permanent files if needed)
 * Files go to /uploads directory
 */
const uploadsStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

/**
 * Temporary file upload storage (for overlays, etc.)
 * Files go to /temp directory and will be cleaned up after video generation
 */
const tempStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `overlay-${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

// Default upload (to uploads folder)
export const upload = multer({ storage: uploadsStorage });

// Temporary upload (to temp folder - for overlays)
export const tempUpload = multer({ storage: tempStorage });
