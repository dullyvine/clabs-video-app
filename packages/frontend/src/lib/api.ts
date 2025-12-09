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
    GeminiChatModel
} from 'shared/src/types';

const API_BASE = 'http://localhost:3001/api';

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

    // Images
    listImageModels: (service: string): Promise<any[]> =>
        fetchAPI(`/images/models?service=${service}`),

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
    listChatModels: (): Promise<{ models: Array<{ id: GeminiChatModel; name: string; description: string }> }> =>
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

    refineImagePrompt: (data: {
        prompt: string;
        scriptContext?: string;
        niche?: string;
        model?: GeminiChatModel;
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
};
