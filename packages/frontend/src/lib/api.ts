import {
    VoiceoverRequest,
    VoiceoverResponse,
    ImagePromptRequest,
    ImagePromptResponse,
    ImageGenerationRequest,
    ImageGenerationResponse,
    StockVideoRequest,
    StockVideoResponse,
    StockVideoSearchRequest,
    StockVideoSearchResponse,
    VideoGenerationRequest,
    VideoGenerationResponse,
    ChatRequest,
    ChatResponse,
    ScriptGenerationRequest,
    ScriptGenerationResponse,
    SmartChatRequest,
    SmartChatResponse,
    ChatModelsResponse,
    TranscriptionRequest,
    TranscriptionResponse,
    TranscriptionStatus
} from 'shared/src/types';

// API base URL:
// - Production: use relative '/api' (Next.js rewrites proxy to backend)
// - Development: use localhost:3001 directly
const API_BASE = process.env.NODE_ENV === 'production' 
    ? '/api' 
    : 'http://localhost:3001/api';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

export const api = {
    // Voiceover
    generateVoiceover: (data: VoiceoverRequest): Promise<VoiceoverResponse> =>
        fetchAPI('/voiceover/generate', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Transcribe audio for accurate caption alignment
    transcribeAudio: (data: TranscriptionRequest, options?: { signal?: AbortSignal }): Promise<TranscriptionResponse> =>
        fetchAPI('/voiceover/transcribe', {
            method: 'POST',
            body: JSON.stringify(data),
            signal: options?.signal,
        }),

    // Get transcription model status
    getTranscriptionStatus: (): Promise<TranscriptionStatus> =>
        fetchAPI('/voiceover/transcription-status'),

    // Generate a short voice preview sample
    previewVoice: (data: { voiceService: string; voiceId: string; model?: string }): Promise<VoiceoverResponse> =>
        fetchAPI('/voiceover/preview', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    listVoices: (service: string, filters?: { language?: string; gender?: string; age?: string }): Promise<any[]> => {
        const params = new URLSearchParams();
        params.append('service', service);
        if (filters?.language) params.append('language', filters.language);
        if (filters?.gender) params.append('gender', filters.gender);
        if (filters?.age) params.append('age', filters.age);
        return fetchAPI(`/voiceover/voices?${params.toString()}`);
    },

    // Upload user's own audio file for voiceover
    uploadVoiceover: async (file: File): Promise<{ audioUrl: string; duration: number; audioId: string }> => {
        const formData = new FormData();
        formData.append('audio', file);

        const response = await fetch(`${API_BASE}/voiceover/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.error || 'Upload failed');
        }

        return response.json();
    },

    // Images
    getImageServiceStatus: (): Promise<{ openrouter: boolean; gemini: boolean; available: string[] }> =>
        fetchAPI('/images/status'),

    listImageModels: (service: string): Promise<any[]> =>
        fetchAPI(`/images/models?service=${service}`),

    listImageEditModels: (): Promise<{ models: Array<{ id: string; name: string; provider: string; description: string; supportsAspectRatio: boolean }> }> =>
        fetchAPI('/images/edit-models'),

    generateImagePrompts: (data: ImagePromptRequest): Promise<ImagePromptResponse> =>
        fetchAPI('/images/prompts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    generateImage: (data: ImageGenerationRequest): Promise<ImageGenerationResponse> =>
        fetchAPI('/images/generate', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    generateBatchImages: (data: {
        prompts: string[];
        service: string;
        model: string;
        aspectRatio: string;
    }): Promise<ImageGenerationResponse[]> =>
        fetchAPI('/images/generate-batch', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    uploadImage: async (file: File): Promise<ImageGenerationResponse> => {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${API_BASE}/images/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        return response.json();
    },

    // Edit image using Gemini's native image editing
    editImage: (data: {
        imageUrl: string;
        editPrompt: string;
        model?: string;
        aspectRatio?: string;
    }): Promise<{
        imageUrl: string;
        imageId: string;
        model: string;
        originalImageUrl: string;
    }> =>
        fetchAPI('/images/edit', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Stock Videos
    analyzeForStockVideos: (data: StockVideoRequest): Promise<StockVideoResponse> =>
        fetchAPI('/stock-videos/analyze', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    searchStockVideos: (payload: StockVideoSearchRequest): Promise<StockVideoSearchResponse> =>
        fetchAPI<StockVideoSearchResponse>('/stock-videos/search', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    // Video Generation
    generateVideo: (data: VideoGenerationRequest): Promise<VideoGenerationResponse> =>
        fetchAPI('/video/generate', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    checkVideoStatus: (jobId: string): Promise<VideoGenerationResponse> =>
        fetchAPI(`/video/status/${jobId}`),

    uploadOverlay: async (file: File): Promise<{ overlayUrl: string; overlayId: string; overlayType: 'image' | 'video' }> => {
        const formData = new FormData();
        formData.append('overlay', file);

        const response = await fetch(`${API_BASE}/video/overlay/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Overlay upload failed');
        }

        return response.json();
    },

    // Chat / Script Writing
    listChatModels: (): Promise<ChatModelsResponse> =>
        fetchAPI('/chat/models'),

    sendChatMessage: (data: ChatRequest): Promise<ChatResponse> =>
        fetchAPI('/chat/message', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    generateScript: (data: ScriptGenerationRequest): Promise<ScriptGenerationResponse> =>
        fetchAPI('/chat/generate-script', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Smart chat with intent detection and word count extraction
    smartChat: (data: SmartChatRequest): Promise<SmartChatResponse> =>
        fetchAPI('/chat/smart-message', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    refineImagePrompt: (data: {
        prompt: string;
        scriptContext?: string;
        niche?: string;
        model?: string;
    }): Promise<{ refinedPrompt: string }> =>
        fetchAPI('/chat/refine-prompt', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Video quality and timing
    getQualityPresets: (): Promise<{ presets: Record<string, { resolution: { width: number; height: number }; crf: number; preset: string; label: string }> }> =>
        fetchAPI('/video/quality-presets'),

    getTimingPreview: (data: {
        videos: Array<{ id: string; duration?: number }>;
        audioDuration: number;
    }): Promise<{
        timingPreview: Array<{
            index: number;
            videoId: string;
            targetDuration: number;
            startTime: number;
            endTime: number;
            originalDuration: number | null;
            needsLoop: boolean | null;
            needsTrim: boolean | null;
        }>;
        totalDuration: number;
        videoCount: number;
        averageDurationPerVideo: number;
    }> =>
        fetchAPI('/video/timing-preview', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Caption generation
    getCaptionStyles: (): Promise<{ styles: Record<string, any> }> =>
        fetchAPI('/video/caption-styles'),

    generateCaptions: (data: {
        script: string;
        voiceoverDuration: number;
        style?: any;
    }): Promise<{
        segments: Array<{
            text: string;
            startTime: number;
            endTime: number;
        }>;
        srtContent: string;
        assContent: string;
    }> =>
        fetchAPI('/video/generate-captions', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // Storage cleanup
    cleanupStorage: (): Promise<{
        success: boolean;
        message: string;
        filesDeleted: number;
        tempFilesDeleted: number;
        uploadsDeleted: number;
        jobsCleared: number;
    }> =>
        fetchAPI('/cleanup', {
            method: 'POST',
        }),

    getStorageStats: (): Promise<{
        tempCount: number;
        uploadsCount: number;
        totalSizeBytes: number;
        activeJobs: number;
        totalJobs: number;
    }> =>
        fetchAPI('/storage-stats'),
};
