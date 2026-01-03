import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { BlendMode, Overlay, MotionEffect } from 'shared/src/types';
import { getTempFilePath, getUploadFilePath } from './file.service';

/**
 * FFmpeg service for video composition
 * 
 * Performance Optimizations:
 * - Hardware acceleration detection (NVENC, AMF, QSV)
 * - Dynamic thread allocation based on system cores
 * - Low framerate encoding for still images (1-5fps vs 25fps)
 * - Parallel clip processing for multi-image/stock-video flows
 * - GOP optimization for faster seeking
 */

// ============================================================================
// PERFORMANCE OPTIMIZATION UTILITIES
// ============================================================================

/**
 * Environment variable controls for optimizations
 */
const FFMPEG_USE_HARDWARE = process.env.FFMPEG_USE_HARDWARE !== 'false';
const FFMPEG_MAX_PARALLEL_CLIPS = Math.max(1, Math.min(5, parseInt(process.env.FFMPEG_MAX_PARALLEL_CLIPS || '3', 10)));
const FFMPEG_LOW_FPS_MODE = process.env.FFMPEG_LOW_FPS_MODE !== 'false';
const FFMPEG_MOTION_FPS = Number(process.env.FFMPEG_MOTION_FPS || '');

/**
 * Cached hardware encoder detection result
 */
let cachedHardwareEncoder: string | null = null;
let hardwareEncoderChecked = false;

/**
 * Detect available hardware encoder
 * Priority: NVENC > AMF > QSV > libx264 (software fallback)
 * Result is cached for performance
 */
export function detectHardwareEncoder(): string {
    if (hardwareEncoderChecked) {
        return cachedHardwareEncoder || 'libx264';
    }

    hardwareEncoderChecked = true;

    if (!FFMPEG_USE_HARDWARE) {
        console.log('[FFmpeg Optimization] Hardware acceleration disabled via environment');
        cachedHardwareEncoder = null;
        return 'libx264';
    }

    const encodersToTry = [
        { name: 'h264_nvenc', label: 'NVIDIA NVENC' },
        { name: 'h264_amf', label: 'AMD AMF' },
        { name: 'h264_qsv', label: 'Intel QSV' },
    ];

    for (const encoder of encodersToTry) {
        try {
            // Test if encoder is available by running a minimal encode
            execSync(
                `ffmpeg -f lavfi -i color=black:s=64x64:d=0.1 -c:v ${encoder.name} -f null - 2>&1`,
                { stdio: 'pipe', timeout: 5000 }
            );
            console.log(`[FFmpeg Optimization] Hardware encoder detected: ${encoder.label} (${encoder.name})`);
            cachedHardwareEncoder = encoder.name;
            return encoder.name;
        } catch {
            // Encoder not available, try next
        }
    }

    console.log('[FFmpeg Optimization] No hardware encoder available, using libx264 (software)');
    cachedHardwareEncoder = null;
    return 'libx264';
}

/**
 * Get optimal thread count based on system cores
 * Leaves headroom for multiple simultaneous video jobs
 */
export function getOptimalThreadCount(): number {
    const cpuCount = os.cpus().length;
    // Use half of available cores, minimum 2, maximum 8
    // This leaves room for 4 simultaneous video generation jobs
    const threads = Math.max(2, Math.min(8, Math.floor(cpuCount / 2)));
    return threads;
}

/**
 * Get optimal framerate based on content type and duration
 * - Single image: 1fps (or 5fps for better seeking on very long videos)
 * - Multi-image: 5fps (preserves smooth appearance at transitions)
 * - Stock video: native (cannot reduce, videos have actual motion)
 */
export function getOptimalFramerate(contentType: 'single-image' | 'multi-image' | 'stock-video', durationSeconds: number): number {
    if (!FFMPEG_LOW_FPS_MODE) {
        return 30; // Default to 30fps if optimization disabled
    }

    switch (contentType) {
        case 'single-image':
            // For very long videos (>30min), use 5fps for better seeking
            // For shorter videos, 1fps is fine
            return durationSeconds > 1800 ? 5 : 1;
        case 'multi-image':
            // 5fps for multi-image to ensure smooth clip transitions
            return 5;
        case 'stock-video':
            // Stock videos keep their native framerate (return 0 to indicate "don't override")
            return 0;
        default:
            return 30;
    }
}

function getMotionFramerate(durationSeconds: number): number {
    if (Number.isFinite(FFMPEG_MOTION_FPS) && FFMPEG_MOTION_FPS > 0) {
        return Math.round(FFMPEG_MOTION_FPS);
    }

    return 30;
}

function parseFps(rate?: string): number | null {
    if (!rate) {
        return null;
    }

    const parts = rate.split('/');
    if (parts.length !== 2) {
        return null;
    }

    const numerator = Number(parts[0]);
    const denominator = Number(parts[1]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return null;
    }

    return numerator / denominator;
}

/**
 * Get optimized encoder options based on content type and duration
 * Returns array of FFmpeg output options
 */
export function getEncoderOptions(params: {
    contentType: 'single-image' | 'multi-image' | 'stock-video';
    durationSeconds: number;
    includeAudio?: boolean;
    crf?: number;
}): string[] {
    const { contentType, durationSeconds, includeAudio = true, crf = 28 } = params;
    
    const encoder = detectHardwareEncoder();
    const threads = getOptimalThreadCount();
    const fps = getOptimalFramerate(contentType, durationSeconds);
    
    const options: string[] = [];
    
    // Video codec
    options.push(`-c:v ${encoder}`);
    
    // Encoder-specific options
    if (encoder === 'libx264') {
        options.push('-preset ultrafast');
        options.push(`-crf ${crf}`);
        
        // Only use -tune stillimage for short single-image videos
        // For longer videos, it actually slows down encoding
        if (contentType === 'single-image' && durationSeconds <= 60) {
            options.push('-tune stillimage');
        }
    } else if (encoder === 'h264_nvenc') {
        options.push('-preset p1'); // Fastest NVENC preset
        options.push(`-cq ${crf}`); // Constant quality mode
        options.push('-rc vbr'); // Variable bitrate
    } else if (encoder === 'h264_amf') {
        options.push('-quality speed');
        options.push(`-rc cqp -qp_i ${crf} -qp_p ${crf}`);
    } else if (encoder === 'h264_qsv') {
        options.push('-preset veryfast');
        options.push(`-global_quality ${crf}`);
    }
    
    // Framerate (only if not stock video)
    if (fps > 0) {
        options.push(`-r ${fps}`);
    }
    
    // GOP size (keyframe interval) - roughly every 5 seconds at the given fps
    // This helps with seeking without too much overhead
    const gopSize = fps > 0 ? Math.max(fps * 5, 30) : 150;
    options.push(`-g ${gopSize}`);
    
    // Pixel format
    options.push('-pix_fmt yuv420p');
    
    // Thread count (only for software encoding)
    if (encoder === 'libx264') {
        options.push(`-threads ${threads}`);
    }
    
    // Audio options
    if (includeAudio) {
        options.push('-c:a aac');
        options.push('-b:a 192k');
    }
    
    // Fast start for web playback
    options.push('-movflags +faststart');
    
    return options;
}

/**
 * Process clips in parallel with controlled concurrency
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param maxConcurrent Maximum concurrent operations (default: FFMPEG_MAX_PARALLEL_CLIPS)
 * @param onProgress Progress callback (0-100)
 */
export async function processClipsInParallel<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    maxConcurrent: number = FFMPEG_MAX_PARALLEL_CLIPS,
    onProgress?: (progress: number) => void
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let completedCount = 0;
    
    // Process in batches
    for (let i = 0; i < items.length; i += maxConcurrent) {
        const batch = items.slice(i, i + maxConcurrent);
        const batchStartIndex = i;
        
        const batchPromises = batch.map(async (item, batchIndex) => {
            const globalIndex = batchStartIndex + batchIndex;
            const result = await processor(item, globalIndex);
            results[globalIndex] = result;
            
            completedCount++;
            if (onProgress) {
                onProgress(Math.floor((completedCount / items.length) * 100));
            }
            
            return result;
        });
        
        await Promise.all(batchPromises);
    }
    
    return results;
}

// Log optimization settings on startup
const motionFpsSetting = Number.isFinite(FFMPEG_MOTION_FPS) && FFMPEG_MOTION_FPS > 0 ? FFMPEG_MOTION_FPS : 'auto';
console.log(`[FFmpeg Optimization] Settings: hardware=${FFMPEG_USE_HARDWARE}, maxParallelClips=${FFMPEG_MAX_PARALLEL_CLIPS}, lowFpsMode=${FFMPEG_LOW_FPS_MODE}, motionFps=${motionFpsSetting}`);

// ============================================================================
// END PERFORMANCE OPTIMIZATION UTILITIES
// ============================================================================

export interface VideoCompositionOptions {
    audioPath: string;
    audioDuration: number;
    outputPath?: string;
    captionFile?: string; // Path to SRT or ASS file for burning captions
}

export interface SingleImageOptions extends VideoCompositionOptions {
    imagePath: string;
    overlays?: InternalOverlay[];
}

export interface MultiImageOptions extends VideoCompositionOptions {
    images: Array<{ imagePath: string; duration: number }>;
    overlays?: InternalOverlay[];
}

export interface StockVideoOptions extends VideoCompositionOptions {
    videos: Array<{ videoPath: string; duration?: number; startTime?: number }>;
    loop?: boolean;
    overlays?: InternalOverlay[];
}

export interface VideoTimingSlot {
    videoPath: string;
    originalDuration: number;
    targetDuration: number;
    startTime: number;
    endTime: number;
    needsLoop: boolean;
    needsTrim: boolean;
}

/**
 * Calculate smart timing for stock videos based on voiceover duration
 * Distributes videos evenly across the audio duration
 */
export async function calculateSmartVideoTiming(
    videos: Array<{ videoPath: string; duration?: number }>,
    audioDuration: number
): Promise<VideoTimingSlot[]> {
    const videoCount = videos.length;
    const targetDurationPerVideo = audioDuration / videoCount;
    
    console.log(`[Smart Timing] Audio: ${audioDuration.toFixed(1)}s, Videos: ${videoCount}, Target per video: ${targetDurationPerVideo.toFixed(1)}s`);
    
    const slots: VideoTimingSlot[] = [];
    let currentTime = 0;
    
    for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        let originalDuration = video.duration;
        
        // Get actual duration if not provided
        if (!originalDuration) {
            try {
                originalDuration = await getVideoDuration(video.videoPath);
            } catch {
                originalDuration = targetDurationPerVideo; // Fallback
            }
        }
        
        // Calculate target duration for this slot
        // Last video fills remaining time to ensure exact match
        const isLast = i === videos.length - 1;
        const targetDuration = isLast 
            ? audioDuration - currentTime 
            : targetDurationPerVideo;
        
        const needsLoop = originalDuration < targetDuration;
        const needsTrim = originalDuration > targetDuration;
        
        slots.push({
            videoPath: video.videoPath,
            originalDuration,
            targetDuration,
            startTime: currentTime,
            endTime: currentTime + targetDuration,
            needsLoop,
            needsTrim
        });
        
        currentTime += targetDuration;
    }
    
    console.log(`[Smart Timing] Calculated ${slots.length} slots, total: ${currentTime.toFixed(1)}s`);
    
    return slots;
}

type InternalOverlay = Overlay & { filePath?: string };

export async function generateSingleImageVideo(
    options: SingleImageOptions,
    onProgress?: (progress: number) => void
): Promise<string> {
    const outputPath = options.outputPath || getTempFilePath('mp4');
    
    // Get optimized encoder options for single image content
    const encoderOptions = getEncoderOptions({
        contentType: 'single-image',
        durationSeconds: options.audioDuration,
        includeAudio: true
    });
    
    const fps = getOptimalFramerate('single-image', options.audioDuration);
    console.log(`[FFmpeg Single-Image] Generating ${options.audioDuration.toFixed(1)}s video at ${fps}fps (${Math.ceil(options.audioDuration * fps)} frames)`);

    return new Promise((resolve, reject) => {
        let command = ffmpeg();

        // Add image input (loop it)
        command = command
            .input(options.imagePath)
            .inputOptions(['-loop 1', `-t ${options.audioDuration}`]);

        // Add audio input
        command = command.input(options.audioPath);

        // Apply overlays if any
        if (options.overlays && options.overlays.length > 0) {
            // For now, skip complex overlay logic in mock
            // In production, use FFmpeg filter_complex for blending
        }

        // Output options - OPTIMIZED
        command = command
            .outputOptions([
                '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
                ...encoderOptions,
                '-shortest'
            ])
            .output(outputPath);

        // Track progress
        command.on('progress', (progress) => {
            if (onProgress && progress.percent) {
                onProgress(Math.min(99, Math.floor(progress.percent)));
            }
        });

        command.on('end', async () => {
            try {
                const hasOverlays = Boolean(options.overlays && options.overlays.length);
                if (onProgress) {
                    onProgress(hasOverlays ? 80 : 100);
                }

                const overlayProgress = hasOverlays && onProgress
                    ? (progressValue: number) => {
                        const scaled = 80 + Math.floor(progressValue * 0.2);
                        onProgress(Math.min(99, scaled));
                    }
                    : undefined;

                const finalPath = await applyVideoOverlays(outputPath, options.overlays, overlayProgress);

                if (hasOverlays && onProgress) {
                    onProgress(100);
                }
                resolve(finalPath);
            } catch (err) {
                reject(err);
            }
        });

        command.on('error', (err) => {
            reject(new Error(`FFmpeg error: ${err.message}`));
        });

        command.run();
    });
}

export async function generateMultiImageVideo(
    options: MultiImageOptions,
    onProgress?: (progress: number) => void
): Promise<string> {
    const outputPath = options.outputPath || getTempFilePath('mp4');
    
    // Get optimized encoder options for multi-image clip generation
    const clipEncoderOptions = getEncoderOptions({
        contentType: 'multi-image',
        durationSeconds: options.audioDuration,
        includeAudio: false // Clips don't need audio, only final output
    });
    
    const fps = getOptimalFramerate('multi-image', options.audioDuration);
    console.log(`[FFmpeg Multi-Image] Generating ${options.images.length} clips in parallel at ${fps}fps`);

    // Process clips in parallel using the parallel processor
    const videoClips = await processClipsInParallel(
        options.images,
        async (image, index) => {
            const { imagePath, duration } = image;
            const clipPath = getTempFilePath('mp4');
            
            await new Promise<void>((resolve, reject) => {
                ffmpeg()
                    .input(imagePath)
                    .inputOptions(['-loop 1', `-t ${duration}`])
                    .outputOptions([
                        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
                        ...clipEncoderOptions.filter(opt => !opt.startsWith('-c:a') && !opt.startsWith('-b:a')), // Remove audio options for clips
                        '-an' // No audio for individual clips
                    ])
                    .output(clipPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .run();
            });
            
            return clipPath;
        },
        FFMPEG_MAX_PARALLEL_CLIPS,
        (clipProgress) => {
            if (onProgress) {
                // Clip generation is 0-50% of total progress
                onProgress(Math.floor(clipProgress * 0.5));
            }
        }
    );
    
    console.log(`[FFmpeg Multi-Image] All ${videoClips.length} clips generated, concatenating...`);

    // Concatenate all video clips
    const concatListPath = getTempFilePath('txt');
    const concatList = videoClips.map(clip => `file '${normalizeConcatPath(clip)}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList);
    
    // Get encoder options for final concatenation
    const finalEncoderOptions = getEncoderOptions({
        contentType: 'multi-image',
        durationSeconds: options.audioDuration,
        includeAudio: true
    });

    return new Promise((resolve, reject) => {
        let command = ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f concat', '-safe 0'])
            .input(options.audioPath)
            .outputOptions([
                ...finalEncoderOptions,
                '-shortest'
            ])
            .output(outputPath);

        command.on('progress', (progress) => {
            if (onProgress && progress.percent) {
                onProgress(Math.min(99, Math.floor(50 + progress.percent / 2)));
            }
        });

        command.on('end', async () => {
            try {
                fs.unlinkSync(concatListPath);
                videoClips.forEach(clip => {
                    try { fs.unlinkSync(clip); } catch { /* ignore */ }
                });
                const hasOverlays = Boolean(options.overlays && options.overlays.length);
                if (onProgress) {
                    onProgress(hasOverlays ? 80 : 100);
                }

                const overlayProgress = hasOverlays && onProgress
                    ? (progressValue: number) => {
                        const scaled = 80 + Math.floor(progressValue * 0.2);
                        onProgress(Math.min(99, scaled));
                    }
                    : undefined;

                const finalPath = await applyVideoOverlays(outputPath, options.overlays, overlayProgress);

                if (hasOverlays && onProgress) {
                    onProgress(100);
                }
                resolve(finalPath);
            } catch (err) {
                reject(err);
            }
        });

        command.on('error', (err) => {
            reject(new Error(`FFmpeg concat error: ${err.message}`));
        });

        command.run();
    });
}

export async function generateStockVideoComposition(
    options: StockVideoOptions,
    onProgress?: (progress: number) => void
): Promise<string> {
    const outputPath = options.outputPath || getTempFilePath('mp4');

    // Calculate smart timing based on audio duration
    const timingSlots = await calculateSmartVideoTiming(options.videos, options.audioDuration);
    
    // Get optimized encoder options for stock video (keeps native framerate)
    const clipEncoderOptions = getEncoderOptions({
        contentType: 'stock-video',
        durationSeconds: options.audioDuration,
        includeAudio: false
    });
    
    console.log(`[FFmpeg Stock-Video] Processing ${timingSlots.length} videos in parallel with smart timing`);

    // Process clips in parallel using the parallel processor
    const processedClips = await processClipsInParallel(
        timingSlots,
        async (slot, index) => {
            const clipPath = getTempFilePath('mp4');
            
            await new Promise<void>((resolve, reject) => {
                let cmd = ffmpeg().input(slot.videoPath);
                
                // If video is shorter than target, loop it
                if (slot.needsLoop) {
                    cmd = cmd.inputOptions([
                        '-stream_loop', '-1',
                        '-t', String(slot.targetDuration)
                    ]);
                }
                
                cmd = cmd.outputOptions([
                    ...clipEncoderOptions.filter(opt => !opt.startsWith('-c:a') && !opt.startsWith('-b:a')),
                    '-t', String(slot.targetDuration),
                    '-an' // No audio for clips
                ])
                .output(clipPath)
                .on('end', () => resolve())
                .on('error', (err) => {
                    console.error(`[Stock Video] Error processing clip ${index}:`, err.message);
                    reject(err);
                });
                
                cmd.run();
            });
            
            console.log(`[FFmpeg Stock-Video] Processed clip ${index + 1}/${timingSlots.length}: ${slot.targetDuration.toFixed(1)}s`);
            return clipPath;
        },
        FFMPEG_MAX_PARALLEL_CLIPS,
        (clipProgress) => {
            if (onProgress) {
                // Clip generation is 0-40% of total progress
                onProgress(Math.floor(clipProgress * 0.4));
            }
        }
    );
    
    console.log(`[FFmpeg Stock-Video] All ${processedClips.length} clips processed, concatenating...`);

    // Concatenate all processed clips
    const concatListPath = getTempFilePath('txt');
    const concatList = processedClips
        .map(clip => `file '${normalizeConcatPath(clip)}'`)
        .join('\n');
    fs.writeFileSync(concatListPath, concatList);
    
    // Get encoder options for final concatenation
    const finalEncoderOptions = getEncoderOptions({
        contentType: 'stock-video',
        durationSeconds: options.audioDuration,
        includeAudio: true
    });

    return new Promise((resolve, reject) => {
        let command = ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f concat', '-safe 0'])
            .input(options.audioPath)
            .outputOptions([
                ...finalEncoderOptions,
                '-shortest'
            ])
            .output(outputPath);

        command.on('progress', (progress) => {
            if (onProgress && progress.percent) {
                onProgress(Math.min(99, Math.floor(40 + progress.percent * 0.4)));
            }
        });

        command.on('end', async () => {
            try {
                // Cleanup
                fs.unlinkSync(concatListPath);
                processedClips.forEach(clip => {
                    try { fs.unlinkSync(clip); } catch { /* ignore */ }
                });
                
                const hasOverlays = Boolean(options.overlays && options.overlays.length);

                if (onProgress) {
                    onProgress(hasOverlays ? 80 : 100);
                }

                const overlayProgress = hasOverlays && onProgress
                    ? (progressValue: number) => {
                        const scaled = 80 + Math.floor(progressValue * 0.2);
                        onProgress(Math.min(99, scaled));
                    }
                    : undefined;

                const finalPath = await applyVideoOverlays(outputPath, options.overlays, overlayProgress);

                if (hasOverlays && onProgress) {
                    onProgress(100);
                }
                resolve(finalPath);
            } catch (err) {
                reject(err);
            }
        });

        command.on('error', (err) => {
            try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
            processedClips.forEach(clip => {
                try { fs.unlinkSync(clip); } catch { /* ignore */ }
            });
            reject(new Error(`FFmpeg stock video error: ${err.message}`));
        });

        command.run();
    });
}

/**
 * Burn captions into video using FFmpeg subtitles filter
 */
export async function burnCaptions(
    inputVideoPath: string,
    captionFilePath: string,
    onProgress?: (progress: number) => void
): Promise<string> {
    if (!fs.existsSync(captionFilePath)) {
        console.warn(`[FFmpeg Caption] Caption file not found: ${captionFilePath}`);
        return inputVideoPath;
    }

    const outputPath = getTempFilePath('mp4');
    const ext = path.extname(captionFilePath).toLowerCase();
    
    const normalizedCaptionPath = escapeFilterPath(captionFilePath);
    const windowsFontsDir = process.env.CAPTION_FONTS_DIR || 'C:/Windows/Fonts';
    const fontsDir = fs.existsSync(windowsFontsDir) ? escapeFilterPath(windowsFontsDir) : null;
    const fontsFilter = fontsDir ? `:fontsdir='${fontsDir}'` : '';

    console.log(`[FFmpeg Caption] Burning captions from: ${captionFilePath}`);

    return new Promise((resolve, reject) => {
        let command = ffmpeg()
            .input(inputVideoPath)
            .outputOptions([
                '-c:v libx264',
                '-preset fast',
                '-crf 23',
                '-pix_fmt yuv420p',
                '-c:a copy',
                '-threads 4'
            ]);

        // Use subtitles filter for ASS/SRT
        const filter = ext === '.ass'
            ? `ass='${normalizedCaptionPath}'${fontsFilter}`
            : `subtitles='${normalizedCaptionPath}'${fontsFilter}`;

        command = command.videoFilters([filter]);

        command
            .output(outputPath)
            .on('progress', (progress) => {
                if (onProgress && progress.percent) {
                    onProgress(Math.min(99, Math.floor(progress.percent)));
                }
            })
            .on('end', () => {
                console.log(`[FFmpeg Caption] Captions burned successfully`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`[FFmpeg Caption] Error: ${err.message}`);
                // Return original if caption burn fails
                resolve(inputVideoPath);
            });

        command.run();
    });
}

/**
 * FFmpeg blend mode mapping
 * Maps CSS blend modes to FFmpeg blend filter modes
 */
const BLEND_MODE_MAP: Record<BlendMode, string> = {
    normal: 'normal',
    multiply: 'multiply',
    screen: 'screen',
    overlay: 'overlay',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'dodge',
    'color-burn': 'burn'
};

function escapeFilterPath(filePath: string) {
    return filePath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'");
}

function normalizeConcatPath(filePath: string) {
    return filePath.replace(/\\/g, '/');
}

function mapBlendMode(mode?: BlendMode): string {
    if (!mode) return 'normal';
    return BLEND_MODE_MAP[mode] || 'normal';
}

/**
 * Apply video overlays to the base video using FFmpeg filter_complex
 * 
 * Strategy:
 * 1. Use 'overlay' filter for proper video compositing (supports transparency)
 * 2. Scale overlays to match base video dimensions
 * 3. Loop overlays to match base video duration using -stream_loop
 * 4. Apply blend modes via blend filter when mode !== 'normal'
 * 5. Apply opacity via colorchannelmixer or format filter
 * 6. Single-pass encoding for efficiency
 * 
 * @param inputVideoPath - Path to the base video
 * @param overlays - Array of overlay configurations
 * @param onProgress - Progress callback
 * @returns Path to the output video with overlays applied
 */
export async function applyVideoOverlays(
    inputVideoPath: string,
    overlays?: InternalOverlay[],
    onProgress?: (progress: number) => void
): Promise<string> {
    if (!overlays || overlays.length === 0) {
        return inputVideoPath;
    }

    const videoOverlays = overlays.filter(
        overlay => overlay?.type === 'video' && overlay.filePath && fs.existsSync(overlay.filePath)
    );

    if (videoOverlays.length === 0) {
        console.log('[FFmpeg Overlay] No valid video overlays found, returning original video');
        return inputVideoPath;
    }

    // Get base video duration and dimensions
    const baseDuration = await getVideoDuration(inputVideoPath);
    const baseInfo = await getVideoInfo(inputVideoPath);
    
    console.log(`[FFmpeg Overlay] Base video: ${baseInfo.width}x${baseInfo.height}, duration: ${baseDuration}s`);
    console.log(`[FFmpeg Overlay] Applying ${videoOverlays.length} overlay(s)`);

    return new Promise((resolve, reject) => {
        const outputPath = getTempFilePath('mp4');
        let command = ffmpeg().input(inputVideoPath);

        // Add each overlay input with infinite loop
        videoOverlays.forEach((overlay) => {
            command = command
                .input(overlay.filePath!)
                .inputOptions([
                    '-stream_loop', '-1',  // Loop overlay infinitely
                    '-t', String(baseDuration)  // But limit to base duration
                ]);
        });

        // Build filter_complex for proper video compositing
        const filterParts: string[] = [];

        // Normalize base video to 30fps and ensure even dimensions (required for libx264)
        filterParts.push(`[0:v]fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=gbrap[base]`);

        let currentBase = 'base';

        videoOverlays.forEach((overlay, index) => {
            const inputIdx = index + 1;
            const opacity = Math.max(0, Math.min(1, overlay.opacity ?? 1));
            const blendMode = mapBlendMode(overlay.blendMode);
            
            const scaledLabel = `scaled${index}`;
            const resultLabel = index === videoOverlays.length - 1 ? 'outv' : `result${index}`;

            // Scale overlay to match base video dimensions and normalize timing
            filterParts.push(
                `[${inputIdx}:v]fps=30,scale=${baseInfo.width}:${baseInfo.height}:force_original_aspect_ratio=decrease,` +
                `pad=${baseInfo.width}:${baseInfo.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=gbrap,setpts=N/(30*TB)[${scaledLabel}]`
            );

            if (blendMode === 'normal') {
                if (opacity < 1) {
                    // Use blend filter to control opacity while keeping accurate colors
                    filterParts.push(
                        `[${currentBase}][${scaledLabel}]blend=all_mode='normal':all_opacity=${opacity}[${resultLabel}]`
                    );
                } else {
                    // Full opacity - direct overlay while preserving original colors
                    filterParts.push(
                            `[${currentBase}][${scaledLabel}]overlay=0:0:format=auto:shortest=1:eof_action=repeat[${resultLabel}]`
                    );
                }
            } else {
                // For special blend modes, rely on blend filter and respect opacity
                filterParts.push(
                    `[${currentBase}][${scaledLabel}]blend=all_mode='${blendMode}':all_opacity=${opacity}[${resultLabel}]`
                );
            }

            currentBase = resultLabel;
        });

        // Ensure output format is compatible
        filterParts.push(`[outv]format=yuv420p[final]`);

        const filterComplex = filterParts.join(';');
        console.log(`[FFmpeg Overlay] Filter complex:\n${filterComplex}`);

        command
            .complexFilter(filterComplex)
            .outputOptions([
                '-map', '[final]',
                '-map', '0:a?',           // Include audio from base if present
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                '-threads', '4',
                '-shortest',
                '-t', String(baseDuration)
            ])
            .output(outputPath)
            .on('start', (cmdLine) => {
                console.log(`[FFmpeg Overlay] Command: ${cmdLine.substring(0, 500)}...`);
            })
            .on('progress', (progress) => {
                if (onProgress && progress.percent) {
                    onProgress(Math.min(99, Math.floor(progress.percent)));
                }
            })
            .on('end', () => {
                console.log(`[FFmpeg Overlay] Successfully applied ${videoOverlays.length} overlay(s) to video`);
                // Clean up original video if it was a temp file
                if (inputVideoPath.includes('temp') && inputVideoPath !== outputPath) {
                    try { fs.unlinkSync(inputVideoPath); } catch { /* ignore */ }
                }
                resolve(outputPath);
            })
            .on('error', (err, stdout, stderr) => {
                console.error(`[FFmpeg Overlay] Error:`, err.message);
                console.error(`[FFmpeg Overlay] stderr:`, stderr);
                // Fall back to returning original video on error
                console.warn('[FFmpeg Overlay] Falling back to original video without overlays');
                resolve(inputVideoPath);
            })
            .run();
    });
}

function buildMotionFilter(
    motionEffect: MotionEffect,
    width: number,
    height: number,
    duration: number,
    fps: number
): string | null {
    if (!motionEffect || motionEffect === 'none') {
        return null;
    }

    const outWidth = Math.floor(width / 2) * 2;
    const outHeight = Math.floor(height / 2) * 2;
    const totalFrames = Math.max(1, Math.ceil(duration * fps));

    const scaleFactor = 1.15;
    const scaledWidth = Math.round(outWidth * scaleFactor);
    const scaledHeight = Math.round(outHeight * scaleFactor);

    const xAmplitude = Math.round((scaledWidth - outWidth) / 2);
    const yAmplitude = Math.round((scaledHeight - outHeight) / 2);

    switch (motionEffect) {
        case 'zoom-in':
            return `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}+${xAmplitude}*2*(1-n/${totalFrames})':'${outHeight}+${yAmplitude}*2*(1-n/${totalFrames})':'(in_w-out_w)/2':'(in_h-out_h)/2',scale=${outWidth}:${outHeight}`;
        case 'zoom-out':
            return `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}+${xAmplitude}*2*(n/${totalFrames})':'${outHeight}+${yAmplitude}*2*(n/${totalFrames})':'(in_w-out_w)/2':'(in_h-out_h)/2',scale=${outWidth}:${outHeight}`;
        case 'pan':
            return `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}':'${outHeight}':'(in_w-${outWidth})/2+${xAmplitude}*sin(n*4*PI/${totalFrames})':'(in_h-${outHeight})/2'`;
        case 'float': {
            const floatXAmp = Math.round(xAmplitude * 0.3);
            const floatYAmp = Math.round(yAmplitude * 0.3);
            return `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}':'${outHeight}':'(in_w-${outWidth})/2+${floatXAmp}*sin(n*4*PI/${totalFrames})':'(in_h-${outHeight})/2+${floatYAmp}*cos(n*4*PI/${totalFrames})'`;
        }
        default:
            return null;
    }
}

export interface VideoPostProcessOptions {
    inputVideoPath: string;
    duration: number;
    contentType: 'single-image' | 'multi-image' | 'stock-video';
    outputPath?: string;
    overlays?: InternalOverlay[];
    captionFilePath?: string;
    motionEffect?: MotionEffect;
}

export async function applyVideoPostProcessing(
    options: VideoPostProcessOptions,
    onProgress?: (progress: number) => void
): Promise<string> {
    const hasMotion = Boolean(options.motionEffect && options.motionEffect !== 'none');
    const hasCaptions = Boolean(options.captionFilePath && fs.existsSync(options.captionFilePath));
    const videoOverlays = (options.overlays || []).filter(
        overlay => overlay?.type === 'video' && overlay.filePath && fs.existsSync(overlay.filePath)
    );

    if (options.captionFilePath && !hasCaptions) {
        console.warn(`[FFmpeg PostProcess] Caption file not found: ${options.captionFilePath}`);
    }

    if (!hasMotion && !hasCaptions && videoOverlays.length === 0) {
        return options.inputVideoPath;
    }

    const outputPath = options.outputPath || getTempFilePath('mp4');
    const baseInfo = await getVideoInfo(options.inputVideoPath);
    const baseDuration = Math.max(0, options.duration || baseInfo.duration || 0);
    const baseFps = baseInfo.fps || 30;
    const targetFps = hasMotion ? getMotionFramerate(baseDuration) : baseFps;
    const normalizedFps = hasMotion ? Math.max(1, Math.round(targetFps)) : baseFps;
    const useFpsFilter = hasMotion || Math.abs(normalizedFps - baseFps) > 0.1;

    console.log(`[FFmpeg PostProcess] overlays=${videoOverlays.length}, motion=${hasMotion}, captions=${hasCaptions}, fps=${normalizedFps}`);

    return new Promise((resolve, reject) => {
        let command = ffmpeg().input(options.inputVideoPath);

        videoOverlays.forEach((overlay) => {
            command = command
                .input(overlay.filePath!)
                .inputOptions([
                    '-stream_loop', '-1',
                    '-t', String(baseDuration)
                ]);
        });

        const filterParts: string[] = [];
        const baseFilters: string[] = [];

        if (useFpsFilter) {
            baseFilters.push(`fps=${normalizedFps}`);
        }

        if (hasMotion) {
            const motionFilter = buildMotionFilter(
                options.motionEffect as MotionEffect,
                baseInfo.width,
                baseInfo.height,
                baseDuration,
                normalizedFps
            );
            if (motionFilter) {
                baseFilters.push(motionFilter);
            }
        } else {
            baseFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
        }

        baseFilters.push('setsar=1', 'format=gbrap');
        filterParts.push(`[0:v]${baseFilters.join(',')}[base]`);

        let currentBase = 'base';

        if (videoOverlays.length > 0) {
            videoOverlays.forEach((overlay, index) => {
                const inputIdx = index + 1;
                const opacity = Math.max(0, Math.min(1, overlay.opacity ?? 1));
                const blendMode = mapBlendMode(overlay.blendMode);
                const scaledLabel = `scaled${index}`;
                const resultLabel = `result${index}`;

                filterParts.push(
                    `[${inputIdx}:v]fps=${normalizedFps},scale=${baseInfo.width}:${baseInfo.height}:force_original_aspect_ratio=decrease,` +
                    `pad=${baseInfo.width}:${baseInfo.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=gbrap,` +
                    `setpts=N/(${normalizedFps}*TB)[${scaledLabel}]`
                );

                if (blendMode === 'normal') {
                    if (opacity < 1) {
                        filterParts.push(
                            `[${currentBase}][${scaledLabel}]blend=all_mode='normal':all_opacity=${opacity}[${resultLabel}]`
                        );
                    } else {
                        filterParts.push(
                            `[${currentBase}][${scaledLabel}]overlay=0:0:format=auto:shortest=1:eof_action=repeat[${resultLabel}]`
                        );
                    }
                } else {
                    filterParts.push(
                        `[${currentBase}][${scaledLabel}]blend=all_mode='${blendMode}':all_opacity=${opacity}[${resultLabel}]`
                    );
                }

                currentBase = resultLabel;
            });
        }

        if (hasCaptions) {
            const captionPath = escapeFilterPath(options.captionFilePath as string);
            const ext = path.extname(options.captionFilePath as string).toLowerCase();
            const windowsFontsDir = process.env.CAPTION_FONTS_DIR || 'C:/Windows/Fonts';
            const fontsDir = fs.existsSync(windowsFontsDir) ? escapeFilterPath(windowsFontsDir) : null;
            const fontsFilter = fontsDir ? `:fontsdir='${fontsDir}'` : '';
            const captionFilter = ext === '.ass'
                ? `ass='${captionPath}'${fontsFilter}`
                : `subtitles='${captionPath}'${fontsFilter}`;

            filterParts.push(`[${currentBase}]format=yuv420p,${captionFilter}[final]`);
        } else {
            filterParts.push(`[${currentBase}]format=yuv420p[final]`);
        }

        const filterComplex = filterParts.join(';');

        const encoderOptions = getEncoderOptions({
            contentType: options.contentType,
            durationSeconds: baseDuration,
            includeAudio: false
        }).filter(option => !option.startsWith('-r '));

        command
            .complexFilter(filterComplex)
            .outputOptions([
                '-map', '[final]',
                '-map', '0:a?',
                ...encoderOptions,
                '-c:a', 'copy',
                '-shortest',
                '-t', String(baseDuration)
            ])
            .output(outputPath)
            .on('start', (cmdLine) => {
                console.log(`[FFmpeg PostProcess] Command: ${cmdLine.substring(0, 500)}...`);
            })
            .on('progress', (progress) => {
                if (onProgress && progress.percent) {
                    onProgress(Math.min(99, Math.floor(progress.percent)));
                }
            })
            .on('end', () => {
                console.log('[FFmpeg PostProcess] Completed successfully');
                resolve(outputPath);
            })
            .on('error', (err, stdout, stderr) => {
                console.error('[FFmpeg PostProcess] Error:', err.message);
                console.error('[FFmpeg PostProcess] stderr:', stderr);
                reject(err);
            })
            .run();
    });
}

/**
 * Get video dimensions and metadata
 */
interface VideoInfo {
    width: number;
    height: number;
    duration: number;
    fps: number | null;
}

async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }
            
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            if (!videoStream) {
                reject(new Error('No video stream found'));
                return;
            }

            resolve({
                width: videoStream.width || 1920,
                height: videoStream.height || 1080,
                duration: metadata.format.duration || 0,
                fps: parseFps(videoStream.avg_frame_rate) ?? parseFps(videoStream.r_frame_rate)
            });
        });
    });
}

export function getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                resolve(metadata.format.duration || 0);
            }
        });
    });
}

export function getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                resolve(metadata.format.duration || 0);
            }
        });
    });
}

export async function normalizeAudioToWav(inputPath: string): Promise<{ outputPath: string; duration: number }> {
    const outputPath = getTempFilePath('wav');

    await new Promise<void>((resolve, reject) => {
        ffmpeg()
            .input(inputPath)
            .outputOptions([
                '-vn',
                '-ac', '2',
                '-ar', '44100',
                '-c:a', 'pcm_s16le'
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
            .run();
    });

    const duration = await getAudioDuration(outputPath);
    return { outputPath, duration };
}

export async function normalizeImageToPng(inputPath: string): Promise<string> {
    const outputPath = getUploadFilePath('png');

    await new Promise<void>((resolve, reject) => {
        ffmpeg()
            .input(inputPath)
            .outputOptions(['-frames:v 1'])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
            .run();
    });

    return outputPath;
}

/**
 * Concatenate multiple audio files into a single file seamlessly
 * @param audioPaths Array of absolute paths to audio files (MP3)
 * @param outputPath Optional output path, will generate temp file if not provided
 * @returns Promise resolving to the output file path
 */
export async function concatenateAudioFiles(
    audioPaths: string[],
    outputPath?: string
): Promise<string> {
    if (audioPaths.length === 0) {
        throw new Error('No audio files provided for concatenation');
    }

    if (audioPaths.length === 1) {
        // No need to concatenate a single file
        return audioPaths[0];
    }

    const output = outputPath || getTempFilePath('mp3');
    const concatListPath = getTempFilePath('txt');
    const concatList = audioPaths.map(p => `file '${normalizeConcatPath(p)}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList);

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
                '-c:a', 'libmp3lame', // Re-encode to MP3 for compatibility
                '-q:a', '2' // High quality
            ])
            .output(output)
            .on('end', () => {
                // Clean up concat list file
                try {
                    fs.unlinkSync(concatListPath);
                } catch (e) {
                    console.warn('Failed to delete concat list file:', e);
                }
                resolve(output);
            })
            .on('error', (err) => {
                // Clean up concat list file
                try {
                    fs.unlinkSync(concatListPath);
                } catch (e) {
                    // Ignore cleanup errors
                }
                reject(new Error(`FFmpeg concatenation error: ${err.message}`));
            })
            .run();
    });
}

/**
 * Apply motion effect to a video using FFmpeg zoompan filter
 * This adds subtle animation to static images to make them more dynamic
 * 
 * Motion effects:
 * - zoom-in: Slow zoom towards center (Ken Burns style)
 * - zoom-out: Start zoomed in, slowly zoom out
 * - pan: Gentle horizontal drift left-to-right and back
 * - float: Subtle circular floating motion (simulates handheld camera)
 * 
 * @param inputVideoPath - Path to the input video
 * @param motionEffect - The type of motion effect to apply
 * @param duration - Total duration of the video in seconds
 * @param onProgress - Progress callback
 * @returns Path to the output video with motion effect applied
 */
export async function applyMotionEffect(
    inputVideoPath: string,
    motionEffect: MotionEffect,
    duration: number,
    onProgress?: (progress: number) => void
): Promise<string> {
    // No effect or invalid effect - return original
    if (!motionEffect || motionEffect === 'none') {
        console.log('[Motion Effect] No motion effect requested, returning original video');
        return inputVideoPath;
    }

    console.log(`[Motion Effect] Applying '${motionEffect}' effect to video (duration: ${duration}s)`);

    // Get video info for proper scaling
    const videoInfo = await getVideoInfo(inputVideoPath);
    const { width, height } = videoInfo;
    
    // Ensure even dimensions (required for libx264)
    const outWidth = Math.floor(width / 2) * 2;
    const outHeight = Math.floor(height / 2) * 2;
    
    // Calculate frames - use configured motion framerate
    const fps = getMotionFramerate(duration);
    const totalFrames = Math.ceil(duration * fps);
    
    // Build video filter based on effect type
    // For video input, we scale up the video first, then use crop with animated expressions
    // to create smooth motion effects
    let videoFilter: string;
    
    // Scale factor to allow room for motion (scaled up video that we'll crop from)
    const scaleFactor = 1.15;
    const scaledWidth = Math.round(outWidth * scaleFactor);
    const scaledHeight = Math.round(outHeight * scaleFactor);
    
    // Motion amplitude (how much it can move)
    const xAmplitude = Math.round((scaledWidth - outWidth) / 2);
    const yAmplitude = Math.round((scaledHeight - outHeight) / 2);
    
    switch (motionEffect) {
        case 'zoom-in':
            // Slow zoom in - start showing full scaled image, gradually crop tighter
            // Using smooth easing with 't' (time in seconds) and 'n' (frame number)
            videoFilter = `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}+${xAmplitude}*2*(1-n/${totalFrames})':'${outHeight}+${yAmplitude}*2*(1-n/${totalFrames})':'(in_w-out_w)/2':'(in_h-out_h)/2',scale=${outWidth}:${outHeight}`;
            break;
            
        case 'zoom-out':
            // Slow zoom out - start cropped tight, gradually reveal more
            videoFilter = `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}+${xAmplitude}*2*(n/${totalFrames})':'${outHeight}+${yAmplitude}*2*(n/${totalFrames})':'(in_w-out_w)/2':'(in_h-out_h)/2',scale=${outWidth}:${outHeight}`;
            break;
            
        case 'pan':
            // Gentle horizontal pan - smooth sine wave motion left-to-right and back
            // Complete 2 full cycles over the duration for noticeable but smooth motion
            videoFilter = `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}':'${outHeight}':'(in_w-${outWidth})/2+${xAmplitude}*sin(n*4*PI/${totalFrames})':'(in_h-${outHeight})/2'`;
            break;
            
        case 'float':
            // Subtle circular floating motion - like handheld camera breathing effect
            // Very gentle circular path - stays close to center for smooth, easy viewing
            // Use small amplitude (30% of available) for subtle movement
            // Use 4*PI to get 2 smooth rotation cycles
            const floatXAmp = Math.round(xAmplitude * 0.3);
            const floatYAmp = Math.round(yAmplitude * 0.3);
            videoFilter = `scale=${scaledWidth}:${scaledHeight},crop='${outWidth}':'${outHeight}':'(in_w-${outWidth})/2+${floatXAmp}*sin(n*4*PI/${totalFrames})':'(in_h-${outHeight})/2+${floatYAmp}*cos(n*4*PI/${totalFrames})'`;
            break;
            
        default:
            console.log(`[Motion Effect] Unknown effect '${motionEffect}', returning original video`);
            return inputVideoPath;
    }

    const outputPath = getTempFilePath('mp4');

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(inputVideoPath)
            .videoFilters([videoFilter])
            .outputOptions([
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'copy',  // Copy audio without re-encoding
                '-threads', '4',
                '-t', String(duration)  // Ensure exact duration
            ])
            .output(outputPath)
            .on('start', (cmdLine) => {
                console.log(`[Motion Effect] FFmpeg command: ${cmdLine.substring(0, 300)}...`);
            })
            .on('progress', (progress) => {
                if (onProgress && progress.percent) {
                    onProgress(Math.min(99, Math.floor(progress.percent)));
                }
            })
            .on('end', () => {
                console.log(`[Motion Effect] Successfully applied '${motionEffect}' effect`);
                // Clean up original video if it was a temp file
                if (inputVideoPath.includes('temp') && inputVideoPath !== outputPath) {
                    try { fs.unlinkSync(inputVideoPath); } catch { /* ignore */ }
                }
                resolve(outputPath);
            })
            .on('error', (err, stdout, stderr) => {
                console.error(`[Motion Effect] Error:`, err.message);
                console.error(`[Motion Effect] stderr:`, stderr);
                // Fall back to returning original video on error
                console.warn('[Motion Effect] Falling back to original video without motion effect');
                resolve(inputVideoPath);
            })
            .run();
    });
}

