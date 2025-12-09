import React from 'react';
import './progress-bar.css';

interface ProgressBarProps {
    progress: number; // 0-100
    label?: string;
    showPercentage?: boolean;
}

export function ProgressBar({ progress, label, showPercentage = true }: ProgressBarProps) {
    const clampedProgress = Math.min(100, Math.max(0, progress));

    return (
        <div className="progress-container">
            {(label || showPercentage) && (
                <div className="progress-header">
                    {label && <span className="progress-label">{label}</span>}
                    {showPercentage && <span className="progress-percentage">{Math.round(clampedProgress)}%</span>}
                </div>
            )}
            <div className="progress-bar">
                <div
                    className="progress-fill"
                    style={{ width: `${clampedProgress}%` }}
                />
            </div>
        </div>
    );
}
