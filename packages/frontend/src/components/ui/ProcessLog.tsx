'use client';

import React from 'react';
import './process-log.css';

export interface LogEntry {
  id: string;
  message: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  timestamp: Date;
  details?: string;
}

interface ProcessLogProps {
  title?: string;
  entries: LogEntry[];
  isActive?: boolean;
}

export function ProcessLog({ title = 'Process Log', entries, isActive = false }: ProcessLogProps) {
  if (entries.length === 0) return null;

  return (
    <div className={`process-log ${isActive ? 'process-log-active' : ''}`}>
      <div className="process-log-header">
        <span className="process-log-title">{title}</span>
        {isActive && <span className="process-log-indicator" />}
      </div>
      <div className="process-log-entries">
        {entries.map((entry) => (
          <div key={entry.id} className={`process-log-entry process-log-entry-${entry.status}`}>
            <div className="process-log-entry-icon">
              {entry.status === 'pending' && <span className="icon-pending">○</span>}
              {entry.status === 'in-progress' && <span className="icon-progress">◎</span>}
              {entry.status === 'completed' && <span className="icon-completed">✓</span>}
              {entry.status === 'error' && <span className="icon-error">✕</span>}
            </div>
            <div className="process-log-entry-content">
              <span className="process-log-entry-message">{entry.message}</span>
              {entry.details && (
                <span className="process-log-entry-details">{entry.details}</span>
              )}
            </div>
            <span className="process-log-entry-time">
              {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Hook for managing process log state
export function useProcessLog() {
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [isActive, setIsActive] = React.useState(false);

  const addEntry = React.useCallback((message: string, status: LogEntry['status'] = 'pending', details?: string) => {
    const id = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const entry: LogEntry = {
      id,
      message,
      status,
      timestamp: new Date(),
      details
    };
    setEntries(prev => [...prev, entry]);
    return id;
  }, []);

  const updateEntry = React.useCallback((id: string, updates: Partial<Omit<LogEntry, 'id'>>) => {
    setEntries(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, ...updates, timestamp: new Date() } : entry
      )
    );
  }, []);

  const clearLog = React.useCallback(() => {
    setEntries([]);
    setIsActive(false);
  }, []);

  const startProcess = React.useCallback(() => {
    setIsActive(true);
    setEntries([]);
  }, []);

  const endProcess = React.useCallback(() => {
    setIsActive(false);
  }, []);

  return {
    entries,
    isActive,
    addEntry,
    updateEntry,
    clearLog,
    startProcess,
    endProcess
  };
}
