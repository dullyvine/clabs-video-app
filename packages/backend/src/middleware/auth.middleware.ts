import { Request, Response, NextFunction } from 'express';
import { findSessionByToken, DBUser } from '../services/db.service';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: DBUser;
            userId?: string;
            sessionToken?: string;
        }
    }
}

/**
 * Extract auth token from request headers
 * Supports: Authorization: Bearer <token> or X-Auth-Token: <token>
 */
function extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    // Check X-Auth-Token header
    const xAuthToken = req.headers['x-auth-token'];
    if (typeof xAuthToken === 'string') {
        return xAuthToken;
    }
    
    // Check cookie (for browser requests)
    const cookies = req.headers.cookie;
    if (cookies) {
        const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('auth_token='));
        if (tokenCookie) {
            return tokenCookie.split('=')[1]?.trim() || null;
        }
    }
    
    return null;
}

/**
 * Auth middleware - requires valid session
 * Attaches user to request if authenticated
 * Returns 401 if not authenticated
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const token = extractToken(req);
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const session = await findSessionByToken(token);
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        // Attach user to request
        req.user = session.user;
        req.userId = session.user.id;
        req.sessionToken = token;
        
        next();
    } catch (error: any) {
        console.error('[Auth Middleware] Error:', error.message);
        return res.status(500).json({ error: 'Authentication error' });
    }
}

/**
 * Optional auth middleware - attaches user if authenticated, but doesn't require it
 * Useful for endpoints that work with or without authentication
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
    try {
        const token = extractToken(req);
        
        if (token) {
            const session = await findSessionByToken(token);
            
            if (session) {
                req.user = session.user;
                req.userId = session.user.id;
                req.sessionToken = token;
            }
        }
        
        next();
    } catch (error: any) {
        // Don't fail on optional auth errors, just continue without user
        console.warn('[Auth Middleware] Optional auth error:', error.message);
        next();
    }
}

/**
 * Check if request is authenticated
 */
export function isAuthenticated(req: Request): boolean {
    return !!req.user && !!req.userId;
}
