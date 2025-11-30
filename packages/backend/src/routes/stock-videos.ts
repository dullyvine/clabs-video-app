import express from 'express';
import {
    StockVideoRequest,
    StockVideoResponse,
    StockVideoSearchRequest,
    StockVideoSearchResponse
} from 'shared/src/types';
import { generateStockVideoKeywords } from '../services/llm.service';
import { searchStockVideos } from '../services/stock.service';


export const stockVideosRouter = express.Router();

stockVideosRouter.post('/analyze', async (req, res) => {
    try {
        const { script, niche, provider = 'both' }: StockVideoRequest = req.body;

        if (!script) {
            return res.status(400).json({ error: 'Script is required' });
        }

        // Use analyzeScript to get comprehensive analysis
        const scenesData = await generateStockVideoKeywords(script, niche);

        // Ensure we have valid scenes with keywords
        const validScenes = scenesData.filter((scene: any) => 
            scene.keywords && scene.keywords.length > 0
        );

        if (validScenes.length === 0) {
            console.warn('No valid scenes with keywords found, creating fallback scenes');
            // Fallback: split script into sentences for scenes
            const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 10);
            const fallbackScenes = sentences.slice(0, 5).map((sentence, idx) => ({
                id: `scene-${idx + 1}`,
                sceneDescription: sentence.trim().substring(0, 100),
                keywords: sentence.trim().split(' ')
                    .filter(w => w.length > 4)
                    .slice(0, 3)
                    .map(w => w.toLowerCase())
            }));
            
            const scenes = await Promise.all(
                fallbackScenes.map(async (scene: any) => {
                    const videos = await searchStockVideos(scene.keywords, provider, {
                        query: scene.sceneDescription,
                        perPage: 8,
                        orientation: 'landscape'
                    });
                    return {
                        id: scene.id,
                        sceneDescription: scene.sceneDescription,
                        keywords: scene.keywords,
                        suggestedVideos: videos.map((v: any) => ({
                            id: v.id,
                            url: v.url,
                            thumbnailUrl: v.thumbnailUrl,
                            duration: v.duration,
                            title: v.title,
                            provider: v.provider,
                            previewUrl: v.previewUrl,
                            sourceUrl: v.sourceUrl,
                            resolution: v.resolution
                        }))
                    };
                })
            );
            
            return res.json({ scenes });
        }

        // For each scene, search for stock videos using keywords
        const scenes = await Promise.all(
            validScenes.map(async (scene: any) => {
                const videos = await searchStockVideos(scene.keywords, provider, {
                    query: scene.sceneDescription,
                    perPage: 8,
                    orientation: 'landscape'
                });
                return {
                    id: scene.id,
                    sceneDescription: scene.sceneDescription,
                    keywords: scene.keywords,
                    suggestedVideos: videos.map((v: any) => ({
                        id: v.id,
                        url: v.url,
                        thumbnailUrl: v.thumbnailUrl,
                        duration: v.duration,
                        title: v.title,
                        provider: v.provider,
                        previewUrl: v.previewUrl,
                        sourceUrl: v.sourceUrl,
                        resolution: v.resolution
                    }))
                };
            })
        );

        const response: StockVideoResponse = {
            scenes
        };

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
