'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import './TimelineEditor.css';

export interface TimelineSlot {
  id: string;
  type: 'image' | 'video';
  assetUrl: string;
  thumbnailUrl?: string;
  duration: number; // in seconds
  startTime: number; // calculated from sequence
  label?: string;
  originalIndex?: number; // Original index in source array
}

interface TimelineEditorProps {
  slots: TimelineSlot[];
  totalDuration: number; // voiceover duration
  onSlotsChange: (slots: TimelineSlot[]) => void;
  voiceoverUrl?: string;
}

export function TimelineEditor({ 
  slots, 
  totalDuration, 
  onSlotsChange,
  voiceoverUrl 
}: TimelineEditorProps) {
  // Auto-select first clip by default
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(slots[0]?.id || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [resizingSlot, setResizingSlot] = useState<{ id: string; edge: 'left' | 'right'; startX: number; startDuration: number; startLeft: number } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<{ id: string; startX: number; initialIndex: number } | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadInterval = useRef<NodeJS.Timeout | null>(null);

  // Ensure a clip is always selected
  React.useEffect(() => {
    if (!selectedSlotId || !slots.find(s => s.id === selectedSlotId)) {
      // Select first clip if current selection is invalid
      if (slots.length > 0) {
        setSelectedSlotId(slots[0].id);
      }
    }
  }, [slots, selectedSlotId]);

  // Calculate total slots duration
  const totalSlotsDuration = slots.reduce((sum, s) => sum + s.duration, 0);
  
  // Calculate start times for each slot
  const slotsWithTiming = React.useMemo(() => {
    let currentStart = 0;
    return slots.map(slot => {
      const slotWithStart = { ...slot, startTime: currentStart };
      currentStart += slot.duration;
      return slotWithStart;
    });
  }, [slots]);

  // Get currently visible slot based on playhead position
  const currentSlotIndex = React.useMemo(() => {
    for (let i = slotsWithTiming.length - 1; i >= 0; i--) {
      if (currentTime >= slotsWithTiming[i].startTime) {
        return i;
      }
    }
    return 0;
  }, [currentTime, slotsWithTiming]);

  // Handle play/pause
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      if (playheadInterval.current) {
        clearInterval(playheadInterval.current);
      }
    } else {
      audioRef.current.currentTime = currentTime;
      audioRef.current.play();
      playheadInterval.current = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          if (audioRef.current.ended) {
            setIsPlaying(false);
            setCurrentTime(0);
            if (playheadInterval.current) {
              clearInterval(playheadInterval.current);
            }
          }
        }
      }, 50);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playheadInterval.current) {
        clearInterval(playheadInterval.current);
      }
    };
  }, []);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format time with milliseconds MM:SS.ms
  const formatTimeMs = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Get time from mouse position on timeline
  const getTimeFromMouseX = useCallback((clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * totalDuration;
  }, [totalDuration]);

  // Handle playhead drag
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    
    // Pause if playing
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      if (playheadInterval.current) {
        clearInterval(playheadInterval.current);
      }
      setIsPlaying(false);
    }
  };

  // Handle timeline click to seek
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (resizingSlot) return;
    const newTime = getTimeFromMouseX(e.clientX);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Get slot index from mouse X position
  const getSlotIndexFromX = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const targetTime = percentage * totalDuration;
    
    // Find which slot this time falls into
    let cumulative = 0;
    for (let i = 0; i < slotsWithTiming.length; i++) {
      cumulative += slotsWithTiming[i].duration;
      if (targetTime <= cumulative) {
        return i;
      }
    }
    return slotsWithTiming.length - 1;
  }, [totalDuration, slotsWithTiming]);

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, slotId: string, edge: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    const slot = slots.find(s => s.id === slotId);
    const slotWithTiming = slotsWithTiming.find(s => s.id === slotId);
    if (!slot || !slotWithTiming) return;
    
    setResizingSlot({
      id: slotId,
      edge,
      startX: e.clientX,
      startDuration: slot.duration,
      startLeft: slotWithTiming.startTime
    });
    setSelectedSlotId(slotId);
  };

  // Handle mouse move for resizing, playhead drag, and clip reordering
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Handle playhead drag
      if (isDraggingPlayhead) {
        const newTime = getTimeFromMouseX(e.clientX);
        setCurrentTime(newTime);
        if (audioRef.current) {
          audioRef.current.currentTime = newTime;
        }
      }
      
      // Handle clip reordering drag
      if (draggingSlot && trackRef.current) {
        const targetIndex = getSlotIndexFromX(e.clientX);
        if (targetIndex !== draggingSlot.initialIndex) {
          setDropTargetIndex(targetIndex);
        } else {
          setDropTargetIndex(null);
        }
      }
      
      // Handle slot resize - smooth with 0.1s precision
      if (resizingSlot && trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        const deltaX = e.clientX - resizingSlot.startX;
        const deltaPercent = deltaX / rect.width;
        const deltaDuration = deltaPercent * totalDuration;
        
        const slotIndex = slots.findIndex(s => s.id === resizingSlot.id);
        if (slotIndex === -1) return;
        
        let newDuration: number;
        if (resizingSlot.edge === 'right') {
          newDuration = resizingSlot.startDuration + deltaDuration;
        } else {
          newDuration = resizingSlot.startDuration - deltaDuration;
        }
        
        // Clamp duration between 0.5 and 120 seconds, with 0.1s precision
        newDuration = Math.max(0.5, Math.min(120, Math.round(newDuration * 10) / 10));
        
        const updated = slots.map(s => 
          s.id === resizingSlot.id ? { ...s, duration: newDuration } : s
        );
        onSlotsChange(updated);
      }
    };

    const handleMouseUp = () => {
      // Handle drop for reordering
      if (draggingSlot && dropTargetIndex !== null) {
        const draggedIndex = slots.findIndex(s => s.id === draggingSlot.id);
        if (draggedIndex !== -1 && draggedIndex !== dropTargetIndex) {
          const newSlots = [...slots];
          const [removed] = newSlots.splice(draggedIndex, 1);
          const insertIndex = dropTargetIndex > draggedIndex ? dropTargetIndex : dropTargetIndex;
          newSlots.splice(insertIndex, 0, removed);
          onSlotsChange(newSlots);
        }
      }
      
      setIsDraggingPlayhead(false);
      setResizingSlot(null);
      setDraggingSlot(null);
      setDropTargetIndex(null);
    };

    if (isDraggingPlayhead || resizingSlot || draggingSlot) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = resizingSlot ? 'ew-resize' : draggingSlot ? 'grabbing' : 'grabbing';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDraggingPlayhead, resizingSlot, draggingSlot, dropTargetIndex, getTimeFromMouseX, getSlotIndexFromX, totalDuration, slots, onSlotsChange]);

  // Handle duration change for a slot
  const handleDurationChange = (slotId: string, newDuration: number) => {
    const updated = slots.map(s => 
      s.id === slotId ? { ...s, duration: Math.max(0.5, Math.min(120, newDuration)) } : s
    );
    onSlotsChange(updated);
  };

  // Distribute durations evenly
  const distributeEvenly = () => {
    const evenDuration = Math.ceil(totalDuration / slots.length);
    const updated = slots.map((s, idx) => ({
      ...s,
      duration: idx === slots.length - 1 
        ? Math.max(1, totalDuration - (evenDuration * (slots.length - 1)))
        : evenDuration
    }));
    onSlotsChange(updated);
  };

  // Duplicate a slot
  const duplicateSlot = (slotId: string) => {
    const slotIndex = slots.findIndex(s => s.id === slotId);
    if (slotIndex === -1) return;
    
    const slot = slots[slotIndex];
    const newSlot: TimelineSlot = {
      ...slot,
      id: `${slot.id}-copy-${Date.now()}`,
      label: `${slot.label || 'Clip'} (copy)`,
    };
    
    const newSlots = [...slots];
    newSlots.splice(slotIndex + 1, 0, newSlot);
    onSlotsChange(newSlots);
  };

  // Delete a slot
  const deleteSlot = (slotId: string) => {
    if (slots.length <= 1) return;
    const updated = slots.filter(s => s.id !== slotId);
    onSlotsChange(updated);
    if (selectedSlotId === slotId) {
      setSelectedSlotId(null);
    }
  };

  // Split slot at playhead
  const splitAtPlayhead = () => {
    const slot = slotsWithTiming[currentSlotIndex];
    if (!slot) return;
    
    const timeIntoSlot = currentTime - slot.startTime;
    if (timeIntoSlot <= 0.5 || timeIntoSlot >= slot.duration - 0.5) return;
    
    const slotIndex = slots.findIndex(s => s.id === slot.id);
    if (slotIndex === -1) return;
    
    const firstPart: TimelineSlot = {
      ...slot,
      duration: Math.round(timeIntoSlot),
    };
    
    const secondPart: TimelineSlot = {
      ...slot,
      id: `${slot.id}-split-${Date.now()}`,
      duration: Math.round(slot.duration - timeIntoSlot),
      label: `${slot.label || 'Clip'} (2)`,
    };
    
    const newSlots = [...slots];
    newSlots.splice(slotIndex, 1, firstPart, secondPart);
    onSlotsChange(newSlots);
  };

  // Handle drag start for reordering
  const handleDragStart = (e: React.MouseEvent, slotId: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingSlot({
      id: slotId,
      startX: e.clientX,
      initialIndex: index
    });
    setSelectedSlotId(slotId);
  };

  // Auto-even remaining clips from current clip onwards
  const autoEvenFromCurrent = () => {
    if (selectedSlotId === null) return;
    const selectedIndex = slots.findIndex(s => s.id === selectedSlotId);
    if (selectedIndex === -1) return;
    
    // Calculate time already used by clips before the selected one
    let usedTime = 0;
    for (let i = 0; i < selectedIndex; i++) {
      usedTime += slots[i].duration;
    }
    
    const remainingTime = totalDuration - usedTime;
    const remainingClips = slots.length - selectedIndex;
    const evenDuration = Math.max(1, Math.ceil(remainingTime / remainingClips));
    
    const updated = slots.map((s, idx) => {
      if (idx < selectedIndex) return s;
      if (idx === slots.length - 1) {
        // Last clip takes remaining time
        const lastDuration = Math.max(1, remainingTime - (evenDuration * (remainingClips - 1)));
        return { ...s, duration: lastDuration };
      }
      return { ...s, duration: evenDuration };
    });
    onSlotsChange(updated);
  };

  // Snap last clip to fill remaining audio duration
  const snapToAudioLength = useCallback(() => {
    if (slots.length === 0) return;
    
    // Calculate time used by all clips except the last one
    let usedTime = 0;
    for (let i = 0; i < slots.length - 1; i++) {
      usedTime += slots[i].duration;
    }
    
    const remainingTime = Math.max(0.5, totalDuration - usedTime);
    const updated = slots.map((s, idx) => 
      idx === slots.length - 1 ? { ...s, duration: Math.round(remainingTime * 10) / 10 } : s
    );
    onSlotsChange(updated);
  }, [slots, totalDuration, onSlotsChange]);

  // Navigate to previous clip
  const selectPreviousClip = useCallback(() => {
    const currentIndex = slots.findIndex(s => s.id === selectedSlotId);
    if (currentIndex > 0) {
      setSelectedSlotId(slots[currentIndex - 1].id);
    }
  }, [slots, selectedSlotId]);

  // Navigate to next clip
  const selectNextClip = useCallback(() => {
    const currentIndex = slots.findIndex(s => s.id === selectedSlotId);
    if (currentIndex < slots.length - 1) {
      setSelectedSlotId(slots[currentIndex + 1].id);
    }
  }, [slots, selectedSlotId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Delete or Backspace - delete selected clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSlotId && slots.length > 1) {
        e.preventDefault();
        deleteSlot(selectedSlotId);
        return;
      }

      // Space - play/pause
      if (e.key === ' ') {
        e.preventDefault();
        togglePlayback();
        return;
      }

      // Ctrl/Cmd + D - duplicate selected clip
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedSlotId) {
        e.preventDefault();
        duplicateSlot(selectedSlotId);
        return;
      }

      // Ctrl/Cmd + E - distribute evenly
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        distributeEvenly();
        return;
      }

      // Ctrl/Cmd + S - split at playhead
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
        // Don't prevent default for Ctrl+S as it's browser save
      }

      // Arrow Left - select previous clip
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        selectPreviousClip();
        return;
      }

      // Arrow Right - select next clip
      if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        selectNextClip();
        return;
      }

      // [ - decrease duration by 0.5s
      if (e.key === '[' && selectedSlotId) {
        e.preventDefault();
        const slot = slots.find(s => s.id === selectedSlotId);
        if (slot && slot.duration > 0.5) {
          handleDurationChange(selectedSlotId, slot.duration - 0.5);
        }
        return;
      }

      // ] - increase duration by 0.5s
      if (e.key === ']' && selectedSlotId) {
        e.preventDefault();
        const slot = slots.find(s => s.id === selectedSlotId);
        if (slot && slot.duration < 120) {
          handleDurationChange(selectedSlotId, slot.duration + 0.5);
        }
        return;
      }

      // Home - go to start
      if (e.key === 'Home') {
        e.preventDefault();
        setCurrentTime(0);
        if (audioRef.current) audioRef.current.currentTime = 0;
        return;
      }

      // End - go to end
      if (e.key === 'End') {
        e.preventDefault();
        setCurrentTime(totalDuration);
        if (audioRef.current) audioRef.current.currentTime = totalDuration;
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSlotId, slots, togglePlayback, duplicateSlot, deleteSlot, distributeEvenly, selectPreviousClip, selectNextClip, handleDurationChange, totalDuration]);

  const selectedSlot = selectedSlotId ? slots.find(s => s.id === selectedSlotId) : null;

  return (
    <div className="timeline-editor">
      {/* Header */}
      <div className="timeline-editor-header">
        <div className="timeline-editor-title">
          <span>Advanced Timeline Editor</span>
          <span className="timeline-editor-subtitle">
            {slots.length} clips • {formatTime(totalDuration)} audio
          </span>
        </div>
      </div>

      {/* Preview Section */}
      <div className="timeline-preview">
        <div className="timeline-preview-screen">
          {slotsWithTiming[currentSlotIndex] && (
            slotsWithTiming[currentSlotIndex].type === 'video' ? (
              <video
                key={slotsWithTiming[currentSlotIndex].id}
                src={slotsWithTiming[currentSlotIndex].assetUrl}
                poster={slotsWithTiming[currentSlotIndex].thumbnailUrl}
                muted
                loop
                autoPlay={isPlaying}
                className="timeline-preview-media"
              />
            ) : (
              <img
                key={slotsWithTiming[currentSlotIndex].id}
                src={slotsWithTiming[currentSlotIndex].assetUrl}
                alt={slotsWithTiming[currentSlotIndex].label || 'Preview'}
                className="timeline-preview-media"
              />
            )
          )}
          <div className="timeline-preview-badge">
            Clip {currentSlotIndex + 1}/{slots.length} • {slotsWithTiming[currentSlotIndex]?.duration || 0}s
          </div>
        </div>

        {/* Playback Controls */}
        <div className="timeline-playback-controls">
          <button 
            className="timeline-playback-btn"
            onClick={() => { setCurrentTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
            title="Go to start"
          >
            ⏮
          </button>
          <button 
            className="timeline-playback-btn timeline-playback-main"
            onClick={togglePlayback}
            disabled={!voiceoverUrl}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button 
            className="timeline-playback-btn"
            onClick={() => { setCurrentTime(totalDuration); if (audioRef.current) audioRef.current.currentTime = totalDuration; }}
            title="Go to end"
          >
            ⏭
          </button>
          <div className="timeline-playback-time">
            <span className="timeline-time-current">{formatTime(currentTime)}</span>
            <span className="timeline-time-separator">/</span>
            <span className="timeline-time-total">{formatTime(totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Timeline Track */}
      <div className="timeline-track-wrapper">
        {/* Time ruler */}
        <div className="timeline-ruler">
          {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }, (_, i) => {
            const time = i * 5;
            if (time > totalDuration) return null;
            return (
              <div 
                key={i} 
                className="timeline-ruler-mark"
                style={{ left: `${(time / totalDuration) * 100}%` }}
              >
                <span>{formatTime(time)}</span>
              </div>
            );
          })}
        </div>

        {/* Combined Timeline - Clips + Audio */}
        <div className="timeline-tracks-container">
          {/* Track Labels */}
          <div className="timeline-track-labels">
            <div className="timeline-track-label">🎬 Clips</div>
            <div className="timeline-track-label">🔊 Audio</div>
          </div>
          
          {/* Tracks Area */}
          <div className="timeline-tracks-area" ref={trackRef} onClick={handleTimelineClick}>
            {/* Clips Track */}
            <div className="timeline-track timeline-clips-track">
              {/* Ghost preview showing where dragged clip will go */}
              {draggingSlot && dropTargetIndex !== null && dropTargetIndex !== draggingSlot.initialIndex && (() => {
                const draggedSlot = slotsWithTiming.find(s => s.id === draggingSlot.id);
                if (!draggedSlot) return null;
                
                // Calculate ghost position (where it will be dropped)
                let ghostStartTime = 0;
                const slotsWithoutDragged = slotsWithTiming.filter(s => s.id !== draggingSlot.id);
                for (let i = 0; i < dropTargetIndex && i < slotsWithoutDragged.length; i++) {
                  ghostStartTime += slotsWithoutDragged[i].duration;
                }
                
                const ghostWidth = (draggedSlot.duration / totalDuration) * 100;
                const ghostLeft = (ghostStartTime / totalDuration) * 100;
                
                return (
                  <div 
                    className="timeline-clip-ghost"
                    style={{
                      width: `${ghostWidth}%`,
                      left: `${ghostLeft}%`,
                    }}
                  >
                    <div className="timeline-clip-ghost-inner">
                      <span>Scene {dropTargetIndex + 1}</span>
                    </div>
                  </div>
                );
              })()}
              
              {slotsWithTiming.map((slot, index) => {
                const widthPercent = (slot.duration / totalDuration) * 100;
                const leftPercent = (slot.startTime / totalDuration) * 100;
                const isSelected = slot.id === selectedSlotId;
                const isResizing = resizingSlot?.id === slot.id;
                const isDragging = draggingSlot?.id === slot.id;
                const isDropTarget = dropTargetIndex === index;
                
                // Check if clip extends past audio duration
                const clipEndTime = slot.startTime + slot.duration;
                const isOverflowing = clipEndTime > totalDuration;
                const isLastClip = index === slotsWithTiming.length - 1;
                const isSnappedToEnd = isLastClip && Math.abs(clipEndTime - totalDuration) < 0.2;
                
                return (
                  <div
                    key={slot.id}
                    className={`timeline-clip ${isSelected ? 'selected' : ''} ${isResizing ? 'resizing' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${isOverflowing ? 'overflowing' : ''} ${isSnappedToEnd ? 'snapped-to-end' : ''}`}
                    style={{
                      width: `${widthPercent}%`,
                      left: `${leftPercent}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Select this clip (always keep one selected)
                      if (!draggingSlot) {
                        setSelectedSlotId(slot.id);
                      }
                    }}
                    onMouseDown={(e) => {
                      // Start drag on mouse down (but not on handles)
                      if (!(e.target as HTMLElement).classList.contains('timeline-clip-handle')) {
                        handleDragStart(e, slot.id, index);
                      }
                    }}
                  >
                    {/* Left resize handle */}
                    <div 
                      className="timeline-clip-handle timeline-clip-handle-left"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleResizeStart(e, slot.id, 'left');
                      }}
                      title="Drag to resize"
                    />
                    
                    {/* Clip content */}
                    <div className="timeline-clip-content">
                        <div className="timeline-clip-thumbnail">
                          {slot.type === 'video' ? (
                            <video src={slot.assetUrl} poster={slot.thumbnailUrl} muted />
                          ) : (
                            <img src={slot.assetUrl} alt="" />
                          )}
                        </div>
                        <div className="timeline-clip-label">
                          <span className="timeline-clip-number">{index + 1}</span>
                          <span className="timeline-clip-duration">{slot.duration.toFixed(1)}s</span>
                        </div>
                      </div>
                    
                    {/* Right resize handle */}
                    <div 
                      className="timeline-clip-handle timeline-clip-handle-right"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleResizeStart(e, slot.id, 'right');
                      }}
                      title="Drag to resize"
                    />
                  </div>
                );
              })}
            </div>
            
            {/* Audio Track - Directly below clips */}
            <div className="timeline-track timeline-audio-track-main">
              <div className="timeline-audio-waveform">
                {/* Waveform visualization */}
                {Array.from({ length: 100 }, (_, i) => (
                  <div 
                    key={i} 
                    className="timeline-waveform-bar"
                    style={{ 
                      height: `${20 + Math.sin(i * 0.3) * 15 + Math.random() * 10}%`,
                      opacity: currentTime / totalDuration > i / 100 ? 1 : 0.4
                    }}
                  />
                ))}
              </div>
            </div>
            
            {/* Audio End Boundary Marker - Visual snap edge */}
            <div 
              className="timeline-audio-end-marker"
              style={{ left: '100%' }}
              title="Audio ends here - clips snap to this edge"
            >
              <div className="timeline-audio-end-line" />
              <div className="timeline-audio-end-label">Audio End</div>
            </div>
            
            {/* Unified Playhead - spans both tracks */}
            <div 
              className={`timeline-playhead ${isDraggingPlayhead ? 'dragging' : ''}`}
              style={{ left: `${(currentTime / totalDuration) * 100}%` }}
              onMouseDown={handlePlayheadMouseDown}
            >
              <div className="timeline-playhead-handle" />
              <div className="timeline-playhead-line" />
              {/* Time tooltip when dragging */}
              {isDraggingPlayhead && (
                <div className="timeline-playhead-tooltip">
                  {formatTimeMs(currentTime)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clip Actions Toolbar - Near the timeline */}
        <div className="timeline-actions-toolbar">
          <div className="timeline-actions-group">
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={splitAtPlayhead}
              title="Split clip at playhead position"
              disabled={!slotsWithTiming[currentSlotIndex]}
            >
              ✂️ Split
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={distributeEvenly}
              title="Distribute all clips evenly across audio duration"
            >
              ⚖️ Even All
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={autoEvenFromCurrent}
              title="Even out remaining clips from selected clip"
              disabled={!selectedSlotId}
            >
              ➡️ Even Rest
            </Button>
          </div>
          <div className="timeline-actions-info">
            <span className={`timeline-total-info ${totalSlotsDuration > totalDuration ? 'overflow-warning' : totalSlotsDuration < totalDuration ? 'underflow-info' : 'perfect-fit'}`}>
              {totalSlotsDuration > totalDuration ? (
                <>⚠️ Clips: {formatTime(totalSlotsDuration)} exceed audio ({formatTime(totalDuration)})</>
              ) : totalSlotsDuration < totalDuration ? (
                <>📏 Clips: {formatTime(totalSlotsDuration)} / Audio: {formatTime(totalDuration)}</>
              ) : (
                <>✓ Perfect fit: {formatTime(totalDuration)}</>
              )}
            </span>
          </div>
        </div>

        {/* Quick Tips & Keyboard Shortcuts */}
        <div className="timeline-tips">
          <span className="timeline-tip"><kbd>Space</kbd> Play</span>
          <span className="timeline-tip-separator">•</span>
          <span className="timeline-tip"><kbd>←</kbd><kbd>→</kbd> Navigate</span>
          <span className="timeline-tip-separator">•</span>
          <span className="timeline-tip"><kbd>Del</kbd> Delete</span>
          <span className="timeline-tip-separator">•</span>
          <span className="timeline-tip"><kbd>[</kbd><kbd>]</kbd> Duration</span>
          <span className="timeline-tip-separator">•</span>
          <span className="timeline-tip"><kbd>Ctrl+D</kbd> Duplicate</span>
        </div>
      </div>

      {/* Clip Panel - Always visible with selected clip */}
      {selectedSlot && (
        <div className="timeline-clip-panel">
          <div className="timeline-clip-panel-header">
            <span>Clip {slots.findIndex(s => s.id === selectedSlot.id) + 1} - {selectedSlot.label || 'Untitled'}</span>
            <div className="timeline-clip-panel-actions">
              <button onClick={() => duplicateSlot(selectedSlot.id)} title="Duplicate clip">📋</button>
              <button onClick={() => deleteSlot(selectedSlot.id)} title="Delete clip" disabled={slots.length <= 1}>🗑️</button>
            </div>
          </div>
          
          <div className="timeline-clip-panel-content">
            <div className="timeline-clip-panel-preview">
              {selectedSlot.type === 'video' ? (
                <video src={selectedSlot.assetUrl} poster={selectedSlot.thumbnailUrl} muted loop autoPlay />
              ) : (
                <img src={selectedSlot.assetUrl} alt="" />
              )}
            </div>
            
            <div className="timeline-clip-panel-controls">
              <div className="timeline-clip-panel-field">
                <label>Duration</label>
                <div className="timeline-clip-panel-duration">
                  <button onClick={() => handleDurationChange(selectedSlot.id, selectedSlot.duration - 0.5)} disabled={selectedSlot.duration <= 0.5}>−0.5</button>
                  <span>{selectedSlot.duration.toFixed(1)}s</span>
                  <button onClick={() => handleDurationChange(selectedSlot.id, selectedSlot.duration + 0.5)} disabled={selectedSlot.duration >= 120}>+0.5</button>
                </div>
              </div>
              
              <div className="timeline-clip-panel-info">
                <div><span>Start:</span> {formatTimeMs(slotsWithTiming.find(s => s.id === selectedSlot.id)?.startTime || 0)}</div>
                <div><span>End:</span> {formatTimeMs((slotsWithTiming.find(s => s.id === selectedSlot.id)?.startTime || 0) + selectedSlot.duration)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      {voiceoverUrl && (
        <audio ref={audioRef} src={voiceoverUrl} style={{ display: 'none' }} />
      )}
    </div>
  );
}
