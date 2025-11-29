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
                '-tune stillimage',
                '-c:a aac',
                '-b:a 192k',
                '-pix_fmt yuv420p',
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
                if (onProgress) onProgress(100);
                const finalPath = await applyVideoOverlays(outputPath, options.overlays, onProgress);
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
                    '-tune stillimage',
                    '-pix_fmt yuv420p',
                    '-r 30'
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
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-b:a 192k',
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
                if (onProgress) onProgress(100);
                fs.unlinkSync(concatListPath);
                videoClips.forEach(clip => {
                    try { fs.unlinkSync(clip); } catch { /* ignore */ }
                });
                const finalPath = await applyVideoOverlays(outputPath, options.overlays, onProgress);
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
                '-pix_fmt yuv420p',
                '-c:a aac',
                '-b:a 192k',
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
                const finalPath = await applyVideoOverlays(outputPath, options.overlays, onProgress);
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

function mapBlendMode(mode?: BlendMode) {
    if (!mode) return 'normal';
    return BLEND_MODE_MAP[mode] || 'normal';
}

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
        return inputVideoPath;
    }

    // Get base video duration for looping overlays
    const baseDuration = await getVideoDuration(inputVideoPath);
    console.log(`[FFmpeg Overlay] Base video duration: ${baseDuration}s, applying ${videoOverlays.length} overlay(s)`);

    return new Promise((resolve, reject) => {
        const outputPath = getTempFilePath('mp4');
        let command = ffmpeg().input(inputVideoPath);

        // Add overlay inputs with loop enabled (-stream_loop -1 loops infinitely)
        videoOverlays.forEach((overlay) => {
            command = command
                .input(overlay.filePath!)
                .inputOptions(['-stream_loop', '-1']); // Loop the overlay infinitely
        });

        // Build filter complex
        // Start with scaling base video to ensure even dimensions
        const filterParts: string[] = ['[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2[base0]'];
        let currentLabel = 'base0';

        videoOverlays.forEach((overlay, index) => {
            const overlayStream = `${index + 1}:v`;
            const overlayLabel = `ov${index}`;
            const scaledOverlay = `sov${index}`;
            const refLabel = `ref${index}`;
            const mode = mapBlendMode(overlay.blendMode);
            const opacity = Math.max(0, Math.min(1, overlay.opacity ?? 1));

            // Scale overlay to match base, then apply blend
            // First scale overlay to same size as current base
            filterParts.push(`[${overlayStream}]scale=trunc(iw/2)*2:trunc(ih/2)*2[${scaledOverlay}]`);
            filterParts.push(`[${scaledOverlay}][${currentLabel}]scale2ref[${overlayLabel}][${refLabel}]`);
            filterParts.push(`[${refLabel}][${overlayLabel}]blend=all_mode='${mode}':all_opacity=${opacity}[base${index + 1}]`);
            currentLabel = `base${index + 1}`;
        });

        filterParts.push(`[${currentLabel}]format=yuv420p[outv]`);

        console.log(`[FFmpeg Overlay] Filter complex: ${filterParts.join(';').substring(0, 200)}...`);

        command
            .complexFilter(filterParts.join(';'))
            .outputOptions([
                '-map', '[outv]',
                '-map', '0:a?',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-c:a', 'aac',
                '-t', String(baseDuration), // Limit output to base video duration
                '-shortest'
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                if (onProgress && progress.percent) {
                    onProgress(Math.min(99, Math.floor(progress.percent)));
                }
            })
            .on('end', () => {
                console.log(`[FFmpeg Overlay] Successfully applied overlays to video`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`[FFmpeg Overlay] Error:`, err);
                reject(new Error(`FFmpeg overlay error: ${err.message}`));
            })
            .run();
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

