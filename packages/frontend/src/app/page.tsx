'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, SelectedStockVideo } from '@/contexts/AppContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProcessLog, useProcessLog } from '@/components/ui/ProcessLog';
import { DownloadButton, DownloadAllButton } from '@/components/ui/DownloadButton';
import { OverlayManager } from '@/components/OverlayManager';
import { ScriptChat } from '@/components/ScriptChat';
import { QueuePanel } from '@/components/QueuePanel';
import { ImageEditModal } from '@/components/ImageEditModal';
import { TimelineEditor, TimelineSlot as TimelineEditorSlot } from '@/components/TimelineEditor';
import CaptionPreview from '@/components/CaptionPreview';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useQueue } from '@/contexts/QueueContext';
import './page.css';
import {
  StockVideoAsset,
  StockVideoOrientation,
  StockVideoProvider,
  StockVideoSlot,
  TimelineSlot,
  MotionEffect,
  MotionEffectOption
} from 'shared/src/types';

export default function Home() {
  const app = useApp();
  const { queue, clearAll: clearQueue } = useQueue();
  const { showToast } = useToast();
  const [isClearing, setIsClearing] = useState(false);

  const handleStartNewProject = () => {
    app.clearStorage();
  };

  const handleClearAllData = async () => {
    if (isClearing) return;
    
    // Confirm if there are active jobs
    const hasActiveJobs = queue.some(p => p.status === 'processing');
    if (hasActiveJobs) {
      const confirmed = window.confirm(
        'You have videos currently being processed. Clearing all data will stop them. Continue?'
      );
      if (!confirmed) return;
    }

    setIsClearing(true);
    try {
      // Clear queue first
      clearQueue();
      // Clear all data (browser + server)
      await app.clearAllData();
      showToast('All temporary data cleared', 'success');
    } catch (error) {
      console.error('Failed to clear all data:', error);
      showToast('Failed to clear server data, but browser data was cleared', 'warning');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <main className="container">
    
      <QueuePanel onStartNew={handleStartNewProject} />
      <header className="app-header">
        <div className="app-header-content">
          <h1>Video Generator</h1>
          <p className="subtitle">Transform scripts into YouTube videos with AI-powered voiceovers and visuals</p>
        </div>
        <div className="app-header-actions">
          <button
            onClick={app.clearStorage}
            className="clear-project-btn"
            title="Start a new project (keeps server files)"
          >
            <span className="clear-project-text">New Project</span>
          </button>
          <button
            onClick={handleClearAllData}
            className="clear-all-btn"
            title="Clear all temporary data (browser storage + server files)"
            disabled={isClearing}
          >
            <span className="clear-project-text">{isClearing ? 'Clearing...' : 'Clear All Data'}</span>
          </button>
        </div>
      </header>

      <div className="wizard-container">
        {/* Progress Steps */}
        <nav className="steps-indicator">
          <Step number={1} title="Script & Voice" active={app.currentStep === 0} completed={app.currentStep > 0} onClick={() => app.goToStep(0)} canNavigate={app.maxCompletedStep >= 0} />
          <Step number={2} title="Content Type" active={app.currentStep === 1} completed={app.currentStep > 1} onClick={() => app.goToStep(1)} canNavigate={app.maxCompletedStep >= 1} />
          <Step number={3} title="Generate Assets" active={app.currentStep === 2} completed={app.currentStep > 2} onClick={() => app.goToStep(2)} canNavigate={app.maxCompletedStep >= 2} />
          <Step number={4} title="Export" active={app.currentStep === 3} completed={app.currentStep > 3} onClick={() => app.goToStep(3)} canNavigate={app.maxCompletedStep >= 3} />
        </nav>

        {/* Step Content */}
        <div className="step-content">
          {app.currentStep === 0 && <ScriptVoiceoverStep />}
          {app.currentStep === 1 && <NicheSelectionStep />}
          {app.currentStep === 2 && app.selectedFlow === 'stock-video' && <StockVideoSelectionStep />}
          {app.currentStep === 2 && app.selectedFlow !== 'stock-video' && <AssetGenerationStep />}
          {app.currentStep === 3 && <VideoGenerationStep />}
        </div>
      </div>
    </main>
  );
}

// Step Indicator Component
function Step({ number, title, active, completed, onClick, canNavigate }: { 
  number: number; 
  title: string; 
  active: boolean; 
  completed: boolean;
  onClick?: () => void;
  canNavigate?: boolean;
}) {
  const handleClick = () => {
    if (canNavigate && onClick && !active) {
      onClick();
    }
  };

  return (
    <div 
      className={`step ${active ? 'step-active' : ''} ${completed ? 'step-completed' : ''} ${canNavigate && !active ? 'step-clickable' : ''}`}
      onClick={handleClick}
      style={{ cursor: canNavigate && !active ? 'pointer' : 'default' }}
    >
      <div className="step-number">{completed ? '✓' : number}</div>
      <div className="step-title">{title}</div>
    </div>
  );
}

// Voice Preview Button Component - plays a short sample of the selected voice
function VoicePreviewButton({ voiceId, voiceService, geminiModel }: { voiceId: string | null | undefined; voiceService: string; geminiModel: string }) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const { error: toastError } = useToast();

  const handlePreview = async () => {
    if (!voiceId) return;
    
    // If we already have a preview for this voice, just play it
    if (previewUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      return;
    }

    setLoading(true);
    try {
      const result = await api.previewVoice({
        voiceService,
        voiceId,
        model: voiceService === 'gemini' ? geminiModel : undefined,
      });
      const fullUrl = 'http://localhost:3001' + result.audioUrl;
      setPreviewUrl(fullUrl);
      
      // Auto-play the preview
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play();
        }
      }, 100);
    } catch (err: any) {
      toastError('Failed to preview voice: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset preview when voice changes
  React.useEffect(() => {
    setPreviewUrl(null);
  }, [voiceId]);

  return (
    <>
      <Button
        onClick={handlePreview}
        disabled={!voiceId || loading}
        isLoading={loading}
        variant="secondary"
        style={{ minWidth: '100px' }}
      >
        {loading ? '...' : 'Preview'}
      </Button>
      {previewUrl && (
        <audio 
          ref={audioRef} 
          src={previewUrl} 
          style={{ display: 'none' }} 
        />
      )}
    </>
  );
}

// Step 1: Script & Voiceover
function ScriptVoiceoverStep() {
  const app = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [voiceService, setVoiceService] = useState('gemini');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash-preview-tts');
  const [voices, setVoices] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    language: '',
    gender: '',
    age: ''
  });
  const [showAIWriter, setShowAIWriter] = useState(false);
  const [isScriptExpanded, setIsScriptExpanded] = useState(false);
  const processLog = useProcessLog();
  const scriptTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Handle script from AI chat - with smooth transition
  const handleUseAIScript = (script: string, wordCount: number) => {
    app.updateState({ script });
    setShowAIWriter(false);
    toastSuccess(`Script loaded! (${wordCount} words) Now select a voice to generate voiceover.`);
    
    // Auto-scroll to script textarea after a short delay
    setTimeout(() => {
      scriptTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scriptTextareaRef.current?.focus();
    }, 100);
  };

  // Handle chat history changes - persist to app state
  const handleChatHistoryChange = (messages: any[]) => {
    app.updateState({ chatHistory: messages });
  };

  // Handle word count changes from chat
  const handleWordCountChange = (count: number) => {
    app.updateState({ scriptWordCount: count });
  };

  React.useEffect(() => {
    // Fetch available voices with filters
    console.log('[Frontend] Fetching voices for service:', voiceService, 'with filters:', filters);
    api.listVoices(voiceService, filters)
      .then((response: any) => {
        console.log('[Frontend] Received response:', response);
        // Handle both response formats: array or { voices: [] }
        if (Array.isArray(response)) {
          console.log('[Frontend] Response is array, length:', response.length);
          setVoices(response);
        } else if (response && response.voices) {
          console.log('[Frontend] Response has voices property, length:', response.voices.length);
          setVoices(response.voices);
        } else {
          console.warn('[Frontend] Unexpected response format:', response);
          setVoices([]);
        }
      })
      .catch((err) => {
        console.error('[Frontend] Error fetching voices:', err);
        setVoices([]);
      });
  }, [voiceService, filters]);

  // Reset voice selection when changing service
  const handleServiceChange = (newService: string) => {
    setVoiceService(newService);
    app.updateState({ voiceId: '' });
  };

  const handleGenerateVoiceover = async () => {
    if (!app.script) return;

    setLoading(true);
    processLog.startProcess();
    
    const initId = processLog.addEntry('Initializing voiceover generation...', 'in-progress');
    
    try {
      // Log steps
      processLog.updateEntry(initId, { status: 'completed', message: 'Initialization complete' });
      
      const scriptId = processLog.addEntry(`Processing script (${app.script.length} characters)...`, 'in-progress');
      await new Promise(r => setTimeout(r, 300)); // Small delay for UX
      processLog.updateEntry(scriptId, { status: 'completed', message: `Script processed (${app.script.length} chars)` });
      
      const voiceId = processLog.addEntry(`Connecting to ${voiceService} API...`, 'in-progress');
      
      const result = await api.generateVoiceover({
        script: app.script,
        voiceService: voiceService as any,
        voiceId: app.voiceId || undefined,
        model: voiceService === 'gemini' ? geminiModel as any : undefined,
      });

      processLog.updateEntry(voiceId, { status: 'completed', message: `Audio generated via ${voiceService}` });
      
      const finalId = processLog.addEntry('Finalizing audio file...', 'in-progress');
      
      const voiceoverUrl = 'http://localhost:3001' + result.audioUrl;
      
      app.updateState({
        voiceoverUrl,
        voiceoverDuration: result.duration,
      });

      processLog.updateEntry(finalId, { 
        status: 'completed', 
        message: `Audio ready (${result.duration.toFixed(1)}s)`,
        details: result.audioUrl
      });
      
      // Auto-transcribe for accurate captions (runs in background)
      const transcribeId = processLog.addEntry('Transcribing audio for captions...', 'in-progress');
      app.updateState({ isTranscribing: true });
      
      try {
        const transcription = await api.transcribeAudio({ audioUrl: result.audioUrl });
        app.updateState({ 
          wordTimestamps: transcription.words,
          isTranscribing: false 
        });
        processLog.updateEntry(transcribeId, { 
          status: 'completed', 
          message: `Transcribed ${transcription.words.length} words for accurate captions`
        });
      } catch (transcribeErr: any) {
        console.warn('Transcription failed, will use estimated timing:', transcribeErr);
        app.updateState({ isTranscribing: false });
        processLog.updateEntry(transcribeId, { 
          status: 'error', 
          message: 'Transcription unavailable, using estimated timing'
        });
      }
      
      processLog.endProcess();
      toastSuccess('Voiceover generated successfully!');
    } catch (err: any) {
      processLog.addEntry(`Error: ${err.message}`, 'error');
      processLog.endProcess();
      toastError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="card-padding">
      <div className="section-header">
        <div className="section-title">
          <h2>Create Your Voiceover</h2>
        </div>
      </div>
      <p className="section-description">
        Write or generate your video script, then select a voice to create an AI voiceover
      </p>

      {/* AI Script Writer Toggle */}
      <div className="ai-writer-section">
        <Button
          variant={showAIWriter ? 'primary' : 'secondary'}
          onClick={() => setShowAIWriter(!showAIWriter)}
          size="sm"
        >
          {showAIWriter ? 'Close AI Writer' : 'Write Script with AI'}
        </Button>
        
        {showAIWriter && (
          <div className="ai-writer-container">
            <ScriptChat
              onUseAsScript={handleUseAIScript}
              initialScript={app.script}
              niche={app.selectedNiche}
              chatHistory={app.chatHistory}
              onChatHistoryChange={handleChatHistoryChange}
              targetWordCount={app.scriptWordCount}
              onWordCountChange={handleWordCountChange}
            />
          </div>
        )}
      </div>

      <div className={`form-group script-form-group ${isScriptExpanded ? 'script-expanded' : ''}`}>
        <div className="form-label-row">
          <label className="form-label">
            Your Script
            {app.script && (
              <span className="label-stats">
                {app.script.split(/\s+/).filter(w => w).length} words · ~{Math.round(app.script.split(/\s+/).filter(w => w).length / 150 * 60)}s
              </span>
            )}
          </label>
          <button
            type="button"
            className="script-expand-btn"
            onClick={() => setIsScriptExpanded(!isScriptExpanded)}
            title={isScriptExpanded ? 'Minimize editor' : 'Expand editor for focused writing'}
          >
            {isScriptExpanded ? '⊖ Minimize' : '⊕ Expand'}
          </button>
        </div>
        <textarea
          ref={scriptTextareaRef}
          placeholder="Enter your video script here or use AI to generate one..."
          value={app.script}
          onChange={(e) => app.updateState({ script: e.target.value })}
          rows={isScriptExpanded ? 20 : 6}
        />
        <p className="form-hint">{app.script.length} characters · {app.script.split(/\s+/).filter(w => w).length} words</p>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Voice Service</label>
          <select
            value={voiceService}
            onChange={(e) => handleServiceChange(e.target.value)}
          >
            <option value="gemini">Gemini TTS (Recommended)</option>
            <option value="gen-ai-pro">Gen AI Pro</option>
            <option value="ai33">ai33.pro (ElevenLabs)</option>
          </select>
        </div>

        {voiceService === 'gemini' && (
          <div className="form-group">
            <label className="form-label">Gemini Model</label>
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
            >
              <option value="gemini-2.5-flash-preview-tts">2.5 Flash (Fast)</option>
              <option value="gemini-2.5-pro-preview-tts">2.5 Pro (Quality)</option>
            </select>
          </div>
        )}
      </div>

      <details className="collapsible-section">
        <summary>Voice Filters (Optional)</summary>
        <div className="filter-grid">
          <div>
            <label className="form-label">Language</label>
            <select
              value={filters.language}
              onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))}
            >
              <option value="">All Languages</option>
              <option value="English">English</option>
              <option value="Vietnamese">Vietnamese</option>
              <option value="Japanese">Japanese</option>
              <option value="Korean">Korean</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
              <option value="German">German</option>
            </select>
          </div>
          <div>
            <label className="form-label">Gender</label>
            <select
              value={filters.gender}
              onChange={(e) => setFilters(prev => ({ ...prev, gender: e.target.value }))}
            >
              <option value="">All</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div>
            <label className="form-label">Age</label>
            <select
              value={filters.age}
              onChange={(e) => setFilters(prev => ({ ...prev, age: e.target.value }))}
            >
              <option value="">All</option>
              <option value="Youth">Youth</option>
              <option value="Young Adult">Young Adult</option>
              <option value="Adult">Adult</option>
              <option value="Middle Aged">Middle Aged</option>
              <option value="Senior">Senior</option>
            </select>
          </div>
        </div>
      </details>

      <div className="form-group">
        <label className="form-label">Select Voice <span className="label-hint">({voices.length} available)</span></label>
        <div className="voice-select-row">
          <select
            value={app.voiceId || ''}
            onChange={(e) => app.updateState({ voiceId: e.target.value })}
          >
            <option value="">Choose a voice...</option>
            {voices.map((voice: any) => (
              <option key={voice.voice_id} value={voice.voice_id}>
                {voice.voice_name} {voice.tag_list?.length > 0 ? `(${voice.tag_list.join(', ')})` : ''}
              </option>
            ))}
          </select>
          <VoicePreviewButton 
            voiceId={app.voiceId} 
            voiceService={voiceService} 
            geminiModel={geminiModel}
          />
        </div>
      </div>

      {/* Process Log */}
      <ProcessLog 
        title="Generation Progress" 
        entries={processLog.entries} 
        isActive={processLog.isActive}
      />

      {/* Audio Preview */}
      {app.voiceoverUrl && (
        <div className="audio-player">
          <div className="audio-player-header">
            <span className="audio-player-title">
              Voiceover Ready
            </span>
            <DownloadButton 
              url={app.voiceoverUrl}
              filename="voiceover.mp3"
              label="Download"
              variant="text"
              size="sm"
            />
          </div>
          <audio controls src={app.voiceoverUrl} />
          <p className="audio-duration">Duration: {app.voiceoverDuration?.toFixed(1)}s</p>
        </div>
      )}

      {/* Actions */}
      <div className="actions-bar">
        <Button
          onClick={handleGenerateVoiceover}
          disabled={!app.script || !app.voiceId}
          isLoading={loading}
        >
          {loading ? 'Generating...' : app.voiceoverUrl ? 'Regenerate' : 'Generate Voiceover'}
        </Button>
        <div className="actions-bar-spacer" />
        {app.voiceoverUrl && (
          <Button onClick={app.nextStep} variant="primary">
            Continue →
          </Button>
        )}
      </div>
    </Card>
  );
}

// Step 2: Niche Selection
function NicheSelectionStep() {
  const app = useApp();

  const handleSelectNiche = (niche: string) => {
    app.updateState({ selectedNiche: niche as any });
  };

  const handleSelectFlow = (flow: 'single-image' | 'multi-image' | 'stock-video') => {
    app.updateState({ selectedFlow: flow });
    app.nextStep();
  };

  const niches = [
    { id: 'motivational', label: 'Motivational' },
    { id: 'educational', label: 'Educational' },
    { id: 'entertainment', label: 'Entertainment' },
    { id: 'news', label: 'News' },
    { id: 'gaming', label: 'Gaming' },
    { id: 'lifestyle', label: 'Lifestyle' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
      <Card className="card-padding">
        <div className="section-header">
          <div className="section-title">
            <h2>Select Your Niche</h2>
          </div>
          {app.selectedNiche && (
            <span className="section-badge">Selected: {app.selectedNiche}</span>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)', fontSize: '0.9375rem' }}>
          Choose a content category to optimize AI-generated visuals for your video style
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--spacing-sm)' }}>
          {niches.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleSelectNiche(id)}
              style={{
                padding: 'var(--spacing-md)',
                background: app.selectedNiche === id ? 'var(--primary)' : 'var(--bg-tertiary)',
                border: `1px solid ${app.selectedNiche === id ? 'var(--primary)' : 'var(--glass-border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: app.selectedNiche === id ? 'white' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      {app.selectedNiche && (
        <Card className="card-padding">
          <div className="section-header">
            <div className="section-title">
              <h2>Choose Content Type</h2>
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)', fontSize: '0.9375rem' }}>
            Select how you want to create visuals for your video
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-md)' }}>
            <FlowCard
              title="Single Image"
              description="Generate one AI image that loops throughout the video"
              onClick={() => handleSelectFlow('single-image')}
            />
            <FlowCard
              title="Multiple Images"
              description="Generate multiple AI images for dynamic scene transitions"
              onClick={() => handleSelectFlow('multi-image')}
            />
            <FlowCard
              title="Stock Videos"
              description="Use professional stock footage from Pexels"
              onClick={() => handleSelectFlow('stock-video')}
            />
          </div>
        </Card>
      )}

      <div className="actions-bar" style={{ borderTop: 'none', marginTop: 0 }}>
        <Button variant="secondary" onClick={app.prevStep}>
          ← Back
        </Button>
      </div>
    </div>
  );
}

function FlowCard({ title, description, onClick }: any) {
  return (
    <Card className="flow-card card-padding" onClick={onClick}>
      <h3 style={{ marginBottom: '6px', fontSize: '1rem' }}>{title}</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', margin: 0 }}>{description}</p>
    </Card>
  );
}

// Step 3: Asset Generation (simplified combined version)
function AssetGenerationStep() {
  const app = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const [imageService, setImageService] = useState('gemini');
  const [imageModel, setImageModel] = useState('imagen-4.0-fast-generate-001');
  const [llmProvider, setLlmProvider] = useState('gemini');
  const [llmModel, setLlmModel] = useState('gemini-2.5-flash');
  const aspectRatio = app.aspectRatio;
  const [loading, setLoading] = useState(false);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [refiningIndex, setRefiningIndex] = useState<number | null>(null);
  const [brainDumpText, setBrainDumpText] = useState('');
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  // Refine prompt modal state
  const [refineModalIndex, setRefineModalIndex] = useState<number | null>(null);
  const [refineModalInput, setRefineModalInput] = useState('');
  // Service availability based on API keys
  const [serviceStatus, setServiceStatus] = useState<{ openrouter: boolean; gemini: boolean; available: string[] } | null>(null);
  const processLog = useProcessLog();
  
  const sortedImages = React.useMemo(() => {
    return [...app.generatedImages].sort((a: any, b: any) => (a.promptIndex ?? 0) - (b.promptIndex ?? 0));
  }, [app.generatedImages]);
  const hasImages = sortedImages.length > 0;
  const toAssetUrl = (url: string) => (url.startsWith('http') ? url : `http://localhost:3001${url}`);

  // Prepare download files for zip
  const downloadFiles = React.useMemo(() => {
    return sortedImages.map((img: any, index: number) => ({
      url: toAssetUrl(img.imageUrl),
      filename: `image-${String(index + 1).padStart(2, '0')}.png`
    }));
  }, [sortedImages]);

  React.useEffect(() => {
    api.listImageModels(imageService).then((data: any) => {
      if (data && data.models) {
        setModels(data.models);
        if (data.models.length > 0 && !models.length) {
          setImageModel(data.models[0].id);
        }
      }
    }).catch(console.error);
  }, [imageService]);

  // Check which image services have API keys configured
  React.useEffect(() => {
    api.getImageServiceStatus().then(setServiceStatus).catch(console.error);
  }, []);

  // Auto-select first available service if current is unavailable
  React.useEffect(() => {
    if (serviceStatus && serviceStatus.available.length > 0) {
      if (!serviceStatus.available.includes(imageService)) {
        setImageService(serviceStatus.available[0]);
      }
    }
  }, [serviceStatus, imageService]);

  // Sync prompts with app context
  React.useEffect(() => {
    // Initialize prompts from app context when component mounts or app prompts change
    if (app.imagePrompts.length > 0 && prompts.length === 0) {
      setPrompts(app.imagePrompts);
    }
  }, [app.imagePrompts]);

  // Track previous flow to detect changes
  const prevFlowRef = React.useRef(app.selectedFlow);
  React.useEffect(() => {
    if (prevFlowRef.current !== app.selectedFlow) {
      // Reset prompts and images when switching flows
      setPrompts([]);
      app.updateState({ imagePrompts: [], generatedImages: [] });
      prevFlowRef.current = app.selectedFlow;
    }
  }, [app.selectedFlow]);

  const handlePromptChange = (index: number, value: string) => {
    const updated = prompts.map((prompt, idx) =>
      idx === index ? { ...prompt, prompt: value } : prompt
    );
    setPrompts(updated);
    app.updateState({ imagePrompts: updated });
  };

  const handleRefinePrompt = async (index: number, userIdeas?: string) => {
    const currentPrompt = prompts[index]?.prompt;
    if (!currentPrompt) return;

    setRefiningIndex(index);
    try {
      // Combine current prompt with user ideas if provided
      const promptToRefine = userIdeas 
        ? `${currentPrompt}\n\nUser wants to add/modify: ${userIdeas}`
        : currentPrompt;
        
      const result = await api.refineImagePrompt({
        prompt: promptToRefine,
        scriptContext: app.script,
        niche: app.selectedNiche || undefined,
        model: llmModel as any
      });
      
      handlePromptChange(index, result.refinedPrompt);
      toastSuccess('Prompt refined with AI!');
    } catch (err: any) {
      toastError('Failed to refine prompt: ' + err.message);
    } finally {
      setRefiningIndex(null);
    }
  };

  // Open refine modal for a prompt
  const openRefineModal = (index: number) => {
    setRefineModalIndex(index);
    setRefineModalInput('');
  };

  // Execute refine from modal
  const executeRefineFromModal = async () => {
    if (refineModalIndex === null) return;
    setRefineModalIndex(null);
    await handleRefinePrompt(refineModalIndex, refineModalInput.trim() || undefined);
    setRefineModalInput('');
  };

  const handleBrainDumpToPrompt = async () => {
    if (!brainDumpText.trim()) {
      toastError('Please enter your ideas first');
      return;
    }

    setLoading(true);
    try {
      const result = await api.refineImagePrompt({
        prompt: brainDumpText,
        scriptContext: app.script,
        niche: app.selectedNiche || undefined,
        model: llmModel as any
      });
      
      // Add as a new prompt or update the first one if single-image
      if (app.selectedFlow === 'single-image') {
        const newPrompts = [{ id: 'scene-1', prompt: result.refinedPrompt, sceneDescription: 'Generated from brain dump' }];
        setPrompts(newPrompts);
        app.updateState({ imagePrompts: newPrompts });
      } else {
        const newPrompt = { 
          id: `scene-${prompts.length + 1}`, 
          prompt: result.refinedPrompt, 
          sceneDescription: 'Generated from brain dump' 
        };
        const updated = [...prompts, newPrompt];
        setPrompts(updated);
        app.updateState({ imagePrompts: updated });
      }
      
      setBrainDumpText('');
      setShowBrainDump(false);
      toastSuccess('Prompt created from your ideas!');
    } catch (err: any) {
      toastError('Failed to create prompt: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePrompts = async () => {
    if (!app.script) return;
    setLoading(true);
    processLog.startProcess();
    
    const initId = processLog.addEntry('Analyzing script content...', 'in-progress');
    
    try {
      await new Promise(r => setTimeout(r, 200));
      processLog.updateEntry(initId, { status: 'completed', message: 'Script analysis complete' });
      
      const llmId = processLog.addEntry(`Generating prompts via ${llmProvider}...`, 'in-progress');
      
      const promptRes = await api.generateImagePrompts({
        script: app.script,
        niche: app.selectedNiche!,
        count: app.selectedFlow === 'multi-image' ? app.imageCount : 1,
        provider: llmProvider as any,
        model: llmProvider === 'gemini' ? llmModel as any : undefined,
      });

      processLog.updateEntry(llmId, { 
        status: 'completed', 
        message: `Generated ${promptRes.prompts.length} image prompts` 
      });
      
      setPrompts(promptRes.prompts);
      app.updateState({ imagePrompts: promptRes.prompts });
      processLog.endProcess();
      toastSuccess(`Generated ${promptRes.prompts.length} prompts!`);
    } catch (err: any) {
      processLog.addEntry(`Error: ${err.message}`, 'error');
      processLog.endProcess();
      toastError('Error generating prompts: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImages = async () => {
    setLoading(true);
    processLog.startProcess();
    
    try {
      const currentPrompts = prompts.length > 0 ? prompts : app.imagePrompts;

      if (currentPrompts.length === 0) {
        throw new Error('No prompts available');
      }

      const prepId = processLog.addEntry('Preparing image generation...', 'in-progress');
      await new Promise(r => setTimeout(r, 200));
      processLog.updateEntry(prepId, { status: 'completed', message: 'Preparation complete' });

      if (app.selectedFlow === 'single-image') {
        const genId = processLog.addEntry(`Generating image via ${imageService}...`, 'in-progress', imageModel);
        
        const result = await api.generateImage({
          prompt: currentPrompts[0].prompt,
          service: imageService as any,
          model: imageModel as any,
          aspectRatio: aspectRatio as any,
        });
        
        processLog.updateEntry(genId, { status: 'completed', message: 'Image generated successfully' });
        app.updateState({ generatedImages: [result], imagePrompts: currentPrompts });
      } else {
        const batchId = processLog.addEntry(`Generating ${currentPrompts.length} images...`, 'in-progress', `Using ${imageModel}`);
        
        const results = await api.generateBatchImages({
          prompts: currentPrompts.map(p => p.prompt),
          service: imageService as any,
          model: imageModel as any,
          aspectRatio: aspectRatio as any,
        });
        
        processLog.updateEntry(batchId, { status: 'completed', message: `Generated ${results.length} images` });
        app.updateState({ generatedImages: results, imagePrompts: currentPrompts });
      }
      
      processLog.endProcess();
      toastSuccess('Images generated successfully!');
    } catch (err: any) {
      processLog.addEntry(`Error: ${err.message}`, 'error');
      processLog.endProcess();
      toastError('Error generating images: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateImage = async (index: number) => {
    const promptEntry = (prompts.length > 0 ? prompts : app.imagePrompts)[index];
    if (!promptEntry) return;
    setRegeneratingIndex(index);
    try {
      const result = await api.generateImage({
        prompt: promptEntry.prompt,
        service: imageService as any,
        model: imageModel as any,
        aspectRatio: aspectRatio as any,
      });
      const updated = [...app.generatedImages];
      updated[index] = { ...result, promptIndex: index };
      app.updateState({ generatedImages: updated });
    } catch (err: any) {
      toastError('Error regenerating image: ' + err.message);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  return (
    <Card className="card-padding">
      <div className="section-header">
        <div className="section-title">
          <h2>Generate {app.selectedFlow === 'single-image' ? 'Image' : 'Images'}</h2>
          {hasImages && <span className="section-badge">{sortedImages.length} generated</span>}
        </div>
      </div>

      {/* Model Configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Image Provider</label>
          <select
            value={imageService}
            onChange={(e) => setImageService(e.target.value)}
          >
            <option value="gemini" disabled={serviceStatus ? !serviceStatus.gemini : false}>
              Gemini Imagen {serviceStatus && !serviceStatus.gemini ? '(No API Key)' : '(Free)'}
            </option>
            <option value="openrouter" disabled={serviceStatus ? !serviceStatus.openrouter : false}>
              OpenRouter {serviceStatus && !serviceStatus.openrouter ? '(No API Key)' : '(FLUX, DALL-E)'}
            </option>
          </select>
          {serviceStatus && serviceStatus.available.length === 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--error)', marginTop: '4px', display: 'block' }}>
              No API keys configured. Check backend .env file.
            </span>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Model</label>
          <select
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            disabled={models.length === 0}
          >
            {models.length === 0 ? (
              <option>No models available</option>
            ) : (
              models.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))
            )}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Aspect Ratio</label>
          <select
            value={app.aspectRatio}
            onChange={(e) => app.updateState({ aspectRatio: e.target.value as any })}
          >
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (Portrait)</option>
            <option value="1:1">1:1 (Square)</option>
          </select>
        </div>

        {app.selectedFlow === 'multi-image' && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Number of Images: {app.imageCount}</label>
            <input
              type="range"
              min="5"
              max="30"
              value={app.imageCount}
              onChange={(e) => app.updateState({ imageCount: parseInt(e.target.value) })}
            />
          </div>
        )}
      </div>

      {/* LLM Config (collapsible) */}
      <details style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
          Prompt Generation Settings
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
          <div>
            <label className="form-label">LLM Provider</label>
            <select
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
            >
              <option value="gemini">Gemini (Free)</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
          {llmProvider === 'gemini' && (
            <div>
              <label className="form-label">Model</label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
              >
                <option value="gemini-2.5-flash">2.5 Flash (Fast)</option>
                <option value="gemini-2.5-pro">2.5 Pro (Better)</option>
              </select>
            </div>
          )}
        </div>
      </details>

      {/* Process Log */}
      <ProcessLog 
        title="Generation Progress" 
        entries={processLog.entries} 
        isActive={processLog.isActive}
      />

      {/* Brain Dump / Quick Prompt Generator */}
      <div style={{ marginBottom: 'var(--spacing-md)' }}>
        <Button
          variant={showBrainDump ? 'primary' : 'secondary'}
          onClick={() => setShowBrainDump(!showBrainDump)}
          size="sm"
        >
          {showBrainDump ? 'Close' : 'Brain Dump to AI Prompt'}
        </Button>
        
        {showBrainDump && (
          <div style={{ 
            marginTop: 'var(--spacing-sm)', 
            padding: 'var(--spacing-md)', 
            background: 'var(--bg-tertiary)', 
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--glass-border)'
          }}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
              Dump your rough ideas here and AI will create a polished image prompt
            </p>
            <textarea
              value={brainDumpText}
              onChange={(e) => setBrainDumpText(e.target.value)}
              placeholder="e.g., dark forest, mysterious, some fog, maybe a person walking, moody lighting..."
              rows={3}
              style={{ width: '100%', fontSize: '0.8125rem', marginBottom: 'var(--spacing-sm)' }}
            />
            <Button onClick={handleBrainDumpToPrompt} isLoading={loading} size="sm">
              Generate Prompt
            </Button>
          </div>
        )}
      </div>

      {/* Prompts Section */}
      {prompts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
            Generate AI prompts based on your script, or use Brain Dump above
          </p>
          <Button onClick={handleGeneratePrompts} isLoading={loading}>
            Generate Prompts from Script
          </Button>
        </div>
      ) : (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <div className="section-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div className="section-title">
              <h3 style={{ fontSize: '0.9375rem' }}>Generated Prompts</h3>
              <span className="section-badge">{prompts.length} prompts</span>
            </div>
            {/* Show timing info for multi-image */}
            {app.selectedFlow === 'multi-image' && app.voiceoverDuration && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                ~{Math.round(app.voiceoverDuration / prompts.length)}s each · {Math.round(app.voiceoverDuration)}s total
              </span>
            )}
          </div>
          <div style={{ maxHeight: '350px', overflow: 'auto', marginBottom: 'var(--spacing-md)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
            {prompts.map((p, i) => {
              // Calculate estimated timing for this scene
              const sceneDuration = app.selectedFlow === 'multi-image' && app.voiceoverDuration 
                ? Math.round(app.voiceoverDuration / prompts.length) 
                : null;
              const sceneStart = sceneDuration ? i * sceneDuration : null;
              
              return (
              <div key={i} style={{ padding: 'var(--spacing-sm)', borderBottom: i < prompts.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                    <span style={{ 
                      fontSize: '0.6875rem', 
                      fontWeight: '600', 
                      color: 'var(--primary)',
                      background: 'var(--bg-secondary)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-xs)'
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                      {p.sceneDescription || 'Scene description'}
                    </span>
                    {sceneDuration && (
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        ({sceneStart}s - {sceneStart! + sceneDuration}s)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => openRefineModal(i)}
                    disabled={refiningIndex === i}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.6875rem',
                      background: refiningIndex === i ? 'var(--bg-secondary)' : 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      cursor: refiningIndex === i ? 'wait' : 'pointer',
                      opacity: refiningIndex === i ? 0.7 : 1
                    }}
                  >
                    {refiningIndex === i ? '...' : 'AI Refine'}
                  </button>
                </div>
                <textarea
                  value={p.prompt}
                  onChange={(e) => handlePromptChange(i, e.target.value)}
                  rows={3}
                  style={{ width: '100%', fontSize: '0.8125rem' }}
                />
              </div>
            );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <Button onClick={handleGenerateImages} isLoading={loading}>
              {loading ? 'Generating Images...' : 'Generate All Images'}
            </Button>
            <Button variant="secondary" onClick={handleGeneratePrompts} isLoading={loading}>
              Regenerate Prompts
            </Button>
          </div>
        </div>
      )}

      {/* Generated Images */}
      {hasImages && (
        <div className="asset-preview-section">
          <div className="asset-preview-header">
            <span className="asset-preview-title">
              Generated Images ({sortedImages.length})
            </span>
            <div className="asset-preview-actions">
              <DownloadAllButton 
                files={downloadFiles}
                zipFilename="generated-images.zip"
                label="Download All"
                size="sm"
              />
            </div>
          </div>
          <div className="image-grid">
            {sortedImages.map((img: any, index: number) => {
              const promptIndex = img.promptIndex ?? index;
              const promptEntry = (prompts.length > 0 ? prompts : app.imagePrompts)[promptIndex];
              const promptText = promptEntry?.prompt || '—';
              const assetUrl = toAssetUrl(img.imageUrl);
              return (
                <div key={img.imageId || `${promptIndex}-${index}`} className="image-grid-item">
                  <div className="image-grid-item-media">
                    <img src={assetUrl} alt={`Scene ${promptIndex + 1}`} />
                  </div>
                  <div className="image-grid-item-overlay">
                    <div className="image-grid-item-actions">
                      <DownloadButton 
                        url={assetUrl}
                        filename={`image-${promptIndex + 1}.png`}
                        label="Save"
                        variant="primary"
                        size="sm"
                        icon={false}
                      />
                      <button
                        onClick={() => setEditingImageIndex(promptIndex)}
                        style={{ 
                          flex: 1, 
                          padding: '6px 8px', 
                          fontSize: '0.75rem', 
                          background: 'var(--primary)', 
                          border: 'none', 
                          borderRadius: 'var(--radius-xs)', 
                          cursor: 'pointer',
                          color: 'white'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleRegenerateImage(promptIndex)}
                        disabled={regeneratingIndex === promptIndex}
                        style={{ 
                          flex: 1, 
                          padding: '6px 8px', 
                          fontSize: '0.75rem', 
                          background: 'var(--bg-tertiary)', 
                          border: '1px solid var(--glass-border)', 
                          borderRadius: 'var(--radius-xs)', 
                          cursor: 'pointer',
                          color: 'var(--text-primary)'
                        }}
                      >
                        {regeneratingIndex === promptIndex ? '...' : 'Redo'}
                      </button>
                    </div>
                  </div>
                  <div className="image-grid-item-info">
                    <span className="image-grid-item-label">Scene {promptIndex + 1}</span>
                    <p className="image-grid-item-prompt">{promptText}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Image Edit Modal */}
      {(() => {
        // Find the image by promptIndex, not array index
        const editingImage = editingImageIndex !== null 
          ? sortedImages.find((img: any) => (img.promptIndex ?? 0) === editingImageIndex)
          : null;
        
        if (!editingImage || editingImageIndex === null) return null;
        
        return (
          <ImageEditModal
            imageUrl={editingImage.imageUrl}
            imageIndex={editingImageIndex}
            onClose={() => setEditingImageIndex(null)}
            onSave={(newImageUrl, newImageId) => {
              // Update the image in the state
              const updated = [...app.generatedImages];
              const actualIndex = updated.findIndex(img => 
                (img.promptIndex ?? 0) === editingImageIndex
              );
              if (actualIndex !== -1) {
                updated[actualIndex] = {
                  ...updated[actualIndex],
                  imageUrl: newImageUrl,
                  imageId: newImageId
                };
                app.updateState({ generatedImages: updated });
                toastSuccess('Image updated successfully!');
              }
              setEditingImageIndex(null);
            }}
          />
        );
      })()}

      {/* Refine Prompt Modal */}
      {refineModalIndex !== null && (
        <div 
          className="refine-modal-overlay"
          onClick={() => setRefineModalIndex(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--spacing-md)'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-lg)',
              maxWidth: '500px',
              width: '100%',
              border: '1px solid var(--glass-border)'
            }}
          >
            <h3 style={{ margin: '0 0 var(--spacing-sm) 0', fontSize: '1rem' }}>
              Refine Prompt #{refineModalIndex + 1}
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
              Add your ideas or leave empty for automatic AI refinement
            </p>
            
            {/* Current prompt preview */}
            <div style={{ 
              padding: 'var(--spacing-sm)', 
              background: 'var(--bg-tertiary)', 
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--spacing-md)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              maxHeight: '80px',
              overflow: 'auto'
            }}>
              <strong>Current:</strong> {prompts[refineModalIndex]?.prompt?.substring(0, 200)}...
            </div>
            
            <textarea
              value={refineModalInput}
              onChange={(e) => setRefineModalInput(e.target.value)}
              placeholder="e.g., 'make it more dramatic', 'add golden hour lighting', 'include a person in silhouette'..."
              rows={4}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm)',
                fontSize: '0.875rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                resize: 'none',
                marginBottom: 'var(--spacing-md)'
              }}
              autoFocus
            />
            
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setRefineModalIndex(null)}>
                Cancel
              </Button>
              <Button onClick={executeRefineFromModal}>
                {refineModalInput.trim() ? 'Refine with Ideas' : 'Auto Refine'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="actions-bar">
        <Button variant="secondary" onClick={app.prevStep}>
          ← Back
        </Button>
        <div className="actions-bar-spacer" />
        <Button onClick={app.nextStep} disabled={!hasImages}>
          Continue to Final Step →
        </Button>
      </div>
    </Card>
  );
}

// Step 3b: Stock Video Selection - Simple grid with swap modal
function StockVideoSelectionStep() {
  const app = useApp();
  const { error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<StockVideoProvider>('both');
  const [slots, setSlots] = useState<StockVideoSlot[]>(app.stockVideoSlots || []);
  const [swapModalSlotId, setSwapModalSlotId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockVideoAsset[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [timingPreview, setTimingPreview] = useState<any>(null);
  const orientation = app.stockOrientation;
  const videoCount = app.stockVideoCount;

  // Load timing preview when slots change
  useEffect(() => {
    if (slots.length > 0 && app.voiceoverDuration) {
      loadTimingPreview();
    }
  }, [slots.length, app.voiceoverDuration]);

  const loadTimingPreview = async () => {
    if (slots.length === 0 || !app.voiceoverDuration) return;
    
    try {
      const result = await api.getTimingPreview({
        videos: slots.map(slot => ({
          id: slot.id,
          duration: slot.video?.duration
        })),
        audioDuration: app.voiceoverDuration
      });
      setTimingPreview(result);
    } catch (err) {
      console.error('Failed to load timing preview:', err);
    }
  };

  const syncSlots = useCallback((updater: (prev: StockVideoSlot[]) => StockVideoSlot[]) => {
    setSlots((prev) => {
      const next = updater(prev);
      app.updateState({
        stockVideoSlots: next,
        selectedVideos: next.map((slot) => ({ ...slot.video, slotId: slot.id }))
      });
      return next;
    });
  }, [app]);

  useEffect(() => {
    if (app.stockVideoSlots.length > 0 && slots.length === 0) {
      setSlots(app.stockVideoSlots);
    }
  }, [app.stockVideoSlots, slots.length]);

  const swapModalSlot = useMemo(
    () => slots.find((slot) => slot.id === swapModalSlotId) || null,
    [slots, swapModalSlotId]
  );

  const handleVideoCountChange = (value: number) => {
    const nextCount = Math.max(3, Math.min(30, value));
    app.updateState({ stockVideoCount: nextCount });
  };

  const handleFetchVideos = async () => {
    if (!app.script.trim()) {
      toastError('Please add a script before fetching stock videos.');
      return;
    }
    if (!app.selectedNiche) {
      toastError('Select a niche before fetching stock footage.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.analyzeForStockVideos({
        script: app.script,
        niche: app.selectedNiche,
        provider,
        videoCount,
        orientation,
        alternativesPerSlot: 6
      });

      setSlots(result.slots);
      app.updateState({
        stockVideoSlots: result.slots,
        selectedVideos: result.slots.map((slot) => ({ ...slot.video, slotId: slot.id }))
      });
    } catch (err: any) {
      toastError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openSwapModal = (slotId: string) => {
    const slot = slots.find((s) => s.id === slotId);
    if (slot) {
      setSearchQuery(slot.keywords.join(' '));
      setSearchResults([]);
    }
    setSwapModalSlotId(slotId);
  };

  const closeSwapModal = () => {
    setSwapModalSlotId(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSwapVideo = (slotId: string, newVideo: StockVideoAsset) => {
    syncSlots((prev) => prev.map((slot) => {
      if (slot.id !== slotId) return slot;
      // Move current video to alternatives if not already there
      const currentVideo = slot.video;
      const existingAlts = slot.alternatives.filter((v) => v.id !== newVideo.id);
      const newAlternatives = existingAlts.some((v) => v.id === currentVideo.id)
        ? existingAlts
        : [currentVideo, ...existingAlts];
      return {
        ...slot,
        video: newVideo,
        alternatives: newAlternatives.slice(0, 10)
      };
    }));
    closeSwapModal();
  };

  const handleSearchLibrary = async () => {
    if (!searchQuery.trim()) {
      toastError('Enter a search query.');
      return;
    }
    setSearchLoading(true);
    try {
      const response = await api.searchStockVideos({
        query: searchQuery.trim(),
        provider,
        perPage: 12,
        orientation: orientation === 'any' ? undefined : orientation
      });
      setSearchResults(response.videos);
      if (response.videos.length === 0) {
        toastError('No videos found. Try different keywords.');
      }
    } catch (err: any) {
      toastError('Search failed: ' + err.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleContinue = () => {
    if (slots.length === 0) {
      toastError('Generate stock videos first.');
      return;
    }
    app.updateState({
      stockVideoSlots: slots,
      selectedVideos: slots.map((slot) => ({ ...slot.video, slotId: slot.id }))
    });
    app.nextStep();
  };

  const orientationOptions: Array<{ value: 'any' | StockVideoOrientation; label: string }> = [
    { value: 'landscape', label: 'Landscape (16:9)' },
    { value: 'portrait', label: 'Portrait (9:16)' },
    { value: 'square', label: 'Square (1:1)' },
    { value: 'any', label: 'Any Orientation' }
  ];

  return (
    <Card className="card-padding">
      <h2>Select Stock Videos</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
        Choose how many videos you need, then click each video to swap it with alternatives or search for something else.
      </p>

      {/* Configuration */}
      <div className="stock-config-row">
        <div className="stock-config-item">
          <label>
            <span>Number of Videos</span>
            <span className="stock-config-value">{videoCount}</span>
          </label>
          <input
            type="range"
            min={3}
            max={30}
            value={videoCount}
            onChange={(e) => handleVideoCountChange(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="stock-config-item">
          <label>Orientation</label>
          <select
            value={orientation}
            onChange={(e) => app.updateState({ stockOrientation: e.target.value as 'any' | StockVideoOrientation })}
          >
            {orientationOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="stock-config-item">
          <label>Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as StockVideoProvider)}
          >
            <option value="both">All Providers</option>
            <option value="pexels">Pexels</option>
            <option value="storyblocks">Storyblocks (Mock)</option>
          </select>
        </div>

        <Button onClick={handleFetchVideos} isLoading={loading}>
          {slots.length > 0 ? 'Regenerate Videos' : 'Find Videos'}
        </Button>
      </div>

      {/* Video Grid */}
      {slots.length === 0 ? (
        <div className="stock-empty-state">
          <p>Click "Find Videos" to analyze your script and fetch stock footage suggestions.</p>
        </div>
      ) : (
        <>
          {/* Timing Preview */}
          {timingPreview && (
            <div style={{ 
              marginBottom: 'var(--spacing-md)', 
              padding: 'var(--spacing-sm) var(--spacing-md)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--glass-border)'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 'var(--spacing-xs)'
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Smart Timing Preview
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Total: {timingPreview.totalDuration.toFixed(1)}s · ~{timingPreview.averageDurationPerVideo.toFixed(1)}s per video
                </span>
              </div>
              <div style={{ display: 'flex', gap: '2px', height: '24px' }}>
                {timingPreview.timingPreview.map((timing: any, idx: number) => (
                  <div
                    key={timing.videoId}
                    style={{
                      flex: timing.targetDuration,
                      background: timing.needsLoop ? 'var(--warning)' : timing.needsTrim ? 'var(--primary)' : 'var(--success)',
                      borderRadius: 'var(--radius-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.625rem',
                      color: 'white',
                      overflow: 'hidden'
                    }}
                    title={`Video ${idx + 1}: ${timing.targetDuration.toFixed(1)}s${timing.needsLoop ? ' (will loop)' : ''}${timing.needsTrim ? ' (will trim)' : ''}`}
                  >
                    {timing.targetDuration.toFixed(1)}s
                  </div>
                ))}
              </div>
              <div style={{ 
                display: 'flex', 
                gap: 'var(--spacing-md)', 
                marginTop: 'var(--spacing-xs)',
                fontSize: '0.625rem',
                color: 'var(--text-tertiary)'
              }}>
                <span><span style={{ color: 'var(--success)' }}>•</span> Fits exactly</span>
                <span><span style={{ color: 'var(--warning)' }}>•</span> Will loop</span>
                <span><span style={{ color: 'var(--primary)' }}>•</span> Will trim</span>
              </div>
            </div>
          )}

          {/* Download All Videos Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-md)' }}>
            <DownloadAllButton
              files={slots.map((slot, index) => ({
                url: slot.video.url,
                filename: `stock-video-${String(index + 1).padStart(2, '0')}.mp4`
              }))}
              zipFilename="stock-videos.zip"
              label={`Download All Videos (${slots.length})`}
              size="sm"
              variant="secondary"
            />
          </div>
          
          <div className="stock-slots-grid">
            {slots.map((slot, index) => {
              const timing = timingPreview?.timingPreview?.[index];
              return (
              <div key={slot.id} className="stock-slot-card">
                <div className="stock-slot-number">{index + 1}</div>
                <div className="stock-slot-media">
                  <video
                    src={slot.video.url}
                    poster={slot.video.thumbnailUrl}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                  <span className="stock-slot-duration">{formatDuration(slot.video.duration)}</span>
                  {timing && (
                    <span style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '4px',
                      background: timing.needsLoop ? 'var(--warning)' : timing.needsTrim ? 'var(--primary)' : 'var(--success)',
                      color: 'white',
                      fontSize: '0.625rem',
                      padding: '2px 4px',
                      borderRadius: 'var(--radius-xs)'
                    }}>
                      → {timing.targetDuration.toFixed(1)}s
                    </span>
                  )}
                </div>
                <div className="stock-slot-info">
                  <p className="stock-slot-title">{slot.video.title}</p>
                  <span className="stock-slot-provider">{slot.video.provider.toUpperCase()}</span>
                </div>
                <div className="stock-slot-actions">
                  <button
                    type="button"
                    className="stock-slot-swap-btn"
                    onClick={() => openSwapModal(slot.id)}
                  >
                    Swap
                  </button>
                  <DownloadButton
                    url={slot.video.url}
                    filename={`stock-video-${String(index + 1).padStart(2, '0')}.mp4`}
                    label=""
                    variant="secondary"
                    size="sm"
                    icon={true}
                  />
                </div>
              </div>
            );
            })}
          </div>
        </>
      )}

      {/* Swap Modal */}
      {swapModalSlot && (
        <div className="stock-modal-overlay" onClick={closeSwapModal}>
          <div className="stock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stock-modal-header">
              <h3>Swap Video</h3>
              <button type="button" className="stock-modal-close" onClick={closeSwapModal}>×</button>
            </div>

            <div className="stock-modal-body">
              {/* Current Video */}
              <div className="stock-modal-current">
                <span className="stock-modal-label">Current</span>
                <div className="stock-modal-current-video">
                  <video
                    src={swapModalSlot.video.url}
                    poster={swapModalSlot.video.thumbnailUrl}
                    muted
                    loop
                    playsInline
                    autoPlay
                  />
                  <div className="stock-modal-current-info">
                    <p>{swapModalSlot.video.title}</p>
                    <span>{swapModalSlot.video.provider.toUpperCase()} · {formatDuration(swapModalSlot.video.duration)}</span>
                  </div>
                </div>
              </div>

              {/* Alternatives */}
              {swapModalSlot.alternatives.length > 0 && (
                <div className="stock-modal-section">
                  <span className="stock-modal-label">Other Options</span>
                  <div className="stock-modal-grid">
                    {swapModalSlot.alternatives.map((video) => (
                      <div
                        key={video.id}
                        className="stock-modal-option"
                        onClick={() => handleSwapVideo(swapModalSlot.id, video)}
                      >
                        <video
                          src={video.url}
                          poster={video.thumbnailUrl}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                        <div className="stock-modal-option-info">
                          <p>{video.title}</p>
                          <span>{formatDuration(video.duration)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="stock-modal-section">
                <span className="stock-modal-label">Search for something else</span>
                <div className="stock-modal-search">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. sunset beach waves"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchLibrary()}
                  />
                  <Button onClick={handleSearchLibrary} isLoading={searchLoading} size="sm">
                    Search
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="stock-modal-grid">
                    {searchResults.map((video) => (
                      <div
                        key={video.id}
                        className="stock-modal-option"
                        onClick={() => handleSwapVideo(swapModalSlot.id, video)}
                      >
                        <video
                          src={video.url}
                          poster={video.thumbnailUrl}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          onMouseEnter={(e) => e.currentTarget.play()}
                          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                        <div className="stock-modal-option-info">
                          <p>{video.title}</p>
                          <span>{video.provider.toUpperCase()} · {formatDuration(video.duration)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="stock-footer">
        <Button variant="secondary" onClick={app.prevStep}>
          ← Back
        </Button>
        <Button onClick={handleContinue} disabled={slots.length === 0}>
          Continue to Final Step
        </Button>
      </div>
    </Card>
  );
}

function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds || Number.isNaN(totalSeconds)) {
    return '0:00';
  }
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

// Video quality options
const VIDEO_QUALITY_OPTIONS = [
  { value: 'draft', label: 'Draft (480p)', description: 'Fast preview' },
  { value: 'standard', label: 'Standard (720p)', description: 'Good balance' },
  { value: 'high', label: 'High (1080p)', description: 'YouTube quality' },
  { value: 'ultra', label: 'Ultra (1080p HQ)', description: 'Best quality' }
];

// Motion effect options for static images
const MOTION_EFFECT_OPTIONS: MotionEffectOption[] = [
  { id: 'none', label: 'None', description: 'Static image' },
  { id: 'zoom-in', label: 'Slow Zoom In', description: 'Ken Burns style zoom' },
  { id: 'zoom-out', label: 'Slow Zoom Out', description: 'Reveal effect' },
  { id: 'pan', label: 'Gentle Pan', description: 'Horizontal drift' },
  { id: 'float', label: 'Subtle Float', description: 'Breathing effect' }
];

// Step 4: Video Generation
function VideoGenerationStep() {
  const app = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const { addToQueue, queue } = useQueue();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submittedToQueue, setSubmittedToQueue] = useState(false);
  const [currentQueuedProjectId, setCurrentQueuedProjectId] = useState<string | null>(null);
  const processLog = useProcessLog();
  const toAssetUrl = (url: string) => (url.startsWith('http') ? url : `http://localhost:3001${url}`);

  // Prepare all assets for download
  const allDownloadFiles = React.useMemo(() => {
    const files: Array<{ url: string; filename: string }> = [];
    
    // Add voiceover
    if (app.voiceoverUrl) {
      files.push({ url: app.voiceoverUrl, filename: 'voiceover.mp3' });
    }
    
    // Add images (for single-image and multi-image flows)
    if (app.selectedFlow !== 'stock-video') {
      app.generatedImages.forEach((img: any, index) => {
        files.push({ 
          url: toAssetUrl(img.imageUrl), 
          filename: `image-${String(index + 1).padStart(2, '0')}.png` 
        });
      });
    }
    
    // Add stock videos (for stock-video flow)
    if (app.selectedFlow === 'stock-video' && app.selectedVideos.length > 0) {
      app.selectedVideos.forEach((video, index) => {
        files.push({
          url: video.url,
          filename: `stock-video-${String(index + 1).padStart(2, '0')}.mp4`
        });
      });
    }
    
    // Add final video
    if (app.finalVideoUrl) {
      files.push({ url: app.finalVideoUrl, filename: 'final-video.mp4' });
    }
    
    return files;
  }, [app.voiceoverUrl, app.generatedImages, app.finalVideoUrl, app.selectedFlow, app.selectedVideos]);

  // Track the current queued project's status
  const currentQueuedProject = React.useMemo(() => {
    if (!currentQueuedProjectId) return null;
    return queue.find(p => p.id === currentQueuedProjectId);
  }, [queue, currentQueuedProjectId]);

  // Update progress from queue
  React.useEffect(() => {
    if (currentQueuedProject) {
      setProgress(currentQueuedProject.progress);
      if (currentQueuedProject.status === 'processing') {
        const progressMessage = currentQueuedProject.progress < 30 
          ? 'Preparing assets...' 
          : currentQueuedProject.progress < 70 
            ? 'Rendering video...' 
            : 'Finalizing...';
        setStatusMessage(progressMessage);
      }
      if (currentQueuedProject.status === 'completed' && currentQueuedProject.videoUrl) {
        app.updateState({ finalVideoUrl: currentQueuedProject.videoUrl });
        setLoading(false);
        toastSuccess('Video generated successfully!');
      }
      if (currentQueuedProject.status === 'failed') {
        setLoading(false);
        toastError('Video generation failed: ' + currentQueuedProject.error);
      }
    }
  }, [currentQueuedProject]);

  const handleGenerateVideo = async () => {
    // Validate stock video selection
    if (app.selectedFlow === 'stock-video' && !app.selectedVideos.length) {
      toastError('Select at least one stock video before generating.');
      return;
    }

    setLoading(true);
    setProgress(0);
    processLog.startProcess();
    
    const initId = processLog.addEntry('Adding to processing queue...', 'in-progress');

    try {
      // Create a project name based on script snippet
      const projectName = app.script.slice(0, 30).trim() + (app.script.length > 30 ? '...' : '') || 'Untitled Video';

      // Prepare the state snapshot for the queue
      const queueState: any = {
        script: app.script,
        voiceoverUrl: app.voiceoverUrl,
        voiceoverDuration: app.voiceoverDuration,
        selectedFlow: app.selectedFlow,
        overlays: app.overlays,
        videoQuality: app.videoQuality,
        captionsEnabled: app.captionsEnabled,
        captionStyle: app.captionStyle,
        imageDuration: app.imageDuration,
        wordTimestamps: app.wordTimestamps, // Pass real timestamps for accurate captions
        motionEffect: app.motionEffect, // Motion effect for static images
      };

      if (app.selectedFlow === 'single-image') {
        queueState.imageUrl = app.generatedImages[0]?.imageUrl;
      } else if (app.selectedFlow === 'multi-image') {
        queueState.images = app.generatedImages.map(img => ({
          imageUrl: img.imageUrl,
          duration: app.imageDuration,
        }));
        // Add custom timing data if available
        if (app.useCustomTiming && app.timelineSlots.length > 0) {
          queueState.useCustomTiming = true;
          queueState.timelineSlots = app.timelineSlots.map(slot => ({
            id: slot.id,
            type: slot.type,
            assetUrl: slot.assetUrl,
            duration: slot.duration,
            originalIndex: slot.originalIndex
          }));
        }
      } else if (app.selectedFlow === 'stock-video') {
        queueState.selectedVideos = app.selectedVideos.map(video => ({
          id: video.id,
          url: video.url,
          duration: video.duration
        }));
        // Add custom timing data if available
        if (app.useCustomTiming && app.timelineSlots.length > 0) {
          queueState.useCustomTiming = true;
          queueState.timelineSlots = app.timelineSlots.map(slot => ({
            id: slot.id,
            type: slot.type,
            assetUrl: slot.assetUrl,
            duration: slot.duration,
            originalIndex: slot.originalIndex
          }));
        }
      }

      // Add to queue - the QueueContext will handle starting the job
      const projectId = addToQueue({
        name: projectName,
        state: queueState
      });

      setCurrentQueuedProjectId(projectId);
      setSubmittedToQueue(true);
      
      processLog.updateEntry(initId, { status: 'completed', message: 'Added to queue' });
      processLog.addEntry('Video is now processing in background...', 'in-progress');
      
      toastSuccess('Video added to queue! You can start a new project while this one renders.');
    } catch (err: any) {
      processLog.addEntry(`Error: ${err.message}`, 'error');
      processLog.endProcess();
      toastError('Error: ' + err.message);
      setLoading(false);
    }
  };

  const handleStartNewProject = () => {
    // Reset the current view state but keep the queue running
    setSubmittedToQueue(false);
    setCurrentQueuedProjectId(null);
    setLoading(false);
    setProgress(0);
    processLog.clearLog();
    // Clear the app state to start fresh
    app.resetApp();
  };

  return (
    <Card className="card-padding">
      <div className="section-header">
        <div className="section-title">
          <h2>Finalize & Export</h2>
        </div>
      </div>

      {/* Step 1: Video Overlays */}
      <div className="export-step-section">
        <div className="export-step-header">
          <span className="step-number">1</span>
          <h3>Video Overlays</h3>
        </div>
        <OverlayManager />
      </div>

      {/* Step 2: Motion Effect Selector - only for single-image and multi-image flows */}
      {(app.selectedFlow === 'single-image' || app.selectedFlow === 'multi-image') && (
        <div className="export-step-section">
          <div className="export-step-header">
            <span className="step-number">2</span>
            <h3>
              Motion Effect
              <span style={{ 
                fontSize: '0.625rem', 
                fontWeight: '600', 
                padding: '2px 6px', 
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                color: 'white', 
                borderRadius: '4px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px' 
              }}>Beta</span>
            </h3>
          </div>
          <p className="export-step-description">
            Add subtle animation to make static images more dynamic. The effect loops throughout the video.
            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--warning)', marginTop: '4px' }}>⚠️ This feature is experimental and may not work perfectly.</span>
          </p>
          
          {/* Preview with motion effect */}
          {app.generatedImages.length > 0 && (
            <div 
              className="motion-preview-container"
              style={{ 
                position: 'relative', 
                width: '100%', 
                maxWidth: '240px', 
                aspectRatio: '16/9',
                borderRadius: 'var(--radius-md)', 
                overflow: 'hidden', 
                marginBottom: 'var(--spacing-md)',
                background: 'var(--bg-tertiary)'
              }}
            >
              <img
                src={app.generatedImages[0]?.imageUrl?.startsWith('http') 
                  ? app.generatedImages[0].imageUrl 
                  : `http://localhost:3001${app.generatedImages[0]?.imageUrl}`}
                alt="Motion preview"
                className={`motion-preview-image motion-effect-${app.motionEffect}`}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  transformOrigin: 'center center'
                }}
              />
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                background: 'rgba(0,0,0,0.7)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: 'var(--radius-xs)',
                fontSize: '0.75rem'
              }}>
                {MOTION_EFFECT_OPTIONS.find(o => o.id === app.motionEffect)?.label || 'None'}
              </div>
            </div>
          )}

          {/* Motion effect options */}
          <div className="motion-effect-options" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
            gap: 'var(--spacing-sm)' 
          }}>
            {MOTION_EFFECT_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => app.updateState({ motionEffect: option.id })}
                className={`motion-effect-option ${app.motionEffect === option.id ? 'active' : ''}`}
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  border: app.motionEffect === option.id 
                    ? '2px solid var(--accent-color)' 
                    : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  background: app.motionEffect === option.id 
                    ? 'var(--accent-color-alpha, rgba(99, 102, 241, 0.15))' 
                    : 'var(--bg-secondary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  color: 'var(--text-primary)',
                  position: 'relative'
                }}
              >
                {/* Selected checkmark indicator */}
                {app.motionEffect === option.id && (
                  <span style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: 'var(--accent-color, #6366f1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    color: 'white',
                    fontWeight: 'bold'
                  }}>
                    ✓
                  </span>
                )}
                <div style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '2px', color: 'inherit' }}>
                  {option.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Video Settings */}
      <div className="export-step-section">
        <div className="export-step-header">
          <span className="step-number">{(app.selectedFlow === 'single-image' || app.selectedFlow === 'multi-image') ? '3' : '2'}</span>
          <h3>Video Settings</h3>
        </div>
        <div className="export-step-content">
          {/* Quality Selector */}
          <div className="settings-group">
            <label className="form-label">Video Quality</label>
            <div className="quality-options">
              {VIDEO_QUALITY_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => app.updateState({ videoQuality: option.value as any })}
                  className={`quality-option ${app.videoQuality === option.value ? 'active' : ''}`}
                >
                  <span className="quality-label">{option.label}</span>
                  <span className="quality-desc">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Caption Toggle */}
          <div className="settings-group">
            <label className="caption-toggle">
              <input
                type="checkbox"
                checked={app.captionsEnabled}
                onChange={(e) => app.updateState({ captionsEnabled: e.target.checked })}
              />
              <span className="caption-toggle-text">
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  Auto-burn captions
                  <span style={{ 
                    fontSize: '0.5625rem', 
                    fontWeight: '600', 
                    padding: '1px 5px', 
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                    color: 'white', 
                    borderRadius: '3px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px' 
                  }}>Beta</span>
                </strong>
                <span className="caption-toggle-hint">Burn subtitles directly into video (experimental)</span>
              </span>
            </label>
          </div>

          {/* Caption Style Options (when captions enabled) */}
          {app.captionsEnabled && (
            <div className="caption-style-options">
              <div>
                <label className="form-label">Size</label>
                <select
                  value={app.captionStyle.fontSize}
                  onChange={(e) => app.updateState({ 
                    captionStyle: { ...app.captionStyle, fontSize: e.target.value as any } 
                  })}
                >
                  <option value="small">Small (48px)</option>
                  <option value="medium">Medium (64px)</option>
                  <option value="large">Large (80px)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Position</label>
                <select
                  value={app.captionStyle.position}
                  onChange={(e) => app.updateState({ 
                    captionStyle: { ...app.captionStyle, position: e.target.value as any } 
                  })}
                >
                  <option value="top">Top</option>
                  <option value="center">Center</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>
              <div>
                <label className="form-label">Color</label>
                <input
                  type="color"
                  value={app.captionStyle.color}
                  onChange={(e) => app.updateState({ 
                    captionStyle: { ...app.captionStyle, color: e.target.value } 
                  })}
                  className="color-input"
                />
              </div>
            </div>
          )}
          
          {/* Caption Preview */}
          {app.captionsEnabled && (
            <CaptionPreview
              voiceoverUrl={app.voiceoverUrl}
              voiceoverDuration={app.voiceoverDuration}
              wordTimestamps={app.wordTimestamps}
              captionStyle={app.captionStyle}
              captionsEnabled={app.captionsEnabled}
              script={app.script}
            />
          )}
        </div>
      </div>

      {/* Step 4: Project Assets Summary */}
      <div className="export-step-section">
        <div className="export-step-header">
          <span className="step-number">{(app.selectedFlow === 'single-image' || app.selectedFlow === 'multi-image') ? '4' : '3'}</span>
          <h3>Project Assets</h3>
          <div style={{ marginLeft: 'auto' }}>
            <DownloadAllButton 
              files={allDownloadFiles}
              zipFilename="video-project-assets.zip"
              label="Download All"
              size="sm"
              variant="secondary"
            />
          </div>
        </div>

        {/* Voiceover Preview */}
        {app.voiceoverUrl && (
          <div className="audio-player" style={{ marginBottom: 'var(--spacing-sm)', marginTop: 0 }}>
            <div className="audio-player-header">
              <span className="audio-player-title">
                Voiceover
              </span>
              <DownloadButton 
                url={app.voiceoverUrl}
                filename="voiceover.mp3"
                label="Download"
                variant="text"
                size="sm"
              />
            </div>
            <audio controls src={app.voiceoverUrl} style={{ width: '100%', height: '36px' }} />
          </div>
        )}

        {/* Images Preview */}
        {app.generatedImages.length > 0 && (
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-xs)' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: '500' }}>Images ({app.generatedImages.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 'var(--spacing-xs)' }}>
              {app.generatedImages.slice(0, 6).map((img: any, i) => (
                <div key={i} style={{ aspectRatio: '16/9', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
                  <img src={toAssetUrl(img.imageUrl)} alt={`Generated ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
            {app.generatedImages.length > 6 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                +{app.generatedImages.length - 6} more images
              </p>
            )}
          </div>
        )}

        {/* Stock Videos Preview */}
        {app.selectedFlow === 'stock-video' && app.selectedVideos.length > 0 && (
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-xs)' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: '500' }}>Stock Videos ({app.selectedVideos.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 'var(--spacing-xs)' }}>
              {app.selectedVideos.slice(0, 6).map((video, i) => (
                <div key={video.id || i} style={{ aspectRatio: '16/9', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xs)', overflow: 'hidden', position: 'relative' }}>
                  <video 
                    src={video.url} 
                    poster={video.thumbnailUrl}
                    muted 
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                </div>
              ))}
            </div>
            {app.selectedVideos.length > 6 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                +{app.selectedVideos.length - 6} more videos
              </p>
            )}
          </div>
        )}
      </div>

      {/* Process Log */}
      <ProcessLog 
        title="Video Generation Progress" 
        entries={processLog.entries} 
        isActive={processLog.isActive}
      />

      {/* Video Generation Section */}
      {loading || (submittedToQueue && currentQueuedProject?.status === 'processing') ? (
        <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <ProgressBar progress={progress} label={statusMessage || 'Generating video...'} />
          <div style={{ textAlign: 'center', marginTop: 'var(--spacing-md)' }}>
            <LoadingSpinner size="sm" />
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 'var(--spacing-sm)' }}>
              Video is rendering in the background...
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 'var(--spacing-xs)' }}>
              You can start a new project while this one processes. Check the queue panel for progress.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--spacing-lg)' }}>
            <Button onClick={handleStartNewProject} variant="primary">
              Start New Project
            </Button>
          </div>
        </div>
      ) : app.finalVideoUrl || (currentQueuedProject?.status === 'completed' && currentQueuedProject.videoUrl) ? (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--spacing-md)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.9375rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
              Video Ready
            </span>
            <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
              <DownloadButton 
                url={app.finalVideoUrl || currentQueuedProject?.videoUrl || ''}
                filename="generated-video.mp4"
                label="Download Video"
                variant="primary"
                size="md"
              />
            </div>
          </div>
          <video 
            controls 
            src={app.finalVideoUrl || currentQueuedProject?.videoUrl} 
            style={{ width: '100%', maxHeight: '400px', display: 'block' }}
          />
          <div style={{ padding: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => {
                app.updateState({ finalVideoUrl: null, videoJobId: null });
                setSubmittedToQueue(false);
                setCurrentQueuedProjectId(null);
                processLog.clearLog();
              }}
            >
              Regenerate Video
            </Button>
            <div style={{ flex: 1 }} />
            <Button onClick={handleStartNewProject}>
              Start New Project
            </Button>
          </div>
        </div>
      ) : submittedToQueue && currentQueuedProject?.status === 'failed' ? (
        <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ textAlign: 'center' }}>

            <h3 style={{ marginTop: 'var(--spacing-sm)', color: 'var(--error)' }}>Video Generation Failed</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
              {currentQueuedProject.error || 'An unknown error occurred'}
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-lg)' }}>
            <Button 
              variant="secondary" 
              onClick={() => {
                setSubmittedToQueue(false);
                setCurrentQueuedProjectId(null);
                processLog.clearLog();
              }}
            >
              Try Again
            </Button>
            <Button onClick={handleStartNewProject}>
              Start New Project
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {/* Timeline Editor for multi-image and stock-video flows */}
          {(app.selectedFlow === 'multi-image' || app.selectedFlow === 'stock-video') && (
            <TimelineSection />
          )}
          
          <div className="actions-bar">
            <Button variant="secondary" onClick={app.prevStep}>
              ← Back
            </Button>
            <div className="actions-bar-spacer" />
            <Button onClick={handleGenerateVideo}>
              Generate Final Video
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// Timeline section component for multi-image and stock-video flows
function TimelineSection() {
  const app = useApp();
  const [showAdvancedTimeline, setShowAdvancedTimeline] = useState(false);
  const toAssetUrl = (url: string) => (url.startsWith('http') ? url : `http://localhost:3001${url}`);

  // Build timeline slots from current assets
  const buildTimelineSlots = useCallback((): TimelineEditorSlot[] => {
    const voiceoverDuration = app.voiceoverDuration || 60;
    
    if (app.selectedFlow === 'multi-image') {
      const imageCount = app.generatedImages.length;
      const defaultDuration = imageCount > 0 ? Math.ceil(voiceoverDuration / imageCount) : 5;
      
      // Use existing timeline slots if available, otherwise build from images
      if (app.useCustomTiming && app.timelineSlots.length === app.generatedImages.length) {
        let startTime = 0;
        return app.timelineSlots.map((slot, idx) => {
          const result = {
            ...slot,
            startTime,
            assetUrl: toAssetUrl(slot.assetUrl)
          };
          startTime += slot.duration;
          return result;
        });
      }
      
      let startTime = 0;
      return app.generatedImages.map((img: any, idx) => {
        const duration = app.imageDuration || defaultDuration;
        const slot: TimelineEditorSlot = {
          id: img.imageId || `img-${idx}`,
          type: 'image',
          assetUrl: toAssetUrl(img.imageUrl),
          duration: duration,
          startTime: startTime,
          label: `Scene ${idx + 1}`,
          originalIndex: idx
        };
        startTime += duration;
        return slot;
      });
    } else if (app.selectedFlow === 'stock-video') {
      const videoCount = app.selectedVideos.length;
      const defaultDuration = videoCount > 0 ? Math.ceil(voiceoverDuration / videoCount) : 5;
      
      // Use existing timeline slots if available
      if (app.useCustomTiming && app.timelineSlots.length === app.selectedVideos.length) {
        let startTime = 0;
        return app.timelineSlots.map((slot, idx) => {
          const result = {
            ...slot,
            startTime
          };
          startTime += slot.duration;
          return result;
        });
      }
      
      let startTime = 0;
      return app.selectedVideos.map((video, idx) => {
        const duration = video.duration || defaultDuration;
        const slot: TimelineEditorSlot = {
          id: video.id || `vid-${idx}`,
          type: 'video',
          assetUrl: video.url,
          thumbnailUrl: video.thumbnailUrl,
          duration: Math.min(duration, voiceoverDuration / videoCount),
          startTime: startTime,
          label: video.title || `Video ${idx + 1}`,
          originalIndex: idx
        };
        startTime += slot.duration;
        return slot;
      });
    }
    
    return [];
  }, [app.selectedFlow, app.generatedImages, app.selectedVideos, app.voiceoverDuration, app.imageDuration, app.useCustomTiming, app.timelineSlots]);

  const [localSlots, setLocalSlots] = useState<TimelineEditorSlot[]>(buildTimelineSlots);

  // Rebuild slots when assets change
  useEffect(() => {
    if (!app.useCustomTiming) {
      setLocalSlots(buildTimelineSlots());
    }
  }, [buildTimelineSlots, app.useCustomTiming]);

  // Handle timeline slot changes
  const handleSlotsChange = (newSlots: TimelineEditorSlot[]) => {
    setLocalSlots(newSlots);
    
    // Update app state with custom timing
    const timelineSlots: TimelineSlot[] = newSlots.map((slot, idx) => ({
      id: slot.id,
      type: slot.type,
      assetUrl: slot.assetUrl.replace('http://localhost:3001', ''),
      thumbnailUrl: slot.thumbnailUrl,
      duration: slot.duration,
      startTime: slot.startTime,
      label: slot.label,
      originalIndex: slot.originalIndex
    }));
    
    app.updateState({ 
      timelineSlots,
      useCustomTiming: true
    });

    // Also update imageDuration to the average for multi-image
    if (app.selectedFlow === 'multi-image' && newSlots.length > 0) {
      const avgDuration = Math.round(newSlots.reduce((sum, s) => sum + s.duration, 0) / newSlots.length);
      app.updateState({ imageDuration: avgDuration });
    }
  };

  // Simple duration adjustment for uniform timing
  const handleUniformDurationChange = (newDuration: number) => {
    app.updateState({ 
      imageDuration: newDuration,
      useCustomTiming: false,
      timelineSlots: []
    });
    setLocalSlots(buildTimelineSlots());
  };

  const imageCount = app.selectedFlow === 'multi-image' ? app.generatedImages.length : app.selectedVideos.length;
  const voiceoverDuration = app.voiceoverDuration || 0;
  const suggestedDuration = imageCount > 0 ? Math.ceil(voiceoverDuration / imageCount) : 5;
  const totalAssetsDuration = localSlots.reduce((sum, s) => sum + s.duration, 0);
  const coversFullAudio = totalAssetsDuration >= voiceoverDuration;

  return (
    <div style={{ marginBottom: 'var(--spacing-md)' }}>
      {/* Toggle between simple and advanced timeline */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-md)',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-md)'
      }}>
        <div>
          <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>
            {app.selectedFlow === 'multi-image' ? 'Image' : 'Video'} Timeline
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'var(--spacing-sm)' }}>
            {imageCount} assets • {Math.round(voiceoverDuration)}s audio
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--spacing-xs)',
            fontSize: '0.8125rem',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={showAdvancedTimeline}
              onChange={(e) => setShowAdvancedTimeline(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Advanced Editor
              <span style={{ 
                fontSize: '0.5625rem', 
                fontWeight: '600', 
                padding: '1px 5px', 
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
                color: 'white', 
                borderRadius: '3px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px' 
              }}>Beta</span>
            </span>
          </label>
        </div>
      </div>

      {showAdvancedTimeline ? (
        /* Advanced Timeline Editor */
        <TimelineEditor
          slots={localSlots}
          totalDuration={voiceoverDuration}
          onSlotsChange={handleSlotsChange}
          voiceoverUrl={app.voiceoverUrl || undefined}
        />
      ) : (
        /* Simple Duration Settings */
        <div style={{ padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          {/* Visual Timeline Preview - Improved */}
          <div style={{ 
            marginBottom: 'var(--spacing-md)',
            padding: 'var(--spacing-md)',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--glass-border)'
          }}>
            <div style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-secondary)', 
              marginBottom: 'var(--spacing-sm)', 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontWeight: '600' }}>📊 Timeline Preview</span>
              <span style={{ fontFamily: 'Monaco, Consolas, monospace' }}>
                {totalAssetsDuration}s / {Math.round(voiceoverDuration)}s
              </span>
            </div>
            
            {/* Timeline bar */}
            <div style={{ 
              display: 'flex', 
              gap: '2px', 
              height: '48px', 
              background: '#1a1a1a', 
              borderRadius: 'var(--radius-sm)', 
              overflow: 'hidden',
              border: '1px solid var(--glass-border)'
            }}>
              {localSlots.map((slot, idx) => {
                const duration = slot.duration;
                const widthPercent = (duration / Math.max(voiceoverDuration, totalAssetsDuration)) * 100;
                return (
                  <div
                    key={slot.id}
                    style={{
                      width: `${widthPercent}%`,
                      minWidth: '24px',
                      background: `linear-gradient(135deg, hsl(${(idx * 45) % 360}, 65%, 45%) 0%, hsl(${(idx * 45) % 360}, 55%, 35%) 100%)`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.625rem',
                      color: 'white',
                      fontWeight: '600',
                      position: 'relative',
                      borderRight: idx < localSlots.length - 1 ? '1px solid rgba(0,0,0,0.3)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                    title={`${slot.label || `Clip ${idx + 1}`}: ${duration}s (${slot.startTime}s - ${slot.startTime + duration}s)`}
                  >
                    <span style={{ opacity: 0.9 }}>{idx + 1}</span>
                    <span style={{ fontSize: '0.5625rem', opacity: 0.7, marginTop: '2px' }}>{duration}s</span>
                  </div>
                );
              })}
              {!coversFullAudio && (
                <div 
                  style={{ 
                    width: `${((voiceoverDuration - totalAssetsDuration) / voiceoverDuration) * 100}%`,
                    minWidth: '20px',
                    background: 'repeating-linear-gradient(45deg, rgba(234, 179, 8, 0.3) 0px, rgba(234, 179, 8, 0.3) 4px, transparent 4px, transparent 8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.5rem',
                    color: 'var(--warning)'
                  }}
                  title={`Gap: Last clip extends by ${Math.round(voiceoverDuration - totalAssetsDuration)}s`}
                >
                  +{Math.round(voiceoverDuration - totalAssetsDuration)}s
                </div>
              )}
            </div>
            
            {/* Time markers */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginTop: '4px',
              fontSize: '0.5625rem',
              color: 'var(--text-tertiary)',
              fontFamily: 'Monaco, Consolas, monospace'
            }}>
              <span>0:00</span>
              <span>{Math.floor(voiceoverDuration / 2 / 60)}:{String(Math.floor(voiceoverDuration / 2) % 60).padStart(2, '0')}</span>
              <span>{Math.floor(voiceoverDuration / 60)}:{String(Math.floor(voiceoverDuration) % 60).padStart(2, '0')}</span>
            </div>
          </div>
          
          <div style={{ 
            padding: 'var(--spacing-sm)', 
            background: 'var(--bg-secondary)', 
            borderRadius: 'var(--radius-sm)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            <p style={{ fontSize: '0.8125rem', marginBottom: 'var(--spacing-xs)' }}>
              💡 Suggested: <strong>{suggestedDuration}s</strong> per {app.selectedFlow === 'multi-image' ? 'image' : 'video'} to evenly distribute across {Math.round(voiceoverDuration)}s audio
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleUniformDurationChange(suggestedDuration)}
            >
              Apply Suggestion
            </Button>
          </div>
          
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Duration per {app.selectedFlow === 'multi-image' ? 'image' : 'video'}: <strong>{app.imageDuration}s</strong></label>
            <input
              type="range"
              min="1"
              max="30"
              value={app.imageDuration}
              onChange={(e) => handleUniformDurationChange(parseInt(e.target.value))}
            />
          </div>
          
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
            <p>Assets: {imageCount} × {app.imageDuration}s = <strong>{totalAssetsDuration}s</strong> | Voiceover: <strong>{Math.round(voiceoverDuration)}s</strong></p>
            
            {!coversFullAudio && (
              <p style={{ color: 'var(--warning)', marginTop: '4px' }}>
                ⚠️ Last asset will extend to cover remaining {Math.round(voiceoverDuration - totalAssetsDuration)}s
              </p>
            )}
          </div>
          
          <div style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid var(--glass-border)' }}>
            <button
              onClick={() => setShowAdvancedTimeline(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline'
              }}
            >
              Need more control? Open Advanced Timeline Editor →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
