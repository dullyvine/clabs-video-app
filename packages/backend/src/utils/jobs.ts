import { JobStatus } from 'shared/src/types';
import * as db from '../services/db.service';

// In-memory job storage (fallback for non-authenticated users)
const jobs = new Map<string, JobStatus & { userId?: string; createdAt?: number }>();

interface CreateJobOptions {
    userId?: string;
    projectId?: string;
    jobType?: string;
}

/**
 * Create a job - persists to DB if userId provided
 */
export async function createJobAsync(jobId: string, options?: CreateJobOptions): Promise<JobStatus> {
    const job: JobStatus & { userId?: string; createdAt?: number } = {
        jobId,
        status: 'queued',
        progress: 0,
        userId: options?.userId,
        createdAt: Date.now()
    };
    jobs.set(jobId, job);

    // If user is authenticated, also persist to database
    if (options?.userId) {
        try {
            await db.createDBJob(
                jobId,
                options.userId,
                options.projectId,
                options.jobType || 'video_generation'
            );
        } catch (error) {
            console.warn('[Jobs] Failed to persist job to DB:', error);
            // Continue - job still tracked in memory
        }
    }

    return job;
}

/**
 * Sync version for backward compatibility
 */
export function createJob(jobId: string): JobStatus {
    const job: JobStatus = {
        jobId,
        status: 'queued',
        progress: 0,
    };
    jobs.set(jobId, { ...job, createdAt: Date.now() });
    return job;
}

/**
 * Update job - syncs to DB if it was created with userId
 */
export async function updateJobAsync(jobId: string, updates: Partial<JobStatus>): Promise<JobStatus | undefined> {
    const job = jobs.get(jobId);
    if (!job) return undefined;

    Object.assign(job, updates);
    jobs.set(jobId, job);

    // If user-associated job, also update in database
    if (job.userId) {
        try {
            await db.updateDBJob(jobId, updates);
        } catch (error) {
            console.warn('[Jobs] Failed to update job in DB:', error);
        }
    }

    return job;
}

/**
 * Sync version for backward compatibility
 */
export function updateJob(jobId: string, updates: Partial<JobStatus>): JobStatus | undefined {
    const job = jobs.get(jobId);
    if (!job) return undefined;

    Object.assign(job, updates);
    jobs.set(jobId, job);
    
    // Fire and forget DB update if user-associated
    if (job.userId) {
        db.updateDBJob(jobId, updates).catch(err => 
            console.warn('[Jobs] Failed to update job in DB:', err)
        );
    }
    
    return job;
}

/**
 * Get job - checks memory first, then DB
 */
export async function getJobAsync(jobId: string, userId?: string): Promise<JobStatus | undefined> {
    // Check memory first
    const memoryJob = jobs.get(jobId);
    if (memoryJob) return memoryJob;

    // If userId provided, check database
    if (userId) {
        try {
            const dbJob = await db.getDBJob(jobId, userId);
            if (dbJob) {
                // Convert DB job to JobStatus
                const job: JobStatus = {
                    jobId: dbJob.job_id,
                    status: dbJob.status as JobStatus['status'],
                    progress: dbJob.progress,
                    message: dbJob.message || undefined,
                    result: dbJob.result,
                    error: dbJob.error || undefined
                };
                // Cache in memory
                jobs.set(jobId, { ...job, userId, createdAt: dbJob.created_at.getTime() });
                return job;
            }
        } catch (error) {
            console.warn('[Jobs] Failed to get job from DB:', error);
        }
    }

    return undefined;
}

/**
 * Sync version for backward compatibility
 */
export function getJob(jobId: string): JobStatus | undefined {
    return jobs.get(jobId);
}

export function deleteJob(jobId: string): boolean {
    return jobs.delete(jobId);
}

/**
 * Clear all jobs for a specific user
 */
export async function clearUserJobs(userId: string): Promise<number> {
    let count = 0;
    
    // Clear from memory
    for (const [jobId, job] of jobs.entries()) {
        if (job.userId === userId) {
            jobs.delete(jobId);
            count++;
        }
    }

    // Clear from database
    try {
        const deleted = await db.deleteUserJobs(userId);
        console.log(`[Jobs] Cleared ${deleted.length} jobs from DB for user ${userId}`);
    } catch (error) {
        console.warn('[Jobs] Failed to clear user jobs from DB:', error);
    }

    return count;
}

/**
 * Clear all jobs from memory (non-user jobs only for backward compat)
 * Returns the number of jobs cleared
 */
export function clearAllJobs(): number {
    const count = jobs.size;
    jobs.clear();
    console.log(`[Jobs] Cleared ${count} jobs from memory`);
    return count;
}

/**
 * Get all jobs for a user
 */
export async function getUserJobs(userId: string): Promise<JobStatus[]> {
    try {
        const dbJobs = await db.getUserDBJobs(userId);
        return dbJobs.map(dbJob => ({
            jobId: dbJob.job_id,
            status: dbJob.status as JobStatus['status'],
            progress: dbJob.progress,
            message: dbJob.message || undefined,
            result: dbJob.result,
            error: dbJob.error || undefined
        }));
    } catch (error) {
        console.warn('[Jobs] Failed to get user jobs from DB:', error);
        return [];
    }
}

/**
 * Get all jobs as an array (from memory)
 */
export function getAllJobs(): JobStatus[] {
    return Array.from(jobs.values());
}

// Cleanup old jobs (older than 1 hour) - only non-user jobs
setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [jobId, job] of jobs.entries()) {
        // Only cleanup non-user jobs (user jobs are persisted in DB)
        if (!job.userId && job.createdAt && job.createdAt < oneHourAgo) {
            jobs.delete(jobId);
        }
    }
}, 10 * 60 * 1000); // Check every 10 minutes
