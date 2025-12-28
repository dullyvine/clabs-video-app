import express from 'express';
import { 
    ChatRequest, 
    ChatResponse, 
    ScriptGenerationRequest, 
    ScriptGenerationResponse,
    GeminiChatModel,
    SmartChatRequest,
    SmartChatResponse,
    ChatModelsResponse
} from 'shared/src/types';
import { chat, generateScript, refineImagePrompt, smartChat, getAvailableModels } from '../services/llm.service';

export const chatRouter = express.Router();

// List available chat models (dynamically based on configured API keys)
chatRouter.get('/models', (req, res) => {
    const modelsResponse: ChatModelsResponse = getAvailableModels();
    res.json(modelsResponse);
});

// Chat endpoint - for conversational interaction
chatRouter.post('/message', async (req, res) => {
    try {
        const request: ChatRequest = req.body;

        if (!request.messages || request.messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const response: ChatResponse = await chat(request);
        res.json(response);
    } catch (error: any) {
        console.error('[Chat Route] Error:', error);
        res.status(500).json({ error: error.message || 'Chat failed' });
    }
});

// Script generation endpoint - for structured script writing
chatRouter.post('/generate-script', async (req, res) => {
    try {
        const request: ScriptGenerationRequest = req.body;

        if (!request.prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const response: ScriptGenerationResponse = await generateScript(request);
        res.json(response);
    } catch (error: any) {
        console.error('[Chat Route] Script generation error:', error);
        res.status(500).json({ error: error.message || 'Script generation failed' });
    }
});

// Refine image prompt endpoint
chatRouter.post('/refine-prompt', async (req, res) => {
    try {
        const { prompt, scriptContext, niche, model } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const refinedPrompt = await refineImagePrompt(
            prompt,
            scriptContext,
            niche,
            model || 'gemini-2.5-flash'
        );

        res.json({ refinedPrompt });
    } catch (error: any) {
        console.error('[Chat Route] Prompt refinement error:', error);
        res.status(500).json({ error: error.message || 'Prompt refinement failed' });
    }
});

// Smart chat endpoint - intelligent conversation with intent detection
chatRouter.post('/smart-message', async (req, res) => {
    try {
        const request: SmartChatRequest = req.body;

        if (!request.messages || request.messages.length === 0) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        const response: SmartChatResponse = await smartChat(request);
        res.json(response);
    } catch (error: any) {
        console.error('[Chat Route] Smart chat error:', error);
        res.status(500).json({ error: error.message || 'Smart chat failed' });
    }
});




