'use client';

import React, { useState } from 'react';
import { useQueue, QueuedProject } from '@/contexts/QueueContext';
import { Button } from '@/components/ui/Button';
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

    if (queue.length === 0) {
        return null;
    }

    return (
        <div className={`queue-panel ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <button 
                className="queue-panel-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="queue-panel-icon">📋</span>
                <span className="queue-panel-summary">
                    {activeCount > 0 && <span className="queue-badge processing">{activeCount} processing</span>}
                    {queuedCount > 0 && <span className="queue-badge queued">{queuedCount} queued</span>}
                    {completedCount > 0 && <span className="queue-badge completed">{completedCount} done</span>}
                    {failedCount > 0 && <span className="queue-badge failed">{failedCount} failed</span>}
                </span>
                <span className="queue-panel-chevron">{isExpanded ? '▼' : '▲'}</span>
            </button>

            {isExpanded && (
                <div className="queue-panel-content">
                    <div className="queue-panel-header">
                        <h3>Video Queue</h3>
                        <div className="queue-panel-actions">
                            {canStartNew && onStartNew && (
                                <Button size="sm" onClick={onStartNew}>
                                    + New Project
                                </Button>
                            )}
                            {completedCount > 0 && (
                                <Button size="sm" variant="secondary" onClick={clearCompleted}>
                                    Clear Done
                                </Button>
                            )}
                        </div>
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
                        <span>Max {4} concurrent · {4 - activeCount} slots available</span>
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

    const getStatusIcon = (status: QueuedProject['status']) => {
        switch (status) {
            case 'processing': return '⏳';
            case 'completed': return '✓';
            case 'failed': return '✗';
            case 'queued': return '⏸';
            default: return '○';
        }
    };

    return (
        <div className={`queue-item ${project.status}`}>
            <div className="queue-item-icon">{getStatusIcon(project.status)}</div>
            <div className="queue-item-info">
                <div className="queue-item-name">{project.name}</div>
                <div className="queue-item-meta">
                    <span className="queue-item-time">{formatTime(project.createdAt)}</span>
                    {project.status === 'processing' && (
                        <span className="queue-item-progress">{project.progress}%</span>
                    )}
                </div>
                {project.status === 'processing' && (
                    <div className="queue-item-progress-bar">
                        <div 
                            className="queue-item-progress-fill" 
                            style={{ width: `${project.progress}%` }}
                        />
                    </div>
                )}
            </div>
            <div className="queue-item-actions">
                {project.status === 'completed' && project.videoUrl && (
                    <a 
                        href={project.videoUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="queue-item-download"
                    >
                        ⬇
                    </a>
                )}
                {(project.status === 'completed' || project.status === 'failed' || project.status === 'queued') && (
                    <button 
                        className="queue-item-remove"
                        onClick={onRemove}
                        title="Remove from queue"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}






