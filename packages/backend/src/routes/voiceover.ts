import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VoiceoverRequest, VoiceoverResponse, TranscriptionRequest, TranscriptionResponse } from 'shared/src/types';
import { generateVoiceover, listVoices, generateVoicePreview } from '../services/tts.service';
import { transcribeAudio, getTranscriptionStatus, preloadTranscriptionModel } from '../services/transcription.service';
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

// Transcription endpoint - generates accurate word-level timestamps from voiceover audio
voiceoverRouter.post('/transcribe', async (req, res) => {
    try {
        const { audioUrl }: TranscriptionRequest = req.body;

        if (!audioUrl) {
            return res.status(400).json({ error: 'Audio URL is required' });
        }

        console.log('[Voiceover] Transcription requested for:', audioUrl);
        
        const result = await transcribeAudio(audioUrl);
        
        const response: TranscriptionResponse = {
            text: result.text,
            words: result.words,
            duration: result.duration
        };
        
        res.json(response);
    } catch (error: any) {
        console.error('Transcription error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get transcription model status
voiceoverRouter.get('/transcription-status', async (req, res) => {
    try {
        const status = getTranscriptionStatus();
        res.json(status);
    } catch (error: any) {
        console.error('Transcription status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Voice preview endpoint - generates a short sample to preview a voice
voiceoverRouter.post('/preview', async (req, res) => {
    try {
        const { voiceService, voiceId, model } = req.body;

        if (!voiceId) {
            return res.status(400).json({ error: 'Voice ID is required' });
        }

        const result = await generateVoicePreview(voiceService, voiceId, model);
        res.json(result);
    } catch (error: any) {
        console.error('Voice preview error:', error);
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
