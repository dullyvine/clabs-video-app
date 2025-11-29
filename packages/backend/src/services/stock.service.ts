/**
 * Mock stock video service
 * In production, this would call real APIs (Pixels, Pexels, Storyblocks, etc.)
 */

interface StockVideo {
    id: string;
    url: string;
    thumbnailUrl: string;
    duration: number;
    title: string;
}

import { StockVideoProvider } from 'shared/src/types';

export async function searchStockVideos(keywords: string[], provider: StockVideoProvider = 'both'): Promise<StockVideo[]> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const mockVideos: StockVideo[] = [];

    // Generate mock videos for each keyword
    for (let i = 0; i < Math.min(keywords.length * 3, 10); i++) {
        const keyword = keywords[i % keywords.length];
        mockVideos.push({
            id: `video-${Date.now()}-${i}`,
            url: `https://example.com/videos/${keyword}-${i}.mp4`,
            thumbnailUrl: `https://example.com/thumbs/${keyword}-${i}.jpg`,
            duration: 10 + Math.floor(Math.random() * 20), // Random duration 10-30s
            title: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} Stock Video ${i + 1}`
        });
    }

    console.log(`Found ${mockVideos.length} mock stock videos for keywords: ${keywords.join(', ')}`);

    return mockVideos;
}
