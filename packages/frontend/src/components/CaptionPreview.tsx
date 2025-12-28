'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { CaptionStyle, WordTimestamp, CaptionSegment } from 'shared/src/types';
import './CaptionPreview.css';

interface CaptionPreviewProps {
    voiceoverUrl: string | null;
    voiceoverDuration: number | null;
    wordTimestamps: WordTimestamp[];
    captionStyle: CaptionStyle;
    captionsEnabled: boolean;
    script: string;
}

// Font sizes in pixels at 1080p - matches ASS output exactly
const FONT_SIZES = {
    small: 48,
    medium: 64,
    large: 80
};

// Preview scale factor (preview is smaller than 1920x1080)
const PREVIEW_WIDTH = 400;
const PREVIEW_HEIGHT = 225;
const SCALE_FACTOR = PREVIEW_WIDTH / 1920;

/**
 * Generate caption segments from word timestamps
 * Same logic as backend caption.service.ts
 */
function generateSegmentsFromTimestamps(wordTimestamps: WordTimestamp[]): CaptionSegment[] {
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
        
        const shouldSplit = 
            currentWords.length >= MAX_WORDS_PER_SEGMENT ||
            potentialText.length >= MAX_CHARS_PER_SEGMENT ||
            hasPause ||  // Split on natural pauses
            /[.!?]$/.test(currentText);
        
        if (shouldSplit && currentWords.length > 0) {
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
            
            currentWords = [wordTs];
            currentText = wordTs.word;
        } else {
            currentWords.push(wordTs);
            currentText = potentialText;
        }
    }
    
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
 * Generate estimated segments from script (fallback)
 */
function generateEstimatedSegments(script: string, duration: number): CaptionSegment[] {
    const sentences = script
        .replace(/([.!?])\s+/g, '$1|')
        .replace(/([,;:])\s+/g, '$1|')
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    if (sentences.length === 0) return [];
    
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    const segments: CaptionSegment[] = [];
    let currentTime = 0;
    
    for (const sentence of sentences) {
        const charRatio = sentence.length / totalChars;
        const segDuration = Math.max(duration * charRatio, 1.0);
        
        segments.push({
            text: sentence,
            startTime: currentTime,
            endTime: currentTime + segDuration
        });
        
        currentTime += segDuration;
    }
    
    return segments;
}

export default function CaptionPreview({
    voiceoverUrl,
    voiceoverDuration,
    wordTimestamps,
    captionStyle,
    captionsEnabled,
    script
}: CaptionPreviewProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentCaption, setCurrentCaption] = useState<string>('');

    // Generate segments from timestamps or estimate from script
    const segments = useMemo(() => {
        if (wordTimestamps && wordTimestamps.length > 0) {
            return generateSegmentsFromTimestamps(wordTimestamps);
        } else if (script && voiceoverDuration) {
            return generateEstimatedSegments(script, voiceoverDuration);
        }
        return [];
    }, [wordTimestamps, script, voiceoverDuration]);

    // Update current caption based on playback time
    useEffect(() => {
        if (!captionsEnabled || segments.length === 0) {
            setCurrentCaption('');
            return;
        }

        const segment = segments.find(
            s => currentTime >= s.startTime && currentTime < s.endTime
        );
        
        setCurrentCaption(segment?.text || '');
    }, [currentTime, segments, captionsEnabled]);

    // Handle audio time updates
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);
        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handleEnded);
        };
    }, []);

    const togglePlayback = () => {
        const audio = audioRef.current;
        if (!audio || !voiceoverUrl) return;

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;
        
        const newTime = parseFloat(e.target.value);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    // Calculate scaled font size for preview
    const scaledFontSize = FONT_SIZES[captionStyle.fontSize] * SCALE_FACTOR;
    
    // Outline size scales with font
    const outlineSize = Math.round(scaledFontSize / 16);

    // Position style
    const getPositionStyle = (): React.CSSProperties => {
        switch (captionStyle.position) {
            case 'top':
                return { top: '10%', bottom: 'auto' };
            case 'center':
                return { top: '50%', transform: 'translateY(-50%)' };
            default:
                return { bottom: '10%', top: 'auto' };
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const hasTimestamps = wordTimestamps && wordTimestamps.length > 0;

    return (
        <div className="caption-preview-container">
            <div className="caption-preview-header">
                <h4>Caption Preview</h4>
                <div className="caption-preview-badge">
                    {hasTimestamps ? (
                        <span className="badge accurate">✓ Accurate Timing</span>
                    ) : (
                        <span className="badge estimated">⚠ Estimated Timing</span>
                    )}
                </div>
            </div>

            {/* Video-like preview area */}
            <div 
                className="caption-preview-video"
                style={{ 
                    width: PREVIEW_WIDTH, 
                    height: PREVIEW_HEIGHT,
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
                }}
            >
                {/* Caption text */}
                {captionsEnabled && currentCaption && (
                    <div 
                        className="caption-text"
                        style={{
                            ...getPositionStyle(),
                            fontSize: `${scaledFontSize}px`,
                            fontFamily: captionStyle.fontFamily || 'Arial',
                            color: captionStyle.color,
                            textShadow: captionStyle.backgroundColor 
                                ? `${outlineSize}px ${outlineSize}px 0 ${captionStyle.backgroundColor}, 
                                   -${outlineSize}px -${outlineSize}px 0 ${captionStyle.backgroundColor},
                                   ${outlineSize}px -${outlineSize}px 0 ${captionStyle.backgroundColor},
                                   -${outlineSize}px ${outlineSize}px 0 ${captionStyle.backgroundColor}`
                                : 'none'
                        }}
                    >
                        {currentCaption}
                    </div>
                )}

                {/* No caption placeholder */}
                {!captionsEnabled && (
                    <div className="caption-disabled-notice">
                        Captions Disabled
                    </div>
                )}

                {/* No voiceover placeholder */}
                {!voiceoverUrl && (
                    <div className="no-voiceover-notice">
                        Generate voiceover to preview captions
                    </div>
                )}
            </div>

            {/* Audio controls */}
            {voiceoverUrl && (
                <div className="caption-preview-controls">
                    <button 
                        className="play-pause-btn"
                        onClick={togglePlayback}
                        disabled={!voiceoverUrl}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    
                    <span className="time-display">
                        {formatTime(currentTime)}
                    </span>
                    
                    <input
                        type="range"
                        className="seek-slider"
                        min={0}
                        max={voiceoverDuration || 0}
                        step={0.1}
                        value={currentTime}
                        onChange={handleSeek}
                    />
                    
                    <span className="time-display">
                        {formatTime(voiceoverDuration || 0)}
                    </span>

                    <audio 
                        ref={audioRef} 
                        src={voiceoverUrl.startsWith('/') 
                            ? `http://localhost:3001${voiceoverUrl}` 
                            : voiceoverUrl
                        } 
                    />
                </div>
            )}

            {/* Size reference note */}
            <div className="caption-preview-note">
                <small>
                    Preview scaled to fit. Final video: 1920×1080 with {FONT_SIZES[captionStyle.fontSize]}px captions.
                </small>
            </div>
        </div>
    );
}
