import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { BlendMode, Overlay } from 'shared/src/types';
import { getTempFilePath } from './file.service';

/**
 * FFmpeg service for video composition
 */

export interface VideoCompositionOptions {
    audioPath: string;
    audioDuration: number;
    outputPath?: string;
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

type InternalOverlay = Overlay & { filePath?: string };

export async function generateSingleImageVideo(
    options: SingleImageOptions,
    onProgress?: (progress: number) => void
): Promise<string> {
    const outputPath = options.outputPath || getTempFilePath('mp4');

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

        // Output options
        command = command
            .outputOptions([
                '-c:v libx264',
                '-preset ultrafast',
                '-crf 28',
                '-tune stillimage',
                '-c:a aac',
                '-b:a 192k',
                '-pix_fmt yuv420p',
                '-threads 4',
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

    // First, create individual video clips for each image
    const videoClips: string[] = [];

    for (let i = 0; i < options.images.length; i++) {
        const { imagePath, duration } = options.images[i];
        const clipPath = getTempFilePath('mp4');

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(imagePath)
                .inputOptions(['-loop 1', `-t ${duration}`])
                .outputOptions([
                    '-c:v libx264',
                    '-preset ultrafast',
                    '-crf 28',
                    '-tune stillimage',
                    '-pix_fmt yuv420p',
                    '-r 30',
                    '-threads 4'
                ])
                .output(clipPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        videoClips.push(clipPath);

        if (onProgress) {
            onProgress(Math.floor((i / options.images.length) * 50));
        }
    }

    // Concatenate all video clips
    const concatListPath = getTempFilePath('txt');
    const concatList = videoClips.map(clip => `file '${normalizeConcatPath(clip)}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList);

    return new Promise((resolve, reject) => {
        let command = ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f concat', '-safe 0'])
            .input(options.audioPath)
            .outputOptions([
                '-c:v libx264',
                '-preset ultrafast',
                '-crf 28',
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-b:a 192k',
                '-threads 4',
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

    const concatListPath = getTempFilePath('txt');
    const concatList = options.videos
        .map(video => `file '${normalizeConcatPath(video.videoPath)}'`)
        .join('\n');
    fs.writeFileSync(concatListPath, concatList);

    return new Promise((resolve, reject) => {
        let command = ffmpeg()
            .input(concatListPath)
            .inputOptions(['-f concat', '-safe 0'])
            .input(options.audioPath)
            .outputOptions([
                '-c:v libx264',
                '-preset ultrafast',
                '-crf 28',
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-b:a 192k',
                '-threads 4',
                '-shortest'
            ])
            .output(outputPath);

        command.on('progress', (progress) => {
            if (onProgress && progress.percent) {
                onProgress(Math.min(99, Math.floor(progress.percent)));
            }
        });

        command.on('end', async () => {
            try {
                fs.unlinkSync(concatListPath);
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
            reject(new Error(`FFmpeg stock video error: ${err.message}`));
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
async function applyVideoOverlays(
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

/**
 * Get video dimensions and metadata
 */
interface VideoInfo {
    width: number;
    height: number;
    duration: number;
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
                duration: metadata.format.duration || 0
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

