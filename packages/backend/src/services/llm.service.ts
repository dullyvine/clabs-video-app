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
    ScriptGenerationResponse
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
 * Chat with Gemini model for script writing or general conversation
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelName = request.model || 'gemini-2.5-flash';
    console.log(`[LLM Chat] Using model: ${modelName}`);

    const model = genAI.getGenerativeModel({ model: modelName });

    // Build conversation history
    const history = request.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

    // Get the last user message
    const lastMessage = request.messages[request.messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
    }

    // Build system instruction
    const systemInstruction = request.systemPrompt || 
        'You are a helpful assistant for video content creation. You help users write scripts, brainstorm ideas, and refine their content.';

    try {
        const chat = model.startChat({
            history: history.slice(0, -1), // All messages except the last one
            generationConfig: {
                maxOutputTokens: request.maxTokens || 8192,
            },
        });

        // Prepend system prompt to first message if provided
        let prompt = lastMessage.content;
        if (request.systemPrompt && history.length <= 1) {
            prompt = `[System: ${systemInstruction}]\n\n${prompt}`;
        }

        const result = await chat.sendMessage(prompt);
        const response = result.response;
        const text = response.text();

        return {
            message: {
                role: 'assistant',
                content: text,
                timestamp: Date.now()
            },
            model: modelName
        };
    } catch (error: any) {
        console.error('[LLM Chat] Error:', error);
        throw error;
    }
}

/**
 * Generate a script based on user requirements
 */
export async function generateScript(request: ScriptGenerationRequest): Promise<ScriptGenerationResponse> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelName = request.model || 'gemini-2.5-flash';
    console.log(`[LLM Script] Generating script with model: ${modelName}`);

    const model = genAI.getGenerativeModel({ model: modelName });

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

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser request: ${request.prompt}` }] }],
            generationConfig: {
                maxOutputTokens: 8192,
            },
        });

        const script = result.response.text().trim();
        const wordCount = script.split(/\s+/).length;

        return {
            script,
            wordCount,
            model: modelName
        };
    } catch (error: any) {
        console.error('[LLM Script] Error:', error);
        throw error;
    }
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
