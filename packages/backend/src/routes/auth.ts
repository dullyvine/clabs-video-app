import express from 'express';
import { 
    findOrCreateUser, 
    createSession, 
    deleteSession, 
    deleteAllUserSessions,
    findUserById,
    getUserProjects,
    getUserStorageStats,
    isDatabaseAvailable
} from '../services/db.service';
import { requireAuth } from '../middleware/auth.middleware';

export const authRouter = express.Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

/**
 * Check if auth is configured
 */
authRouter.get('/status', (req, res) => {
    const dbAvailable = isDatabaseAvailable();
    const googleConfigured = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
    
    res.json({
        available: dbAvailable,
        providers: {
            google: googleConfigured
        },
        // If no auth configured, app works in "anonymous" mode
        mode: dbAvailable && googleConfigured ? 'authenticated' : 'anonymous'
    });
});

/**
 * Google OAuth - Step 1: Get authorization URL
 * Frontend redirects user to this URL
 */
authRouter.get('/google/url', (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
        return res.status(503).json({ error: 'Google OAuth not configured' });
    }
    
    // Use explicit BACKEND_URL for consistent redirect URI
    const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
    
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'email profile',
        access_type: 'offline',
        prompt: 'consent'
    });
    
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    
    res.json({ url });
});

/**
 * Google OAuth - Step 2: Handle callback from Google
 * This is called after user authorizes with Google
 */
authRouter.get('/google/callback', async (req, res) => {
    try {
        const { code, error } = req.query;
        
        if (error) {
            console.error('[Auth] Google OAuth error:', error);
            return res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(String(error))}`);
        }
        
        if (!code || typeof code !== 'string') {
            return res.redirect(`${FRONTEND_URL}?auth_error=no_code`);
        }
        
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return res.redirect(`${FRONTEND_URL}?auth_error=not_configured`);
        }
        
        // Use explicit BACKEND_URL for consistent redirect URI
        const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
        
        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            })
        });
        
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[Auth] Token exchange failed:', errorText);
            return res.redirect(`${FRONTEND_URL}?auth_error=token_exchange_failed`);
        }
        
        const tokens = await tokenResponse.json() as { access_token: string };
        
        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        
        if (!userResponse.ok) {
            console.error('[Auth] Failed to get user info');
            return res.redirect(`${FRONTEND_URL}?auth_error=user_info_failed`);
        }
        
        const googleUser = await userResponse.json() as { email: string; name?: string; picture?: string };
        
        // Find or create user in our database
        const user = await findOrCreateUser(
            googleUser.email,
            googleUser.name,
            googleUser.picture
        );
        
        // Create session
        const session = await createSession(user.id);
        
        console.log(`[Auth] User logged in: ${user.email}`);
        
        // Redirect to frontend with token
        // Frontend should store this token and use it for subsequent requests
        res.redirect(`${FRONTEND_URL}?auth_token=${session.token}`);
        
    } catch (error: any) {
        console.error('[Auth] Callback error:', error);
        res.redirect(`${FRONTEND_URL}?auth_error=callback_failed`);
    }
});

/**
 * Direct login with email (for development/testing)
 * In production, this should be disabled or require additional verification
 */
authRouter.post('/login/email', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Simple email validation
        if (!email.includes('@') || !email.includes('.')) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Find or create user
        const user = await findOrCreateUser(email.toLowerCase().trim(), name);
        
        // Create session
        const session = await createSession(user.id);
        
        console.log(`[Auth] Email login: ${user.email}`);
        
        res.json({
            token: session.token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatar_url
            }
        });
        
    } catch (error: any) {
        console.error('[Auth] Email login error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get current user info
 */
authRouter.get('/me', requireAuth, async (req, res) => {
    try {
        const user = req.user!;
        const stats = await getUserStorageStats(user.id);
        
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatar_url,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at
            },
            stats
        });
        
    } catch (error: any) {
        console.error('[Auth] Get me error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Logout - delete current session
 */
authRouter.post('/logout', requireAuth, async (req, res) => {
    try {
        const token = req.sessionToken!;
        
        await deleteSession(token);
        
        console.log(`[Auth] User logged out: ${req.user!.email}`);
        
        res.json({ success: true });
        
    } catch (error: any) {
        console.error('[Auth] Logout error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Logout all devices - delete all sessions for user
 */
authRouter.post('/logout-all', requireAuth, async (req, res) => {
    try {
        const userId = req.userId!;
        
        await deleteAllUserSessions(userId);
        
        console.log(`[Auth] All sessions deleted for user: ${req.user!.email}`);
        
        res.json({ success: true });
        
    } catch (error: any) {
        console.error('[Auth] Logout all error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Verify token (for frontend to check if stored token is still valid)
 */
authRouter.get('/verify', requireAuth, (req, res) => {
    res.json({ valid: true, userId: req.userId });
});
