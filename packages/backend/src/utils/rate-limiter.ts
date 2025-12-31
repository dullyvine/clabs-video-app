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
 */
export function calculateOptimalStrategy(totalChars: number): {
    chunkSize: number;
    estimatedChunks: number;
    estimatedTimeSeconds: number;
    strategy: 'single' | 'chunked';
} {
    const RPM = 10;
    const TPM = 10000;
    
    // If small enough for single request
    if (totalChars <= 4000) {
        return {
            chunkSize: totalChars,
            estimatedChunks: 1,
            estimatedTimeSeconds: 3,
            strategy: 'single'
        };
    }
    
    // For larger scripts, optimize chunk size
    // Target: maximize throughput while staying under limits
    // 
    // Constraints:
    // 1. Max 10 requests per minute
    // 2. Max 10,000 tokens (≈40,000 chars) per minute
    //
    // Optimal: 4,000 chars per chunk = 1,000 tokens
    // This allows 10 chunks/min (limited by RPM, not TPM)
    
    const optimalChunkSize = 4000;
    const estimatedChunks = Math.ceil(totalChars / optimalChunkSize);
    
    // Time calculation:
    // - First 10 chunks: processed in parallel (~5s)
    // - Every additional 10 chunks: +60s wait
    const fullMinutes = Math.floor(estimatedChunks / RPM);
    const remainingChunks = estimatedChunks % RPM;
    
    // First batch is "free" (no wait), subsequent batches need 60s wait each
    const waitMinutes = Math.max(0, fullMinutes - 1) + (fullMinutes > 0 && remainingChunks > 0 ? 1 : 0);
    const processingTime = 5; // ~5s for API calls + concatenation per batch
    
    const estimatedTimeSeconds = (waitMinutes * 60) + (fullMinutes + (remainingChunks > 0 ? 1 : 0)) * processingTime;
    
    return {
        chunkSize: optimalChunkSize,
        estimatedChunks,
        estimatedTimeSeconds,
        strategy: 'chunked'
    };
}
