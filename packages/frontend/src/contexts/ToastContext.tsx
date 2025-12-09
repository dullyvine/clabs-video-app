'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ToastContainer, ToastProps, ToastType } from '@/components/ui/Toast';
import { v4 as uuidv4 } from 'uuid';

interface ToastContextType {
    showToast: (message: string, type?: ToastType, duration?: number) => void;
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastProps[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback(
        (message: string, type: ToastType = 'info', duration = 5000) => {
            const id = uuidv4();
            const newToast: ToastProps = {
                id,
                message,
                type,
                duration,
                onClose: removeToast,
            };

            setToasts((prev) => [...prev, newToast]);
        },
        [removeToast]
    );

    const success = useCallback(
        (message: string, duration = 5000) => showToast(message, 'success', duration),
        [showToast]
    );

    const error = useCallback(
        (message: string, duration = 7000) => showToast(message, 'error', duration),
        [showToast]
    );

    const warning = useCallback(
        (message: string, duration = 6000) => showToast(message, 'warning', duration),
        [showToast]
    );

    const info = useCallback(
        (message: string, duration = 5000) => showToast(message, 'info', duration),
        [showToast]
    );

    const value = {
        showToast,
        success,
        error,
        warning,
        info,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onClose={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
