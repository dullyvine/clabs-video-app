import React, { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { BlendMode } from 'shared/src/types';
import { useToast } from '@/contexts/ToastContext';

const BLEND_OPTIONS: BlendMode[] = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn'
];

/**
 * Convert relative URLs to absolute backend URLs
 * Overlays are stored in /temp/ directory on the backend
 */
const toAbsoluteUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    // Both /temp/ and /uploads/ paths are served from backend
    return `http://localhost:3001${url}`;
};

export function OverlayManager() {
    const app = useApp();
    const { error: toastError, success: toastSuccess } = useToast();
    const [uploading, setUploading] = useState(false);

    const basePreview = useMemo(() => {
        if (!app.generatedImages.length) return null;
        const first = app.generatedImages[0];
        return toAbsoluteUrl(first.imageUrl);
    }, [app.generatedImages]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('video/')) {
            toastError('Please upload a video file for the overlay.');
            return;
        }

        setUploading(true);
        try {
            const result = await api.uploadOverlay(file);

            if (result.overlayType !== 'video') {
                toastError('Please upload a video file for the overlay.');
                return;
            }

            // Store the relative URL (e.g., /temp/overlay-xxx.mp4)
            // This will be resolved to absolute path on the backend during video generation
            const newOverlay = {
                id: result.overlayId,
                fileUrl: result.overlayUrl,  // Keep as relative URL for backend resolution
                type: 'video' as const,
                blendMode: 'screen' as BlendMode,  // Default to screen for light leaks/particles
                opacity: 0.7  // Default to 70% opacity
            };

            app.updateState({
                overlays: [...app.overlays, newOverlay]
            });

            toastSuccess('Overlay added! It will be applied to your final video.');
        } catch (err: any) {
            toastError('Upload failed: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    const updateOverlay = (id: string, updates: Partial<{ blendMode: BlendMode; opacity: number }>) => {
        const updatedOverlays = app.overlays.map(o =>
            o.id === id ? { ...o, ...updates } : o
        );
        app.updateState({ overlays: updatedOverlays });
    };

    const removeOverlay = (id: string) => {
        app.updateState({
            overlays: app.overlays.filter(o => o.id !== id)
        });
    };

    return (
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <h3>Video Overlays</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
                Layer short overlay videos (logos, particles, light leaks, etc.) on top of your base footage using blend modes.
            </p>

            {basePreview ? (
                <div style={{ position: 'relative', width: '100%', maxWidth: '240px', paddingTop: 'min(56.25%, 135px)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 'var(--spacing-md)' }}>
                    <img
                        src={basePreview}
                        alt="Base preview"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {app.overlays.map((overlay) => (
                        <video
                            key={`preview-${overlay.id}`}
                            src={toAbsoluteUrl(overlay.fileUrl)}
                            autoPlay
                            loop
                            muted
                            playsInline
                            style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                mixBlendMode: overlay.blendMode,
                                opacity: overlay.opacity ?? 1
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div style={{ padding: 'var(--spacing-md)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)' }}>
                    Generate at least one image to preview overlays in-context.
                </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                {app.overlays.map((overlay) => (
                    <div key={overlay.id} style={{
                        display: 'flex',
                        gap: 'var(--spacing-md)',
                        padding: 'var(--spacing-sm)',
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        alignItems: 'center'
                    }}>
                        <video
                            src={toAbsoluteUrl(overlay.fileUrl)}
                            muted
                            loop
                            autoPlay
                            playsInline
                            style={{ width: '100px', height: '60px', objectFit: 'cover', borderRadius: 'var(--radius-xs)', background: '#000' }}
                        />

                        <div style={{ flex: 1 }}>
                            <div style={{ marginBottom: 'var(--spacing-xs)' }}>
                                <label style={{ fontSize: '0.875rem', marginRight: 'var(--spacing-sm)' }}>Blend Mode:</label>
                                <select
                                    value={overlay.blendMode}
                                    onChange={(e) => updateOverlay(overlay.id, { blendMode: e.target.value as BlendMode })}
                                    style={{ padding: '4px' }}
                                >
                                    {BLEND_OPTIONS.map(mode => (
                                        <option key={mode} value={mode}>{mode}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.875rem', marginRight: 'var(--spacing-sm)' }}>Opacity:</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={overlay.opacity ?? 1}
                                    onChange={(e) => updateOverlay(overlay.id, { opacity: parseFloat(e.target.value) })}
                                    style={{ verticalAlign: 'middle', width: '150px' }}
                                />
                                <span style={{ marginLeft: 'var(--spacing-xs)', fontSize: '0.85rem' }}>
                                    {Math.round((overlay.opacity ?? 1) * 100)}%
                                </span>
                            </div>
                        </div>

                        <Button variant="secondary" onClick={() => removeOverlay(overlay.id)} style={{ padding: 'var(--spacing-xs)' }}>
                            Remove
                        </Button>
                    </div>
                ))}
            </div>

            <div>
                <input
                    type="file"
                    id="overlay-upload"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />
                <Button
                    variant="secondary"
                    onClick={() => document.getElementById('overlay-upload')?.click()}
                    isLoading={uploading}
                >
                    + Add Overlay Video
                </Button>
            </div>
        </div>
    );
}
