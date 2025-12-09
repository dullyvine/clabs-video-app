import React from 'react';
import './card.css';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    hover?: boolean;
}

export function Card({ children, className = '', onClick, hover = true }: CardProps) {
    return (
        <div
            className={`glass-card ${hover ? 'card-hover' : ''} ${className}`}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {children}
        </div>
    );
}
