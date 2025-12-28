
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VoiceService, GeminiTTSModel, VoiceoverResponse } from 'shared/src/types';
import { getAudioDuration, concatenateAudioFiles } from './ffmpeg.service';
import { getTempFilePath } from './file.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEN_AI_PRO_API_KEY = process.env.GEN_AI_PRO_API_KEY;
const GEN_AI_PRO_BASE_URL = process.env.GEN_AI_PRO_BASE_URL || 'https://genaipro.vn/api/v1';

const AI33_API_KEY = process.env.AI33_API_KEY;
const AI33_BASE_URL = process.env.AI33_BASE_URL || 'https://api.ai33.pro/v1';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

export async function listVoices(service: VoiceService, filters?: { language?: string; gender?: string; age?: string }) {
    if (service === 'gen-ai-pro') {
        return listGenAiProVoices(filters);
    } else if (service === 'ai33') {
        return listAi33Voices(filters);
    } else if (service === 'gemini') {
        return listGeminiVoices(filters);
    }
    return [];
}

async function listGenAiProVoices(filters?: { language?: string; gender?: string; age?: string }) {
    if (!GEN_AI_PRO_API_KEY) {
        console.warn('GEN_AI_PRO_API_KEY not set');
        return [];
    }

    try {
        // Fetch all voices without filters to ensure proper client-side filtering
        const params = new URLSearchParams({
            page: '1',      // API requires page to start at 1, not 0
            page_size: '100'  // API max is 100
        });

        const url = `${GEN_AI_PRO_BASE_URL}/max/voices?${params.toString()}`;
        console.log('[Gen AI Pro] Fetching voices from:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${GEN_AI_PRO_API_KEY}`
            }
        });

        console.log('[Gen AI Pro] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Gen AI Pro] API Error:', response.status, errorText);
            throw new Error(`Failed to fetch voices: ${response.statusText}`);
        }

        const data = await response.json() as any;
        console.log('[Gen AI Pro] Raw response:', {
            total: data.total,
            voice_list_length: data.voice_list?.length,
            has_more: data.has_more
        });

        let voices = data.voice_list || [];

        // Apply client-side filtering based on tag_list
        if (filters?.language || filters?.gender || filters?.age) {
            const originalCount = voices.length;
            voices = voices.filter((voice: any) => {
                const tags = voice.tag_list || [];
                const tagString = tags.join(' ').toLowerCase();

                // Check language filter
                if (filters.language && !tagString.includes(filters.language.toLowerCase())) {
                    return false;
                }

                // Check gender filter
                if (filters.gender && !tagString.includes(filters.gender.toLowerCase())) {
                    return false;
                }

                // Check age filter
                if (filters.age && !tagString.includes(filters.age.toLowerCase())) {
                    return false;
                }

                return true;
            });
            console.log(`[Gen AI Pro] Filtered ${originalCount} voices to ${voices.length} based on filters:`, filters);
        } else {
            console.log(`[Gen AI Pro] No filters applied, returning all ${voices.length} voices`);
        }

        return voices;
    } catch (error) {
        console.error('[Gen AI Pro] Error listing voices:', error);
        return [];
    }
}

async function listAi33Voices(filters?: { language?: string; gender?: string; age?: string }) {
    if (!AI33_API_KEY) {
        console.warn('AI33_API_KEY not set');
        return [];
    }

    try {
        // Use /v2/voices endpoint as per documentation
        const params = new URLSearchParams({
            page: '1',  // Start at page 1
            page_size: '100'
        });

        const response = await fetch(`${AI33_BASE_URL}/v2/voices?${params.toString()}`, {
            headers: {
                'xi-api-key': AI33_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.statusText}`);
        }

        const data = await response.json() as any;
        let voices = data.voices || [];

        // Apply client-side filtering based on labels and tags
        if (filters?.language || filters?.gender || filters?.age) {
            voices = voices.filter((voice: any) => {
                const labels = voice.labels || {};

                // Check language filter
                // For AI33/ElevenLabs, language info might not be available in labels
                // We'll skip language filtering for now or filter by other means if data is available

                // Check gender filter
                if (filters.gender && labels.gender) {
                    const voiceGender = labels.gender.toLowerCase();
                    const filterGender = filters.gender.toLowerCase();
                    if (voiceGender !== filterGender) {
                        return false;
                    }
                }

                // Check age filter - handle variations inage labels
                if (filters.age && labels.age) {
                    const voiceAge = labels.age.toLowerCase().replace(/[_\s]/g, '');
                    const filterAge = filters.age.toLowerCase().replace(/[_\s]/g, '');

                    // Direct match
                    if (voiceAge === filterAge) {
                        return true;
                    }

                    // Map common variations
                    const ageMap: Record<string, string[]> = {
                        'youth': ['young', 'youth'],
                        'youngadult': ['youngadult'],
                        'adult': ['adult', 'middleaged'],
                        'middleaged': ['middleaged', 'adult'],
                        'senior': ['old', 'senior', 'elderly']
                    };

                    const acceptableAges = ageMap[filterAge] || [filterAge];
                    if (!acceptableAges.some(age => voiceAge.includes(age))) {
                        return false;
                    }
                }

                return true;
            });
        }

        // Map AI33 voice structure to match Gen AI Pro format for consistency
        return voices.map((voice: any) => ({
            voice_id: voice.voice_id,
            voice_name: voice.name,
            tag_list: [
                voice.labels?.gender,
                voice.labels?.age,
                voice.labels?.accent,
                voice.labels?.description
            ].filter(Boolean),
            category: voice.category,
            labels: voice.labels
        }));
    } catch (error) {
        console.error('Error listing ai33 voices:', error);
        return [];
    }
}

export async function generateVoiceover(
    script: string,
    voiceService: VoiceService,
    voiceId?: string,
    model?: GeminiTTSModel
): Promise<VoiceoverResponse> {
    if (voiceService === 'gen-ai-pro') {
        return generateGenAiProVoiceover(script, voiceId);
    } else if (voiceService === 'ai33') {
        return generateAi33Voiceover(script, voiceId);
    } else if (voiceService === 'gemini') {
        return generateGeminiVoiceover(script, voiceId, model);
    }
    throw new Error(`Unsupported voice service: ${voiceService}`);
}


async function generateGenAiProVoiceover(script: string, voiceId?: string): Promise<VoiceoverResponse> {
    if (!GEN_AI_PRO_API_KEY) {
        throw new Error('GEN_AI_PRO_API_KEY is not configured');
    }

    if (!voiceId) {
        throw new Error('Please select a voice from the dropdown before generating voiceover');
    }

    try {
        // Create speech task
        const createResponse = await fetch(`${GEN_AI_PRO_BASE_URL}/max/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GEN_AI_PRO_API_KEY}`
            },
            body: JSON.stringify({
                text: script,
                voice_id: voiceId,
                model_id: 'speech-2.5-hd-preview',
                speed: 1.0,
                pitch: 0,
                volume: 1.0
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Gen AI Pro API error: ${createResponse.status} ${errorText}`);
        }

        const taskData = await createResponse.json() as any;
        const taskId = taskData.id;

        if (!taskId) {
            throw new Error('Failed to get task ID from Gen AI Pro');
        }

        // Poll for completion
        const audioUrl = await pollGenAiProTask(taskId);

        // Download audio file
        return downloadAudio(audioUrl);
    } catch (error: any) {
        console.error('Gen AI Pro generation error:', error);
        throw error;
    }
}

async function generateAi33Voiceover(script: string, voiceId?: string): Promise<VoiceoverResponse> {
    if (!AI33_API_KEY) {
        throw new Error('AI33_API_KEY is not configured');
    }

    if (!voiceId) {
        throw new Error('Please select a voice from the dropdown before generating voiceover');
    }

    try {
        // Create text-to-speech task using AI33 API
        const createResponse = await fetch(
            `${AI33_BASE_URL}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': AI33_API_KEY
                },
                body: JSON.stringify({
                    text: script,
                    model_id: 'eleven_multilingual_v2',
                    with_transcript: false
                })
            }
        );

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`AI33 API error: ${createResponse.status} ${errorText}`);
        }

        const taskData = await createResponse.json() as any;
        const taskId = taskData.task_id;

        if (!taskId) {
            throw new Error('Failed to get task ID from AI33');
        }

        // Poll for completion
        const audioUrl = await pollAi33Task(taskId);

        // Download audio file
        return downloadAudio(audioUrl);
    } catch (error: any) {
        console.error('AI33 generation error:', error);
        throw error;
    }
}

async function pollGenAiProTask(taskId: string): Promise<string> {
    const maxAttempts = 60; // 1 minute timeout
    const interval = 1000; // 1 second

    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(`${GEN_AI_PRO_BASE_URL}/max/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${GEN_AI_PRO_API_KEY}`
            }
        });

        if (!response.ok) continue;

        const data = await response.json() as any;

        if (data.status === 'completed' && data.result) {
            return data.result;
        }

        if (data.status === 'failed') {
            throw new Error(data.error || 'Voice generation failed');
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Voice generation timed out');
}

async function pollAi33Task(taskId: string): Promise<string> {
    const maxAttempts = 60; // 1 minute timeout
    const interval = 1000; // 1 second

    for (let i = 0; i < maxAttempts; i++) {
        const response = await fetch(`${AI33_BASE_URL}/task/${taskId}`, {
            headers: {
                'xi-api-key': AI33_API_KEY!
            }
        });

        if (!response.ok) continue;

        const data = await response.json() as any;

        if (data.status === 'done' && data.metadata?.audio_url) {
            return data.metadata.audio_url;
        }

        if (data.status === 'failed') {
            throw new Error(data.error_message || 'Voice generation failed');
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Voice generation timed out');
}

async function downloadAudio(url: string): Promise<VoiceoverResponse> {
    const filePath = getTempFilePath('mp3');

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download audio file');

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    const duration = await getAudioDuration(filePath);
    return buildVoiceoverResponse(filePath, duration);
}

// === GEMINI TTS IMPLEMENTATION ===

// Voice metadata from official Gemini docs with style descriptions
const GEMINI_VOICES = [
    { id: 'zephyr', label: 'Zephyr', style: 'Bright' },
    { id: 'puck', label: 'Puck', style: 'Upbeat' },
    { id: 'charon', label: 'Charon', style: 'Informative' },
    { id: 'kore', label: 'Kore', style: 'Firm' },
    { id: 'fenrir', label: 'Fenrir', style: 'Excitable' },
    { id: 'leda', label: 'Leda', style: 'Youthful' },
    { id: 'orus', label: 'Orus', style: 'Firm' },
    { id: 'aoede', label: 'Aoede', style: 'Breezy' },
    { id: 'callirrhoe', label: 'Callirrhoe', style: 'Easy-going' },
    { id: 'autonoe', label: 'Autonoe', style: 'Bright' },
    { id: 'enceladus', label: 'Enceladus', style: 'Breathy' },
    { id: 'iapetus', label: 'Iapetus', style: 'Clear' },
    { id: 'umbriel', label: 'Umbriel', style: 'Easy-going' },
    { id: 'algieba', label: 'Algieba', style: 'Smooth' },
    { id: 'despina', label: 'Despina', style: 'Smooth' },
    { id: 'erinome', label: 'Erinome', style: 'Clear' },
    { id: 'algenib', label: 'Algenib', style: 'Gravelly' },
    { id: 'rasalgethi', label: 'Rasalgethi', style: 'Informative' },
    { id: 'laomedeia', label: 'Laomedeia', style: 'Upbeat' },
    { id: 'achernar', label: 'Achernar', style: 'Soft' },
    { id: 'alnilam', label: 'Alnilam', style: 'Firm' },
    { id: 'schedar', label: 'Schedar', style: 'Even' },
    { id: 'gacrux', label: 'Gacrux', style: 'Mature' },
    { id: 'pulcherrima', label: 'Pulcherrima', style: 'Forward' },
    { id: 'achird', label: 'Achird', style: 'Friendly' },
    { id: 'zubenelgenubi', label: 'Zubenelgenubi', style: 'Casual' },
    { id: 'vindemiatrix', label: 'Vindemiatrix', style: 'Gentle' },
    { id: 'sadachbia', label: 'Sadachbia', style: 'Lively' },
    { id: 'sadaltager', label: 'Sadaltager', style: 'Knowledgeable' },
    { id: 'sulafat', label: 'Sulafat', style: 'Warm' }
];
const GEMINI_DEFAULT_VOICE = 'kore';

// Short sample text for voice preview - varies by style
const PREVIEW_TEXTS: Record<string, string> = {
    'default': 'Hello! This is a preview of my voice. I hope you like how I sound!',
    'Bright': 'Hey there! Welcome! This is my voice, and I am so excited to share it with you!',
    'Upbeat': 'Hi! Ready to make something awesome? Let me show you what I can do!',
    'Informative': 'Good day. Allow me to demonstrate my voice capabilities for your project.',
    'Firm': 'Welcome. This is my voice. Clear, confident, and ready for your content.',
    'Excitable': 'Oh wow! Hi there! This is going to be amazing! Listen to my voice!',
    'Youthful': 'Hey! Super excited to be here! Check out how I sound!',
    'Breezy': 'Hey, just wanted to say hi. This is how I sound. Pretty chill, right?',
    'Easy-going': 'Hey there. Just giving you a quick sample of my voice. Nice and relaxed.',
    'Breathy': 'Hi there... this is my voice... soft and expressive, just for you.',
    'Clear': 'Hello and welcome. My voice is designed for clarity and understanding.',
    'Smooth': 'Hello there. Listen to the smooth, flowing quality of my voice.',
    'Gravelly': 'Hey. This is my voice. Got that distinctive texture you might be looking for.',
    'Soft': 'Hello... this is a gentle preview of my voice for you to hear.',
    'Even': 'Hello. This is my voice. Balanced and steady throughout.',
    'Mature': 'Good day. This voice carries experience and depth in every word.',
    'Forward': 'Hello! Let me get right to it - this is my voice, direct and clear!',
    'Friendly': 'Hi there! So nice to meet you! This is what I sound like.',
    'Casual': 'Hey, what\'s up? Just giving you a quick listen to my voice.',
    'Gentle': 'Hello, dear listener. Here is a soft sample of my voice for you.',
    'Lively': 'Hey hey! Excited to show you my voice! Let\'s make something great!',
    'Knowledgeable': 'Greetings. I present to you a demonstration of my vocal qualities.',
    'Warm': 'Hello there. Welcome. Let me share the warmth of my voice with you.'
};

async function listGeminiVoices(filters?: { language?: string; gender?: string; age?: string }) {
    if (!GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY not set');
        return [];
    }

    // Gemini TTS has 30 pre-built voices with style descriptions
    // The API supports 24 languages and auto-detects input language
    return GEMINI_VOICES.map((voice) => ({
        voice_id: voice.id,
        voice_name: voice.label,
        tag_list: [voice.style, 'Multi-language'],
        style: voice.style,
        category: 'gemini-tts'
    }));
}

/**
 * Generate a short voice preview sample (5-10 seconds)
 */
export async function generateVoicePreview(
    voiceService: VoiceService,
    voiceId: string,
    model?: GeminiTTSModel
): Promise<VoiceoverResponse> {
    if (voiceService === 'gemini') {
        // Find voice style for appropriate preview text
        const voice = GEMINI_VOICES.find(v => v.id === voiceId.toLowerCase());
        const style = voice?.style || 'default';
        const previewText = PREVIEW_TEXTS[style] || PREVIEW_TEXTS['default'];
        
        return generateGeminiVoiceover(previewText, voiceId, model || 'gemini-2.5-flash-preview-tts');
    } else if (voiceService === 'gen-ai-pro') {
        const previewText = 'Hello! This is a preview of my voice. I hope you like how I sound!';
        return generateGenAiProVoiceover(previewText, voiceId);
    } else if (voiceService === 'ai33') {
        const previewText = 'Hello! This is a preview of my voice. I hope you like how I sound!';
        return generateAi33Voiceover(previewText, voiceId);
    }
    throw new Error(`Unsupported voice service: ${voiceService}`);
}

/**
 * Estimate character count for text
 * Gemini TTS has a hard limit of ~900 bytes per request
 * To avoid distortion on longer audio, we chunk aggressively
 */
function estimateCharCount(text: string): number {
    return text.length;
}

/**
 * Smart chunking: Split script into chunks at sentence boundaries
 * respecting character limits
 * 
 * Gemini TTS works best with shorter text chunks (~800-1000 chars)
 * Longer inputs cause audio distortion, especially towards the end
 * At ~150 words/min speaking rate, 800 chars ≈ 1-1.5 min of audio
 */
function chunkScriptBySentences(script: string, maxCharsPerChunk: number = 800): string[] {
    const chunks: string[] = [];

    // Split into sentences (naive approach: split on . ! ?)
    // In production, use a proper sentence tokenizer
    const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];

    let currentChunk = '';
    let currentChars = 0;

    for (const sentence of sentences) {
        const sentenceChars = estimateCharCount(sentence);

        // If single sentence exceeds limit, we have to include it anyway
        if (sentenceChars > maxCharsPerChunk) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
                currentChars = 0;
            }
            chunks.push(sentence.trim());
            continue;
        }

        // If adding this sentence would exceed limit, start new chunk
        if (currentChars + sentenceChars > maxCharsPerChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
            currentChars = sentenceChars;
        } else {
            currentChunk += sentence;
            currentChars += sentenceChars;
        }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Generate voiceover using Gemini TTS with smart chunking
 */
async function generateGeminiVoiceover(
    script: string,
    voiceId?: string,
    model?: GeminiTTSModel
): Promise<VoiceoverResponse> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    let normalizedVoice = voiceId?.toLowerCase().trim() || GEMINI_DEFAULT_VOICE;
    if (!GEMINI_VOICES.some(v => v.id === normalizedVoice)) {
        normalizedVoice = GEMINI_DEFAULT_VOICE;
    }

    const voiceName = normalizedVoice;
    const voiceLabel = GEMINI_VOICES.find(v => v.id === voiceName)?.label || voiceName;
    const ttsModel = model || 'gemini-2.5-flash-preview-tts';

    console.log(`[Gemini TTS] Generating voiceover with model: ${ttsModel}, voice: ${voiceLabel}`);

    // Estimate script characters
    const totalChars = estimateCharCount(script);
    console.log(`[Gemini TTS] Script length: ${totalChars} characters`);

    // Gemini TTS works best with shorter text to avoid audio distortion
    // At ~150 words/min, 800 chars ≈ 1-1.5 min of audio per chunk
    // This ensures clean audio without distortion on longer voiceovers
    const MAX_CHARS_PER_CHUNK = 1000;

    let audioChunks: string[] = [];
    let wasChunked = false;

    if (totalChars > MAX_CHARS_PER_CHUNK) {
        // Need to chunk the script
        wasChunked = true;
        const scriptChunks = chunkScriptBySentences(script, MAX_CHARS_PER_CHUNK);
        console.log(`[Gemini TTS] Script chunked into ${scriptChunks.length} parts for better audio quality`);

        // Generate audio for all chunks in parallel (with concurrency limit to avoid rate limiting)
        const CONCURRENCY_LIMIT = 10; // Process 10 chunks at a time for maximum speed
        const startTime = Date.now();
        
        console.log(`[Gemini TTS] Generating ${scriptChunks.length} chunks in parallel (concurrency: ${CONCURRENCY_LIMIT})`);
        
        // Create array to hold results in order
        const results: (string | null)[] = new Array(scriptChunks.length).fill(null);
        
        // Process chunks in batches
        for (let batchStart = 0; batchStart < scriptChunks.length; batchStart += CONCURRENCY_LIMIT) {
            const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, scriptChunks.length);
            const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);
            
            console.log(`[Gemini TTS] Processing batch: chunks ${batchStart + 1}-${batchEnd} of ${scriptChunks.length}`);
            
            // Generate this batch in parallel
            const batchPromises = batchIndices.map(async (index) => {
                console.log(`[Gemini TTS] Starting chunk ${index + 1}/${scriptChunks.length} (${scriptChunks[index].length} chars)`);
                const audioPath = await generateSingleGeminiAudio(scriptChunks[index], voiceName, ttsModel);
                console.log(`[Gemini TTS] Completed chunk ${index + 1}/${scriptChunks.length}`);
                return { index, audioPath };
            });
            
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            
            // Store results in order
            for (const { index, audioPath } of batchResults) {
                results[index] = audioPath;
            }
        }
        
        // Filter out any nulls (shouldn't happen, but safety check)
        audioChunks = results.filter((path): path is string => path !== null);
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Gemini TTS] All ${audioChunks.length} chunks generated in ${elapsedTime}s`);

        // Concatenate all chunks
        console.log(`[Gemini TTS] Concatenating ${audioChunks.length} audio chunks`);
        const concatenatedPath = await concatenateAudioFiles(audioChunks);

        // Calculate total duration
        const duration = await getAudioDuration(concatenatedPath);

        // Clean up individual chunk files
        for (const chunkFile of audioChunks) {
            try {
                fs.unlinkSync(chunkFile);
            } catch (e) {
                console.warn('[Gemini TTS] Failed to delete chunk file:', e);
            }
        }

        return buildVoiceoverResponse(concatenatedPath, duration, {
            chunked: true,
            chunkCount: scriptChunks.length
        });
    } else {
        // No chunking needed
        console.log(`[Gemini TTS] No chunking needed, generating single audio`);
        const filePath = await generateSingleGeminiAudio(script, voiceName, ttsModel);
        const duration = await getAudioDuration(filePath);

        return buildVoiceoverResponse(filePath, duration, {
            chunked: false,
            chunkCount: 1
        });
    }
}

/**
 * Generate a single Gemini TTS audio file (no chunking) with retry logic
 */
async function generateSingleGeminiAudio(
    text: string,
    voiceName: string,
    model: string,
    maxRetries: number = 3
): Promise<string> {
    if (!genAI) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const generativeModel = genAI.getGenerativeModel({
                model: model
            });

            const result = await generativeModel.generateContent({
                contents: [{ role: 'user', parts: [{ text }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceName
                            }
                        }
                    }
                } as any
            });

            const response = result.response;

            // Extract audio data from response
            // The audio is in the inline_data field
            const candidates = (response as any).candidates;
            if (!candidates || candidates.length === 0) {
                throw new Error('No audio generated in response');
            }

            const parts = candidates[0].content.parts;
            if (!parts || parts.length === 0) {
                throw new Error('No parts in response');
            }

            const audioPart = parts.find((part: any) => part.inlineData);
            if (!audioPart || !audioPart.inlineData) {
                throw new Error('No inline audio data in response');
            }

            const inlineAudio = audioPart.inlineData;
            const audioInfo = parseGeminiAudioInlineData(inlineAudio.mimeType);
            const audioData = inlineAudio.data;

            if (!audioData) {
                throw new Error('Gemini response did not include inline audio payload');
            }

            // The audio is base64 encoded, decode it
            let audioBuffer: Buffer = Buffer.from(audioData, 'base64');

            // Gemini currently returns raw PCM data, so we wrap it in a WAV container
            if (audioInfo.isRawPcm) {
                audioBuffer = wrapPcmInWav(audioBuffer, audioInfo);
            }

            const filePath = getTempFilePath(audioInfo.extension || 'wav');
            const fileName = path.basename(filePath);
            fs.writeFileSync(filePath, audioBuffer);

            console.log(`[Gemini TTS] Audio saved to ${fileName}`);
            return filePath;

        } catch (error: any) {
            lastError = error;
            const isRetryable = error.status === 500 || error.status === 503 || error.status === 429;
            
            if (isRetryable && attempt < maxRetries) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // Exponential backoff: 1s, 2s, 4s, max 8s
                console.warn(`[Gemini TTS] Attempt ${attempt}/${maxRetries} failed with ${error.status}, retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                console.error(`[Gemini TTS] Generation error (attempt ${attempt}/${maxRetries}):`, error);
                throw error;
            }
        }
    }
    
    throw lastError || new Error('Failed to generate audio after retries');
}

/**
 * Parse Gemini inline audio metadata so we can save it with the right container
 */
function parseGeminiAudioInlineData(mimeType?: string) {
    const defaultInfo = {
        extension: 'wav',
        sampleRate: 24000,
        channels: 1,
        bitDepth: 16,
        isRawPcm: true
    };

    if (!mimeType) {
        return defaultInfo;
    }

    const [typePart, ...paramParts] = mimeType.split(';').map(part => part.trim()).filter(Boolean);
    const normalizedType = typePart.toLowerCase();
    const params: Record<string, string> = {};
    for (const part of paramParts) {
        const [key, value] = part.split('=').map(item => item.trim());
        if (key && value) {
            params[key.toLowerCase()] = value;
        }
    }

    const parseNumber = (input?: string) => {
        if (!input) return undefined;
        const normalized = input.toLowerCase().replace(/[^0-9.]/g, '');
        const parsed = parseInt(normalized, 10);
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    const info = {
        extension: 'wav',
        sampleRate: parseNumber(params.rate) ?? defaultInfo.sampleRate,
        channels: parseNumber(params.channels) ?? defaultInfo.channels,
        bitDepth: parseNumber(params.bits || params.bitdepth) ?? defaultInfo.bitDepth,
        isRawPcm: defaultInfo.isRawPcm
    };

    if (normalizedType.includes('mp3') || normalizedType.includes('mpeg')) {
        info.extension = 'mp3';
        info.isRawPcm = false;
    } else if (normalizedType.includes('ogg')) {
        info.extension = 'ogg';
        info.isRawPcm = false;
    } else if (normalizedType.includes('wav') || normalizedType.includes('wave')) {
        info.extension = 'wav';
        info.isRawPcm = false;
    } else if (normalizedType.includes('flac')) {
        info.extension = 'flac';
        info.isRawPcm = false;
    } else if (normalizedType.includes('aac')) {
        info.extension = 'aac';
        info.isRawPcm = false;
    } else if (normalizedType.includes('pcm') || normalizedType.includes('raw') || normalizedType.includes('l16')) {
        info.extension = 'wav';
        info.isRawPcm = true;
    }

    return info;
}

/**
 * Wrap raw PCM audio returned by Gemini in a WAV container so FFmpeg can read it
 */
function wrapPcmInWav(
    pcmBuffer: Buffer,
    info: { sampleRate?: number; channels?: number; bitDepth?: number }
): Buffer {
    const sampleRate = info.sampleRate ?? 24000;
    const channels = info.channels ?? 1;
    const bitDepth = info.bitDepth ?? 16;
    const bytesPerSample = bitDepth / 8;

    if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) {
        throw new Error(`Unsupported PCM bit depth: ${bitDepth}`);
    }

    const blockAlign = channels * bytesPerSample;
    if (blockAlign <= 0) {
        throw new Error(`Invalid PCM channel configuration: ${channels} channels`);
    }

    // Ensure buffer length aligns to whole samples to avoid FFmpeg warnings
    const remainder = pcmBuffer.length % blockAlign;
    const dataBuffer = remainder === 0 ? pcmBuffer : pcmBuffer.slice(0, pcmBuffer.length - remainder);
    const dataSize = dataBuffer.length;
    const byteRate = sampleRate * blockAlign;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1 size for PCM
    header.writeUInt16LE(1, 20); // Audio format (PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, dataBuffer]);
}

function buildVoiceoverResponse(
    filePath: string,
    duration: number,
    overrides?: Partial<VoiceoverResponse>
): VoiceoverResponse {
    const fileName = path.basename(filePath);

    return {
        audioUrl: `/temp/${fileName}`,
        duration,
        jobId: overrides?.jobId || uuidv4(),
        chunked: overrides?.chunked ?? false,
        chunkCount: overrides?.chunkCount ?? 1
    };
}

