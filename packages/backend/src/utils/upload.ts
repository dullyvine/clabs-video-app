import multer from 'multer';
import path from 'path';

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Go up from src/utils to root, then to uploads
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

export const upload = multer({ storage });
