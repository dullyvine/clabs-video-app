import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { voiceoverRouter } from './routes/voiceover';
import { imagesRouter } from './routes/images';
import { stockVideosRouter } from './routes/stock-videos';
import { videoRouter } from './routes/video';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from uploads and temp directories
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/temp', express.static(path.join(__dirname, '../temp')));

// Routes
app.use('/api/voiceover', voiceoverRouter);
app.use('/api/images', imagesRouter);
app.use('/api/stock-videos', stockVideosRouter);
app.use('/api/video', videoRouter);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        error: err.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Uploads directory: ${path.join(__dirname, '../uploads')}`);
    console.log(`📁 Temp directory: ${path.join(__dirname, '../temp')}`);
});
