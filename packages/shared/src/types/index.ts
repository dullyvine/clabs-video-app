// Voice service types
export type VoiceService = 'gen-ai-pro' | 'ai33' | 'gemini';
export type GeminiTTSModel = 'gemini-2.5-flash-preview-tts' | 'gemini-2.5-pro-preview-tts';

export interface VoiceoverRequest {
    script: string;
    voiceService: VoiceService;
    voiceId?: string;
    model?: GeminiTTSModel; // For Gemini TTS
}

export interface VoiceoverResponse {
    audioUrl: string;
    duration: number; // in seconds
    jobId: string;
    chunked?: boolean; // Indicates if response was chunked (for Gemini TTS)
    chunkCount?: number; // Number of chunks used
}

// Image generation types
export type ImageService = 'openrouter' | 'gemini';
export type ImageModel =
    // OpenRouter models (dynamically fetched)
    | 'flux-pro' | 'flux-dev' | 'flux-schnell' | 'dall-e-3'
    // Gemini Nano Banana models (uses generateContent)
    | 'gemini-2.5-flash-image'
    | 'gemini-2.5-pro-image'
    // Gemini Imagen models (uses generateImages)
    | 'imagen-4.0-generate-001'
    | 'imagen-4.0-ultra-generate-001'
    | 'imagen-4.0-fast-generate-001'
    | string; // Allow dynamic OpenRouter models

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export interface ImagePromptRequest {
    script: string;
    niche: string;
    count?: number; // for multiple images
    provider?: LLMProvider;
    model?: GeminiLLMModel;
}

export interface ImagePromptResponse {
    prompts: Array<{
        id: string;
        prompt: string;
        sceneDescription?: string;
    }>;
}

export interface ImageGenerationRequest {
    prompt: string;
    service: ImageService;
    model: ImageModel;
    aspectRatio: AspectRatio;
    isTest?: boolean; // for testing different models
}

export interface ImageGenerationResponse {
    imageUrl: string;
    imageId: string;
    model: ImageModel;
    promptIndex?: number;
    prompt?: string;
}

// LLM provider types
export type LLMProvider = 'gemini' | 'openrouter';
export type GeminiLLMModel = 'gemini-2.5-flash' | 'gemini-2.5-pro';

export interface ScriptAnalysisRequest {
    script: string;
    niche: string;
}

export interface ScriptAnalysisResponse {
    visualKeywords: string[];
    moodTone: string;
    keyThemes: string[];
    sceneBreakdown: string[];
    stockVideoQueries: string[];
    colorPalette: string;
    pacing: 'slow' | 'moderate' | 'fast';
}

// Stock video types
export type StockVideoProvider = 'storyblocks' | 'pexels' | 'both';

export interface StockVideoRequest {
    script: string;
    niche: string;
    provider?: StockVideoProvider;
}

export interface StockVideoScene {
    id: string;
    keywords: string[];
    sceneDescription: string;
    suggestedVideos: Array<{
        id: string;
        url: string;
        thumbnailUrl: string;
        duration: number;
        title: string;
    }>;
}

export interface StockVideoResponse {
    scenes: StockVideoScene[];
}

// Overlay types
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn';

export interface Overlay {
    id: string;
    fileUrl: string;
    type: 'image' | 'video';
    blendMode: BlendMode;
    opacity?: number;
    previewUrl?: string;
    filePath?: string;
    name?: string;
}

// Video generation types
export type VideoFlowType = 'single-image' | 'multi-image' | 'stock-video';

export interface SingleImageVideoRequest {
    flowType: 'single-image';
    voiceoverUrl: string;
    voiceoverDuration: number;
    imageUrl: string;
    overlays?: Overlay[];
}

export interface MultiImageVideoRequest {
    flowType: 'multi-image';
    voiceoverUrl: string;
    voiceoverDuration: number;
    images: Array<{
        imageUrl: string;
        duration: number;
    }>;
    overlays?: Overlay[];
}

export interface StockVideoVideoRequest {
    flowType: 'stock-video';
    voiceoverUrl: string;
    voiceoverDuration: number;
    videos: Array<{
        videoUrl: string;
        startTime?: number;
        duration?: number;
    }>;
    loop?: boolean;
    overlays?: Overlay[];
}

export type VideoGenerationRequest = SingleImageVideoRequest | MultiImageVideoRequest | StockVideoVideoRequest;

export interface VideoGenerationResponse {
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    videoUrl?: string;
    estimatedFileSize?: number;
    error?: string;
}

// Job status types
export interface JobStatus {
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    result?: any;
    error?: string;
}

// Error types
export interface ServiceError {
    serviceName: string;
    errorCode: string;
    message: string;
    statusCode?: number;
    details?: any;
}

// Niche types
export type Niche = 'motivational' | 'educational' | 'entertainment' | 'news' | 'gaming' | 'lifestyle' | 'other';
