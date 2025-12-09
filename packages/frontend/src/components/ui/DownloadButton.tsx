'use client';

import React, { useState } from 'react';
import './download-button.css';

interface DownloadButtonProps {
  url: string;
  filename: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md';
  icon?: boolean;
  className?: string;
}

export function DownloadButton({
  url,
  filename,
  label = 'Download',
  variant = 'secondary',
  size = 'md',
  icon = true,
  className = ''
}: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (downloading) return;
    
    setDownloading(true);
    setProgress(0);

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Unable to read response');
      }

      const chunks: BlobPart[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        received += value.length;
        
        if (total > 0) {
          setProgress(Math.round((received / total) * 100));
        }
      }

      const blob = new Blob(chunks);
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      
      setProgress(100);
      
      // Reset after a short delay
      setTimeout(() => {
        setDownloading(false);
        setProgress(0);
      }, 1000);
      
    } catch (err) {
      console.error('Download failed:', err);
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`download-btn download-btn-${variant} download-btn-${size} ${downloading ? 'download-btn-loading' : ''} ${className}`}
    >
      {downloading ? (
        <>
          <span className="download-spinner" />
          <span>{progress > 0 ? `${progress}%` : 'Downloading...'}</span>
        </>
      ) : (
        <>
          {icon && <span className="download-icon">↓</span>}
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

interface DownloadAllButtonProps {
  files: Array<{ url: string; filename: string }>;
  zipFilename?: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
}

export function DownloadAllButton({
  files,
  zipFilename = 'assets.zip',
  label = 'Download All',
  variant = 'primary',
  size = 'md'
}: DownloadAllButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: files.length });

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (downloading || files.length === 0) return;
    
    setDownloading(true);
    setProgress({ current: 0, total: files.length });

    try {
      // Dynamically import JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });
        
        try {
          const response = await fetch(file.url);
          if (response.ok) {
            const blob = await response.blob();
            zip.file(file.filename, blob);
          }
        } catch (err) {
          console.warn(`Failed to download ${file.filename}:`, err);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const blobUrl = window.URL.createObjectURL(content);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      
      setTimeout(() => {
        setDownloading(false);
        setProgress({ current: 0, total: files.length });
      }, 1000);
      
    } catch (err) {
      console.error('Download all failed:', err);
      setDownloading(false);
      setProgress({ current: 0, total: files.length });
    }
  };

  if (files.length === 0) return null;

  return (
    <button
      onClick={handleDownloadAll}
      disabled={downloading}
      className={`download-btn download-btn-${variant} download-btn-${size} ${downloading ? 'download-btn-loading' : ''}`}
    >
      {downloading ? (
        <>
          <span className="download-spinner" />
          <span>Downloading {progress.current}/{progress.total}...</span>
        </>
      ) : (
        <>
          <span className="download-icon">📦</span>
          <span>{label} ({files.length} files)</span>
        </>
      )}
    </button>
  );
}
