import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { 
    CaptionSegment, 
    CaptionStyle, 
    CaptionRequest, 
    CaptionResponse,
    CaptionWord,
    WordTimestamp
} from 'shared/src/types';
import { getTempFilePath } from './file.service';

const genAI = process.env.GEMINI_API_KEY 
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

/**
 * Generate captions with word-level timestamps
 * If wordTimestamps are provided (from transcription), uses those for accurate alignment
 * Otherwise falls back to estimation based on script structure
 */
export async function generateCaptions(request: CaptionRequest): Promise<CaptionResponse> {
    const { script, voiceoverDuration, style, wordTimestamps } = request;

    // Use real timestamps if provided, otherwise estimate
    let segments: CaptionSegment[];
    
    if (wordTimestamps && wordTimestamps.length > 0) {
        console.log('[Caption] Using real transcription timestamps for accurate alignment');
        segments = generateSegmentsFromTranscription(wordTimestamps, voiceoverDuration);
    } else {
        console.log('[Caption] No transcription provided, using estimated timing');
        segments = generateSegmentsFromScript(script, voiceoverDuration);
    }
    
    // Generate SRT content
    const srtContent = generateSRT(segments);
    
    // Generate ASS content with styling
    const assContent = generateASS(segments, style);
    
    return {
        segments,
        srtContent,
        assContent
    };
}

/**
 * Generate caption segments from real transcription timestamps
 * Groups words into readable segments (max ~8 words per segment)
 */
function generateSegmentsFromTranscription(
    wordTimestamps: WordTimestamp[], 
    totalDuration: number
): CaptionSegment[] {
    const segments: CaptionSegment[] = [];
    const MAX_WORDS_PER_SEGMENT = 5;
    const MAX_CHARS_PER_SEGMENT = 40;
    const PAUSE_THRESHOLD = 0.4; // Split on pauses longer than 400ms (natural sentence breaks)
    
    let currentWords: WordTimestamp[] = [];
    let currentText = '';
    
    for (const wordTs of wordTimestamps) {
        const potentialText = currentText ? `${currentText} ${wordTs.word}` : wordTs.word;
        
        // Check for natural pause (gap between last word end and current word start)
        const lastWord = currentWords[currentWords.length - 1];
        const hasPause = lastWord && (wordTs.startTime - lastWord.endTime) > PAUSE_THRESHOLD;
        
        // Check if we should start a new segment
        const shouldSplit = 
            currentWords.length >= MAX_WORDS_PER_SEGMENT ||
            potentialText.length >= MAX_CHARS_PER_SEGMENT ||
            hasPause ||  // Split on natural pauses (sentence boundaries)
            // Split on sentence-ending punctuation
            /[.!?]$/.test(currentText);
        
        if (shouldSplit && currentWords.length > 0) {
            // Finalize current segment
            segments.push({
                text: currentText,
                startTime: currentWords[0].startTime,
                endTime: currentWords[currentWords.length - 1].endTime,
                words: currentWords.map(w => ({
                    word: w.word,
                    startTime: w.startTime,
                    endTime: w.endTime
                }))
            });
            
            // Start new segment
            currentWords = [wordTs];
            currentText = wordTs.word;
        } else {
            currentWords.push(wordTs);
            currentText = potentialText;
        }
    }
    
    // Don't forget the last segment
    if (currentWords.length > 0) {
        segments.push({
            text: currentText,
            startTime: currentWords[0].startTime,
            endTime: currentWords[currentWords.length - 1].endTime,
            words: currentWords.map(w => ({
                word: w.word,
                startTime: w.startTime,
                endTime: w.endTime
            }))
        });
    }
    
    return segments;
}

/**
 * Split script into caption segments with estimated timing
 * Uses intelligent parsing based on punctuation and natural pauses
 */
function generateSegmentsFromScript(script: string, totalDuration: number): CaptionSegment[] {
    const segments: CaptionSegment[] = [];
    
    // Split by sentences/clauses
    const sentences = script
        .replace(/([.!?])\s+/g, '$1|')
        .replace(/([,;:])\s+/g, '$1|')
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    if (sentences.length === 0) {
        return [];
    }
    
    // Calculate total character count for proportional timing
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    
    let currentTime = 0;
    
    for (const sentence of sentences) {
        // Calculate duration based on character proportion + small buffer for natural pauses
        const charRatio = sentence.length / totalChars;
        let duration = totalDuration * charRatio;
        
        // Ensure minimum readable duration (at least 1 second per segment)
        duration = Math.max(duration, 1.0);
        
        // Add slight pause after sentence-ending punctuation
        const endsWithPunctuation = /[.!?]$/.test(sentence);
        const pauseBuffer = endsWithPunctuation ? 0.3 : 0.1;
        
        // Generate word-level timestamps within segment
        const words = generateWordTimings(sentence, currentTime, duration - pauseBuffer);
        
        segments.push({
            text: sentence,
            startTime: currentTime,
            endTime: currentTime + duration - pauseBuffer,
            words
        });
        
        currentTime += duration;
    }
    
    // Normalize to fit exactly within totalDuration
    if (currentTime > totalDuration && segments.length > 0) {
        const scale = totalDuration / currentTime;
        let adjustedTime = 0;
        
        for (const segment of segments) {
            const originalDuration = segment.endTime - segment.startTime;
            segment.startTime = adjustedTime;
            segment.endTime = adjustedTime + (originalDuration * scale);
            
            // Adjust word timings
            if (segment.words) {
                const segmentScale = (segment.endTime - segment.startTime) / originalDuration;
                for (const word of segment.words) {
                    const wordOffset = word.startTime - segment.startTime;
                    word.startTime = segment.startTime + (wordOffset * segmentScale);
                    word.endTime = word.startTime + ((word.endTime - word.startTime) * segmentScale);
                }
            }
            
            adjustedTime = segment.endTime;
        }
    }
    
    return segments;
}

/**
 * Generate word-level timings within a segment
 */
function generateWordTimings(text: string, startTime: number, duration: number): CaptionWord[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];
    
    const totalChars = words.reduce((sum, w) => sum + w.length, 0);
    const result: CaptionWord[] = [];
    
    let currentTime = startTime;
    
    for (const word of words) {
        const wordRatio = word.length / totalChars;
        const wordDuration = duration * wordRatio;
        
        result.push({
            word,
            startTime: currentTime,
            endTime: currentTime + wordDuration
        });
        
        currentTime += wordDuration;
    }
    
    return result;
}

/**
 * Generate SRT subtitle format
 */
function generateSRT(segments: CaptionSegment[]): string {
    return segments.map((segment, index) => {
        const start = formatSRTTime(segment.startTime);
        const end = formatSRTTime(segment.endTime);
        return `${index + 1}\n${start} --> ${end}\n${segment.text}\n`;
    }).join('\n');
}

function formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Generate ASS subtitle format with styling
 * Font sizes are calibrated for 1920x1080 video output
 */
function generateASS(segments: CaptionSegment[], style?: CaptionStyle): string {
    const captionStyle = style || {
        fontSize: 'medium',
        color: '#FFFFFF',
        position: 'bottom',
        backgroundColor: '#000000'
    };
    
    // ASS uses BGR format
    const primaryColor = hexToBGR(captionStyle.color);
    const outlineColor = hexToBGR(captionStyle.backgroundColor || '#000000');
    
    // Larger font sizes for better readability at 1080p
    // These match the preview component exactly
    const fontSize = captionStyle.fontSize === 'small' ? 48 
        : captionStyle.fontSize === 'large' ? 80 
        : 64; // medium
    
    const alignment = captionStyle.position === 'top' ? 8 
        : captionStyle.position === 'center' ? 5 
        : 2;
    
    const fontFamily = captionStyle.fontFamily || 'Arial';
    
    // Outline thickness scales with font size
    const outlineSize = Math.round(fontSize / 16);
    const shadowSize = Math.round(fontSize / 32);
    
    const header = `[Script Info]
Title: Generated Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},&H00${primaryColor},&H00${primaryColor},&H00${outlineColor},&H80${outlineColor},-1,0,0,0,100,100,0,0,1,${outlineSize},${shadowSize},${alignment},50,50,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = segments.map(segment => {
        const start = formatASSTime(segment.startTime);
        const end = formatASSTime(segment.endTime);
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,${segment.text}`;
    }).join('\n');
    
    return header + events;
}

function formatASSTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours}:${String(minutes).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
}

function hexToBGR(hex: string): string {
    const clean = hex.replace('#', '');
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    return `${b}${g}${r}`.toUpperCase();
}

/**
 * Save captions to a file for FFmpeg to use
 */
export async function saveCaptionFile(
    segments: CaptionSegment[], 
    style?: CaptionStyle,
    format: 'srt' | 'ass' = 'ass'
): Promise<string> {
    const content = format === 'srt' 
        ? generateSRT(segments)
        : generateASS(segments, style);
    
    const filePath = getTempFilePath(format);
    fs.writeFileSync(filePath, content, 'utf-8');
    
    console.log(`[Caption] Saved ${segments.length} segments to ${filePath}`);
    
    return filePath;
}

/**
 * Default caption styles
 */
export const DEFAULT_CAPTION_STYLES: Record<string, CaptionStyle> = {
    classic: {
        fontSize: 'medium',
        color: '#FFFFFF',
        backgroundColor: '#000000',
        position: 'bottom',
        fontFamily: 'Arial'
    },
    modern: {
        fontSize: 'large',
        color: '#FFFFFF',
        backgroundColor: '#1a1a1a',
        position: 'bottom',
        fontFamily: 'Helvetica'
    },
    minimal: {
        fontSize: 'small',
        color: '#FFFFFF',
        position: 'bottom',
        fontFamily: 'Arial'
    },
    dramatic: {
        fontSize: 'large',
        color: '#FFFF00',
        backgroundColor: '#000000',
        position: 'center',
        fontFamily: 'Impact'
    }
};


