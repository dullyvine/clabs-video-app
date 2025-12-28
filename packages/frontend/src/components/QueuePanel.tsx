'use client';

import React, { useState } from 'react';
import { useQueue, QueuedProject } from '@/contexts/QueueContext';
import { Button } from '@/components/ui/Button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import './QueuePanel.css';

interface QueuePanelProps {
    onStartNew?: () => void;
}

export function QueuePanel({ onStartNew }: QueuePanelProps) {
    const { queue, activeCount, clearCompleted, removeFromQueue, canStartNew } = useQueue();
    const [isExpanded, setIsExpanded] = useState(false);

    const completedCount = queue.filter(p => p.status === 'completed').length;
    const queuedCount = queue.filter(p => p.status === 'queued').length;
    const failedCount = queue.filter(p => p.status === 'failed').length;

    // Auto-expand when there are active jobs
    React.useEffect(() => {
        if (activeCount > 0 && !isExpanded) {
            setIsExpanded(true);
        }
    }, [activeCount]);

    if (queue.length === 0) {
        return null;
    }

    return (
        <div className={`queue-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {/* Collapsed Tab */}
            <button 
                className="queue-panel-tab"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-label="Toggle render queue"
            >
                <div className="queue-tab-indicator">
                    {activeCount > 0 && (
                        <span className="queue-tab-pulse" />
                    )}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                </div>
                {!isExpanded && (
                    <div className="queue-tab-counts">
                        {activeCount > 0 && <span className="count active">{activeCount}</span>}
                        {completedCount > 0 && <span className="count done">{completedCount}</span>}
                        {(queuedCount > 0 || failedCount > 0) && (
                            <span className="count other">{queuedCount + failedCount}</span>
                        )}
                    </div>
                )}
            </button>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="queue-panel-body">
                    <div className="queue-panel-header">
                        <div className="queue-header-title">
                            <h3>Render Queue</h3>
                            <span className="queue-header-status">
                                {activeCount > 0 ? `${activeCount} rendering` : 'Idle'}
                            </span>
                        </div>
                        <button 
                            className="queue-close-btn"
                            onClick={() => setIsExpanded(false)}
                            aria-label="Close panel"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="queue-list">
                        {queue.map((project) => (
                            <QueueItem 
                                key={project.id} 
                                project={project}
                                onRemove={() => removeFromQueue(project.id)}
                            />
                        ))}
                    </div>

                    <div className="queue-panel-footer">
                        <div className="queue-footer-info">
                            <span className="queue-slots">
                                {4 - activeCount} of 4 slots available
                            </span>
                        </div>
                        <div className="queue-footer-actions">
                            {completedCount > 0 && (
                                <button 
                                    className="queue-text-btn"
                                    onClick={clearCompleted}
                                >
                                    Clear completed
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function QueueItem({ project, onRemove }: { project: QueuedProject; onRemove: () => void }) {
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={`queue-item ${project.status}`}>
            <div className="queue-item-status">
                {project.status === 'processing' && (
                    <div className="status-spinner" />
                )}
                {project.status === 'completed' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
                {project.status === 'failed' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                )}
                {project.status === 'queued' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                )}
            </div>
            
            <div className="queue-item-content">
                <div className="queue-item-header">
                    <span className="queue-item-name">{project.name}</span>
                    <span className="queue-item-time">{formatTime(project.createdAt)}</span>
                </div>
                
                {project.status === 'processing' && (
                    <div className="queue-item-progress">
                        <div className="progress-track">
                            <div 
                                className="progress-fill" 
                                style={{ width: `${project.progress}%` }}
                            />
                        </div>
                        <span className="progress-text">{project.progress}%</span>
                    </div>
                )}
                
                {project.status === 'failed' && project.error && (
                    <span className="queue-item-error">{project.error}</span>
                )}
            </div>

            <div className="queue-item-actions">
                {project.status === 'completed' && project.videoUrl && (
                    <DownloadButton
                        url={project.videoUrl}
                        filename={`${project.name.replace(/[^a-z0-9]/gi, '-')}.mp4`}
                        label=""
                        variant="secondary"
                        size="sm"
                        icon={true}
                    />
                )}
                {(project.status === 'completed' || project.status === 'failed' || project.status === 'queued') && (
                    <button 
                        className="queue-item-remove"
                        onClick={onRemove}
                        aria-label="Remove from queue"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}






