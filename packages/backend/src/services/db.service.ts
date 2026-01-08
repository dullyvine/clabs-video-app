import { neon, neonConfig } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

// Configure for serverless environment with longer timeout
neonConfig.fetchConnectionCache = true;

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.warn('[DB] DATABASE_URL not set - database features will be disabled');
}

// Create SQL query function with extended timeout for cold starts
const sql = DATABASE_URL ? neon(DATABASE_URL, {
    fetchOptions: {
        // Longer timeout for cold starts (NeonDB computes can take time to wake up)
        signal: undefined  // We'll handle timeout via retry logic instead
    }
}) : null;

/**
 * Check if database is configured and available
 */
export function isDatabaseAvailable(): boolean {
    return sql !== null;
}

/**
 * Sleep helper for retry logic
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute a SQL query with parameters and retry logic
 * Uses neon's query() method for parameterized queries
 */
export async function query<T = any>(queryText: string, params: any[] = [], retries = 3): Promise<T[]> {
    if (!sql) {
        throw new Error('Database not configured');
    }
    
    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Use sql.query() for parameterized queries (safer than template strings for dynamic queries)
            const result = await sql.query(queryText, params);
            return result as T[];
        } catch (error: any) {
            lastError = error;
            const isRetryable = error.message?.includes('fetch failed') || 
                               error.message?.includes('timeout') ||
                               error.code === 'UND_ERR_CONNECT_TIMEOUT';
            
            if (isRetryable && attempt < retries) {
                console.warn(`[DB] Query failed (attempt ${attempt}/${retries}), retrying in ${attempt * 500}ms...`);
                await sleep(attempt * 500);
            } else {
                console.error('[DB] Query error:', error.message);
                throw error;
            }
        }
    }
    
    throw lastError;
}

// ============================================
// USER OPERATIONS
// ============================================

export interface DBUser {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    created_at: Date;
    updated_at: Date;
    last_login_at: Date | null;
}

/**
 * Find user by email
 */
export async function findUserByEmail(email: string): Promise<DBUser | null> {
    const users = await query<DBUser>(
        'SELECT * FROM users WHERE email = $1',
        [email]
    );
    return users[0] || null;
}

/**
 * Find user by ID
 */
export async function findUserById(id: string): Promise<DBUser | null> {
    const users = await query<DBUser>(
        'SELECT * FROM users WHERE id = $1',
        [id]
    );
    return users[0] || null;
}

/**
 * Create a new user
 */
export async function createUser(email: string, name?: string, avatarUrl?: string): Promise<DBUser> {
    const users = await query<DBUser>(
        `INSERT INTO users (email, name, avatar_url) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [email, name || null, avatarUrl || null]
    );
    return users[0];
}

/**
 * Update user's last login time
 */
export async function updateUserLastLogin(userId: string): Promise<void> {
    await query(
        'UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1',
        [userId]
    );
}

/**
 * Find or create user by email (for OAuth login)
 */
export async function findOrCreateUser(email: string, name?: string, avatarUrl?: string): Promise<DBUser> {
    let user = await findUserByEmail(email);
    
    if (!user) {
        user = await createUser(email, name, avatarUrl);
        console.log(`[DB] Created new user: ${email}`);
    } else {
        // Update name and avatar if provided and different
        if ((name && name !== user.name) || (avatarUrl && avatarUrl !== user.avatar_url)) {
            await query(
                'UPDATE users SET name = COALESCE($2, name), avatar_url = COALESCE($3, avatar_url), updated_at = NOW() WHERE id = $1',
                [user.id, name, avatarUrl]
            );
            user.name = name || user.name;
            user.avatar_url = avatarUrl || user.avatar_url;
        }
        await updateUserLastLogin(user.id);
    }
    
    return user;
}

// ============================================
// SESSION OPERATIONS
// ============================================

export interface DBSession {
    id: string;
    user_id: string;
    token: string;
    expires_at: Date;
    created_at: Date;
}

/**
 * Create a new session for a user
 */
export async function createSession(userId: string, expiresInDays: number = 30): Promise<DBSession> {
    const token = uuidv4() + '-' + uuidv4(); // Double UUID for extra security
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    const sessions = await query<DBSession>(
        `INSERT INTO sessions (user_id, token, expires_at) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [userId, token, expiresAt.toISOString()]
    );
    return sessions[0];
}

/**
 * Find session by token
 */
export async function findSessionByToken(token: string): Promise<(DBSession & { user: DBUser }) | null> {
    // Define interface for the joined query result
    interface SessionWithUserRow {
        id: string;
        user_id: string;
        token: string;
        expires_at: Date;
        created_at: Date;
        email: string;
        name: string | null;
        avatar_url: string | null;
        user_created_at: Date;
        updated_at: Date;
        last_login_at: Date | null;
    }
    
    const results = await query<SessionWithUserRow>(
        `SELECT s.*, u.id as user_id, u.email, u.name, u.avatar_url, u.created_at as user_created_at
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token = $1 AND s.expires_at > NOW()`,
        [token]
    );
    
    if (!results[0]) return null;
    
    const row = results[0];
    return {
        id: row.id,
        user_id: row.user_id,
        token: row.token,
        expires_at: row.expires_at,
        created_at: row.created_at,
        user: {
            id: row.user_id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            created_at: row.user_created_at,
            updated_at: row.updated_at,
            last_login_at: row.last_login_at
        }
    };
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(token: string): Promise<void> {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
}

/**
 * Delete all sessions for a user
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
    const result = await query<{ count: string }>(
        'WITH deleted AS (DELETE FROM sessions WHERE expires_at < NOW() RETURNING *) SELECT COUNT(*) FROM deleted'
    );
    return parseInt(result[0]?.count || '0', 10);
}

// ============================================
// PROJECT OPERATIONS
// ============================================

export interface DBProject {
    id: string;
    user_id: string;
    name: string;
    status: string;
    current_step: number;
    script: string | null;
    voice_service: string | null;
    voice_id: string | null;
    voiceover_url: string | null;
    voiceover_duration: number | null;
    selected_flow: string | null;
    selected_niche: string | null;
    image_model: string | null;
    aspect_ratio: string | null;
    motion_effect: string;
    video_quality: string;
    image_count: number;
    image_duration: number;
    stock_video_count: number;
    stock_orientation: string;
    captions_enabled: boolean;
    caption_style: any;
    word_timestamps: any;
    image_prompts: any;
    generated_images: any;
    selected_images: string[] | null;
    stock_video_slots: any;
    selected_videos: any;
    overlays: any;
    timeline_slots: any;
    use_custom_timing: boolean;
    video_job_id: string | null;
    final_video_url: string | null;
    chat_history: any;
    script_word_count: number;
    created_at: Date;
    updated_at: Date;
}

/**
 * Create a new project for a user
 */
export async function createProject(userId: string, name?: string): Promise<DBProject> {
    const projects = await query<DBProject>(
        `INSERT INTO projects (user_id, name) 
         VALUES ($1, $2) 
         RETURNING *`,
        [userId, name || 'Untitled Project']
    );
    return projects[0];
}

/**
 * Get all projects for a user
 */
export async function getUserProjects(userId: string): Promise<DBProject[]> {
    return query<DBProject>(
        'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
    );
}

/**
 * Get a specific project by ID (with user check)
 */
export async function getProject(projectId: string, userId: string): Promise<DBProject | null> {
    const projects = await query<DBProject>(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId]
    );
    return projects[0] || null;
}

/**
 * Get user's current/active project (most recently updated draft)
 */
export async function getCurrentProject(userId: string): Promise<DBProject | null> {
    const projects = await query<DBProject>(
        `SELECT * FROM projects 
         WHERE user_id = $1 AND status = 'draft' 
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [userId]
    );
    return projects[0] || null;
}

/**
 * Update a project
 */
export async function updateProject(projectId: string, userId: string, updates: Partial<DBProject>): Promise<DBProject | null> {
    // Build dynamic update query
    const allowedFields = [
        'name', 'status', 'current_step', 'script', 'voice_service', 'voice_id',
        'voiceover_url', 'voiceover_duration', 'selected_flow', 'selected_niche',
        'image_model', 'aspect_ratio', 'motion_effect', 'video_quality',
        'image_count', 'image_duration', 'stock_video_count', 'stock_orientation',
        'captions_enabled', 'caption_style', 'word_timestamps', 'image_prompts',
        'generated_images', 'selected_images', 'stock_video_slots', 'selected_videos',
        'overlays', 'timeline_slots', 'use_custom_timing', 'video_job_id',
        'final_video_url', 'chat_history', 'script_word_count'
    ];
    
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            setClauses.push(`${key} = $${paramIndex}`);
            // Convert objects to JSON for JSONB fields
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                values.push(JSON.stringify(value));
            } else if (Array.isArray(value)) {
                // Handle arrays - some are TEXT[], some are JSONB
                const jsonbFields = ['caption_style', 'word_timestamps', 'image_prompts', 
                    'generated_images', 'stock_video_slots', 'selected_videos', 
                    'overlays', 'timeline_slots', 'chat_history'];
                if (jsonbFields.includes(key)) {
                    values.push(JSON.stringify(value));
                } else {
                    values.push(value);
                }
            } else {
                values.push(value);
            }
            paramIndex++;
        }
    }
    
    if (setClauses.length === 0) return null;
    
    setClauses.push('updated_at = NOW()');
    values.push(projectId, userId);
    
    const projects = await query<DBProject>(
        `UPDATE projects 
         SET ${setClauses.join(', ')} 
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
         RETURNING *`,
        values
    );
    
    return projects[0] || null;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string, userId: string): Promise<boolean> {
    const result = await query(
        'DELETE FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId]
    );
    return true;
}

// ============================================
// FILE OPERATIONS
// ============================================

export interface DBFile {
    id: string;
    user_id: string;
    project_id: string | null;
    file_type: string;
    file_url: string;
    file_path: string | null;
    file_size_bytes: number | null;
    mime_type: string | null;
    metadata: any;
    created_at: Date;
}

/**
 * Track a file in the database
 */
export async function trackFileInDB(
    userId: string,
    fileType: string,
    fileUrl: string,
    filePath?: string,
    projectId?: string,
    metadata?: any
): Promise<DBFile> {
    const files = await query<DBFile>(
        `INSERT INTO files (user_id, project_id, file_type, file_url, file_path, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, projectId || null, fileType, fileUrl, filePath || null, metadata ? JSON.stringify(metadata) : null]
    );
    return files[0];
}

/**
 * Get all files for a user
 */
export async function getUserFiles(userId: string, fileType?: string): Promise<DBFile[]> {
    if (fileType) {
        return query<DBFile>(
            'SELECT * FROM files WHERE user_id = $1 AND file_type = $2 ORDER BY created_at DESC',
            [userId, fileType]
        );
    }
    return query<DBFile>(
        'SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );
}

/**
 * Delete a file record
 */
export async function deleteFileRecord(fileId: string, userId: string): Promise<boolean> {
    await query(
        'DELETE FROM files WHERE id = $1 AND user_id = $2',
        [fileId, userId]
    );
    return true;
}

/**
 * Delete all files for a user
 */
export async function deleteAllUserFiles(userId: string): Promise<DBFile[]> {
    const files = await query<DBFile>(
        'DELETE FROM files WHERE user_id = $1 RETURNING *',
        [userId]
    );
    return files;
}

// Aliases for file.service.ts compatibility
export const trackFile = async (params: {
    id?: string;
    userId: string;
    projectId?: string;
    jobId?: string;
    filePath: string;
    fileType: 'temp' | 'upload' | 'output';
    mimeType?: string;
}): Promise<DBFile> => {
    const fileUrl = params.filePath.includes('/temp/') 
        ? `/temp/${params.filePath.split('/temp/')[1]}`
        : params.filePath.includes('/uploads/')
            ? `/uploads/${params.filePath.split('/uploads/')[1]}`
            : params.filePath;
            
    return trackFileInDB(
        params.userId,
        params.fileType,
        fileUrl,
        params.filePath,
        params.projectId,
        params.jobId ? { jobId: params.jobId } : undefined
    );
};

export const getFilesByUserId = async (userId: string): Promise<DBFile[]> => {
    return getUserFiles(userId);
};

export const getFilesByJobId = async (jobId: string): Promise<DBFile[]> => {
    return query<DBFile>(
        `SELECT * FROM files WHERE metadata->>'jobId' = $1`,
        [jobId]
    );
};

export const deleteFile = async (fileId: string): Promise<boolean> => {
    await query('DELETE FROM files WHERE id = $1', [fileId]);
    return true;
};

export const deleteUserFiles = async (userId: string): Promise<DBFile[]> => {
    return deleteAllUserFiles(userId);
};

// ============================================
// JOB OPERATIONS
// ============================================

export interface DBJob {
    id: string;
    job_id: string;
    user_id: string;
    project_id: string | null;
    job_type: string;
    status: string;
    progress: number;
    message: string | null;
    result: any;
    error: string | null;
    created_at: Date;
    updated_at: Date;
}

/**
 * Create a job in the database
 */
export async function createDBJob(
    jobId: string,
    userId: string,
    jobType: string,
    projectId?: string
): Promise<DBJob> {
    const jobs = await query<DBJob>(
        `INSERT INTO jobs (job_id, user_id, project_id, job_type)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [jobId, userId, projectId || null, jobType]
    );
    return jobs[0];
}

/**
 * Get a job by job_id (internal - use getDBJob alias for flexibility)
 */
async function getJobByJobId(jobId: string): Promise<DBJob | null> {
    const jobs = await query<DBJob>(
        'SELECT * FROM jobs WHERE job_id = $1',
        [jobId]
    );
    return jobs[0] || null;
}

/**
 * Get a job by job_id with user check
 */
export async function getDBJobForUser(jobId: string, userId: string): Promise<DBJob | null> {
    const jobs = await query<DBJob>(
        'SELECT * FROM jobs WHERE job_id = $1 AND user_id = $2',
        [jobId, userId]
    );
    return jobs[0] || null;
}

/**
 * Update a job
 */
export async function updateDBJob(
    jobId: string,
    updates: { status?: string; progress?: number; message?: string; result?: any; error?: string }
): Promise<DBJob | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
    }
    if (updates.progress !== undefined) {
        setClauses.push(`progress = $${paramIndex++}`);
        values.push(updates.progress);
    }
    if (updates.message !== undefined) {
        setClauses.push(`message = $${paramIndex++}`);
        values.push(updates.message);
    }
    if (updates.result !== undefined) {
        setClauses.push(`result = $${paramIndex++}`);
        values.push(JSON.stringify(updates.result));
    }
    if (updates.error !== undefined) {
        setClauses.push(`error = $${paramIndex++}`);
        values.push(updates.error);
    }
    
    if (setClauses.length === 0) return null;
    
    setClauses.push('updated_at = NOW()');
    values.push(jobId);
    
    const jobs = await query<DBJob>(
        `UPDATE jobs SET ${setClauses.join(', ')} WHERE job_id = $${paramIndex} RETURNING *`,
        values
    );
    
    return jobs[0] || null;
}

/**
 * Get all jobs for a user
 */
export async function getUserJobs(userId: string, status?: string): Promise<DBJob[]> {
    if (status) {
        return query<DBJob>(
            'SELECT * FROM jobs WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
            [userId, status]
        );
    }
    return query<DBJob>(
        'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );
}

/**
 * Delete all jobs for a user
 */
export async function deleteAllUserJobs(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
        'WITH deleted AS (DELETE FROM jobs WHERE user_id = $1 RETURNING *) SELECT COUNT(*) FROM deleted',
        [userId]
    );
    return parseInt(result[0]?.count || '0', 10);
}

// Aliases for jobs.ts compatibility
export const getDBJob = async (jobId: string, userId?: string): Promise<DBJob | null> => {
    if (userId) {
        const jobs = await query<DBJob>(
            'SELECT * FROM jobs WHERE job_id = $1 AND user_id = $2',
            [jobId, userId]
        );
        return jobs[0] || null;
    }
    const jobs = await query<DBJob>(
        'SELECT * FROM jobs WHERE job_id = $1',
        [jobId]
    );
    return jobs[0] || null;
};

export const deleteUserJobs = async (userId: string): Promise<DBJob[]> => {
    const jobs = await query<DBJob>(
        'DELETE FROM jobs WHERE user_id = $1 RETURNING *',
        [userId]
    );
    return jobs;
};

export const getUserDBJobs = async (userId: string): Promise<DBJob[]> => {
    return getUserJobs(userId);
};

// ============================================
// QUEUE OPERATIONS
// ============================================

export interface DBQueueItem {
    id: string;
    user_id: string;
    project_id: string;
    name: string | null;
    status: string;
    progress: number;
    job_id: string | null;
    video_url: string | null;
    error: string | null;
    project_state: any;
    created_at: Date;
    updated_at: Date;
}

/**
 * Add item to queue
 */
export async function addToDBQueue(
    userId: string,
    projectId: string,
    name: string,
    projectState: any
): Promise<DBQueueItem> {
    const items = await query<DBQueueItem>(
        `INSERT INTO queue_items (user_id, project_id, name, project_state)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, projectId, name, JSON.stringify(projectState)]
    );
    return items[0];
}

/**
 * Get user's queue
 */
export async function getUserQueue(userId: string): Promise<DBQueueItem[]> {
    return query<DBQueueItem>(
        'SELECT * FROM queue_items WHERE user_id = $1 ORDER BY created_at ASC',
        [userId]
    );
}

/**
 * Update queue item
 */
export async function updateQueueItem(
    queueItemId: string,
    userId: string,
    updates: Partial<DBQueueItem>
): Promise<DBQueueItem | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    const allowedFields = ['status', 'progress', 'job_id', 'video_url', 'error'];
    
    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            setClauses.push(`${key} = $${paramIndex++}`);
            values.push(value);
        }
    }
    
    if (setClauses.length === 0) return null;
    
    setClauses.push('updated_at = NOW()');
    values.push(queueItemId, userId);
    
    const items = await query<DBQueueItem>(
        `UPDATE queue_items SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
        values
    );
    
    return items[0] || null;
}

/**
 * Delete queue item
 */
export async function deleteQueueItem(queueItemId: string, userId: string): Promise<boolean> {
    await query(
        'DELETE FROM queue_items WHERE id = $1 AND user_id = $2',
        [queueItemId, userId]
    );
    return true;
}

/**
 * Clear completed/failed items from queue
 */
export async function clearCompletedQueueItems(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
        `WITH deleted AS (
            DELETE FROM queue_items 
            WHERE user_id = $1 AND status IN ('completed', 'failed') 
            RETURNING *
        ) SELECT COUNT(*) FROM deleted`,
        [userId]
    );
    return parseInt(result[0]?.count || '0', 10);
}

/**
 * Clear all queue items for a user
 */
export async function clearUserQueue(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
        'WITH deleted AS (DELETE FROM queue_items WHERE user_id = $1 RETURNING *) SELECT COUNT(*) FROM deleted',
        [userId]
    );
    return parseInt(result[0]?.count || '0', 10);
}

// ============================================
// CLEANUP OPERATIONS
// ============================================

/**
 * Get stats for a user's storage
 */
export async function getUserStorageStats(userId: string): Promise<{
    fileCount: number;
    projectCount: number;
    jobCount: number;
    queueCount: number;
}> {
    const [files, projects, jobs, queue] = await Promise.all([
        query<{ count: string }>('SELECT COUNT(*) FROM files WHERE user_id = $1', [userId]),
        query<{ count: string }>('SELECT COUNT(*) FROM projects WHERE user_id = $1', [userId]),
        query<{ count: string }>('SELECT COUNT(*) FROM jobs WHERE user_id = $1', [userId]),
        query<{ count: string }>('SELECT COUNT(*) FROM queue_items WHERE user_id = $1', [userId])
    ]);
    
    return {
        fileCount: parseInt(files[0]?.count || '0', 10),
        projectCount: parseInt(projects[0]?.count || '0', 10),
        jobCount: parseInt(jobs[0]?.count || '0', 10),
        queueCount: parseInt(queue[0]?.count || '0', 10)
    };
}

// Export connection string getter for debugging (redacted)
export function getConnectionInfo(): { connected: boolean; host: string | null } {
    if (!DATABASE_URL) {
        return { connected: false, host: null };
    }
    try {
        const url = new URL(DATABASE_URL);
        return { connected: true, host: url.host };
    } catch {
        return { connected: true, host: 'unknown' };
    }
}
