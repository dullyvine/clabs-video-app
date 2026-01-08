import express from 'express';
import { 
    createProject, 
    getUserProjects, 
    getProject, 
    getCurrentProject,
    updateProject, 
    deleteProject,
    DBProject
} from '../services/db.service';
import { requireAuth } from '../middleware/auth.middleware';

export const projectsRouter = express.Router();

// All project routes require authentication
projectsRouter.use(requireAuth);

/**
 * Get all projects for the current user
 */
projectsRouter.get('/', async (req, res) => {
    try {
        const userId = req.userId!;
        const projects = await getUserProjects(userId);
        
        res.json({ projects });
        
    } catch (error: any) {
        console.error('[Projects] List error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get user's current/active project (most recent draft)
 * Creates one if none exists
 */
projectsRouter.get('/current', async (req, res) => {
    try {
        const userId = req.userId!;
        
        let project = await getCurrentProject(userId);
        
        // If no current project, create one
        if (!project) {
            project = await createProject(userId);
            console.log(`[Projects] Created new project for user: ${req.user!.email}`);
        }
        
        res.json({ project: formatProject(project) });
        
    } catch (error: any) {
        console.error('[Projects] Get current error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Create a new project
 */
projectsRouter.post('/', async (req, res) => {
    try {
        const userId = req.userId!;
        const { name } = req.body;
        
        const project = await createProject(userId, name);
        
        console.log(`[Projects] Created project: ${project.id} for user: ${req.user!.email}`);
        
        res.json({ project: formatProject(project) });
        
    } catch (error: any) {
        console.error('[Projects] Create error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get a specific project by ID
 */
projectsRouter.get('/:projectId', async (req, res) => {
    try {
        const userId = req.userId!;
        const { projectId } = req.params;
        
        const project = await getProject(projectId, userId);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json({ project: formatProject(project) });
        
    } catch (error: any) {
        console.error('[Projects] Get error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Update a project
 * Accepts partial updates
 */
projectsRouter.patch('/:projectId', async (req, res) => {
    try {
        const userId = req.userId!;
        const { projectId } = req.params;
        const updates = req.body;
        
        // Remove fields that shouldn't be updated directly
        delete updates.id;
        delete updates.user_id;
        delete updates.created_at;
        delete updates.updated_at;
        
        const project = await updateProject(projectId, userId, updates);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json({ project: formatProject(project) });
        
    } catch (error: any) {
        console.error('[Projects] Update error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sync project state from frontend
 * This is a bulk update endpoint for syncing the entire app state
 */
projectsRouter.put('/:projectId/sync', async (req, res) => {
    try {
        const userId = req.userId!;
        const { projectId } = req.params;
        const state = req.body;
        
        // Map frontend state fields to database fields
        const updates: Partial<DBProject> = {};
        
        if (state.currentStep !== undefined) updates.current_step = state.currentStep;
        if (state.script !== undefined) updates.script = state.script;
        if (state.voiceService !== undefined) updates.voice_service = state.voiceService;
        if (state.voiceId !== undefined) updates.voice_id = state.voiceId;
        if (state.voiceoverUrl !== undefined) updates.voiceover_url = state.voiceoverUrl;
        if (state.voiceoverDuration !== undefined) updates.voiceover_duration = state.voiceoverDuration;
        if (state.selectedFlow !== undefined) updates.selected_flow = state.selectedFlow;
        if (state.selectedNiche !== undefined) updates.selected_niche = state.selectedNiche;
        if (state.imageModel !== undefined) updates.image_model = state.imageModel;
        if (state.aspectRatio !== undefined) updates.aspect_ratio = state.aspectRatio;
        if (state.motionEffect !== undefined) updates.motion_effect = state.motionEffect;
        if (state.videoQuality !== undefined) updates.video_quality = state.videoQuality;
        if (state.imageCount !== undefined) updates.image_count = state.imageCount;
        if (state.imageDuration !== undefined) updates.image_duration = state.imageDuration;
        if (state.stockVideoCount !== undefined) updates.stock_video_count = state.stockVideoCount;
        if (state.stockOrientation !== undefined) updates.stock_orientation = state.stockOrientation;
        if (state.captionsEnabled !== undefined) updates.captions_enabled = state.captionsEnabled;
        if (state.captionStyle !== undefined) updates.caption_style = state.captionStyle;
        if (state.wordTimestamps !== undefined) updates.word_timestamps = state.wordTimestamps;
        if (state.imagePrompts !== undefined) updates.image_prompts = state.imagePrompts;
        if (state.generatedImages !== undefined) updates.generated_images = state.generatedImages;
        if (state.selectedImages !== undefined) updates.selected_images = state.selectedImages;
        if (state.stockVideoSlots !== undefined) updates.stock_video_slots = state.stockVideoSlots;
        if (state.selectedVideos !== undefined) updates.selected_videos = state.selectedVideos;
        if (state.overlays !== undefined) updates.overlays = state.overlays;
        if (state.timelineSlots !== undefined) updates.timeline_slots = state.timelineSlots;
        if (state.useCustomTiming !== undefined) updates.use_custom_timing = state.useCustomTiming;
        if (state.videoJobId !== undefined) updates.video_job_id = state.videoJobId;
        if (state.finalVideoUrl !== undefined) updates.final_video_url = state.finalVideoUrl;
        if (state.chatHistory !== undefined) updates.chat_history = state.chatHistory;
        if (state.scriptWordCount !== undefined) updates.script_word_count = state.scriptWordCount;
        
        const project = await updateProject(projectId, userId, updates);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json({ project: formatProject(project), synced: true });
        
    } catch (error: any) {
        console.error('[Projects] Sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Delete a project
 */
projectsRouter.delete('/:projectId', async (req, res) => {
    try {
        const userId = req.userId!;
        const { projectId } = req.params;
        
        await deleteProject(projectId, userId);
        
        console.log(`[Projects] Deleted project: ${projectId}`);
        
        res.json({ success: true });
        
    } catch (error: any) {
        console.error('[Projects] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Format database project to frontend-compatible format
 */
function formatProject(project: DBProject) {
    return {
        id: project.id,
        userId: project.user_id,
        name: project.name,
        status: project.status,
        currentStep: project.current_step,
        script: project.script,
        voiceService: project.voice_service,
        voiceId: project.voice_id,
        voiceoverUrl: project.voiceover_url,
        voiceoverDuration: project.voiceover_duration ? Number(project.voiceover_duration) : null,
        selectedFlow: project.selected_flow,
        selectedNiche: project.selected_niche,
        imageModel: project.image_model || 'dall-e-3',
        aspectRatio: project.aspect_ratio || '16:9',
        motionEffect: project.motion_effect,
        videoQuality: project.video_quality,
        imageCount: project.image_count,
        imageDuration: project.image_duration,
        stockVideoCount: project.stock_video_count,
        stockOrientation: project.stock_orientation,
        captionsEnabled: project.captions_enabled,
        captionStyle: project.caption_style || {
            fontSize: 'medium',
            color: '#FFFFFF',
            backgroundColor: '#000000',
            position: 'bottom',
            fontFamily: 'Arial'
        },
        wordTimestamps: project.word_timestamps || [],
        imagePrompts: project.image_prompts || [],
        generatedImages: project.generated_images || [],
        selectedImages: project.selected_images || [],
        stockVideoSlots: project.stock_video_slots || [],
        selectedVideos: project.selected_videos || [],
        overlays: project.overlays || [],
        timelineSlots: project.timeline_slots || [],
        useCustomTiming: project.use_custom_timing,
        videoJobId: project.video_job_id,
        finalVideoUrl: project.final_video_url,
        chatHistory: project.chat_history || [],
        scriptWordCount: project.script_word_count,
        createdAt: project.created_at,
        updatedAt: project.updated_at
    };
}
