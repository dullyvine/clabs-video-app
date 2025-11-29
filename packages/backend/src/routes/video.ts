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
import { upload } from '../utils/upload';

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

// Upload overlay
videoRouter.post('/overlay/upload', upload.single('overlay'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No overlay file provided' });
        }

        const overlayUrl = `/uploads/${req.file.filename}`;
        const overlayId = uuidv4();
        const overlayType = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';

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

        // Convert URLs to local file paths (remove /temp/ prefix)
        const resolveAssetPath = async (url: string): Promise<string> => {
            const sanitized = url || '';

            const needsDownload = sanitized.startsWith('http') && !sanitized.includes('/temp/') && !sanitized.includes('/uploads/');
            if (needsDownload) {
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
                return localPath;
            }

            const filename = sanitized.split('/').pop();
            if (!filename) {
                throw new Error(`Invalid asset URL: ${url}`);
            }
            const isUpload = sanitized.includes('/uploads/');
            const relativeDir = isUpload ? '../uploads' : '../../temp';
            return path.join(__dirname, relativeDir, filename);
        };

        const audioPath = await resolveAssetPath(request.voiceoverUrl);
        const overlays = (await Promise.all(
            (request.overlays || []).map(async (overlay) => {
                try {
                    return {
                        ...overlay,
                        filePath: await resolveAssetPath(overlay.fileUrl)
                    };
                } catch (err) {
                    console.warn('Failed to resolve overlay path:', overlay.fileUrl, err);
                    return null;
                }
            })
        )).filter(Boolean);

        const onProgress = (progress: number) => {
            updateJob(jobId, { progress: Math.min(99, progress) });
        };

        if (request.flowType === 'single-image') {
            const imagePath = await resolveAssetPath(request.imageUrl);
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

        updateJob(jobId, {
            status: 'completed',
            progress: 100,
            result: {
                videoUrl,
                estimatedFileSize: 1024 * 1024 * 10 // Mock 10MB
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
