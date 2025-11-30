import fs from 'fs';
import path from 'path';
import { ImageModel, AspectRatio, ImageService, ImageGenerationResponse } from 'shared/src/types';
import { getTempFilePath } from './file.service';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Nano Banana models (uses generateContent API)
type NanoBananaModelId = 'gemini-2.5-flash-image' | 'gemini-2.5-pro-image';

// Imagen models (uses generateImages API)
type ImagenModelId = 'imagen-4.0-generate-001' | 'imagen-4.0-ultra-generate-001' | 'imagen-4.0-fast-generate-001';

type GeminiImageModelId = NanoBananaModelId | ImagenModelId;

interface ImageModelInfo {
    name: string;
    description: string;
    apiModel: string;
    family: 'nano-banana' | 'imagen';
}

const GEMINI_IMAGE_MODELS: Record<GeminiImageModelId, ImageModelInfo> = {
    // Imagen family (uses generateImages API) - FAST options first
    'imagen-4.0-fast-generate-001': {
        name: 'Imagen 4 Fast ⚡',
        description: 'Fastest option - optimized for speed while maintaining good quality',
        apiModel: 'imagen-4.0-fast-generate-001',
        family: 'imagen'
    },
    'imagen-4.0-generate-001': {
        name: 'Imagen 4 (Balanced)',
        description: 'High-fidelity image generation, great balance of quality and speed',
        apiModel: 'imagen-4.0-generate-001',
        family: 'imagen'
    },
    'imagen-4.0-ultra-generate-001': {
        name: 'Imagen 4 Ultra (Best Quality)',
        description: 'Highest quality Imagen model for professional asset production',
        apiModel: 'imagen-4.0-ultra-generate-001',
        family: 'imagen'
    },
    // Nano Banana family (uses generateContent API)
    'gemini-2.5-flash-image': {
        name: 'Gemini Flash Image ⚡',
        description: 'Fast, good-quality Gemini image generation',
        apiModel: 'gemini-2.5-flash-image',
        family: 'nano-banana'
    },
    'gemini-2.5-pro-image': {
        name: 'Gemini Pro Image (Best Quality)',
        description: 'Highest quality Gemini image model',
        apiModel: 'gemini-2.5-pro-image',
        family: 'nano-banana'
    }
};

function isGeminiImageModel(model: string): model is GeminiImageModelId {
    return model in GEMINI_IMAGE_MODELS;
}

function isNanoBananaModel(model: string): model is NanoBananaModelId {
    return model === 'gemini-2.5-flash-image' || model === 'gemini-2.5-pro-image';
}

function isImagenModel(model: string): model is ImagenModelId {
    return model === 'imagen-4.0-generate-001' || model === 'imagen-4.0-ultra-generate-001' || model === 'imagen-4.0-fast-generate-001';
}

export async function listImageModels(service: ImageService): Promise<any[]> {
    if (service === 'openrouter') {
        return listOpenRouterModels();
    } else if (service === 'gemini') {
        return Object.entries(GEMINI_IMAGE_MODELS).map(([id, meta]: [string, any]) => ({
            id,
            name: meta.name,
            description: meta.description
        }));
    }
    return [];
}

async function listOpenRouterModels() {
    if (!OPENROUTER_API_KEY) {
        // Return popular defaults if no API key
        return [
            { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro', description: 'Best quality' },
            { id: 'black-forest-labs/flux-dev', name: 'FLUX Dev', description: 'Good balance' },
            { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', description: 'Fastest' },
            { id: 'openai/dall-e-3', name: 'DALL-E 3', description: 'OpenAI' }
        ];
    }
    try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
            headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
        });
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json() as any;
        
        // Filter for image generation models
        const imageModels = data.data.filter((model: any) => {
            const id = model.id.toLowerCase();
            return id.includes('flux') || id.includes('dall-e') || 
                   id.includes('stable-diffusion') || id.includes('midjourney');
        });
        
        console.log(`[OpenRouter] Found ${imageModels.length} image models`);
        return imageModels.map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            description: m.description || ''
        }));
    } catch (error) {
        console.error('Error fetching OpenRouter models:', error);
        return [];
    }
}

interface ImageMetadata {
    promptIndex?: number;
    prompt?: string;
}

export async function generateImage(
    prompt: string,
    service: ImageService,
    model: ImageModel,
    aspectRatio: AspectRatio = '16:9',
    metadata?: ImageMetadata
): Promise<ImageGenerationResponse> {
    if (service === 'openrouter') {
        return generateOpenRouterImage(prompt, model, aspectRatio, metadata);
    } else if (service === 'gemini') {
        if (!isGeminiImageModel(model)) {
            throw new Error(`Unsupported Gemini image model: ${model}`);
        }
        return generateGeminiImage(prompt, model, aspectRatio, metadata);
    }
    throw new Error(`Unsupported image service: ${service}`);
}

async function generateOpenRouterImage(
    prompt: string,
    model: ImageModel,
    aspectRatio: AspectRatio,
    metadata?: ImageMetadata
) {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

    let width = 1024;
    let height = 576; // 16:9
    if (aspectRatio === '9:16') { width = 576; height = 1024; }
    else if (aspectRatio === '1:1') { width = 1024; height = 1024; }

    try {
        const response = await fetch(`${OPENROUTER_BASE_URL}/images/generations`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://clabs.app',
                'X-Title': 'Clabs Video Generator'
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                size: `${width}x${height}`
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter error: ${response.status} ${error}`);
        }

        const data = await response.json() as any;
        let imageUrl = data.data?.[0]?.url;

        if (!imageUrl) throw new Error('No image URL returned');

        const filePath = getTempFilePath('png');
        const fileName = path.basename(filePath);
        const imageId = path.parse(filePath).name;
        const imgRes = await fetch(imageUrl);
        const buffer = await imgRes.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return {
            imageUrl: `/temp/${fileName}`,
            imageId,
            model,
            promptIndex: metadata?.promptIndex,
            prompt: metadata?.prompt
        };
    } catch (error) {
        console.error('OpenRouter generation error:', error);
        throw error;
    }
}

async function generateGeminiImage(
    prompt: string,
    model: GeminiImageModelId,
    aspectRatio: AspectRatio,
    metadata?: ImageMetadata
) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    const modelInfo = GEMINI_IMAGE_MODELS[model];
    const apiModel = modelInfo ? modelInfo.apiModel : model;
    const modelName = modelInfo ? modelInfo.name : model;
    const modelFamily = modelInfo ? modelInfo.family : 'nano-banana';
    
    console.log(`[Gemini Image] Generating image with model: ${modelName} (${modelFamily}), aspect ratio: ${aspectRatio}`);

    try {
        let base64Data: string;
        let mimeType: string;

        if (modelFamily === 'imagen') {
            // Use Imagen generateImages API
            const result = await requestImagenImage(apiModel, prompt, aspectRatio);
            base64Data = result.base64Data;
            mimeType = result.mimeType;
        } else {
            // Use Nano Banana generateContent API
            const result = await requestGeminiImage(apiModel, prompt, aspectRatio);
            base64Data = result.base64Data;
            mimeType = result.mimeType;
        }

        const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const filePath = getTempFilePath(extension);
        const fileName = path.basename(filePath);
        const imageId = path.parse(filePath).name;

        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        console.log(`[Gemini Image] Image saved to ${fileName}`);
        return {
            imageUrl: `/temp/${fileName}`,
            imageId,
            model,
            promptIndex: metadata?.promptIndex,
            prompt: metadata?.prompt
        };

    } catch (error: any) {
        console.error('[Gemini Image] Generation error:', error);
        throw error;
    }
}

/**
 * Generate multiple images in parallel for faster batch processing
 * Includes retry logic to ensure all requested images are generated
 */
export async function generateMultipleImages(
    prompts: string[],
    service: ImageService,
    model: ImageModel,
    aspectRatio: AspectRatio
): Promise<ImageGenerationResponse[]> {
    console.log(`[Image Service] Generating ${prompts.length} images in parallel using ${model}`);
    
    // Use conservative batch size to avoid rate limits
    const batchSize = 3; 
    const maxRetries = 5; // Increased retries
    
    // Track results by index to maintain order
    const resultsByIndex: Map<number, ImageGenerationResponse> = new Map();
    
    // Track which indices still need to be generated
    let pendingIndices = prompts.map((_, i) => i);
    let retryCount = 0;
    
    while (pendingIndices.length > 0 && retryCount < maxRetries) {
        if (retryCount > 0) {
            const delay = 2000 * Math.pow(2, retryCount - 1); // Exponential backoff: 2s, 4s, 8s, 16s...
            console.log(`[Image Service] Retry ${retryCount}/${maxRetries} for ${pendingIndices.length} failed images. Waiting ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const failedIndices: number[] = [];
        
        // Process in batches
        for (let batchStart = 0; batchStart < pendingIndices.length; batchStart += batchSize) {
            const batchIndices = pendingIndices.slice(batchStart, batchStart + batchSize);
            const batchPromises = batchIndices.map(globalIndex => {
                const prompt = prompts[globalIndex];
                return generateImage(
                    prompt,
                    service,
                    model,
                    aspectRatio,
                    { promptIndex: globalIndex, prompt }
                ).then(result => ({ globalIndex, result }))
                .catch(err => {
                    const isRateLimit = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many Requests');
                    console.error(`[Image Service] Failed to generate image ${globalIndex} (${isRateLimit ? 'Rate Limit' : 'Error'}):`, err.message || err);
                    return { globalIndex, result: null, error: err };
                });
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            for (const { globalIndex, result } of batchResults) {
                if (result) {
                    resultsByIndex.set(globalIndex, result);
                } else {
                    failedIndices.push(globalIndex);
                }
            }
            
            // Delay between batches
            if (batchStart + batchSize < pendingIndices.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        pendingIndices = failedIndices;
        retryCount++;
    }
    
    // Log final status
    const successCount = resultsByIndex.size;
    if (pendingIndices.length > 0) {
        console.warn(`[Image Service] Could not generate ${pendingIndices.length} images after ${maxRetries} retries: indices ${pendingIndices.join(', ')}`);
    }
    console.log(`[Image Service] Successfully generated ${successCount}/${prompts.length} images`);
    
    // Return results in order
    const orderedResults: ImageGenerationResponse[] = [];
    for (let i = 0; i < prompts.length; i++) {
        const result = resultsByIndex.get(i);
        if (result) {
            orderedResults.push(result);
        }
    }
    
    return orderedResults;
}

async function requestGeminiImage(model: string, prompt: string, aspectRatio: AspectRatio): Promise<{ base64Data: string; mimeType: string }> {
    const url = `${GEMINI_IMAGE_BASE_URL}/models/${model}:generateContent`;
    const body = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            imageConfig: {
                aspectRatio
            }
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY!
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini image error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    
    // Extract image from candidates array
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
        throw new Error('No candidates in Gemini response');
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
        throw new Error('No parts in candidate content');
    }

    // Find inline data in parts
    let inlineData = null;
    for (const part of parts) {
        if (part.inlineData || part.inline_data) {
            inlineData = part.inlineData || part.inline_data;
            break;
        }
    }

    if (!inlineData) {
        throw new Error('No inline image data found in response');
    }

    const base64Data = inlineData.data;
    const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';

    if (!base64Data) {
        throw new Error('Missing base64 image data');
    }

    return { base64Data, mimeType };
}

async function requestImagenImage(model: string, prompt: string, aspectRatio: AspectRatio): Promise<{ base64Data: string; mimeType: string }> {
    // Imagen uses a different API endpoint - generateImages instead of generateContent
    const url = `${GEMINI_IMAGE_BASE_URL}/models/${model}:predict`;
    
    // Map aspect ratio to Imagen format (Imagen supports 1:1, 3:4, 4:3, 9:16, 16:9)
    let imagenAspectRatio = aspectRatio;
    
    const body = {
        instances: [{
            prompt: prompt
        }],
        parameters: {
            sampleCount: 1,
            aspectRatio: imagenAspectRatio,
            personGeneration: 'allow_adult'
        }
    };

    console.log(`[Imagen] Requesting image from model: ${model}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY!
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[Imagen] API Error:', errorText);
        throw new Error(`Imagen API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as any;
    
    // Imagen returns predictions array with bytesBase64Encoded
    const predictions = data.predictions;
    if (!predictions || predictions.length === 0) {
        throw new Error('No predictions in Imagen response');
    }

    const prediction = predictions[0];
    const base64Data = prediction.bytesBase64Encoded;
    const mimeType = prediction.mimeType || 'image/png';

    if (!base64Data) {
        throw new Error('No image data in Imagen response');
    }

    console.log(`[Imagen] Successfully received image data`);
    return { base64Data, mimeType };
}

