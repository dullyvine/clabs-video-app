import express from 'express';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import {
    VideoGenerationRequest,
    VideoGenerationResponse,
    JobStatus
} from 'shared/src/types';
import {
    generateSingleImageVideo,
    generateMultiImageVideo,
    generateStockVideoComposition
} from '../services/ffmpeg.service';
import { createJob, updateJob, getJob } from '../utils/jobs';
import { getTempFilePath, trackFile } from '../services/file.service';
import { tempUpload } from '../utils/upload';

export const videoRouter = express.Router();

// Generate final video
videoRouter.post('/generate', async (req, res) => {
    try {
        const request: VideoGenerationRequest = req.body;

        const jobId = uuidv4();
        createJob(jobId);

        // Start video generation asynchronously
        generateVideoAsync(jobId, request);

        const response: VideoGenerationResponse = {
            jobId,
            status: 'processing',
            progress: 0
        };

        res.json(response);
    } catch (error: any) {
        console.error('Video generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check video generation status
videoRouter.get('/status/:jobId', (req, res) => {
    try {
        const { jobId } = req.params;

        const job = getJob(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const response: VideoGenerationResponse = {
            jobId: job.jobId,
            status: job.status,
            progress: job.progress,
            videoUrl: job.result?.videoUrl,
            estimatedFileSize: job.result?.estimatedFileSize,
            error: job.error
        };

        res.json(response);
    } catch (error: any) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload overlay - now uses temp storage since overlays are temporary
videoRouter.post('/overlay/upload', tempUpload.single('overlay'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No overlay file provided' });
        }

        // Overlays are stored in temp folder now
        const overlayUrl = `/temp/${req.file.filename}`;
        const overlayId = uuidv4();
        const overlayType = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';

        console.log(`[Overlay Upload] Saved overlay to temp: ${req.file.filename}, type: ${overlayType}`);

        res.json({
            overlayUrl,
            overlayId,
            overlayType
        });
    } catch (error: any) {
        console.error('Overlay upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Async video generation function
async function generateVideoAsync(jobId: string, request: VideoGenerationRequest) {
    try {
        updateJob(jobId, { status: 'processing', progress: 10 });

        let videoPath: string;

        // Get the actual temp and uploads directories
        const tempDir = path.join(__dirname, '../../temp');
        const uploadsDir = path.join(__dirname, '../../uploads');

        // Resolve asset URLs to local file paths
        // Handles: /temp/*, /uploads/*, and external http(s) URLs
        const resolveAssetPath = async (url: string): Promise<string> => {
            const sanitized = (url || '').trim();
            
            if (!sanitized) {
                throw new Error('Empty URL provided');
            }

            console.log(`[Asset Resolution] Resolving: ${sanitized}`);

            // Handle external URLs - download to temp
            const isExternal = sanitized.startsWith('http') && 
                !sanitized.includes('localhost') && 
                !sanitized.includes('127.0.0.1');
                
            if (isExternal) {
                console.log(`[Asset Resolution] Downloading external asset: ${sanitized.substring(0, 100)}...`);
                const response = await fetch(sanitized);
                if (!response.ok) {
                    throw new Error(`Failed to download asset: ${sanitized}`);
                }
                let extension = 'mp4';
                try {
                    const remotePath = new URL(sanitized).pathname;
                    const ext = path.extname(remotePath).replace('.', '');
                    if (ext) {
                        extension = ext;
                    }
                } catch {
                    // ignore URL parsing errors
                }
                const localPath = getTempFilePath(extension);
                const buffer = Buffer.from(await response.arrayBuffer());
                fs.writeFileSync(localPath, buffer);
                console.log(`[Asset Resolution] Downloaded to: ${localPath}`);
                return localPath;
            }

            // Handle localhost URLs - strip the host part
            let urlPath = sanitized;
            if (sanitized.includes('localhost') || sanitized.includes('127.0.0.1')) {
                try {
                    const urlObj = new URL(sanitized);
                    urlPath = urlObj.pathname;
                } catch {
                    // Keep as-is if URL parsing fails
                }
            }

            // Extract filename from URL path
            const filename = urlPath.split('/').pop();
            if (!filename) {
                throw new Error(`Invalid asset URL: ${url}`);
            }

            // Determine which directory based on URL prefix
            const isUpload = urlPath.includes('/uploads/');
            const primaryDir = isUpload ? uploadsDir : tempDir;
            const primaryPath = path.join(primaryDir, filename);

            console.log(`[Asset Resolution] Checking primary path: ${primaryPath}`);

            // Check if file exists at primary location
            if (fs.existsSync(primaryPath)) {
                console.log(`[Asset Resolution] Found at: ${primaryPath}`);
                return primaryPath;
            }

            // Try alternate directory
            const alternateDir = isUpload ? tempDir : uploadsDir;
            const alternatePath = path.join(alternateDir, filename);
            
            console.log(`[Asset Resolution] Checking alternate path: ${alternatePath}`);

            if (fs.existsSync(alternatePath)) {
                console.log(`[Asset Resolution] Found at alternate: ${alternatePath}`);
                return alternatePath;
            }

            throw new Error(`Asset file not found: ${filename} (checked ${primaryPath} and ${alternatePath})`);
        };

        const audioPath = await resolveAssetPath(request.voiceoverUrl);
        console.log(`[Video Generation] Audio path: ${audioPath}`);

        // Resolve overlay file paths with detailed logging
        console.log(`[Video Generation] Processing ${(request.overlays || []).length} overlay(s) from request`);
        
        const overlays = (await Promise.all(
            (request.overlays || []).map(async (overlay, index) => {
                console.log(`[Video Generation] Overlay ${index + 1}: fileUrl=${overlay.fileUrl}, type=${overlay.type}, blendMode=${overlay.blendMode}`);
                try {
                    const filePath = await resolveAssetPath(overlay.fileUrl);
                    console.log(`[Video Generation] Overlay ${index + 1} resolved: ${filePath}`);
                    return {
                        ...overlay,
                        filePath
                    };
                } catch (err: any) {
                    console.error(`[Video Generation] Failed to resolve overlay ${index + 1}:`, err.message);
                    return null;
                }
            })
        )).filter(Boolean);

        console.log(`[Video Generation] ${overlays.length} overlay(s) ready for application`);

        const onProgress = (progress: number) => {
            updateJob(jobId, { progress: Math.min(99, progress) });
        };

        if (request.flowType === 'single-image') {
            const imagePath = await resolveAssetPath(request.imageUrl);
            console.log(`[Video Generation] Single image flow, image: ${imagePath}`);
            
            videoPath = await generateSingleImageVideo(
                {
                    audioPath,
                    audioDuration: request.voiceoverDuration,
                    imagePath,
                    overlays: overlays as any
                },
                onProgress
            );
        } else if (request.flowType === 'multi-image') {
            const images = await Promise.all(request.images.map(async (img) => ({
                imagePath: await resolveAssetPath(img.imageUrl),
                duration: img.duration
            })));

            console.log(`[Video Generation] Multi-image flow, ${images.length} images`);

            videoPath = await generateMultiImageVideo(
                {
                    audioPath,
                    audioDuration: request.voiceoverDuration,
                    images,
                    overlays: overlays as any
                },
                onProgress
            );
        } else if (request.flowType === 'stock-video') {
            const videos = await Promise.all(request.videos.map(async (vid) => ({
                videoPath: await resolveAssetPath(vid.videoUrl),
                duration: vid.duration,
                startTime: vid.startTime
            })));

            console.log(`[Video Generation] Stock video flow, ${videos.length} videos`);

            videoPath = await generateStockVideoComposition(
                {
                    audioPath,
                    audioDuration: request.voiceoverDuration,
                    videos,
                    loop: request.loop,
                    overlays: overlays as any
                },
                onProgress
            );
        } else {
            throw new Error('Invalid flow type');
        }

        trackFile(videoPath, jobId);
        const videoUrl = `/temp/${videoPath.split(/[\\/]/).pop()}`;

        console.log(`[Video Generation] Completed! Video URL: ${videoUrl}`);

        updateJob(jobId, {
            status: 'completed',
            progress: 100,
            result: {
                videoUrl,
                estimatedFileSize: fs.statSync(videoPath).size
            }
        });
    } catch (error: any) {
        console.error(`Video generation failed for job ${jobId}:`, error);
        updateJob(jobId, {
            status: 'failed',
            error: error.message
        });
    }
}
