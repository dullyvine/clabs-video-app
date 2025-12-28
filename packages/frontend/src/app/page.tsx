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
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useQueue } from '@/contexts/QueueContext';
import './page.css';
import {
  StockVideoAsset,
  StockVideoOrientation,
  StockVideoProvider,
  StockVideoSlot
} from 'shared/src/types';

export default function Home() {
  const app = useApp();

  const handleStartNewProject = () => {
    app.clearStorage();
  };

  return (
    <main className="container">
    
      <QueuePanel onStartNew={handleStartNewProject} />
      <header className="app-header">
        <div className="app-header-content">
          <h1><span className="app-logo">🎬</span> Video Generator</h1>
          <p className="subtitle">Transform scripts into YouTube videos with AI-powered voiceovers and visuals</p>
        </div>
        <button
          onClick={app.clearStorage}
          className="clear-project-btn"
          title="Clear project and start fresh"
        >
          <span>🗑️</span>
          <span className="clear-project-text">New Project</span>
        </button>
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
        {loading ? '...' : '🔊 Preview'}
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
  const processLog = useProcessLog();

  const handleUseAIScript = (script: string) => {
    app.updateState({ script });
    setShowAIWriter(false);
    toastSuccess('Script loaded! You can now generate a voiceover.');
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
      
      app.updateState({
        voiceoverUrl: 'http://localhost:3001' + result.audioUrl,
        voiceoverDuration: result.duration,
      });

      processLog.updateEntry(finalId, { 
        status: 'completed', 
        message: `Audio ready (${result.duration.toFixed(1)}s)`,
        details: result.audioUrl
      });
      
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
          {showAIWriter ? '✕ Close AI Writer' : '✨ Write Script with AI'}
        </Button>
        
        {showAIWriter && (
          <div className="ai-writer-container">
            <ScriptChat
              onUseAsScript={handleUseAIScript}
              initialScript={app.script}
              niche={app.selectedNiche}
            />
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Your Script</label>
        <textarea
          placeholder="Enter your video script here or use AI to generate one..."
          value={app.script}
          onChange={(e) => app.updateState({ script: e.target.value })}
          rows={6}
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
              <span className="icon">✓</span> Voiceover Ready
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
    { id: 'motivational', label: 'Motivational', icon: '💪' },
    { id: 'educational', label: 'Educational', icon: '📚' },
    { id: 'entertainment', label: 'Entertainment', icon: '🎭' },
    { id: 'news', label: 'News', icon: '📰' },
    { id: 'gaming', label: 'Gaming', icon: '🎮' },
    { id: 'lifestyle', label: 'Lifestyle', icon: '✨' },
    { id: 'other', label: 'Other', icon: '📁' },
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
          {niches.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => handleSelectNiche(id)}
              style={{
                padding: 'var(--spacing-sm)',
                background: app.selectedNiche === id ? 'var(--primary)' : 'var(--bg-tertiary)',
                border: `1px solid ${app.selectedNiche === id ? 'var(--primary)' : 'var(--glass-border)'}`,
                borderRadius: 'var(--radius-sm)',
                color: app.selectedNiche === id ? 'white' : 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{icon}</span>
              <span style={{ fontSize: '0.8125rem', fontWeight: '500' }}>{label}</span>
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
              icon="🖼️"
              onClick={() => handleSelectFlow('single-image')}
            />
            <FlowCard
              title="Multiple Images"
              description="Generate multiple AI images for dynamic scene transitions"
              icon="🎨"
              onClick={() => handleSelectFlow('multi-image')}
            />
            <FlowCard
              title="Stock Videos"
              description="Use professional stock footage from Pexels"
              icon="🎥"
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

function FlowCard({ title, description, icon, onClick }: any) {
  return (
    <Card className="flow-card card-padding" onClick={onClick}>
      <div className="flow-icon">{icon}</div>
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

  const handlePromptChange = (index: number, value: string) => {
    const updated = prompts.map((prompt, idx) =>
      idx === index ? { ...prompt, prompt: value } : prompt
    );
    setPrompts(updated);
    app.updateState({ imagePrompts: updated });
  };

  const handleRefinePrompt = async (index: number) => {
    const currentPrompt = prompts[index]?.prompt;
    if (!currentPrompt) return;

    setRefiningIndex(index);
    try {
      const result = await api.refineImagePrompt({
        prompt: currentPrompt,
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
            <option value="gemini">Gemini Imagen (Free)</option>
            <option value="openrouter">OpenRouter (FLUX, DALL-E)</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Model</label>
          <select
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
          >
            {models.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name || m.id}</option>
            ))}
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
          {showBrainDump ? '✕ Close' : '🧠 Brain Dump → AI Prompt'}
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
              ✨ Generate Prompt
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
          </div>
          <div style={{ maxHeight: '350px', overflow: 'auto', marginBottom: 'var(--spacing-md)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
            {prompts.map((p, i) => (
              <div key={i} style={{ padding: 'var(--spacing-sm)', borderBottom: i < prompts.length - 1 ? '1px solid var(--glass-border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                    Scene {i + 1}: {p.sceneDescription || 'No description'}
                  </span>
                  <button
                    onClick={() => handleRefinePrompt(i)}
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
                    {refiningIndex === i ? '...' : '✨ Refine'}
                  </button>
                </div>
                <textarea
                  value={p.prompt}
                  onChange={(e) => handlePromptChange(i, e.target.value)}
                  rows={3}
                  style={{ width: '100%', fontSize: '0.8125rem' }}
                />
              </div>
            ))}
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
              <span style={{ color: 'var(--success)' }}>✓</span> Generated Images ({sortedImages.length})
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
                        {regeneratingIndex === promptIndex ? '...' : '🔄'}
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
                  ⏱️ Smart Timing Preview
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
                <span>🟢 Fits exactly</span>
                <span>🟡 Will loop</span>
                <span>🔵 Will trim</span>
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
                    🔄 Swap
                  </button>
                  <DownloadButton
                    url={slot.video.url}
                    filename={`stock-video-${String(index + 1).padStart(2, '0')}.mp4`}
                    label="⬇"
                    variant="secondary"
                    size="sm"
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

// Step 4: Video Generation
function VideoGenerationStep() {
  const app = useApp();
  const { error: toastError, success: toastSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const handleGenerateVideo = async () => {
    setLoading(true);
    setProgress(0);
    processLog.startProcess();
    
    const initId = processLog.addEntry('Initializing video generation...', 'in-progress');
    
    try {
      // Prepare overlays
      const overlaysForRequest = app.overlays.map(overlay => ({
        id: overlay.id,
        fileUrl: overlay.fileUrl.replace('http://localhost:3001', ''),
        type: overlay.type,
        blendMode: overlay.blendMode,
        opacity: overlay.opacity ?? 1
      }));

      let request: any = {
        voiceoverUrl: app.voiceoverUrl!.replace('http://localhost:3001', ''),
        voiceoverDuration: app.voiceoverDuration!,
        overlays: overlaysForRequest,
        // Caption settings
        captionsEnabled: app.captionsEnabled,
        captionStyle: app.captionStyle,
        script: app.script, // Needed for generating captions
      };

      const normalizeAssetUrl = (url: string) =>
        url.startsWith('http://localhost:3001') ? url.replace('http://localhost:3001', '') : url;

      processLog.updateEntry(initId, { status: 'completed', message: 'Initialization complete' });
      
      const prepId = processLog.addEntry('Preparing assets...', 'in-progress');

      if (app.selectedFlow === 'single-image') {
        request.flowType = 'single-image';
        request.imageUrl = app.generatedImages[0].imageUrl;
        processLog.updateEntry(prepId, { status: 'completed', message: 'Single image flow prepared' });
      } else if (app.selectedFlow === 'multi-image') {
        request.flowType = 'multi-image';
        request.images = app.generatedImages.map(img => ({
          imageUrl: img.imageUrl,
          duration: app.imageDuration,
        }));
        processLog.updateEntry(prepId, { status: 'completed', message: `${app.generatedImages.length} images prepared` });
      } else if (app.selectedFlow === 'stock-video') {
        if (!app.selectedVideos.length) {
          toastError('Select at least one stock video before generating.');
          setLoading(false);
          processLog.addEntry('No stock videos selected', 'error');
          processLog.endProcess();
          return;
        }
        request.flowType = 'stock-video';
        request.videos = app.selectedVideos.map(video => ({
          videoUrl: normalizeAssetUrl(video.url),
          duration: video.duration || undefined
        }));
        processLog.updateEntry(prepId, { status: 'completed', message: `${app.selectedVideos.length} stock videos prepared` });
      }

      const submitId = processLog.addEntry('Submitting to video processor...', 'in-progress');
      
      const result = await api.generateVideo(request);
      app.updateState({ videoJobId: result.jobId });
      
      processLog.updateEntry(submitId, { status: 'completed', message: `Job ID: ${result.jobId}` });
      
      const renderingId = processLog.addEntry('Rendering video with FFmpeg...', 'in-progress');

      // Poll for progress
      const pollInterval = setInterval(async () => {
        const status = await api.checkVideoStatus(result.jobId);
        setProgress(status.progress);
        
        // Use progress to determine status message
        const progressMessage = status.progress < 30 
          ? 'Preparing assets...' 
          : status.progress < 70 
            ? 'Rendering video...' 
            : 'Finalizing...';
        setStatusMessage(progressMessage);

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          processLog.updateEntry(renderingId, { status: 'completed', message: 'Video rendering complete' });
          processLog.addEntry('Video ready for download!', 'completed');
          processLog.endProcess();
          
          app.updateState({ finalVideoUrl: 'http://localhost:3001' + status.videoUrl });
          setLoading(false);
          toastSuccess('Video generated successfully!');
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          processLog.updateEntry(renderingId, { status: 'error', message: 'Rendering failed' });
          processLog.addEntry(`Error: ${status.error}`, 'error');
          processLog.endProcess();
          
          toastError('Video generation failed: ' + status.error);
          setLoading(false);
        }
      }, 1000);
    } catch (err: any) {
      processLog.addEntry(`Error: ${err.message}`, 'error');
      processLog.endProcess();
      toastError('Error: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <Card className="card-padding">
      <div className="section-header">
        <div className="section-title">
          <h2>Finalize & Export</h2>
        </div>
      </div>

      <OverlayManager />

      <div className="section-divider" />

      {/* Video Settings */}
      <details className="video-settings-panel" open>
        <summary className="video-settings-header">
          <span className="video-settings-icon">⚙️</span>
          <span>Video Settings</span>
          <span className="video-settings-summary">
            {app.videoQuality} quality{app.captionsEnabled ? ' · captions' : ''}
          </span>
        </summary>

        <div className="video-settings-content">
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
                <strong>Auto-burn captions</strong>
                <span className="caption-toggle-hint">Burn subtitles directly into video</span>
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
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
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
        </div>
      </details>

      {/* Asset Summary */}
      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="section-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
          <div className="section-title">
            <h3 style={{ fontSize: '0.9375rem' }}>Project Assets</h3>
          </div>
          <DownloadAllButton 
            files={allDownloadFiles}
            zipFilename="video-project-assets.zip"
            label="Download All Assets"
            size="sm"
            variant="secondary"
          />
        </div>

        {/* Voiceover Preview */}
        {app.voiceoverUrl && (
          <div className="audio-player" style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div className="audio-player-header">
              <span className="audio-player-title">
                <span className="icon">🎙️</span> Voiceover
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
              <span style={{ fontSize: '0.8125rem', fontWeight: '500' }}>📸 Images ({app.generatedImages.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 'var(--spacing-xs)' }}>
              {app.generatedImages.slice(0, 6).map((img: any, i) => (
                <div key={i} style={{ aspectRatio: '16/9', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
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
              <span style={{ fontSize: '0.8125rem', fontWeight: '500' }}>🎥 Stock Videos ({app.selectedVideos.length})</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 'var(--spacing-xs)' }}>
              {app.selectedVideos.slice(0, 6).map((video, i) => (
                <div key={video.id || i} style={{ aspectRatio: '16/9', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-xs)', overflow: 'hidden', position: 'relative' }}>
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
      {loading ? (
        <div style={{ padding: 'var(--spacing-lg)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <ProgressBar progress={progress} label={statusMessage || 'Generating video...'} />
          <div style={{ textAlign: 'center', marginTop: 'var(--spacing-md)' }}>
            <LoadingSpinner size="sm" />
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: 'var(--spacing-sm)' }}>
              This may take a few minutes depending on video length...
            </p>
          </div>
        </div>
      ) : app.finalVideoUrl ? (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ padding: 'var(--spacing-md)', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.9375rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
              <span style={{ color: 'var(--success)' }}>✓</span> Video Ready
            </span>
            <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
              <DownloadButton 
                url={app.finalVideoUrl}
                filename="generated-video.mp4"
                label="Download Video"
                variant="primary"
                size="md"
              />
            </div>
          </div>
          <video 
            controls 
            src={app.finalVideoUrl} 
            style={{ width: '100%', maxHeight: '400px', display: 'block' }}
          />
          <div style={{ padding: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              onClick={() => {
                app.updateState({ finalVideoUrl: null, videoJobId: null });
                processLog.clearLog();
              }}
            >
              🔄 Regenerate Video
            </Button>
            <div style={{ flex: 1 }} />
            <Button onClick={app.resetApp}>
              Start New Project
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {app.selectedFlow === 'multi-image' && (
            <div style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              {(() => {
                const imageCount = app.generatedImages.length;
                const voiceoverDuration = app.voiceoverDuration || 0;
                const suggestedDuration = imageCount > 0 ? Math.ceil(voiceoverDuration / imageCount) : 5;
                const totalImagesDuration = imageCount * app.imageDuration;
                const coversFullAudio = totalImagesDuration >= voiceoverDuration;
                
                return (
                  <>
                    <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '500' }}>Image Duration Settings</span>
                    </div>
                    
                    <div style={{ 
                      padding: 'var(--spacing-sm)', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 'var(--spacing-sm)'
                    }}>
                      <p style={{ fontSize: '0.8125rem', marginBottom: 'var(--spacing-xs)' }}>
                        💡 Suggested: <strong>{suggestedDuration}s</strong> per image to evenly distribute across {Math.round(voiceoverDuration)}s audio
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => app.updateState({ imageDuration: suggestedDuration })}
                      >
                        Apply Suggestion
                      </Button>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Duration per image: <strong>{app.imageDuration}s</strong></label>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        value={app.imageDuration}
                        onChange={(e) => app.updateState({ imageDuration: parseInt(e.target.value) })}
                      />
                    </div>
                    
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 'var(--spacing-xs)' }}>
                      <p>Images: {imageCount} × {app.imageDuration}s = <strong>{totalImagesDuration}s</strong> | Voiceover: <strong>{Math.round(voiceoverDuration)}s</strong></p>
                      
                      {!coversFullAudio && (
                        <p style={{ color: 'var(--warning)', marginTop: '4px' }}>
                          ⚠️ Last image will extend to cover remaining {Math.round(voiceoverDuration - totalImagesDuration)}s
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
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
