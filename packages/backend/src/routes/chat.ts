import express from 'express';
import { 
    ChatRequest, 
    ChatResponse, 
    ScriptGenerationRequest, 
    ScriptGenerationResponse,
    GeminiChatModel
} from 'shared/src/types';
import { chat, generateScript, refineImagePrompt } from '../services/llm.service';

export const chatRouter = express.Router();

// Available Gemini models for chat/script writing
const AVAILABLE_MODELS: Array<{ id: GeminiChatModel; name: string; description: string }> = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast and efficient for most tasks' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Best quality for complex writing' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Lightweight and fast' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'High quality, longer context' }
];

// List available chat models
chatRouter.get('/models', (req, res) => {
    res.json({ models: AVAILABLE_MODELS });
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



