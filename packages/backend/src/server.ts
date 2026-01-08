import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { voiceoverRouter } from './routes/voiceover';
import { imagesRouter } from './routes/images';
import { stockVideosRouter } from './routes/stock-videos';
import { videoRouter } from './routes/video';
import { chatRouter } from './routes/chat';
import { authRouter } from './routes/auth';
import { projectsRouter } from './routes/projects';
import { cleanupAllTempFiles, getTempStats, cleanupUserFiles } from './services/file.service';
import { preloadTranscriptionModel } from './services/transcription.service';
import { clearAllJobs, getAllJobs, clearUserJobs } from './utils/jobs';
import { isDatabaseAvailable, getConnectionInfo, cleanupExpiredSessions } from './services/db.service';
import { optionalAuth } from './middleware/auth.middleware';

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
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/voiceover', voiceoverRouter);
app.use('/api/images', imagesRouter);
app.use('/api/stock-videos', stockVideosRouter);
app.use('/api/video', videoRouter);
app.use('/api/chat', chatRouter);

// Cleanup endpoint - deletes temp files and resets job state
// User-scoped cleanup when authenticated, global cleanup otherwise
app.post('/api/cleanup', optionalAuth, async (req, res) => {
    try {
        const userId = req.userId;
        
        let fileStats: { tempDeleted: number; uploadsDeleted: number };
        let jobsCleared: number;
        
        if (userId) {
            // User-scoped cleanup - only clear the authenticated user's files and jobs
            fileStats = await cleanupUserFiles(userId);
            jobsCleared = await clearUserJobs(userId);
            console.log(`[Cleanup] User ${userId}: ${fileStats.tempDeleted} temp files, ${fileStats.uploadsDeleted} uploads, ${jobsCleared} jobs cleared`);
        } else {
            // Non-authenticated cleanup - clear all (backward compatibility)
            fileStats = cleanupAllTempFiles();
            jobsCleared = clearAllJobs();
            console.log(`[Cleanup] Global: ${fileStats.tempDeleted} temp files, ${fileStats.uploadsDeleted} uploads, ${jobsCleared} jobs cleared`);
        }
        
        res.json({
            success: true,
            message: userId ? 'Your temporary files and job data cleared' : 'All temporary files and job data cleared',
            filesDeleted: fileStats.tempDeleted + fileStats.uploadsDeleted,
            tempFilesDeleted: fileStats.tempDeleted,
            uploadsDeleted: fileStats.uploadsDeleted,
            jobsCleared,
            userScoped: !!userId
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
    const dbInfo = getConnectionInfo();
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: {
            available: isDatabaseAvailable(),
            host: dbInfo.host
        }
    });
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
    
    // Log database status
    const dbInfo = getConnectionInfo();
    if (isDatabaseAvailable()) {
        console.log(`🗄️  Database connected: ${dbInfo.host}`);
        
        // Start periodic session cleanup (every hour)
        setInterval(async () => {
            try {
                const cleaned = await cleanupExpiredSessions();
                if (cleaned > 0) {
                    console.log(`[Auth] Cleaned up ${cleaned} expired sessions`);
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }, 60 * 60 * 1000);
    } else {
        console.log('⚠️  Database not configured - running in anonymous mode');
    }
    
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📁 Uploads directory: ${path.join(__dirname, '../uploads')}`);
    console.log(`📁 Temp directory: ${path.join(__dirname, '../temp')}`);
});
