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
    // Gemini Nano Banana models (uses generateContent API)
    | 'gemini-2.5-flash-image'      // Nano Banana - fast, good quality
    | 'gemini-3-pro-image-preview'  // Nano Banana Pro - best quality, supports 4K & thinking
    // Gemini Imagen models (uses predict/generateImages API)
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
export type StockVideoOrientation = 'landscape' | 'portrait' | 'square';
export type StockVideoOrientationOption = StockVideoOrientation | 'any';

export interface StockVideoAsset {
    id: string;
    url: string;
    thumbnailUrl: string;
    duration: number;
    title: string;
    provider: StockVideoProvider;
    previewUrl?: string;
    sourceUrl?: string;
    resolution?: { width: number; height: number };
}

export interface StockVideoRequest {
    script: string;
    niche: string;
    provider?: StockVideoProvider;
    videoCount?: number;
    orientation?: StockVideoOrientationOption;
    alternativesPerSlot?: number;
}

export interface StockVideoSlot {
    id: string;
    keywords: string[];
    description: string;
    video: StockVideoAsset;
    alternatives: StockVideoAsset[];
}

export interface StockVideoResponse {
    slots: StockVideoSlot[];
}

// Legacy scene type for backward compatibility
export interface StockVideoScene {
    id: string;
    keywords: string[];
    sceneDescription: string;
    suggestedVideos: StockVideoAsset[];
    selectedVideo?: StockVideoAsset;
}

export interface StockVideoSearchRequest {
    keywords?: string[];
    query?: string;
    provider?: StockVideoProvider;
    perPage?: number;
    orientation?: StockVideoOrientation;
    minDuration?: number;
    maxDuration?: number;
}

export interface StockVideoSearchResponse {
    videos: StockVideoAsset[];
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

// Motion effect types for adding dynamic movement to static images
export type MotionEffect = 'none' | 'zoom-in' | 'zoom-out' | 'pan' | 'float';

export interface MotionEffectOption {
    id: MotionEffect;
    label: string;
    description: string;
}

// Video generation types
export type VideoFlowType = 'single-image' | 'multi-image' | 'stock-video';

// Common video request fields
interface BaseVideoRequest {
    voiceoverUrl: string;
    voiceoverDuration: number;
    overlays?: Overlay[];
    // Motion effect for static images (adds subtle animation)
    motionEffect?: MotionEffect;
    // Caption options
    captionsEnabled?: boolean;
    captionStyle?: CaptionStyle;
    script?: string; // Needed for generating captions
    wordTimestamps?: WordTimestamp[]; // Real timestamps from transcription for accurate captions
}

export interface SingleImageVideoRequest extends BaseVideoRequest {
    flowType: 'single-image';
    imageUrl: string;
}

export interface MultiImageVideoRequest extends BaseVideoRequest {
    flowType: 'multi-image';
    images: Array<{
        imageUrl: string;
        duration: number;
    }>;
}

export interface StockVideoVideoRequest extends BaseVideoRequest {
    flowType: 'stock-video';
    videos: Array<{
        videoUrl: string;
        startTime?: number;
        duration?: number;
    }>;
    loop?: boolean;
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

// Chat/Script writing types
export type GeminiChatModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-1.5-flash' | 'gemini-1.5-pro';

// Provider types for chat models
export type ChatModelProvider = 'gemini' | 'openrouter';

// Model definition with capabilities
export interface ChatModelDefinition {
    id: string;                      // Full model ID (e.g., 'gemini-2.5-flash' or 'anthropic/claude-3.5-sonnet')
    name: string;                    // Display name
    description: string;             // Short description
    provider: ChatModelProvider;     // Which API to use
    supportsSearch: boolean;         // Can use web search/grounding
    contextLength?: number;          // Max context window
    category?: 'fast' | 'balanced' | 'powerful';  // Model tier
}

// Response from /chat/models endpoint
export interface ChatModelsResponse {
    models: ChatModelDefinition[];
    defaultModel: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}

export interface ChatRequest {
    messages: ChatMessage[];
    model: string;  // Now accepts any model ID string
    systemPrompt?: string;
    maxTokens?: number;
    useSearch?: boolean;  // Enable web search if model supports it
}

export interface ChatResponse {
    message: ChatMessage;
    model: string;  // Now returns the actual model ID used
    searchUsed?: boolean;  // Whether search was used for this response
}

export interface ScriptGenerationRequest {
    prompt: string;
    wordCount?: number;
    tone?: string;
    niche?: Niche;
    model: string;  // Now accepts any model ID string
    useSearch?: boolean;  // Enable web search if model supports it
}

export interface ScriptGenerationResponse {
    script: string;
    wordCount: number;
    model: string;  // Now returns the actual model ID used
    searchUsed?: boolean;
}

// Enhanced Chat types for intelligent script writing
export type ChatIntent = 'research' | 'write' | 'refine' | 'general';

export interface SmartChatRequest {
    messages: ChatMessage[];
    model: string;  // Now accepts any model ID string
    niche?: Niche;
    targetWordCount?: number;  // Can be overridden by prompt
    systemContext?: string;    // Additional context about the project
    useSearch?: boolean;       // Enable web search if model supports it
}

export interface SmartChatResponse {
    message: ChatMessage;
    model: string;  // Now returns the actual model ID used
    detectedIntent: ChatIntent;
    extractedWordCount?: number;    // If user specified word count in prompt
    isScript: boolean;              // True if response is a complete script
    scriptWordCount?: number;       // Word count if isScript is true
    suggestedActions?: string[];    // e.g., ["Use as Script", "Refine Further", "Make Shorter"]
    searchUsed?: boolean;           // Whether search was used for this response
}

// Video quality types
export type VideoQuality = 'draft' | 'standard' | 'high' | 'ultra';

export interface VideoQualitySettings {
    resolution: { width: number; height: number };
    crf: number;
    preset: string;
    label: string;
}

// Caption types
export interface CaptionWord {
    word: string;
    startTime: number;
    endTime: number;
}

export interface CaptionSegment {
    text: string;
    startTime: number;
    endTime: number;
    words?: CaptionWord[];
}

export interface CaptionStyle {
    fontSize: 'small' | 'medium' | 'large';
    color: string;
    backgroundColor?: string;
    position: 'top' | 'center' | 'bottom';
    fontFamily?: string;
}

export interface CaptionRequest {
    script: string;
    voiceoverDuration: number;
    style?: CaptionStyle;
    wordTimestamps?: WordTimestamp[]; // Use real timestamps if provided
}

export interface CaptionResponse {
    segments: CaptionSegment[];
    srtContent: string;
    assContent: string;
}

// Transcription types for accurate caption alignment
export interface WordTimestamp {
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
}

export interface TranscriptionRequest {
    audioUrl: string;
}

export interface TranscriptionResponse {
    text: string;
    words: WordTimestamp[];
    duration: number;
}

export interface TranscriptionStatus {
    modelLoaded: boolean;
    modelPath: string;
    modelExists: boolean;
}

// Image editing types (for Gemini native image generation)
export interface ImageEditModelInfo {
    id: string;
    name: string;
    provider: 'gemini';
    description: string;
    supportsAspectRatio: boolean;
}

export interface ImageEditRequest {
    imageUrl: string;          // URL of the image to edit (can be local /temp/ or /uploads/ path)
    editPrompt: string;        // Natural language edit instruction
    service?: ImageService;    // Default to gemini
    model?: string;            // Model to use for editing
    aspectRatio?: AspectRatio; // Optional aspect ratio for the output
}

export interface ImageEditResponse {
    imageUrl: string;
    imageId: string;
    model: string;
    originalImageUrl: string;  // Reference to the original
}

// Enhanced image prompt with scene timing info
export interface ImagePromptWithTiming {
    id: string;
    prompt: string;
    sceneDescription?: string;
    duration?: number;         // Duration in seconds for this scene
    startTime?: number;        // When this scene starts (for preview)
}

// Timeline editor types for custom asset timing
export interface TimelineSlot {
    id: string;
    type: 'image' | 'video';
    assetUrl: string;
    thumbnailUrl?: string;
    duration: number;          // Duration in seconds
    startTime: number;         // Calculated from sequence order
    label?: string;            // Display label (e.g., "Scene 1", video title)
    originalIndex?: number;    // Original index in source array (for images/videos)
}

// Request type for video generation with custom timing
export interface CustomTimingVideoRequest extends Omit<BaseVideoRequest, 'voiceoverDuration'> {
    flowType: 'multi-image' | 'stock-video';
    voiceoverDuration: number;
    timelineSlots: Array<{
        assetUrl: string;
        duration: number;
        type: 'image' | 'video';
    }>;
    useCustomTiming: true;
}

// Extended video generation request that supports custom timing
export type ExtendedVideoGenerationRequest = 
    | SingleImageVideoRequest 
    | MultiImageVideoRequest 
    | StockVideoVideoRequest 
    | CustomTimingVideoRequest;