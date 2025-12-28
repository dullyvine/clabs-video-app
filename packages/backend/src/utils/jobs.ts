import { JobStatus } from 'shared/src/types';

// In-memory job storage
const jobs = new Map<string, JobStatus>();

export function createJob(jobId: string): JobStatus {
    const job: JobStatus = {
        jobId,
        status: 'queued',
        progress: 0,
    };
    jobs.set(jobId, job);
    return job;
}

export function updateJob(jobId: string, updates: Partial<JobStatus>): JobStatus | undefined {
    const job = jobs.get(jobId);
    if (!job) return undefined;

    Object.assign(job, updates);
    jobs.set(jobId, job);
    return job;
}

export function getJob(jobId: string): JobStatus | undefined {
    return jobs.get(jobId);
}

export function deleteJob(jobId: string): boolean {
    return jobs.delete(jobId);
}

/**
 * Clear all jobs from memory
 * Returns the number of jobs cleared
 */
export function clearAllJobs(): number {
    const count = jobs.size;
    jobs.clear();
    console.log(`[Jobs] Cleared ${count} jobs from memory`);
    return count;
}

/**
 * Get all jobs as an array
 */
export function getAllJobs(): JobStatus[] {
    return Array.from(jobs.values());
}

// Cleanup old jobs (older than 1 hour)
setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [jobId, job] of jobs.entries()) {
        // You could add a timestamp field to JobStatus if needed
        // For now, we'll keep completed/failed jobs for 1 hour manually
    }
}, 10 * 60 * 1000); // Check every 10 minutes
