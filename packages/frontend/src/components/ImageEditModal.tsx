'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { api } from '@/lib/api';
import './ImageEditModal.css';

interface ImageEditModalProps {
    imageUrl: string;
    imageIndex: number;
    onClose: () => void;
    onSave: (newImageUrl: string, newImageId: string) => void;
}

interface EditHistoryEntry {
    imageUrl: string;
    prompt: string;
}

interface EditModel {
    id: string;
    name: string;
    provider: string;
    description: string;
    supportsAspectRatio: boolean;
}

type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export function ImageEditModal({ imageUrl, imageIndex, onClose, onSave }: ImageEditModalProps) {
    const [editPrompt, setEditPrompt] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl);
    const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([{ imageUrl, prompt: 'Original' }]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    // New: Model and aspect ratio selection
    const [availableModels, setAvailableModels] = useState<EditModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-image');
    const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio | 'original'>('original');
    const [loadingModels, setLoadingModels] = useState(true);

    // Fetch available edit models on mount
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const { models } = await api.listImageEditModels();
                setAvailableModels(models);
                if (models.length > 0) {
                    setSelectedModel(models[0].id);
                }
            } catch (err) {
                console.error('Failed to fetch edit models:', err);
            } finally {
                setLoadingModels(false);
            }
        };
        fetchModels();
    }, []);

    // Relative URLs work - Next.js rewrites proxy /temp/* and /uploads/* to backend
    const toAssetUrl = (url: string) => url;

    const currentModelSupportsAspectRatio = availableModels.find(m => m.id === selectedModel)?.supportsAspectRatio ?? false;

    const handleEdit = async () => {
        if (!editPrompt.trim() || isEditing) return;

        setIsEditing(true);
        setError(null);

        try {
            const result = await api.editImage({
                imageUrl: currentImageUrl,
                editPrompt: editPrompt.trim(),
                model: selectedModel,
                aspectRatio: selectedAspectRatio !== 'original' && currentModelSupportsAspectRatio ? selectedAspectRatio : undefined
            });

            const newEntry: EditHistoryEntry = {
                imageUrl: result.imageUrl,
                prompt: editPrompt.trim()
            };

            // Add to history
            const newHistory = [...editHistory.slice(0, historyIndex + 1), newEntry];
            setEditHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
            setCurrentImageUrl(result.imageUrl);
            setEditPrompt('');
        } catch (err: any) {
            setError(err.message || 'Failed to edit image');
        } finally {
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleEdit();
        }
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setCurrentImageUrl(editHistory[newIndex].imageUrl);
        }
    };

    const handleRedo = () => {
        if (historyIndex < editHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setCurrentImageUrl(editHistory[newIndex].imageUrl);
        }
    };

    const handleRevertToOriginal = () => {
        setHistoryIndex(0);
        setCurrentImageUrl(editHistory[0].imageUrl);
    };

    const handleSave = () => {
        // Extract imageId from the URL (it's the filename without extension)
        const parts = currentImageUrl.split('/');
        const filename = parts[parts.length - 1];
        const imageId = filename.replace(/\.[^/.]+$/, '');
        onSave(currentImageUrl, imageId);
    };

    const quickEdits = [
        'Make the colors more vibrant',
        'Add dramatic lighting',
        'Make it look more cinematic',
        'Add a sunset glow',
        'Make the atmosphere more mysterious',
        'Add depth of field blur to the background',
        'Make it look more professional',
        'Enhance the contrast'
    ];

    return (
        <div className="image-edit-modal-overlay" onClick={onClose}>
            <div className="image-edit-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="image-edit-modal-header">
                    <div className="image-edit-modal-title">
                        <h3>Edit Image {imageIndex + 1}</h3>
                        <span className="image-edit-modal-hint">
                            Describe how you want to modify the image
                        </span>
                    </div>
                    <button className="image-edit-modal-close" onClick={onClose}>×</button>
                </div>

                {/* Main Content */}
                <div className="image-edit-modal-content">
                    {/* Image Preview */}
                    <div className="image-edit-preview">
                        <div className="image-edit-preview-container">
                            {isEditing && (
                                <div className="image-edit-loading-overlay">
                                    <LoadingSpinner size="md" />
                                    <p>Applying edits...</p>
                                </div>
                            )}
                            <img 
                                src={toAssetUrl(currentImageUrl)} 
                                alt={`Scene ${imageIndex + 1}`} 
                            />
                        </div>
                        
                        {/* History Controls */}
                        <div className="image-edit-history-controls">
                            <button 
                                onClick={handleUndo} 
                                disabled={historyIndex === 0}
                                title="Undo"
                            >
                                ← Undo
                            </button>
                            <span className="image-edit-history-indicator">
                                {historyIndex + 1} / {editHistory.length}
                            </span>
                            <button 
                                onClick={handleRedo} 
                                disabled={historyIndex === editHistory.length - 1}
                                title="Redo"
                            >
                                Redo →
                            </button>
                            {historyIndex > 0 && (
                                <button 
                                    onClick={handleRevertToOriginal}
                                    className="image-edit-revert-btn"
                                >
                                    Reset to Original
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Edit Panel */}
                    <div className="image-edit-panel">
                        {/* Model and Aspect Ratio Selection */}
                        <div className="image-edit-options">
                            <div className="image-edit-option-group">
                                <label className="image-edit-option-label">Edit Model</label>
                                {loadingModels ? (
                                    <div className="image-edit-loading-models">Loading models...</div>
                                ) : availableModels.length === 0 ? (
                                    <div className="image-edit-no-models">No edit models available (check API keys)</div>
                                ) : (
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="image-edit-select"
                                        disabled={isEditing}
                                    >
                                        {availableModels.map((model) => (
                                            <option key={model.id} value={model.id}>
                                                {model.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {selectedModel && availableModels.find(m => m.id === selectedModel) && (
                                    <span className="image-edit-model-description">
                                        {availableModels.find(m => m.id === selectedModel)?.description}
                                    </span>
                                )}
                            </div>
                            
                            {currentModelSupportsAspectRatio && (
                                <div className="image-edit-option-group">
                                    <label className="image-edit-option-label">Output Aspect Ratio</label>
                                    <select
                                        value={selectedAspectRatio}
                                        onChange={(e) => setSelectedAspectRatio(e.target.value as AspectRatio | 'original')}
                                        className="image-edit-select"
                                        disabled={isEditing}
                                    >
                                        <option value="original">Keep Original</option>
                                        <option value="16:9">16:9 (Landscape)</option>
                                        <option value="9:16">9:16 (Portrait)</option>
                                        <option value="1:1">1:1 (Square)</option>
                                        <option value="4:3">4:3</option>
                                        <option value="3:4">3:4</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Edit History */}
                        {editHistory.length > 1 && (
                            <div className="image-edit-history">
                                <span className="image-edit-history-label">Edit History</span>
                                <div className="image-edit-history-list">
                                    {editHistory.map((entry, idx) => (
                                        <button
                                            key={idx}
                                            className={`image-edit-history-item ${idx === historyIndex ? 'active' : ''}`}
                                            onClick={() => {
                                                setHistoryIndex(idx);
                                                setCurrentImageUrl(entry.imageUrl);
                                            }}
                                        >
                                            {idx === 0 ? 'Original' : `Edit ${idx}: ${entry.prompt.substring(0, 30)}${entry.prompt.length > 30 ? '...' : ''}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Edits */}
                        <div className="image-edit-quick-actions">
                            <span className="image-edit-quick-label">Quick Edits</span>
                            <div className="image-edit-quick-buttons">
                                {quickEdits.map((edit, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setEditPrompt(edit)}
                                        className="image-edit-quick-btn"
                                    >
                                        {edit}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Edit Input */}
                        <div className="image-edit-input-area">
                            <textarea
                                ref={textareaRef}
                                value={editPrompt}
                                onChange={(e) => setEditPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe how you want to modify this image... (e.g., 'add more dramatic shadows', 'change the sky to sunset colors')"
                                rows={3}
                                disabled={isEditing}
                            />
                            <Button
                                onClick={handleEdit}
                                disabled={!editPrompt.trim() || isEditing}
                                isLoading={isEditing}
                            >
                                {isEditing ? 'Editing...' : 'Apply Edit'}
                            </Button>
                        </div>

                        {error && (
                            <div className="image-edit-error">
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="image-edit-modal-footer">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleSave}
                        disabled={currentImageUrl === imageUrl}
                    >
                        {currentImageUrl === imageUrl ? 'No Changes' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
