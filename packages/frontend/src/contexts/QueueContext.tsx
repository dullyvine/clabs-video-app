'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const QUEUE_STORAGE_KEY = 'clabs-video-app-queue';
const MAX_CONCURRENT = 4;

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
        overlays: any[];
        videoQuality: string;
        captionsEnabled: boolean;
        captionStyle: any;
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

    // Load queue from localStorage on mount
    useEffect(() => {
        const stored = loadQueueFromStorage();
        setQueue(stored);
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






