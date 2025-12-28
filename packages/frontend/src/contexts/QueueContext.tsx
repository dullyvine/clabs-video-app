'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { api } from '@/lib/api';

const QUEUE_STORAGE_KEY = 'clabs-video-app-queue';
const MAX_CONCURRENT = 4;
const POLL_INTERVAL = 2000; // Poll every 2 seconds

export interface QueuedProject {
    id: string;
    name: string;
    createdAt: number;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    jobId?: string;
    videoUrl?: string;
    error?: string;
    // Snapshot of project state at time of queueing
    state: {
        script: string;
        voiceoverUrl: string | null;
        voiceoverDuration: number | null;
        selectedFlow: string | null;
        imageUrl?: string;
        images?: Array<{ imageUrl: string; duration: number }>;
        videos?: Array<{ videoUrl: string; duration?: number }>;
        selectedVideos?: Array<{ id: string; url: string; duration?: number }>;
        overlays: any[];
        videoQuality: string;
        captionsEnabled: boolean;
        captionStyle: any;
        imageDuration?: number;
    };
}

interface QueueContextType {
    queue: QueuedProject[];
    activeCount: number;
    addToQueue: (project: Omit<QueuedProject, 'id' | 'createdAt' | 'status' | 'progress'>) => string;
    updateProject: (id: string, updates: Partial<QueuedProject>) => void;
    removeFromQueue: (id: string) => void;
    clearCompleted: () => void;
    clearAll: () => void;
    getProject: (id: string) => QueuedProject | undefined;
    canStartNew: boolean;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

function generateId(): string {
    return `project-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function loadQueueFromStorage(): QueuedProject[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('[QueueContext] Failed to load queue:', e);
    }
    return [];
}

function saveQueueToStorage(queue: QueuedProject[]) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('[QueueContext] Failed to save queue:', e);
    }
}

export function QueueProvider({ children }: { children: ReactNode }) {
    const [queue, setQueue] = useState<QueuedProject[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);
    // Track which jobs are currently being started to avoid duplicate API calls
    const startingJobsRef = useRef<Set<string>>(new Set());
    // Track which jobs are currently being polled
    const pollingJobsRef = useRef<Set<string>>(new Set());

    // Load queue from localStorage on mount
    useEffect(() => {
        const stored = loadQueueFromStorage();
        // Reset any "processing" jobs without jobId to "queued" on reload
        // (they were interrupted before the API call completed)
        const fixedQueue = stored.map(p => {
            if (p.status === 'processing' && !p.jobId) {
                return { ...p, status: 'queued' as const };
            }
            return p;
        });
        setQueue(fixedQueue);
        setIsHydrated(true);
    }, []);

    // Save queue to localStorage when it changes
    useEffect(() => {
        if (isHydrated) {
            saveQueueToStorage(queue);
        }
    }, [queue, isHydrated]);

    const activeCount = queue.filter(p => p.status === 'processing').length;
    const canStartNew = activeCount < MAX_CONCURRENT;

    const addToQueue = useCallback((project: Omit<QueuedProject, 'id' | 'createdAt' | 'status' | 'progress'>): string => {
        const id = generateId();
        const newProject: QueuedProject = {
            ...project,
            id,
            createdAt: Date.now(),
            status: canStartNew ? 'processing' : 'queued',
            progress: 0
        };

        setQueue(prev => [...prev, newProject]);
        return id;
    }, [canStartNew]);

    const updateProject = useCallback((id: string, updates: Partial<QueuedProject>) => {
        setQueue(prev => prev.map(p => 
            p.id === id ? { ...p, ...updates } : p
        ));

        // If a project completed/failed, check if we can start a queued one
        if (updates.status === 'completed' || updates.status === 'failed') {
            setQueue(prev => {
                const processing = prev.filter(p => p.status === 'processing').length;
                if (processing < MAX_CONCURRENT) {
                    const nextQueued = prev.find(p => p.status === 'queued');
                    if (nextQueued) {
                        return prev.map(p => 
                            p.id === nextQueued.id ? { ...p, status: 'processing' as const } : p
                        );
                    }
                }
                return prev;
            });
        }
    }, []);

    const removeFromQueue = useCallback((id: string) => {
        setQueue(prev => prev.filter(p => p.id !== id));
    }, []);

    const clearCompleted = useCallback(() => {
        setQueue(prev => prev.filter(p => p.status !== 'completed' && p.status !== 'failed'));
    }, []);

    const clearAll = useCallback(() => {
        setQueue([]);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(QUEUE_STORAGE_KEY);
        }
    }, []);

    const getProject = useCallback((id: string) => {
        return queue.find(p => p.id === id);
    }, [queue]);

    // ========== BACKGROUND PROCESSING ENGINE ==========
    // This effect runs continuously and handles:
    // 1. Starting new jobs for items marked as 'processing' that don't have a jobId yet
    // 2. Polling the backend for progress on jobs that are in progress
    useEffect(() => {
        if (!isHydrated) return;

        const processQueue = async () => {
            // 1. Start new jobs for items that need to be started
            const itemsToStart = queue.filter(
                p => p.status === 'processing' && !p.jobId && !startingJobsRef.current.has(p.id)
            );

            for (const item of itemsToStart) {
                startingJobsRef.current.add(item.id);
                
                try {
                    // Normalize URLs (remove localhost prefix for backend)
                    const normalizeUrl = (url: string) =>
                        url?.startsWith('http://localhost:3001') 
                            ? url.replace('http://localhost:3001', '') 
                            : url;

                    // Prepare overlays
                    const overlaysForRequest = (item.state.overlays || []).map((overlay: any) => ({
                        id: overlay.id,
                        fileUrl: normalizeUrl(overlay.fileUrl),
                        type: overlay.type,
                        blendMode: overlay.blendMode,
                        opacity: overlay.opacity ?? 1
                    }));

                    // Build the request based on flow type
                    let request: any = {
                        voiceoverUrl: normalizeUrl(item.state.voiceoverUrl || ''),
                        voiceoverDuration: item.state.voiceoverDuration!,
                        overlays: overlaysForRequest,
                        captionsEnabled: item.state.captionsEnabled,
                        captionStyle: item.state.captionStyle,
                        script: item.state.script,
                    };

                    if (item.state.selectedFlow === 'single-image') {
                        request.flowType = 'single-image';
                        request.imageUrl = item.state.imageUrl;
                    } else if (item.state.selectedFlow === 'multi-image') {
                        request.flowType = 'multi-image';
                        request.images = item.state.images?.map(img => ({
                            imageUrl: img.imageUrl,
                            duration: item.state.imageDuration || img.duration,
                        }));
                    } else if (item.state.selectedFlow === 'stock-video') {
                        request.flowType = 'stock-video';
                        request.videos = item.state.selectedVideos?.map((video: any) => ({
                            videoUrl: normalizeUrl(video.url),
                            duration: video.duration || undefined
                        }));
                    }

                    console.log(`[QueueEngine] Starting job for project: ${item.name}`);
                    const result = await api.generateVideo(request);
                    
                    // Update the project with the jobId
                    setQueue(prev => prev.map(p => 
                        p.id === item.id ? { ...p, jobId: result.jobId } : p
                    ));
                    console.log(`[QueueEngine] Job started: ${result.jobId}`);
                } catch (error: any) {
                    console.error(`[QueueEngine] Failed to start job for ${item.name}:`, error);
                    setQueue(prev => prev.map(p => 
                        p.id === item.id 
                            ? { ...p, status: 'failed' as const, error: error.message } 
                            : p
                    ));
                } finally {
                    startingJobsRef.current.delete(item.id);
                }
            }

            // 2. Poll for progress on active jobs
            const itemsToPoll = queue.filter(
                p => p.status === 'processing' && p.jobId && !pollingJobsRef.current.has(p.id)
            );

            for (const item of itemsToPoll) {
                pollingJobsRef.current.add(item.id);
                
                try {
                    const status = await api.checkVideoStatus(item.jobId!);
                    
                    if (status.status === 'completed') {
                        console.log(`[QueueEngine] Job completed: ${item.jobId}`);
                        setQueue(prev => {
                            const updated = prev.map(p => 
                                p.id === item.id 
                                    ? { 
                                        ...p, 
                                        status: 'completed' as const, 
                                        progress: 100,
                                        videoUrl: 'http://localhost:3001' + status.videoUrl 
                                    } 
                                    : p
                            );
                            // Check if we can start a queued job
                            const processingCount = updated.filter(p => p.status === 'processing').length;
                            if (processingCount < MAX_CONCURRENT) {
                                const nextQueued = updated.find(p => p.status === 'queued');
                                if (nextQueued) {
                                    return updated.map(p => 
                                        p.id === nextQueued.id 
                                            ? { ...p, status: 'processing' as const } 
                                            : p
                                    );
                                }
                            }
                            return updated;
                        });
                    } else if (status.status === 'failed') {
                        console.error(`[QueueEngine] Job failed: ${item.jobId}`, status.error);
                        setQueue(prev => {
                            const updated = prev.map(p => 
                                p.id === item.id 
                                    ? { ...p, status: 'failed' as const, error: status.error } 
                                    : p
                            );
                            // Check if we can start a queued job
                            const processingCount = updated.filter(p => p.status === 'processing').length;
                            if (processingCount < MAX_CONCURRENT) {
                                const nextQueued = updated.find(p => p.status === 'queued');
                                if (nextQueued) {
                                    return updated.map(p => 
                                        p.id === nextQueued.id 
                                            ? { ...p, status: 'processing' as const } 
                                            : p
                                    );
                                }
                            }
                            return updated;
                        });
                    } else {
                        // Still processing - update progress
                        setQueue(prev => prev.map(p => 
                            p.id === item.id ? { ...p, progress: status.progress } : p
                        ));
                    }
                } catch (error: any) {
                    console.error(`[QueueEngine] Failed to poll job ${item.jobId}:`, error);
                    // Don't mark as failed on poll error - might be temporary network issue
                } finally {
                    pollingJobsRef.current.delete(item.id);
                }
            }
        };

        // Run immediately
        processQueue();
        
        // Then run on interval
        const interval = setInterval(processQueue, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [queue, isHydrated]);

    return (
        <QueueContext.Provider value={{
            queue,
            activeCount,
            addToQueue,
            updateProject,
            removeFromQueue,
            clearCompleted,
            clearAll,
            getProject,
            canStartNew
        }}>
            {children}
        </QueueContext.Provider>
    );
}

export function useQueue() {
    const context = useContext(QueueContext);
    if (!context) {
        throw new Error('useQueue must be used within QueueProvider');
    }
    return context;
}






