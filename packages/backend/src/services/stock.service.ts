import https from 'https';
import { StockVideoProvider, StockVideoAsset, StockVideoOrientation } from 'shared/src/types';

interface StockVideoSearchOptions {
    query?: string;
    perPage?: number;
    orientation?: StockVideoOrientation;
    minDuration?: number;
    maxDuration?: number;
}

interface PexelsVideoFile {
    id: number;
    link: string;
    width?: number;
    height?: number;
    quality?: string;
    file_type?: string;
}

interface PexelsVideoPicture {
    picture: string;
    nr: number;
}

interface PexelsVideoItem {
    id: number;
    url: string;
    image: string;
    duration: number;
    video_files: PexelsVideoFile[];
    video_pictures?: PexelsVideoPicture[];
    user?: { name?: string };
}

interface PexelsResponse {
    page: number;
    per_page: number;
    total_results: number;
    url: string;
    videos: PexelsVideoItem[];
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const PEXELS_API_BASE = 'https://api.pexels.com';
const DEFAULT_RESULTS_PER_QUERY = 8;

export async function searchStockVideos(
    keywords: string[] = [],
    provider: StockVideoProvider = 'both',
    options: StockVideoSearchOptions = {}
): Promise<StockVideoAsset[]> {
    const searchTerm = (options.query || '').trim();
    const fallbackQuery = keywords.slice(0, 6).join(' ').trim();
    const query = searchTerm || fallbackQuery;

    if (!query) {
        console.warn('[Stock Service] No query or keywords provided, returning empty result');
        return [];
    }

    const providersToQuery: StockVideoProvider[] = provider === 'both' ? ['pexels', 'storyblocks'] : [provider];
    const allResults: StockVideoAsset[] = [];

    for (const currentProvider of providersToQuery) {
        if (currentProvider === 'pexels') {
            const pexelsResults = await searchPexels(query, { ...options, perPage: options.perPage || DEFAULT_RESULTS_PER_QUERY });
            allResults.push(...pexelsResults);
        } else if (currentProvider === 'storyblocks') {
            const storyblocksResults = generateMockVideos(query, keywords, 'storyblocks', options.perPage);
            allResults.push(...storyblocksResults);
        }
    }

    if (allResults.length === 0) {
        console.warn('[Stock Service] No stock videos returned from providers, falling back to mock data');
        return generateMockVideos(query, keywords, provider, options.perPage);
    }

    return dedupeVideos(allResults);
}

async function searchPexels(query: string, options: StockVideoSearchOptions): Promise<StockVideoAsset[]> {
    if (!PEXELS_API_KEY) {
        console.warn('[Stock Service] PEXELS_API_KEY is not set, returning mock videos');
        return generateMockVideos(query, [], 'pexels', options.perPage);
    }

    const perPage = Math.max(1, Math.min(options.perPage || DEFAULT_RESULTS_PER_QUERY, 20));
    const url = new URL(`${PEXELS_API_BASE}/videos/search`);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', '1');

    if (options.orientation) {
        url.searchParams.set('orientation', options.orientation);
    }
    if (options.minDuration) {
        url.searchParams.set('min_duration', String(options.minDuration));
    }
    if (options.maxDuration) {
        url.searchParams.set('max_duration', String(options.maxDuration));
    }

    const response = await httpGetJson<PexelsResponse>(url.toString(), {
        Authorization: PEXELS_API_KEY
    });

    if (!response?.videos?.length) {
        console.warn(`[Stock Service] Pexels returned 0 videos for query: ${query}`);
        return [];
    }

    return response.videos
        .map(mapPexelsVideo)
        .filter(Boolean) as StockVideoAsset[];
}

function mapPexelsVideo(video: PexelsVideoItem): StockVideoAsset | null {
    if (!Array.isArray(video.video_files) || video.video_files.length === 0) {
        return null;
    }

    const sortedFiles = [...video.video_files].sort((a, b) => (b.width || 0) - (a.width || 0));
    const preferredFile = sortedFiles.find(file => (file.width || 0) <= 1920 && file.file_type?.includes('mp4'))
        || sortedFiles.find(file => file.file_type?.includes('mp4'))
        || sortedFiles[0];

    if (!preferredFile?.link) {
        return null;
    }

    const preview = video.video_pictures?.find(pic => pic.nr === 0)?.picture || video.image;
    const titleBase = video.user?.name ? `${video.user.name}` : `Pexels Video ${video.id}`;

    return {
        id: `pexels-${video.id}-${preferredFile.id}`,
        url: preferredFile.link,
        thumbnailUrl: preview,
        previewUrl: preview,
        duration: Math.round(video.duration || 0),
        title: titleBase,
        provider: 'pexels',
        sourceUrl: video.url,
        resolution: preferredFile.width && preferredFile.height
            ? { width: preferredFile.width, height: preferredFile.height }
            : undefined
    };
}

function generateMockVideos(
    query: string,
    keywords: string[],
    provider: StockVideoProvider,
    perPage?: number
): StockVideoAsset[] {
    const normalizedKeywords = keywords.length > 0 ? keywords : query.split(' ').filter(Boolean).slice(0, 6);
    if (normalizedKeywords.length === 0) {
        normalizedKeywords.push('stock-video');
    }
    const results: StockVideoAsset[] = [];
    const total = Math.max(6, Math.min((perPage || DEFAULT_RESULTS_PER_QUERY) * 2, 12));

    for (let i = 0; i < total; i++) {
        const keyword = normalizedKeywords[i % normalizedKeywords.length] || `scene-${i + 1}`;
        results.push({
            id: `${provider}-mock-${Date.now()}-${i}`,
            url: `https://storage.example.com/${provider}/${keyword}-${i}.mp4`,
            thumbnailUrl: `https://storage.example.com/${provider}/thumbs/${keyword}-${i}.jpg`,
            previewUrl: `https://storage.example.com/${provider}/thumbs/${keyword}-${i}.jpg`,
            duration: 8 + ((i * 3) % 12),
            title: `${capitalize(keyword)} (${provider} placeholder)`,
            provider,
            sourceUrl: `https://example.com/${provider}/${keyword}-${i}`
        });
    }

    return results;
}

function dedupeVideos(videos: StockVideoAsset[]): StockVideoAsset[] {
    const seen = new Map<string, StockVideoAsset>();

    videos.forEach(video => {
        const key = video.url || video.id;
        if (!seen.has(key)) {
            seen.set(key, video);
        }
    });

    return Array.from(seen.values());
}

function capitalize(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function httpGetJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    return new Promise((resolve, reject) => {
        const request = https.request(url, { method: 'GET', headers }, (response) => {
            const chunks: Buffer[] = [];

            response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

            response.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf-8');

                if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(body) as T;
                        resolve(parsed);
                    } catch (err: any) {
                        reject(new Error(`Failed to parse JSON response: ${err.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${response.statusCode || 0}: ${body}`));
                }
            });
        });

        request.on('error', (error) => reject(error));
        request.end();
    });
}
