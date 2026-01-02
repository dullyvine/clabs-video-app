import express from 'express';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import {
    VideoGenerationRequest,
    VideoGenerationResponse,
    JobStatus,
    VideoQuality,
    VideoQualitySettings,
    MotionEffect
} from 'shared/src/types';
import {
    generateSingleImageVideo,
    generateMultiImageVideo,
    generateStockVideoComposition,
    calculateSmartVideoTiming,
    getAudioDuration,
    burnCaptions,
    applyMotionEffect
} from '../services/ffmpeg.service';
import { createJob, updateJob, getJob } from '../utils/jobs';
import { getTempFilePath, trackFile } from '../services/file.service';
import { tempUpload } from '../utils/upload';
import { generateCaptions, saveCaptionFile, DEFAULT_CAPTION_STYLES } from '../services/caption.service';

// Video quality presets
export const VIDEO_QUALITY_PRESETS: Record<VideoQuality, VideoQualitySettings> = {
    draft: { resolution: { width: 854, height: 480 }, crf: 32, preset: 'ultrafast', label: 'Draft (480p)' },
    standard: { resolution: { width: 1280, height: 720 }, crf: 28, preset: 'fast', label: 'Standard (720p)' },
    high: { resolution: { width: 1920, height: 1080 }, crf: 23, preset: 'medium', label: 'High (1080p)' },
    ultra: { resolution: { width: 1920, height: 1080 }, crf: 18, preset: 'slow', label: 'Ultra (1080p HQ)' }
};

export const videoRouter = express.Router();

// Maximum time for video generation (10 minutes)
const VIDEO_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

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

// Get video quality presets
videoRouter.get('/quality-presets', (req, res) => {
    res.json({ presets: VIDEO_QUALITY_PRESETS });
});

// Get caption style presets
videoRouter.get('/caption-styles', (req, res) => {
    res.json({ styles: DEFAULT_CAPTION_STYLES });
});

// Generate captions from script
videoRouter.post('/generate-captions', async (req, res) => {
    try {
        const { script, voiceoverDuration, style } = req.body;
        
        if (!script) {
            return res.status(400).json({ error: 'Script is required' });
        }
        
        if (!voiceoverDuration || voiceoverDuration <= 0) {
            return res.status(400).json({ error: 'Valid voiceover duration is required' });
        }
        
        const result = await generateCaptions({
            script,
            voiceoverDuration,
            style
        });
        
        res.json(result);
    } catch (error: any) {
        console.error('Caption generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Calculate timing preview for stock videos
videoRouter.post('/timing-preview', async (req, res) => {
    try {
        const { videos, audioDuration } = req.body;
        
        if (!videos || !Array.isArray(videos) || videos.length === 0) {
            return res.status(400).json({ error: 'Videos array is required' });
        }
        
        if (!audioDuration || audioDuration <= 0) {
            return res.status(400).json({ error: 'Valid audio duration is required' });
        }
        
        // For preview, we don't need actual file paths - just calculate timing
        const videoCount = videos.length;
        const targetDurationPerVideo = audioDuration / videoCount;
        
        const timingPreview = videos.map((video: any, index: number) => {
            const isLast = index === videos.length - 1;
            const targetDuration = isLast 
                ? audioDuration - (targetDurationPerVideo * index)
                : targetDurationPerVideo;
            
            return {
                index,
                videoId: video.id || `video-${index}`,
                targetDuration: parseFloat(targetDuration.toFixed(1)),
                startTime: parseFloat((targetDurationPerVideo * index).toFixed(1)),
                endTime: parseFloat((targetDurationPerVideo * (index + 1)).toFixed(1)),
                originalDuration: video.duration || null,
                needsLoop: video.duration ? video.duration < targetDuration : null,
                needsTrim: video.duration ? video.duration > targetDuration : null
            };
        });
        
        res.json({ 
            timingPreview,
            totalDuration: audioDuration,
            videoCount,
            averageDurationPerVideo: parseFloat(targetDurationPerVideo.toFixed(1))
        });
    } catch (error: any) {
        console.error('Timing preview error:', error);
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
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(new Error(`Video generation timed out after ${VIDEO_GENERATION_TIMEOUT_MS / 1000}s`));
        }, VIDEO_GENERATION_TIMEOUT_MS);
    });

    // Create the actual generation promise
    const generationPromise = (async () => {
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

        let voiceoverDuration = request.voiceoverDuration;
        if (!voiceoverDuration || voiceoverDuration <= 0) {
            try {
                voiceoverDuration = await getAudioDuration(audioPath);
                console.log(`[Video Generation] Derived voiceover duration: ${voiceoverDuration.toFixed(1)}s`);
            } catch (err: any) {
                throw new Error(`Unable to read audio duration for ${audioPath}: ${err.message}`);
            }
        }

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
                    audioDuration: voiceoverDuration,
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
                    audioDuration: voiceoverDuration,
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
                    audioDuration: voiceoverDuration,
                    videos,
                    loop: request.loop,
                    overlays: overlays as any
                },
                onProgress
            );
        } else {
            throw new Error('Invalid flow type');
        }

        // Apply motion effect for single-image and multi-image flows (not stock-video)
        // Motion effects add subtle animation to static images
        if (request.motionEffect && request.motionEffect !== 'none' && request.flowType !== 'stock-video') {
            console.log(`[Video Generation] Applying motion effect: ${request.motionEffect}`);
            updateJob(jobId, { progress: 75 });
            
            try {
                videoPath = await applyMotionEffect(
                    videoPath,
                    request.motionEffect,
                    voiceoverDuration,
                    (progress) => {
                        const scaledProgress = 75 + Math.floor(progress * 0.1);
                        updateJob(jobId, { progress: Math.min(84, scaledProgress) });
                    }
                );
                console.log(`[Video Generation] Motion effect applied successfully`);
            } catch (motionError: any) {
                console.error(`[Video Generation] Motion effect failed:`, motionError.message);
                // Continue without motion effect rather than failing the whole job
            }
        }

        // Burn captions if enabled
        const hasCaptionData = Boolean(request.script) || (request.wordTimestamps && request.wordTimestamps.length > 0);
        if (request.captionsEnabled && hasCaptionData) {
            console.log(`[Video Generation] Captions enabled, generating and burning...`);
            const hasRealTimestamps = request.wordTimestamps && request.wordTimestamps.length > 0;
            console.log(`[Video Generation] Using ${hasRealTimestamps ? 'REAL transcription' : 'estimated'} timestamps`);
            updateJob(jobId, { progress: 85 });
            
            try {
                // Generate captions from script (uses real timestamps if provided)
                const captionResult = await generateCaptions({
                    script: request.script || '',
                    voiceoverDuration,
                    style: request.captionStyle,
                    wordTimestamps: request.wordTimestamps // Pass real timestamps if available
                });
                
                // Save captions to file
                const captionFilePath = await saveCaptionFile(
                    captionResult.segments,
                    request.captionStyle,
                    'ass'
                );
                
                console.log(`[Video Generation] Caption file saved: ${captionFilePath}`);
                updateJob(jobId, { progress: 90 });
                
                // Burn captions into video
                const captionedVideoPath = await burnCaptions(
                    videoPath,
                    captionFilePath,
                    (progress) => {
                        const scaledProgress = 90 + Math.floor(progress * 0.1);
                        updateJob(jobId, { progress: Math.min(99, scaledProgress) });
                    }
                );
                
                // Clean up original video if captioned version is different
                if (captionedVideoPath !== videoPath) {
                    try { fs.unlinkSync(videoPath); } catch { /* ignore */ }
                    videoPath = captionedVideoPath;
                }
                
                // Clean up caption file
                try { fs.unlinkSync(captionFilePath); } catch { /* ignore */ }
                
                console.log(`[Video Generation] Captions burned successfully`);
            } catch (captionError: any) {
                console.error(`[Video Generation] Caption burning failed:`, captionError.message);
                // Continue without captions rather than failing the whole job
            }
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

        return videoPath;
    })();

    // Race between timeout and generation
    try {
        await Promise.race([generationPromise, timeoutPromise]);
    } catch (error: any) {
        console.error(`Video generation failed for job ${jobId}:`, error);
        updateJob(jobId, {
            status: 'failed',
            error: error.message
        });
    }
}
