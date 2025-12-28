import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import {
    ImagePromptRequest,
    ImagePromptResponse,
    ImageGenerationRequest,
    ImageGenerationResponse,
    ImageEditRequest,
    ImageEditResponse
} from 'shared/src/types';
import { generateImagePrompt, generateMultipleImagePrompts } from '../services/llm.service';
import { generateImage, generateMultipleImages, listImageModels, editImage, listImageEditModels, getImageServiceStatus } from '../services/image.service';
import { trackFile } from '../services/file.service';
import { upload } from '../utils/upload';

export const imagesRouter = express.Router();

// Get image service availability status (based on API keys)
imagesRouter.get('/status', async (req, res) => {
    try {
        const status = getImageServiceStatus();
        console.log(`[Images Route] Service status: OpenRouter=${status.openrouter}, Gemini=${status.gemini}`);
        res.json(status);
    } catch (error: any) {
        console.error('Status check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate image prompts from script
imagesRouter.post('/prompts', async (req, res) => {
    try {
        const { script, niche, count, provider, model }: ImagePromptRequest = req.body;

        if (!script || !niche) {
            return res.status(400).json({ error: 'Script and niche are required' });
        }

        let response: ImagePromptResponse;

        if (count && count > 1) {
            // Generate multiple prompts
            const prompts = await generateMultipleImagePrompts(script, niche, count, provider, model);
            response = { prompts };
        } else {
            // Generate single prompt
            const prompt = await generateImagePrompt(script, niche, provider, model);
            response = {
                prompts: [{ id: 'single', prompt, sceneDescription: 'Main scene' }]
            };
        }

        res.json(response);
    } catch (error: any) {
        console.error('Prompt generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate single image
imagesRouter.post('/generate', async (req, res) => {
    try {
        const { prompt, service, model, aspectRatio }: ImageGenerationRequest = req.body;

        if (!prompt || !model || !aspectRatio) {
            return res.status(400).json({ error: 'Prompt, model, and aspectRatio are required' });
        }

        const result = await generateImage(
            prompt,
            service || 'openrouter',
            model,
            aspectRatio,
            { promptIndex: 0, prompt }
        );

        const response: ImageGenerationResponse = {
            imageUrl: result.imageUrl,
            imageId: result.imageId,
            model: result.model,
            promptIndex: result.promptIndex ?? 0,
            prompt: result.prompt
        };

        res.json(response);
    } catch (error: any) {
        console.error('Image generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate multiple images
imagesRouter.post('/generate-batch', async (req, res) => {
    try {
        const { prompts, service, model, aspectRatio } = req.body;

        if (!prompts || !Array.isArray(prompts) || !model || !aspectRatio) {
            return res.status(400).json({ error: 'Prompts array, model, and aspectRatio are required' });
        }

        const results = await generateMultipleImages(prompts, service || 'openrouter', model, aspectRatio);
        res.json(results);
    } catch (error: any) {
        console.error('Batch image generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List available models
imagesRouter.get('/models', async (req, res) => {
    try {
        const service = req.query.service as any || 'openrouter';
        const models = await listImageModels(service);
        console.log(`[Images Route] Listing ${models.length} models for ${service}`);
        res.json({ models });
    } catch (error: any) {
        console.error('Models list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// List available image editing models
imagesRouter.get('/edit-models', async (req, res) => {
    try {
        const models = listImageEditModels();
        console.log(`[Images Route] Listing ${models.length} image editing models`);
        res.json({ models });
    } catch (error: any) {
        console.error('Edit models list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Upload image
imagesRouter.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        const imageId = uuidv4();

        res.json({
            imageUrl,
            imageId,
            model: 'user-upload'
        });
    } catch (error: any) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Edit image using Gemini's native image generation
imagesRouter.post('/edit', async (req, res) => {
    try {
        const { imageUrl, editPrompt, model }: ImageEditRequest = req.body;

        if (!imageUrl || !editPrompt) {
            return res.status(400).json({ error: 'imageUrl and editPrompt are required' });
        }

        console.log(`[Images Route] Editing image: ${imageUrl} with prompt: "${editPrompt.substring(0, 50)}..."`);

        const result = await editImage(
            imageUrl,
            editPrompt,
            model || 'gemini-2.0-flash-exp'
        );

        const response: ImageEditResponse = {
            imageUrl: result.imageUrl,
            imageId: result.imageId,
            model: result.model,
            originalImageUrl: result.originalImageUrl
        };

        res.json(response);
    } catch (error: any) {
        console.error('Image edit error:', error);
        res.status(500).json({ error: error.message });
    }
});
