'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, AuthStatus, MeResponse } from 'shared/src/types';

const AUTH_TOKEN_KEY = 'clabs-auth-token';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    authStatus: AuthStatus | null;
    login: (email: string, name?: string) => Promise<void>;
    loginWithGoogle: () => void;
    logout: () => Promise<void>;
    getAuthToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// API base URL for auth endpoints
const getApiBase = () => {
    if (typeof window !== 'undefined') {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (backendUrl) {
            return `${backendUrl}/api`;
        }
    }
    return process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api';
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

    // Get stored auth token
    const getAuthToken = useCallback((): string | null => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(AUTH_TOKEN_KEY);
    }, []);

    // Store auth token
    const setAuthToken = useCallback((token: string | null) => {
        if (typeof window === 'undefined') return;
        if (token) {
            localStorage.setItem(AUTH_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }
    }, []);

    // Fetch auth status from backend
    const fetchAuthStatus = useCallback(async () => {
        try {
            const response = await fetch(`${getApiBase()}/auth/status`);
            if (response.ok) {
                const status: AuthStatus = await response.json();
                setAuthStatus(status);
                return status;
            }
        } catch (error) {
            console.warn('[Auth] Failed to fetch auth status:', error);
        }
        return null;
    }, []);

    // Verify token and get user info
    const verifyAndLoadUser = useCallback(async (token: string): Promise<User | null> => {
        try {
            const response = await fetch(`${getApiBase()}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data: MeResponse = await response.json();
                return data.user;
            } else if (response.status === 401) {
                // Token expired or invalid
                setAuthToken(null);
            }
        } catch (error) {
            console.warn('[Auth] Failed to verify token:', error);
        }
        return null;
    }, [setAuthToken]);

    // Handle URL params (for OAuth callback)
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const token = params.get('auth_token');
        const error = params.get('auth_error');

        if (token) {
            // Store token from OAuth callback
            setAuthToken(token);
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
        }

        if (error) {
            console.error('[Auth] OAuth error:', error);
            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [setAuthToken]);

    // Initialize auth state
    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            
            // Fetch auth status
            await fetchAuthStatus();
            
            // Check for stored token
            const token = getAuthToken();
            if (token) {
                const loadedUser = await verifyAndLoadUser(token);
                if (loadedUser) {
                    setUser(loadedUser);
                }
            }
            
            setIsLoading(false);
        };
        
        init();
    }, [fetchAuthStatus, getAuthToken, verifyAndLoadUser]);

    // Email login (simple/dev mode)
    const login = useCallback(async (email: string, name?: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${getApiBase()}/auth/login/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Login failed');
            }
            
            const data = await response.json();
            setAuthToken(data.token);
            setUser(data.user);
        } finally {
            setIsLoading(false);
        }
    }, [setAuthToken]);

    // Google OAuth login
    const loginWithGoogle = useCallback(async () => {
        try {
            const response = await fetch(`${getApiBase()}/auth/google/url`);
            if (!response.ok) {
                throw new Error('Failed to get Google auth URL');
            }
            
            const { url } = await response.json();
            window.location.href = url;
        } catch (error) {
            console.error('[Auth] Google login error:', error);
            throw error;
        }
    }, []);

    // Logout
    const logout = useCallback(async () => {
        const token = getAuthToken();
        if (token) {
            try {
                await fetch(`${getApiBase()}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            } catch (error) {
                console.warn('[Auth] Logout request failed:', error);
            }
        }
        
        setAuthToken(null);
        setUser(null);
    }, [getAuthToken, setAuthToken]);

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            authStatus,
            login,
            loginWithGoogle,
            logout,
            getAuthToken
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
