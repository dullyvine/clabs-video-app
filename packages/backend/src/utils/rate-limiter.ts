/**
 * Rate Limiter for Gemini TTS API
 * 
 * Implements a sliding window rate limiter that tracks:
 * - Requests per minute (RPM)
 * - Tokens per minute (TPM)
 * 
 * Based on Google's Gemini API rate limits for Paid Tier 1:
 * - gemini-2.5-flash-preview-tts: 10 RPM, 10,000 TPM
 * - gemini-2.5-pro-preview-tts: 10 RPM, 10,000 TPM
 */

interface RateLimitConfig {
    requestsPerMinute: number;
    tokensPerMinute: number;
    name?: string;
}

interface RequestRecord {
    timestamp: number;
    tokens: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    requestsPerMinute: 10,
    tokensPerMinute: 10000,
    name: 'gemini-tts'
};

// Estimate tokens from character count (1 token ≈ 4 characters)
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export class GeminiRateLimiter {
    private config: RateLimitConfig;
    private requestHistory: RequestRecord[] = [];
    private readonly WINDOW_MS = 60000; // 1 minute sliding window

    constructor(config: Partial<RateLimitConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Clean up old requests outside the sliding window
     */
    private cleanOldRequests(): void {
        const cutoff = Date.now() - this.WINDOW_MS;
        this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
    }

    /**
     * Get current usage within the sliding window
     */
    public getCurrentUsage(): { requests: number; tokens: number } {
        this.cleanOldRequests();
        return {
            requests: this.requestHistory.length,
            tokens: this.requestHistory.reduce((sum, r) => sum + r.tokens, 0)
        };
    }

    /**
     * Check if a request with the given token count can be made now
     */
    public canMakeRequest(tokenCount: number): boolean {
        const usage = this.getCurrentUsage();
        return (
            usage.requests < this.config.requestsPerMinute &&
            usage.tokens + tokenCount <= this.config.tokensPerMinute
        );
    }

    /**
     * Calculate how long to wait before the next request can be made
     * Returns 0 if request can be made immediately
     */
    public getWaitTime(tokenCount: number): number {
        this.cleanOldRequests();
        
        if (this.canMakeRequest(tokenCount)) {
            return 0;
        }

        // Find the oldest request that's blocking us
        if (this.requestHistory.length === 0) {
            return 0;
        }

        // Calculate when the oldest request will expire from the window
        const oldestRequest = this.requestHistory[0];
        const expiresAt = oldestRequest.timestamp + this.WINDOW_MS;
        const waitTime = expiresAt - Date.now();

        // Add a small buffer to ensure we're past the rate limit window
        return Math.max(0, waitTime + 100);
    }

    /**
     * Record a successful request
     */
    public recordRequest(tokenCount: number): void {
        this.requestHistory.push({
            timestamp: Date.now(),
            tokens: tokenCount
        });
    }

    /**
     * Wait until a request can be made, then record it
     * This is the main method to use for rate-limited requests
     */
    public async waitAndRecord(tokenCount: number): Promise<void> {
        const waitTime = this.getWaitTime(tokenCount);
        
        if (waitTime > 0) {
            const usage = this.getCurrentUsage();
            console.log(`[RateLimiter] Rate limit approaching (${usage.requests}/${this.config.requestsPerMinute} RPM, ${usage.tokens}/${this.config.tokensPerMinute} TPM)`);
            console.log(`[RateLimiter] Waiting ${(waitTime / 1000).toFixed(1)}s for rate limit window to reset...`);
            await this.sleep(waitTime);
        }

        this.recordRequest(tokenCount);
    }

    /**
     * Get optimal batch size based on current limits
     * Returns how many requests can be made in parallel safely
     */
    public getOptimalBatchSize(): number {
        const usage = this.getCurrentUsage();
        return Math.max(1, this.config.requestsPerMinute - usage.requests);
    }

    /**
     * Calculate estimated time to process N chunks of given average token size
     */
    public estimateProcessingTime(chunkCount: number, avgTokensPerChunk: number): number {
        // How many batches needed?
        const requestsPerMinute = this.config.requestsPerMinute;
        const tokensPerMinute = this.config.tokensPerMinute;
        
        // Constrained by RPM
        const batchesByRPM = Math.ceil(chunkCount / requestsPerMinute);
        
        // Constrained by TPM
        const totalTokens = chunkCount * avgTokensPerChunk;
        const batchesByTPM = Math.ceil(totalTokens / tokensPerMinute);
        
        // Take the more restrictive constraint
        const batches = Math.max(batchesByRPM, batchesByTPM);
        
        // Each batch after the first requires waiting ~60s
        return (batches - 1) * 60;
    }

    /**
     * Reset the rate limiter (useful for testing)
     */
    public reset(): void {
        this.requestHistory = [];
    }

    /**
     * Get rate limit configuration
     */
    public getConfig(): RateLimitConfig {
        return { ...this.config };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance for the Gemini TTS rate limiter
let geminiTTSRateLimiter: GeminiRateLimiter | null = null;

export function getGeminiTTSRateLimiter(): GeminiRateLimiter {
    if (!geminiTTSRateLimiter) {
        geminiTTSRateLimiter = new GeminiRateLimiter({
            requestsPerMinute: 10,
            tokensPerMinute: 10000,
            name: 'gemini-2.5-flash-tts'
        });
    }
    return geminiTTSRateLimiter;
}

/**
 * Calculate optimal chunk size and processing strategy
 * 
 * Chunk size: 3212 characters (optimal for Gemini TTS)
 * - 3212 chars ≈ 803 tokens (1 token ≈ 4 chars)
 * - Allows ~12 chunks before hitting 10,000 TPM limit
 * - But RPM limit (10/min) is usually the bottleneck
 * 
 * Rate limits for Paid Tier 1:
 * - 10 RPM (requests per minute)
 * - 10,000 TPM (tokens per minute)
 */
export function calculateOptimalStrategy(totalChars: number): {
    chunkSize: number;
    estimatedChunks: number;
    estimatedTimeSeconds: number;
    strategy: 'single' | 'chunked';
} {
    const RPM = 10;
    const TPM = 10000;
    const CHUNK_SIZE = 3212; // Optimal chunk size as requested
    
    // If small enough for single request (under chunk size)
    if (totalChars <= CHUNK_SIZE) {
        return {
            chunkSize: totalChars,
            estimatedChunks: 1,
            estimatedTimeSeconds: 3,
            strategy: 'single'
        };
    }
    
    // For larger scripts, use 3212 char chunks
    // 3212 chars ≈ 803 tokens
    // With 10 RPM limit, we can do 10 chunks per minute
    // With 10,000 TPM limit, we can do ~12 chunks per minute
    // So RPM is the limiting factor
    
    const estimatedChunks = Math.ceil(totalChars / CHUNK_SIZE);
    
    // Time calculation:
    // - Process in batches of 10 (RPM limit)
    // - First batch: ~5s (parallel API calls)
    // - Subsequent batches: 60s wait + 5s processing
    const fullBatches = Math.ceil(estimatedChunks / RPM);
    const processingTimePerBatch = 5; // ~5s for API calls + concatenation
    const waitTimeBetweenBatches = 60; // Wait for rate limit window
    
    // First batch has no wait, subsequent batches wait 60s each
    const totalWaitTime = Math.max(0, fullBatches - 1) * waitTimeBetweenBatches;
    const totalProcessingTime = fullBatches * processingTimePerBatch;
    
    const estimatedTimeSeconds = totalWaitTime + totalProcessingTime;
    
    return {
        chunkSize: CHUNK_SIZE,
        estimatedChunks,
        estimatedTimeSeconds,
        strategy: 'chunked'
    };
}
