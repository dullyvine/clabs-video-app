'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
    VoiceService,
    ImageModel,
    AspectRatio,
    Overlay,
    Niche,
    ImageGenerationResponse,
    StockVideoSlot,
    StockVideoAsset,
    StockVideoOrientation,
    VideoQuality,
    CaptionStyle,
    ChatMessage,
    TimelineSlot,
    WordTimestamp,
    MotionEffect
} from 'shared/src/types';
import { api } from '@/lib/api';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'clabs-video-app-state';
const QUEUE_STORAGE_KEY = 'clabs-video-app-queue';
const DEBOUNCE_MS = 500;

type FlowType = 'single-image' | 'multi-image' | 'stock-video' | null;

export type SelectedStockVideo = StockVideoAsset & { slotId?: string };

interface AppState {
    // Step tracking
    currentStep: number;

    // Script Chat
    chatHistory: ChatMessage[];
    scriptWordCount: number; // Target word count for script generation

    // Voiceover
    script: string;
    voiceService: VoiceService | null;
    voiceId: string | null;
    voiceoverUrl: string | null;
    voiceoverDuration: number | null;

    // Flow selection
    selectedFlow: FlowType;
    selectedNiche: Niche | null;

    // Image generation
    imageModel: ImageModel;
    aspectRatio: AspectRatio;
    imagePrompts: Array<{ id: string; prompt: string; sceneDescription?: string }>;
    generatedImages: ImageGenerationResponse[];
    selectedImages: string[]; // imageIds

    // Multi-image specific
    imageCount: number;
    imageDuration: number;

    // Stock videos
    stockVideoSlots: StockVideoSlot[];
    selectedVideos: SelectedStockVideo[];
    stockVideoCount: number;
    stockOrientation: 'any' | StockVideoOrientation;

    // Overlays
    overlays: Overlay[];

    // Motion effect for static images
    motionEffect: MotionEffect;

    // Video generation
    generatingVideo: boolean;
    videoJobId: string | null;
    finalVideoUrl: string | null;

    // Video quality
    videoQuality: VideoQuality;

    // Timeline editor - custom asset timing
    useCustomTiming: boolean;
    timelineSlots: TimelineSlot[];

    // Captions
    captionsEnabled: boolean;
    captionStyle: CaptionStyle;
    
    // Transcription for accurate captions
    wordTimestamps: WordTimestamp[];
    isTranscribing: boolean;
}

interface AppContextType extends AppState {
    updateState: (updates: Partial<AppState>) => void;
    nextStep: () => void;
    prevStep: () => void;
    goToStep: (step: number) => void;
    resetApp: () => void;
    clearStorage: () => void;
    clearAllData: () => Promise<void>;
    maxCompletedStep: number;
    projectId: string | null;
    isSyncing: boolean;
}

const initialState: AppState = {
    currentStep: 0,
    chatHistory: [],
    scriptWordCount: 300,
    script: '',
    voiceService: null,
    voiceId: null,
    voiceoverUrl: null,
    voiceoverDuration: null,
    selectedFlow: null,
    selectedNiche: null,
    imageModel: 'dall-e-3',
    aspectRatio: '16:9',
    imagePrompts: [],
    generatedImages: [],
    selectedImages: [],
    imageCount: 10,
    imageDuration: 3,
    stockVideoSlots: [],
    selectedVideos: [],
    stockVideoCount: 10,
    stockOrientation: 'landscape',
    overlays: [],
    motionEffect: 'none',
    generatingVideo: false,
    videoJobId: null,
    finalVideoUrl: null,
    videoQuality: 'standard',
    useCustomTiming: false,
    timelineSlots: [],
    captionsEnabled: false,
    captionStyle: {
        fontSize: 'medium',
        color: '#FFFFFF',
        backgroundColor: '#000000',
        position: 'bottom',
        fontFamily: 'Arial'
    },
    wordTimestamps: [],
    isTranscribing: false,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to safely parse localStorage
function loadFromStorage(): AppState | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Validate it has the expected structure
            if (parsed && typeof parsed.currentStep === 'number') {
                return { ...initialState, ...parsed };
            }
        }
    } catch (e) {
        console.warn('[AppContext] Failed to load from localStorage:', e);
    }
    return null;
}

// Helper to save to localStorage
function saveToStorage(state: AppState) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('[AppContext] Failed to save to localStorage:', e);
    }
}

export function AppProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading: authLoading } = useAuth();
    const [state, setState] = useState<AppState>(initialState);
    const [maxCompletedStep, setMaxCompletedStep] = useState(0);
    const [isHydrated, setIsHydrated] = useState(false);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncedStateRef = useRef<string>('');

    // Load state from localStorage on mount (fallback when not authenticated)
    useEffect(() => {
        if (authLoading) return; // Wait for auth to resolve
        
        const stored = loadFromStorage();
        if (stored) {
            setState(stored);
            setMaxCompletedStep(stored.currentStep);
        }
        setIsHydrated(true);
    }, [authLoading]);

    // Load from database when authenticated
    useEffect(() => {
        if (authLoading || !isHydrated) return;
        
        if (isAuthenticated) {
            // Load project from database
            const loadProject = async () => {
                try {
                    setIsSyncing(true);
                    const { project } = await api.getCurrentProject();
                    setProjectId(project.id);
                    
                    // Map database project to app state
                    const dbState: Partial<AppState> = {
                        currentStep: project.currentStep,
                        script: project.script || '',
                        voiceService: project.voiceService as VoiceService | null,
                        voiceId: project.voiceId,
                        voiceoverUrl: project.voiceoverUrl,
                        voiceoverDuration: project.voiceoverDuration,
                        selectedFlow: project.selectedFlow as FlowType,
                        selectedNiche: project.selectedNiche as Niche | null,
                        imageModel: project.imageModel as ImageModel,
                        aspectRatio: project.aspectRatio as AspectRatio,
                        motionEffect: project.motionEffect as MotionEffect,
                        videoQuality: project.videoQuality as VideoQuality,
                        imageCount: project.imageCount,
                        imageDuration: project.imageDuration,
                        stockVideoCount: project.stockVideoCount,
                        stockOrientation: project.stockOrientation as 'any' | StockVideoOrientation,
                        captionsEnabled: project.captionsEnabled,
                        captionStyle: project.captionStyle,
                        wordTimestamps: project.wordTimestamps || [],
                        imagePrompts: project.imagePrompts || [],
                        generatedImages: project.generatedImages || [],
                        selectedImages: project.selectedImages || [],
                        stockVideoSlots: project.stockVideoSlots || [],
                        selectedVideos: project.selectedVideos || [],
                        overlays: project.overlays || [],
                        timelineSlots: project.timelineSlots || [],
                        useCustomTiming: project.useCustomTiming,
                        videoJobId: project.videoJobId,
                        finalVideoUrl: project.finalVideoUrl,
                        chatHistory: project.chatHistory || [],
                        scriptWordCount: project.scriptWordCount,
                    };
                    
                    setState(prev => ({ ...prev, ...dbState }));
                    setMaxCompletedStep(project.currentStep);
                    lastSyncedStateRef.current = JSON.stringify(dbState);
                    
                    console.log('[AppContext] Loaded project from database:', project.id);
                } catch (error) {
                    console.warn('[AppContext] Failed to load project from database:', error);
                    // Fall back to localStorage
                } finally {
                    setIsSyncing(false);
                }
            };
            
            loadProject();
        } else {
            // Not authenticated - clear project ID
            setProjectId(null);
        }
    }, [isAuthenticated, authLoading, isHydrated]);

    // Sync state to database when authenticated (debounced)
    useEffect(() => {
        if (!isHydrated || !isAuthenticated || !projectId) return;
        
        // Clear any pending sync
        if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
        }
        
        // Check if state actually changed
        const currentStateStr = JSON.stringify(state);
        if (currentStateStr === lastSyncedStateRef.current) {
            return;
        }
        
        // Debounced sync to database
        syncTimeoutRef.current = setTimeout(async () => {
            try {
                await api.syncProjectState(projectId, state);
                lastSyncedStateRef.current = currentStateStr;
                console.log('[AppContext] Synced to database');
            } catch (error) {
                console.warn('[AppContext] Failed to sync to database:', error);
            }
        }, DEBOUNCE_MS * 2); // Longer debounce for DB sync
        
        return () => {
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, [state, isHydrated, isAuthenticated, projectId]);

    // Debounced save to localStorage (always, as fallback)
    useEffect(() => {
        if (!isHydrated) return;

        const timeoutId = setTimeout(() => {
            saveToStorage(state);
        }, DEBOUNCE_MS);

        return () => clearTimeout(timeoutId);
    }, [state, isHydrated]);

    // Track max completed step
    useEffect(() => {
        if (state.currentStep > maxCompletedStep) {
            setMaxCompletedStep(state.currentStep);
        }
    }, [state.currentStep, maxCompletedStep]);

    const updateState = useCallback((updates: Partial<AppState>) => {
        setState((prev) => ({ ...prev, ...updates }));
    }, []);

    const nextStep = useCallback(() => {
        setState((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }));
    }, []);

    const prevStep = useCallback(() => {
        setState((prev) => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
    }, []);

    const goToStep = useCallback((step: number) => {
        if (step >= 0 && step <= maxCompletedStep) {
            setState((prev) => ({ ...prev, currentStep: step }));
        }
    }, [maxCompletedStep]);

    const resetApp = useCallback(() => {
        setState(initialState);
        setMaxCompletedStep(0);
    }, []);

    const clearStorage = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
        }
        resetApp();
    }, [resetApp]);

    /**
     * Clear ALL temporary data - both browser storage and server-side temp files
     * This is a comprehensive cleanup function
     */
    const clearAllData = useCallback(async () => {
        // Clear browser storage first
        if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(QUEUE_STORAGE_KEY);
        }
        
        // Reset app state
        resetApp();

        // Call backend to clean up server temp files
        try {
            await api.cleanupStorage();
            console.log('[AppContext] Server temp files cleaned up');
        } catch (error) {
            console.warn('[AppContext] Failed to cleanup server files:', error);
            // Don't throw - browser cleanup succeeded, server cleanup is best-effort
        }
        
        // If authenticated, delete the project from database and create fresh
        if (isAuthenticated && projectId) {
            try {
                await api.deleteProject(projectId);
                const { project } = await api.createProject();
                setProjectId(project.id);
                console.log('[AppContext] Created fresh project:', project.id);
            } catch (error) {
                console.warn('[AppContext] Failed to reset project in database:', error);
            }
        }
    }, [resetApp, isAuthenticated, projectId]);

    return (
        <AppContext.Provider value={{ 
            ...state, 
            updateState, 
            nextStep, 
            prevStep, 
            goToStep,
            resetApp, 
            clearStorage,
            clearAllData,
            maxCompletedStep,
            projectId,
            isSyncing
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
}
