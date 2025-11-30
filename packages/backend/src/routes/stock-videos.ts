import express from 'express';
import {
    StockVideoRequest,
    StockVideoResponse,
    StockVideoSearchRequest,
    StockVideoSearchResponse,
    StockVideoOrientationOption,
    StockVideoSlot,
    StockVideoAsset
} from 'shared/src/types';
import { generateStockVideoKeywords } from '../services/llm.service';
import { searchStockVideos } from '../services/stock.service';


export const stockVideosRouter = express.Router();

stockVideosRouter.post('/analyze', async (req, res) => {
    try {
        const {
            script,
            niche,
            provider = 'both',
            videoCount = 10,
            orientation = 'landscape',
            alternativesPerSlot = 5
        }: StockVideoRequest = req.body;

        if (!script) {
            return res.status(400).json({ error: 'Script is required' });
        }

        const normalizedOrientation: StockVideoOrientationOption = orientation || 'landscape';
        const targetVideoCount = Math.max(3, Math.min(30, videoCount));
        const altCount = Math.max(3, Math.min(10, alternativesPerSlot));

        // Generate keywords from script analysis
        const scenesData = await generateStockVideoKeywords(script, niche);

        // Collect all keywords from all scenes
        const allKeywords: string[] = [];
        scenesData.forEach((scene: any) => {
            if (scene.keywords && Array.isArray(scene.keywords)) {
                allKeywords.push(...scene.keywords);
            }
        });

        // If no keywords, fallback to script words
        if (allKeywords.length === 0) {
            const words = script.split(/\s+/).filter(w => w.length > 4).slice(0, 30);
            allKeywords.push(...words.map(w => w.toLowerCase()));
        }

        // Distribute keywords across video slots
        const keywordsPerSlot = Math.max(2, Math.ceil(allKeywords.length / targetVideoCount));
        
        const slots: StockVideoSlot[] = [];
        
        for (let i = 0; i < targetVideoCount; i++) {
            const startIdx = i * keywordsPerSlot;
            const slotKeywords = allKeywords.slice(startIdx, startIdx + keywordsPerSlot);
            
            // Fallback if no keywords for this slot
            if (slotKeywords.length === 0) {
                slotKeywords.push(...allKeywords.slice(0, 3));
            }

            const query = slotKeywords.slice(0, 3).join(' ');
            
            // Search for videos - get enough for main + alternatives
            const videos = await searchStockVideos(slotKeywords, provider, {
                query,
                perPage: altCount + 1,
                orientation: normalizedOrientation === 'any' ? undefined : normalizedOrientation
            });

            const mappedVideos: StockVideoAsset[] = videos.map((v: any) => ({
                id: v.id,
                url: v.url,
                thumbnailUrl: v.thumbnailUrl,
                duration: v.duration,
                title: v.title,
                provider: v.provider,
                previewUrl: v.previewUrl,
                sourceUrl: v.sourceUrl,
                resolution: v.resolution
            }));

            if (mappedVideos.length > 0) {
                slots.push({
                    id: `slot-${i + 1}`,
                    keywords: slotKeywords,
                    description: query,
                    video: mappedVideos[0],
                    alternatives: mappedVideos.slice(1)
                });
            }
        }

        // If we didn't get enough slots, that's okay - return what we have
        const response: StockVideoResponse = { slots };
        res.json(response);
    } catch (error: any) {
        console.error('Stock video analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

stockVideosRouter.post('/search', async (req, res) => {
    try {
        const {
            keywords = [],
            query,
            provider = 'pexels',
            perPage,
            orientation,
            minDuration,
            maxDuration
        }: StockVideoSearchRequest = req.body || {};

        if ((!query || query.trim().length === 0) && (!keywords || keywords.length === 0)) {
            return res.status(400).json({ error: 'A query or keywords are required' });
        }

        const videos = await searchStockVideos(keywords || [], provider, {
            query: query?.trim(),
            perPage,
            orientation,
            minDuration,
            maxDuration
        });

        const response: StockVideoSearchResponse = {
            videos: videos.map((video) => ({
                id: video.id,
                url: video.url,
                thumbnailUrl: video.thumbnailUrl,
                duration: video.duration,
                title: video.title,
                provider: video.provider,
                previewUrl: video.previewUrl,
                sourceUrl: video.sourceUrl,
                resolution: video.resolution
            }))
        };

        res.json(response);
    } catch (error: any) {
        console.error('Stock video search error:', error);
        res.status(500).json({ error: error.message });
    }
});
