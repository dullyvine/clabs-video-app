import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { voiceoverRouter } from './routes/voiceover';
import { imagesRouter } from './routes/images';
import { stockVideosRouter } from './routes/stock-videos';
import { videoRouter } from './routes/video';
import { chatRouter } from './routes/chat';
import { cleanupAllTempFiles, getTempStats } from './services/file.service';
import { preloadTranscriptionModel } from './services/transcription.service';
import { clearAllJobs, getAllJobs } from './utils/jobs';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());

// Increase payload limits for long video scripts and transcription data
// 50MB limit allows for very long videos (2+ hours) with full transcription data
// This does NOT use 50MB of RAM constantly - only when processing large requests
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from uploads and temp directories
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/temp', express.static(path.join(__dirname, '../temp')));

// Routes
app.use('/api/voiceover', voiceoverRouter);
app.use('/api/images', imagesRouter);
app.use('/api/stock-videos', stockVideosRouter);
app.use('/api/video', videoRouter);
app.use('/api/chat', chatRouter);

// Cleanup endpoint - deletes all temp files and resets job state
app.post('/api/cleanup', (req, res) => {
    try {
        const fileStats = cleanupAllTempFiles();
        const jobsCleared = clearAllJobs();
        
        res.json({
            success: true,
            message: 'All temporary files and job data cleared',
            filesDeleted: fileStats.tempDeleted + fileStats.uploadsDeleted,
            tempFilesDeleted: fileStats.tempDeleted,
            uploadsDeleted: fileStats.uploadsDeleted,
            jobsCleared
        });
    } catch (error: any) {
        console.error('[Cleanup] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to cleanup files'
        });
    }
});

// Get temp storage stats
app.get('/api/storage-stats', (req, res) => {
    try {
        const stats = getTempStats();
        const jobs = getAllJobs();
        
        res.json({
            ...stats,
            activeJobs: jobs.filter(j => j.status === 'processing').length,
            totalJobs: jobs.length
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

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
    preloadTranscriptionModel();
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Uploads directory: ${path.join(__dirname, '../uploads')}`);
    console.log(`📁 Temp directory: ${path.join(__dirname, '../temp')}`);
});
