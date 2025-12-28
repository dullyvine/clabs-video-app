import { 
    Niche, 
    LLMProvider, 
    GeminiLLMModel, 
    ScriptAnalysisResponse,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    GeminiChatModel,
    ScriptGenerationRequest,
    ScriptGenerationResponse,
    SmartChatRequest,
    SmartChatResponse,
    ChatIntent,
    ChatModelDefinition,
    ChatModelsResponse
} from 'shared/src/types';
import { GoogleGenerativeAI } from '@google/generative-ai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const DEFAULT_LLM_MODEL = process.env.DEFAULT_LLM_MODEL || 'anthropic/claude-3.5-sonnet';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

// ============ MODEL REGISTRY ============

/**
 * Registry of available chat models with their capabilities
 * This is the single source of truth - add new models here
 */
const GEMINI_MODELS: ChatModelDefinition[] = [
    { 
        id: 'gemini-2.5-flash', 
        name: 'Gemini 2.5 Flash', 
        description: 'Fast and efficient with web search support',
        provider: 'gemini',
        supportsSearch: true,
        contextLength: 1048576,
        category: 'fast'
    },
    { 
        id: 'gemini-2.5-pro', 
        name: 'Gemini 2.5 Pro', 
        description: 'Best quality for complex writing with web search',
        provider: 'gemini',
        supportsSearch: true,
        contextLength: 1048576,
        category: 'powerful'
    },
    { 
        id: 'gemini-1.5-flash', 
        name: 'Gemini 1.5 Flash', 
        description: 'Lightweight and fast',
        provider: 'gemini',
        supportsSearch: false,
        contextLength: 1000000,
        category: 'fast'
    },
    { 
        id: 'gemini-1.5-pro', 
        name: 'Gemini 1.5 Pro', 
        description: 'High quality, longer context',
        provider: 'gemini',
        supportsSearch: false,
        contextLength: 2000000,
        category: 'powerful'
    }
];

/**
 * Popular OpenRouter models with their capabilities
 * Search capability through OpenRouter requires model-specific support
 */
const OPENROUTER_MODELS: ChatModelDefinition[] = [
    // Anthropic Claude models
    { 
        id: 'anthropic/claude-sonnet-4', 
        name: 'Claude Sonnet 4', 
        description: 'Latest Claude model, excellent for creative writing',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 200000,
        category: 'powerful'
    },
    { 
        id: 'anthropic/claude-3.5-sonnet', 
        name: 'Claude 3.5 Sonnet', 
        description: 'High quality, fast responses',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 200000,
        category: 'balanced'
    },
    { 
        id: 'anthropic/claude-3-haiku', 
        name: 'Claude 3 Haiku', 
        description: 'Fast and affordable',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 200000,
        category: 'fast'
    },
    // OpenAI models
    { 
        id: 'openai/gpt-4o', 
        name: 'GPT-4o', 
        description: 'OpenAI flagship model',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 128000,
        category: 'powerful'
    },
    { 
        id: 'openai/gpt-4o-mini', 
        name: 'GPT-4o Mini', 
        description: 'Fast and cost-effective',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 128000,
        category: 'fast'
    },
    { 
        id: 'openai/gpt-4-turbo', 
        name: 'GPT-4 Turbo', 
        description: 'Powerful with long context',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 128000,
        category: 'powerful'
    },
    // Meta Llama models
    { 
        id: 'meta-llama/llama-3.3-70b-instruct', 
        name: 'Llama 3.3 70B', 
        description: 'Open source, high quality',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 131072,
        category: 'powerful'
    },
    { 
        id: 'meta-llama/llama-3.1-8b-instruct', 
        name: 'Llama 3.1 8B', 
        description: 'Fast open source model',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 131072,
        category: 'fast'
    },
    // Mistral models
    { 
        id: 'mistralai/mistral-large', 
        name: 'Mistral Large', 
        description: 'Mistral flagship model',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 128000,
        category: 'powerful'
    },
    { 
        id: 'mistralai/mistral-small-3.1-24b-instruct', 
        name: 'Mistral Small', 
        description: 'Efficient Mistral model',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 32000,
        category: 'balanced'
    },
    // DeepSeek models
    { 
        id: 'deepseek/deepseek-chat', 
        name: 'DeepSeek Chat', 
        description: 'Cost-effective reasoning model',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 64000,
        category: 'balanced'
    },
    // Google models via OpenRouter (alternative to direct Gemini)
    { 
        id: 'google/gemini-2.0-flash-001', 
        name: 'Gemini 2.0 Flash (OpenRouter)', 
        description: 'Gemini via OpenRouter',
        provider: 'openrouter',
        supportsSearch: false,
        contextLength: 1000000,
        category: 'fast'
    },
    // Perplexity models with search
    { 
        id: 'perplexity/llama-3.1-sonar-large-128k-online', 
        name: 'Perplexity Sonar Large (Online)', 
        description: 'Web search enabled model',
        provider: 'openrouter',
        supportsSearch: true,
        contextLength: 128000,
        category: 'balanced'
    },
    { 
        id: 'perplexity/llama-3.1-sonar-small-128k-online', 
        name: 'Perplexity Sonar Small (Online)', 
        description: 'Fast web search model',
        provider: 'openrouter',
        supportsSearch: true,
        contextLength: 128000,
        category: 'fast'
    }
];

/**
 * Get all available models based on configured API keys
 */
export function getAvailableModels(): ChatModelsResponse {
    const models: ChatModelDefinition[] = [];
    
    // Add Gemini models if API key is configured
    if (GEMINI_API_KEY) {
        models.push(...GEMINI_MODELS);
    }
    
    // Add OpenRouter models if API key is configured
    if (OPENROUTER_API_KEY) {
        models.push(...OPENROUTER_MODELS);
    }
    
    // Determine default model based on what's available
    let defaultModel = 'gemini-2.5-flash'; // Prefer Gemini
    if (!GEMINI_API_KEY && OPENROUTER_API_KEY) {
        defaultModel = 'anthropic/claude-3.5-sonnet';
    } else if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) {
        // No API keys - return empty with warning
        console.warn('[LLM] No API keys configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY');
    }
    
    return { models, defaultModel };
}

/**
 * Get model definition by ID
 */
export function getModelById(modelId: string): ChatModelDefinition | undefined {
    const allModels = [...GEMINI_MODELS, ...OPENROUTER_MODELS];
    return allModels.find(m => m.id === modelId);
}

/**
 * Check if a model supports web search
 */
export function modelSupportsSearch(modelId: string): boolean {
    const model = getModelById(modelId);
    return model?.supportsSearch ?? false;
}

/**
 * LLM service for prompt generation and script analysis supporting multiple providers
 */

export async function generateImagePrompt(
    script: string,
    niche: string,
    provider: LLMProvider = 'openrouter',
    model?: GeminiLLMModel
): Promise<string> {

    if (provider === 'gemini') {
        return generateGeminiPrompt(script, niche, model || 'gemini-2.5-flash');
    }

    if (!OPENROUTER_API_KEY) {
        console.warn('OPENROUTER_API_KEY not set, using mock prompt generation');
        return generateMockPrompt(script, niche);
    }

    try {
        const nicheDescriptions: Record<string, string> = {
            motivational: 'inspiring and uplifting with dynamic energy',
            educational: 'clear and informative with professional aesthetics',
            entertainment: 'dramatic and engaging with cinematic appeal',
            news: 'professional and authoritative with journalistic quality',
            gaming: 'action-packed with vibrant neon colors',
            lifestyle: 'aesthetic and calming with natural beauty',
            other: 'visually striking with professional composition'
        };

        const style = nicheDescriptions[niche as Niche] || nicheDescriptions.other;

        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'Video Generator App'
            },
            body: JSON.stringify({
                model: DEFAULT_LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert at creating image generation prompts for ${niche} content. Generate detailed, visual prompts that are ${style}.`
                    },
                    {
                        role: 'user',
                        content: `Based on this script, create a single detailed image generation prompt:\n\n"${script}"\n\nThe prompt should be vivid, specific, and optimized for AI image generation. Focus on visual elements, composition, lighting, and mood. Output ONLY the prompt, no explanations.`
                    }
                ],
                max_tokens: 300,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const data = await response.json() as any;
        const prompt = data.choices?.[0]?.message?.content?.trim() || '';

        if (!prompt) {
            throw new Error('Empty prompt from LLM');
        }

        console.log(`Generated prompt via ${DEFAULT_LLM_MODEL}`);
        return prompt;
    } catch (error: any) {
        console.error('Prompt generation error:', error);
        console.log('Falling back to mock prompt');
        return generateMockPrompt(script, niche);
    }
}

export async function generateMultipleImagePrompts(
    script: string,
    niche: string,
    count: number,
    provider: LLMProvider = 'openrouter',
    model?: GeminiLLMModel
): Promise<Array<{ id: string; prompt: string; sceneDescription: string }>> {

    if (provider === 'gemini') {
        return generateGeminiMultiplePrompts(script, niche, count, model || 'gemini-2.5-flash');
    }

    if (!OPENROUTER_API_KEY) {
        console.warn('OPENROUTER_API_KEY not set, using mock prompts');
        return generateMockMultiplePrompts(script, niche, count);
    }

    try {
        const nicheDescriptions: Record<string, string> = {
            motivational: 'inspiring and uplifting',
            educational: 'clear and informative',
            entertainment: 'dramatic and engaging',
            news: 'professional and authoritative',
            gaming: 'action-packed',
            lifestyle: 'aesthetic and calming',
            other: 'visually striking'
        };

        const style = nicheDescriptions[niche as Niche] || nicheDescriptions.other;

        const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'Video Generator App'
            },
            body: JSON.stringify({
                model: DEFAULT_LLM_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert visual director. Split the following script into ${count} distinct scenes and create a detailed image generation prompt for each. The style should be ${style}. Return a JSON array where each object has: "sceneDescription" (brief summary of the scene) and "prompt" (detailed visual prompt for AI image generator).`
                    },
                    {
                        role: 'user',
                        content: script
                    }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const data = await response.json() as any;
        let content = data.choices?.[0]?.message?.content?.trim() || '';

        // Clean up markdown if present
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        let scenes;
        try {
            const parsed = JSON.parse(content);
            scenes = Array.isArray(parsed) ? parsed : (parsed.scenes || parsed.prompts || []);
        } catch (e) {
            console.error('Failed to parse LLM response:', content);
            throw new Error('Invalid JSON response from LLM');
        }

        return scenes.map((scene: any, index: number) => ({
            id: `scene-${index + 1}`,
            sceneDescription: scene.sceneDescription || `Scene ${index + 1}`,
            prompt: scene.prompt || scene.sceneDescription
        })).slice(0, count);

    } catch (error) {
        console.error('Multiple prompt generation error:', error);
        return generateMockMultiplePrompts(script, niche, count);
    }
}

async function generateGeminiPrompt(script: string, niche: string, modelName: string): Promise<string> {
    if (!genAI) {
        console.warn('[LLM] GEMINI_API_KEY not set, using mock prompt');
        return generateMockPrompt(script, niche);
    }

    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `Create a detailed image generation prompt for a ${niche} video based on this script segment: "${script}". The prompt should be vivid, specific, and optimized for AI image generation. Output ONLY the prompt text.`;

    try {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('[LLM] Gemini prompt generation error:', error);
        return generateMockPrompt(script, niche);
    }
}

async function generateGeminiMultiplePrompts(script: string, niche: string, count: number, modelName: string) {
    if (!genAI) {
        console.warn('[LLM] GEMINI_API_KEY not set, using mock prompts');
        return generateMockMultiplePrompts(script, niche, count);
    }

    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `You are a visual director. Split this script into ${count} scenes. For each scene, write a "sceneDescription" (brief summary) and a "prompt" (detailed image generation prompt). Return a JSON array of objects.

Script: ${script}
Niche: ${niche}

Output JSON ONLY.`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);

        if (jsonMatch) {
            const scenes = JSON.parse(jsonMatch[0]);
            return scenes.map((scene: any, index: number) => ({
                id: `scene-${index + 1}`,
                sceneDescription: scene.sceneDescription || `Scene ${index + 1}`,
                prompt: scene.prompt || scene.sceneDescription
            })).slice(0, count);
        }
        throw new Error('No JSON array found in response');
    } catch (error) {
        console.error('[LLM] Gemini multiple prompt generation error:', error);
        return generateMockMultiplePrompts(script, niche, count);
    }
}

/**
 * Analyze script using Gemini 2.5 Flash for video production
 */
export async function analyzeScript(
    script: string,
    niche: string
): Promise<ScriptAnalysisResponse> {
    if (!genAI) {
        console.warn('[LLM] GEMINI_API_KEY not set, using mock analysis');
        return generateMockAnalysis(script);
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const analysisPrompt = `Analyze this video script and provide a structured analysis for video production. Return a JSON object with the following structure:

{
  "visualKeywords": ["keyword1", "keyword2", ...],  // Specific visual elements, objects, locations (15-30 items)
  "moodTone": "description of overall mood",  // String describing emotional tone
  "keyThemes": ["theme1", "theme2", ...],  // Main topics and themes (5-10 items)
  "sceneBreakdown": ["scene1", "scene2", ...],  // Distinct scenes or shots (10-20 items)
  "stockVideoQueries": ["query1", "query2", ...],  // Specific search terms for stock footage (20-40 items)
  "colorPalette": "description",  // Suggested color schemes
  "pacing": "slow|moderate|fast"  // Suggested video pacing
}

SCRIPT:
${script}

NICHE: ${niche}

Provide ONLY the JSON object, no additional text.`;

    try {
        const result = await model.generateContent(analysisPrompt);
        const response = result.response;
        const text = response.text();

        console.log('[LLM] Gemini analysis response length:', text.length);

        // Try to parse JSON from response - remove markdown code blocks if present
        const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const analysisResult = {
                visualKeywords: Array.isArray(parsed.visualKeywords) ? parsed.visualKeywords : [],
                moodTone: parsed.moodTone || '',
                keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : [],
                sceneBreakdown: Array.isArray(parsed.sceneBreakdown) ? parsed.sceneBreakdown : [],
                stockVideoQueries: Array.isArray(parsed.stockVideoQueries) ? parsed.stockVideoQueries : [],
                colorPalette: parsed.colorPalette || '',
                pacing: parsed.pacing || 'moderate'
            };
            
            console.log(`[LLM] Parsed: ${analysisResult.stockVideoQueries.length} stock queries, ${analysisResult.sceneBreakdown.length} scenes`);
            
            // If stockVideoQueries is empty, generate from visualKeywords
            if (analysisResult.stockVideoQueries.length === 0 && analysisResult.visualKeywords.length > 0) {
                console.warn('[LLM] No stock queries, using visual keywords as fallback');
                analysisResult.stockVideoQueries = analysisResult.visualKeywords.slice(0, 30);
            }
            
            return analysisResult;
        } else {
            console.warn('[LLM] Could not parse JSON from Gemini response, using mock');
            return generateMockAnalysis(script);
        }
    } catch (error) {
        console.error('[LLM] Error analyzing script with Gemini:', error);
        return generateMockAnalysis(script);
    }
}

// Mock fallback functions
function generateMockPrompt(script: string, niche: string): string {
    const scriptPreview = script.substring(0, 100).replace(/\s+/g, ' ').trim();
    const nicheStyles: Record<string, string> = {
        motivational: 'inspiring, uplifting, energetic scene with vibrant colors',
        educational: 'clear, informative visualization with modern design',
        entertainment: 'dramatic, engaging scene with cinematic lighting',
        news: 'professional, clean composition with journalistic style',
        gaming: 'dynamic action scene with neon colors and high energy',
        lifestyle: 'aesthetic, calming scene with natural lighting',
        other: 'visually striking scene with professional composition'
    };
    const style = nicheStyles[niche as Niche] || nicheStyles.other;
    return `Create a ${style}, based on the theme: "${scriptPreview}..." High quality, 4K, cinematic, professional photography`;
}

function generateMockMultiplePrompts(script: string, niche: string, count: number) {
    const prompts: Array<{ id: string; prompt: string; sceneDescription: string }> = [];
    const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const scenesPerImage = Math.max(1, Math.floor(sentences.length / count));

    for (let i = 0; i < count; i++) {
        const startIdx = i * scenesPerImage;
        const endIdx = Math.min(startIdx + scenesPerImage, sentences.length);
        const sceneText = sentences.slice(startIdx, endIdx).join('. ').trim();
        const scenePreview = sceneText.substring(0, 80).trim();

        prompts.push({
            id: `scene-${i + 1}`,
            sceneDescription: scenePreview + (sceneText.length > 80 ? '...' : ''),
            prompt: generateMockPrompt(sceneText || script, niche)
        });
    }

    return prompts;
}

function generateMockAnalysis(script: string): ScriptAnalysisResponse {
    const words = script.split(' ').filter(w => w.length > 4);
    const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    return {
        visualKeywords: words.slice(0, 25).map(w => w.toLowerCase()),
        moodTone: 'informative and engaging',
        keyThemes: ['storytelling', 'visual narrative', 'content creation'],
        sceneBreakdown: sentences.slice(0, 10).map((s, i) => s.trim().substring(0, 80)),
        stockVideoQueries: words.slice(0, 35).map(w => w.toLowerCase()),
        colorPalette: 'vibrant and dynamic',
        pacing: 'moderate'
    };
}

/**
 * Generate stock video keywords for script scenes
 * @deprecated Use analyzeScript instead
 */
export async function generateStockVideoKeywords(
    script: string,
    niche: string
): Promise<Array<{ id: string; keywords: string[]; sceneDescription: string }>> {
    // Use the new analyzeScript function
    const analysis = await analyzeScript(script, niche);

    console.log(`[LLM] Stock video keywords: ${analysis.stockVideoQueries.length} queries for ${analysis.sceneBreakdown.length} scenes`);

    // Ensure we have scenes
    if (analysis.sceneBreakdown.length === 0) {
        console.warn('[LLM] No scenes in breakdown, creating default scenes');
        const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 10);
        analysis.sceneBreakdown = sentences.slice(0, 5).map(s => s.trim().substring(0, 100));
    }

    // Ensure we have stock queries
    if (analysis.stockVideoQueries.length === 0) {
        console.warn('[LLM] No stock queries, using keywords from script');
        analysis.stockVideoQueries = script.split(' ')
            .filter(w => w.length > 4)
            .slice(0, 30)
            .map(w => w.toLowerCase());
    }

    // Distribute keywords across scenes (3-5 keywords per scene)
    const keywordsPerScene = Math.max(3, Math.floor(analysis.stockVideoQueries.length / analysis.sceneBreakdown.length));
    
    return analysis.sceneBreakdown.map((scene, index) => {
        const startIdx = index * keywordsPerScene;
        const endIdx = Math.min(startIdx + keywordsPerScene, analysis.stockVideoQueries.length);
        const sceneKeywords = analysis.stockVideoQueries.slice(startIdx, endIdx);
        
        // Fallback if no keywords for this scene
        if (sceneKeywords.length === 0) {
            const sceneWords = scene.split(' ').filter(w => w.length > 4).slice(0, 3);
            return {
                id: `scene-${index + 1}`,
                sceneDescription: scene,
                keywords: sceneWords.map(w => w.toLowerCase())
            };
        }
        
        return {
            id: `scene-${index + 1}`,
            sceneDescription: scene,
            keywords: sceneKeywords
        };
    });
}

// ============ CHAT / SCRIPT WRITING FUNCTIONS ============

/**
 * Call OpenRouter API for chat completions
 */
async function callOpenRouter(
    messages: Array<{ role: string; content: string }>,
    modelId: string,
    maxTokens: number = 8192
): Promise<string> {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Video Generator App'
        },
        body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: maxTokens,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } };
        throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    
    if (!content) {
        throw new Error('Empty response from OpenRouter');
    }

    return content;
}

/**
 * Call Gemini API with optional search grounding
 */
async function callGemini(
    messages: ChatMessage[],
    modelId: string,
    systemPrompt?: string,
    maxTokens: number = 8192,
    useSearch: boolean = false
): Promise<{ text: string; searchUsed: boolean }> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    console.log(`[LLM Gemini] Using model: ${modelId}, search: ${useSearch}`);

    // Configure tools for search if requested and model supports it
    const modelConfig: any = { model: modelId };
    
    // Enable Google Search grounding for supported models (2.5 series)
    if (useSearch && (modelId.includes('2.5') || modelId.includes('2.0'))) {
        modelConfig.tools = [{
            googleSearch: {}
        }];
        console.log('[LLM Gemini] Google Search grounding enabled');
    }

    const model = genAI.getGenerativeModel(modelConfig);

    // Build conversation history
    const history = messages
        .filter(m => m.role !== 'system')
        .slice(0, -1)
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
    }

    try {
        const chat = model.startChat({
            history,
            generationConfig: {
                maxOutputTokens: maxTokens,
            },
        });

        // Prepend system prompt to first message if provided
        let prompt = lastMessage.content;
        if (systemPrompt && history.length === 0) {
            prompt = `[System: ${systemPrompt}]\n\n${prompt}`;
        }

        const result = await chat.sendMessage(prompt);
        const response = result.response;
        const text = response.text();
        
        // Check if search grounding was actually used
        const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
        const searchUsed = useSearch && !!groundingMetadata?.searchEntryPoint;
        
        if (searchUsed) {
            console.log('[LLM Gemini] Search grounding was used in response');
        }

        return { text, searchUsed };
    } catch (error: any) {
        console.error('[LLM Gemini] Error:', error);
        throw error;
    }
}

/**
 * Chat with any supported model for script writing or general conversation
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
    const modelId = request.model || 'gemini-2.5-flash';
    const modelDef = getModelById(modelId);
    
    console.log(`[LLM Chat] Using model: ${modelId}, provider: ${modelDef?.provider || 'unknown'}`);

    // Determine if we should use search
    const useSearch = !!(request.useSearch && modelSupportsSearch(modelId));
    
    if (!modelDef) {
        // Unknown model - try to detect provider from ID
        if (modelId.includes('/')) {
            // Looks like OpenRouter format (provider/model)
            return chatViaOpenRouter(request, modelId);
        }
        // Default to Gemini
        return chatViaGemini(request, modelId, useSearch);
    }

    if (modelDef.provider === 'openrouter') {
        return chatViaOpenRouter(request, modelId);
    }

    return chatViaGemini(request, modelId, useSearch);
}

async function chatViaGemini(request: ChatRequest, modelId: string, useSearch: boolean): Promise<ChatResponse> {
    const systemPrompt = request.systemPrompt || 
        'You are a helpful assistant for video content creation. You help users write scripts, brainstorm ideas, and refine their content.';

    const { text, searchUsed } = await callGemini(
        request.messages,
        modelId,
        systemPrompt,
        request.maxTokens || 8192,
        useSearch
    );

    return {
        message: {
            role: 'assistant',
            content: text,
            timestamp: Date.now()
        },
        model: modelId,
        searchUsed
    };
}

async function chatViaOpenRouter(request: ChatRequest, modelId: string): Promise<ChatResponse> {
    const systemPrompt = request.systemPrompt || 
        'You are a helpful assistant for video content creation. You help users write scripts, brainstorm ideas, and refine their content.';

    // Build messages for OpenRouter
    const messages: Array<{ role: string; content: string }> = [];
    
    // Add system message
    messages.push({ role: 'system', content: systemPrompt });
    
    // Add conversation history
    for (const msg of request.messages) {
        if (msg.role !== 'system') {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    const text = await callOpenRouter(messages, modelId, request.maxTokens || 8192);

    return {
        message: {
            role: 'assistant',
            content: text,
            timestamp: Date.now()
        },
        model: modelId,
        searchUsed: false
    };
}

/**
 * Generate a script based on user requirements
 */
export async function generateScript(request: ScriptGenerationRequest): Promise<ScriptGenerationResponse> {
    const modelId = request.model || 'gemini-2.5-flash';
    const modelDef = getModelById(modelId);
    const useSearch = request.useSearch && modelSupportsSearch(modelId);

    console.log(`[LLM Script] Generating script with model: ${modelId}`);

    const wordCountInstruction = request.wordCount 
        ? `The script should be approximately ${request.wordCount} words.` 
        : 'Write a comprehensive script.';

    const toneInstruction = request.tone 
        ? `The tone should be ${request.tone}.` 
        : '';

    const nicheInstruction = request.niche 
        ? `This is for a ${request.niche} video.` 
        : '';

    const systemPrompt = `You are an expert video script writer. Write engaging, natural-sounding scripts that are perfect for voiceover narration.

Guidelines:
- Write in a conversational, engaging tone
- Use short sentences that are easy to speak
- Include natural pauses and transitions
- Avoid complex jargon unless specifically requested
- Focus on clear, impactful storytelling
${wordCountInstruction}
${toneInstruction}
${nicheInstruction}

Output ONLY the script text, no titles, no formatting markers, no explanations.`;

    let script: string;
    let searchUsed = false;

    if (modelDef?.provider === 'openrouter' || (!modelDef && modelId.includes('/'))) {
        // Use OpenRouter
        script = await callOpenRouter(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: request.prompt }
            ],
            modelId,
            8192
        );
    } else {
        // Use Gemini
        const result = await callGemini(
            [{ role: 'user', content: request.prompt, timestamp: Date.now() }],
            modelId,
            systemPrompt,
            8192,
            useSearch
        );
        script = result.text;
        searchUsed = result.searchUsed;
    }

    const wordCount = script.split(/\s+/).length;

    return {
        script: script.trim(),
        wordCount,
        model: modelId,
        searchUsed
    };
}

/**
 * Refine an image prompt using AI - takes context from script and user's rough idea
 */
export async function refineImagePrompt(
    roughPrompt: string,
    scriptContext?: string,
    niche?: string,
    model: GeminiChatModel = 'gemini-2.5-flash'
): Promise<string> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    console.log(`[LLM Refine] Refining prompt with model: ${model}`);

    const geminiModel = genAI.getGenerativeModel({ model });

    const nicheStyle = niche ? getNicheStyleDescription(niche) : 'visually striking and professional';
    
    const contextSection = scriptContext 
        ? `\n\nScript context for reference:\n"${scriptContext.substring(0, 500)}${scriptContext.length > 500 ? '...' : ''}"`
        : '';

    const systemPrompt = `You are an expert at creating detailed image generation prompts for AI image generators like DALL-E, Midjourney, and Imagen.

Transform the user's rough idea into a polished, detailed image generation prompt that will produce high-quality results.

Guidelines:
- Be specific about visual elements, composition, lighting, colors, and mood
- The style should be ${nicheStyle}
- Include technical quality terms (4K, cinematic, professional photography, etc.)
- Keep it under 200 words
- Output ONLY the refined prompt, nothing else
${contextSection}`;

    try {
        const result = await geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser's rough idea: ${roughPrompt}` }] }],
        });

        return result.response.text().trim();
    } catch (error: any) {
        console.error('[LLM Refine] Error:', error);
        throw error;
    }
}

function getNicheStyleDescription(niche: string): string {
    const styles: Record<string, string> = {
        motivational: 'inspiring, uplifting, with dynamic energy and vibrant colors',
        educational: 'clear, informative, with professional and clean aesthetics',
        entertainment: 'dramatic, engaging, with cinematic appeal and visual impact',
        news: 'professional, authoritative, with journalistic quality',
        gaming: 'action-packed, with vibrant neon colors and high energy',
        lifestyle: 'aesthetic, calming, with natural beauty and soft lighting',
        other: 'visually striking with professional composition'
    };
    return styles[niche] || styles.other;
}

// ============ SMART CHAT FUNCTIONS ============

/**
 * Detect user intent from their message
 */
function detectIntent(message: string): ChatIntent {
    const lowerMessage = message.toLowerCase();
    
    // Research indicators
    const researchPatterns = [
        /research/i, /find out/i, /look up/i, /what is/i, /tell me about/i,
        /explore/i, /investigate/i, /learn about/i, /information on/i,
        /before (you )?writ/i, /don't write yet/i, /just research/i
    ];
    
    // Write/script indicators
    const writePatterns = [
        /write (a |the )?script/i, /create (a |the )?script/i, /generate (a |the )?script/i,
        /write (a |the )?video/i, /\d+ words?/i, /write about/i, /write me/i,
        /draft (a |the )?script/i, /compose/i
    ];
    
    // Refine indicators
    const refinePatterns = [
        /make it/i, /change (the |this )?/i, /shorter/i, /longer/i, /more/i, /less/i,
        /rewrite/i, /revise/i, /improve/i, /adjust/i, /modify/i, /tweak/i,
        /tone/i, /style/i, /add more/i, /remove/i
    ];
    
    // Check patterns in order of specificity
    if (refinePatterns.some(p => p.test(lowerMessage))) {
        return 'refine';
    }
    if (researchPatterns.some(p => p.test(lowerMessage))) {
        return 'research';
    }
    if (writePatterns.some(p => p.test(lowerMessage))) {
        return 'write';
    }
    
    return 'general';
}

/**
 * Extract word count from user message if specified
 */
function extractWordCount(message: string): number | undefined {
    // Match patterns like "300 words", "around 500 words", "~200 word", "500-word"
    const patterns = [
        /(\d+)\s*[-]?\s*words?/i,
        /around\s+(\d+)\s+words?/i,
        /approximately\s+(\d+)\s+words?/i,
        /about\s+(\d+)\s+words?/i,
        /~\s*(\d+)\s*words?/i,
        /(\d+)\s*word\s*script/i
    ];
    
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
            const count = parseInt(match[1], 10);
            if (count >= 50 && count <= 10000) {
                return count;
            }
        }
    }
    
    return undefined;
}

/**
 * Check if the response looks like a complete script
 */
function isCompleteScript(text: string): boolean {
    const wordCount = text.split(/\s+/).length;
    // A script typically has:
    // - More than 100 words
    // - Multiple sentences
    // - Narrative structure (not just Q&A or bullet points)
    
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const hasBulletPoints = /^[\s]*[-•*]/m.test(text);
    const hasNarrativeFlow = sentences.length >= 3 && !hasBulletPoints;
    
    return wordCount >= 100 && hasNarrativeFlow;
}

/**
 * Generate suggested actions based on response type
 */
function getSuggestedActions(isScript: boolean, intent: ChatIntent): string[] {
    if (isScript) {
        return ['Use as Script', 'Make it shorter', 'Make it longer', 'Change the tone'];
    }
    
    switch (intent) {
        case 'research':
            return ['Now write the script', 'Tell me more', 'Focus on a specific aspect'];
        case 'refine':
            return ['Use as Script', 'Refine further', 'Start over'];
        default:
            return ['Write a script about this', 'Tell me more'];
    }
}

/**
 * Smart chat that detects intent, extracts word count, and adapts behavior
 */
export async function smartChat(request: SmartChatRequest): Promise<SmartChatResponse> {
    const modelId = request.model || 'gemini-2.5-flash';
    const modelDef = getModelById(modelId);
    const useSearch = request.useSearch && modelSupportsSearch(modelId);
    
    console.log(`[Smart Chat] Using model: ${modelId}, provider: ${modelDef?.provider || 'unknown'}, search: ${useSearch}`);

    // Get the last user message
    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
    }

    // Detect intent and extract word count
    const detectedIntent = detectIntent(lastMessage.content);
    const extractedWordCount = extractWordCount(lastMessage.content);
    const targetWordCount = extractedWordCount || request.targetWordCount || 300;

    console.log(`[Smart Chat] Detected intent: ${detectedIntent}, Word count: ${extractedWordCount || 'not specified'}`);

    // Build intent-specific system prompt
    const nicheContext = request.niche ? `The content is for the ${request.niche} niche.` : '';
    let systemPrompt = '';
    
    switch (detectedIntent) {
        case 'research':
            systemPrompt = `You are a research assistant helping with video content creation. ${nicheContext}
            
The user wants to research a topic BEFORE writing a script. Provide helpful, detailed information.
DO NOT write a script yet - just provide research, facts, insights, and angles they could take.
Be thorough but organized. Use bullet points or sections for clarity.${useSearch ? '\n\nUse web search to find current, accurate information.' : ''}`;
            break;
            
        case 'write':
            systemPrompt = `You are an expert video script writer. ${nicheContext}

Write an engaging, natural-sounding script for voiceover narration.
Target word count: approximately ${targetWordCount} words.

Guidelines:
- Write in a conversational, engaging tone
- Use short sentences that are easy to speak
- Include natural pauses and transitions
- Avoid complex jargon unless specifically requested
- Focus on clear, impactful storytelling
- Output ONLY the script text - no titles, headers, or formatting markers${useSearch ? '\n\nYou may use web search to gather accurate facts for the script.' : ''}`;
            break;
            
        case 'refine':
            systemPrompt = `You are an expert script editor. ${nicheContext}

The user wants to refine or modify a previous script or content.
Apply their requested changes while maintaining quality and flow.
If they ask to make it shorter/longer, target approximately ${targetWordCount} words.
Output the revised script directly without explanations.`;
            break;
            
        default:
            systemPrompt = `You are a helpful assistant for video content creation. ${nicheContext}
You help users brainstorm ideas, answer questions, and prepare for script writing.
Be conversational and helpful. If they seem ready to write, offer to create a script.${useSearch ? '\n\nUse web search when helpful to provide accurate, current information.' : ''}`;
    }

    let text: string;
    let searchUsed = false;

    if (modelDef?.provider === 'openrouter' || (!modelDef && modelId.includes('/'))) {
        // Use OpenRouter
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt }
        ];
        
        // Add conversation history (excluding last message which we'll add separately)
        for (const msg of request.messages.slice(0, -1)) {
            if (msg.role !== 'system') {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
        
        // Add last message
        messages.push({ role: 'user', content: lastMessage.content });

        text = await callOpenRouter(messages, modelId, 8192);
        
        // Check if this is a Perplexity online model (has built-in search)
        if (modelId.includes('online') || modelId.includes('sonar')) {
            searchUsed = true;
        }
    } else {
        // Use Gemini
        const result = await callGemini(
            request.messages,
            modelId,
            systemPrompt,
            8192,
            useSearch
        );
        text = result.text;
        searchUsed = result.searchUsed;
    }

    // Analyze the response
    const isScript = isCompleteScript(text);
    const scriptWordCount = isScript ? text.split(/\s+/).length : undefined;
    const suggestedActions = getSuggestedActions(isScript, detectedIntent);

    console.log(`[Smart Chat] Response: ${text.length} chars, isScript: ${isScript}, wordCount: ${scriptWordCount}, searchUsed: ${searchUsed}`);

    return {
        message: {
            role: 'assistant',
            content: text,
            timestamp: Date.now()
        },
        model: modelId,
        detectedIntent,
        extractedWordCount,
        isScript,
        scriptWordCount,
        suggestedActions,
        searchUsed
    };
}
