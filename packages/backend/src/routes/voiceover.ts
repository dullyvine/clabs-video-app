import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VoiceoverRequest, VoiceoverResponse } from 'shared/src/types';
import { generateVoiceover, listVoices } from '../services/tts.service';
import { createJob, updateJob } from '../utils/jobs';
import { trackFile } from '../services/file.service';

export const voiceoverRouter = express.Router();

voiceoverRouter.post('/generate', async (req, res) => {
    try {
        const { script, voiceService, voiceId, model }: VoiceoverRequest = req.body;

        if (!script) {
            return res.status(400).json({ error: 'Script is required' });
        }

        const result = await generateVoiceover(script, voiceService, voiceId, model);
        res.json(result);
    } catch (error: any) {
        console.error('Voiceover generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

voiceoverRouter.get('/voices', async (req, res) => {
    try {
        const service = req.query.service as any || 'gen-ai-pro';
        const filters = {
            language: req.query.language as string,
            gender: req.query.gender as string,
            age: req.query.age as string
        };
        const voices = await listVoices(service, filters);
        res.json({ voices });
    } catch (error: any) {
        console.error('Error fetching voices:', error);
        res.status(500).json({ error: error.message });
    }
});
