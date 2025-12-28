'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
    WordTimestamp
} from 'shared/src/types';
import { api } from '@/lib/api';

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
    generatingVideo: false,
    videoJobId: null,
    finalVideoUrl: null,
    videoQuality: 'standard',
    useCustomTiming: false,
    timelineSlots: [],
    captionsEnabled: true,
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
    const [state, setState] = useState<AppState>(initialState);
    const [maxCompletedStep, setMaxCompletedStep] = useState(0);
    const [isHydrated, setIsHydrated] = useState(false);

    // Load state from localStorage on mount
    useEffect(() => {
        const stored = loadFromStorage();
        if (stored) {
            setState(stored);
            setMaxCompletedStep(stored.currentStep);
        }
        setIsHydrated(true);
    }, []);

    // Debounced save to localStorage
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
    }, [resetApp]);

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
            maxCompletedStep
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
