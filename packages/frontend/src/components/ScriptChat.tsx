'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { ChatMessage, ChatModelDefinition, Niche, SmartChatResponse } from 'shared/src/types';
import './ScriptChat.css';

interface ScriptChatProps {
    onUseAsScript: (script: string, wordCount: number) => void;
    initialScript?: string;
    niche?: Niche | null;
    chatHistory?: ChatMessage[];
    onChatHistoryChange?: (messages: ChatMessage[]) => void;
    targetWordCount?: number;
    onWordCountChange?: (count: number) => void;
}

export function ScriptChat({ 
    onUseAsScript, 
    initialScript, 
    niche,
    chatHistory = [],
    onChatHistoryChange,
    targetWordCount = 300,
    onWordCountChange
}: ScriptChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(chatHistory);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [model, setModel] = useState<string>('gemini-2.5-flash');
    const [models, setModels] = useState<ChatModelDefinition[]>([]);
    const [defaultModel, setDefaultModel] = useState<string>('gemini-2.5-flash');
    const [useSearch, setUseSearch] = useState(false);
    const [lastResponse, setLastResponse] = useState<SmartChatResponse | null>(null);
    const [showScriptPreview, setShowScriptPreview] = useState(false);
    const [scriptToPreview, setScriptToPreview] = useState<{ content: string; wordCount: number } | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Simple markdown-like formatting for chat messages
    const formatMessage = (text: string) => {
        // Remove asterisks used for bold/emphasis and just show clean text
        let formatted = text
            .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // Remove ***bold italic***
            .replace(/\*\*(.+?)\*\*/g, '$1')      // Remove **bold**
            .replace(/\*(.+?)\*/g, '$1')          // Remove *italic*
            .replace(/\_\_(.+?)\_\_/g, '$1')      // Remove __underline__
            .replace(/\_(.+?)\_/g, '$1');          // Remove _italic_
        return formatted;
    };

    // Get current model definition
    const currentModel = models.find(m => m.id === model);

    // Sync messages with parent state
    useEffect(() => {
        if (chatHistory.length > 0 && messages.length === 0) {
            setMessages(chatHistory);
        }
    }, [chatHistory, messages.length]);

    // Notify parent of chat history changes
    useEffect(() => {
        if (onChatHistoryChange && messages.length > 0) {
            onChatHistoryChange(messages);
        }
    }, [messages, onChatHistoryChange]);

    // Load available models
    useEffect(() => {
        api.listChatModels()
            .then(data => {
                setModels(data.models);
                setDefaultModel(data.defaultModel);
                // Set initial model to default if current model is not available
                if (!data.models.find(m => m.id === model)) {
                    setModel(data.defaultModel);
                }
            })
            .catch(console.error);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [inputValue]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: inputValue.trim(),
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);
        setLastResponse(null);

        try {
            // Use smart chat endpoint with search if enabled
            const response = await api.smartChat({
                messages: [...messages, userMessage],
                model,
                niche: niche || undefined,
                targetWordCount,
                useSearch: useSearch && currentModel?.supportsSearch
            });

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response.message.content,
                timestamp: Date.now()
            };

            setMessages(prev => [...prev, assistantMessage]);
            setLastResponse(response);

            // If word count was extracted from prompt, notify parent
            if (response.extractedWordCount && onWordCountChange) {
                onWordCountChange(response.extractedWordCount);
            }
        } catch (error: any) {
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: `Error: ${error.message}`,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handlePreviewScript = (content: string) => {
        const wordCount = content.split(/\s+/).filter(w => w).length;
        setScriptToPreview({ content, wordCount });
        setShowScriptPreview(true);
    };

    const handleConfirmUseScript = () => {
        if (scriptToPreview) {
            onUseAsScript(scriptToPreview.content, scriptToPreview.wordCount);
            setShowScriptPreview(false);
            setScriptToPreview(null);
        }
    };

    const handleQuickAction = (action: string) => {
        // Set input value based on action
        const actionPrompts: Record<string, string> = {
            'Use as Script': '', // Handled separately
            'Make it shorter': 'Make the script shorter, more concise',
            'Make it longer': 'Expand the script with more detail',
            'Change the tone': 'Rewrite with a different tone - ',
            'Now write the script': 'Now write the full script based on the research above',
            'Tell me more': 'Tell me more about this topic',
            'Focus on a specific aspect': 'Focus more on ',
            'Refine further': 'Refine the script further - ',
            'Start over': '', // Clear and start fresh
            'Write a script about this': 'Write a script about the topic we discussed'
        };

        if (action === 'Use as Script') {
            // Find the last assistant message that looks like a script
            const lastScriptMessage = [...messages].reverse().find(
                m => m.role === 'assistant' && m.content.split(/\s+/).length > 100
            );
            if (lastScriptMessage) {
                handlePreviewScript(lastScriptMessage.content);
            }
        } else if (action === 'Start over') {
            clearChat();
        } else {
            const prompt = actionPrompts[action] || action;
            setInputValue(prompt);
            textareaRef.current?.focus();
        }
    };

    const clearChat = () => {
        setMessages([]);
        setLastResponse(null);
        if (onChatHistoryChange) {
            onChatHistoryChange([]);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Estimate audio duration based on word count (average speaking rate: 150 words/min)
    const estimateDuration = (wordCount: number) => {
        const minutes = wordCount / 150;
        if (minutes < 1) {
            return `~${Math.round(minutes * 60)}s`;
        }
        return `~${minutes.toFixed(1)} min`;
    };

    return (
        <div className={`script-chat ${isExpanded ? 'expanded' : ''}`}>
            {/* Header */}
            <div className="script-chat-header">
                <div className="script-chat-title-area">
                    <span className="script-chat-title">AI Script Writer</span>
                    {lastResponse?.detectedIntent && (
                        <span className={`script-chat-intent-badge ${lastResponse.detectedIntent}`}>
                            {lastResponse.detectedIntent === 'research' && 'Research'}
                            {lastResponse.detectedIntent === 'write' && 'Writing'}
                            {lastResponse.detectedIntent === 'refine' && 'Refining'}
                            {lastResponse.detectedIntent === 'general' && 'Chat'}
                        </span>
                    )}
                    {lastResponse?.searchUsed && (
                        <span className="script-chat-search-badge">Web</span>
                    )}
                </div>
                <div className="script-chat-controls">
                    <div className="script-chat-model-selector">
                        <select
                            value={model}
                            onChange={(e) => {
                                setModel(e.target.value);
                                // Reset search toggle if new model doesn't support it
                                const newModel = models.find(m => m.id === e.target.value);
                                if (!newModel?.supportsSearch) {
                                    setUseSearch(false);
                                }
                            }}
                            className="script-chat-model-select"
                            title={currentModel?.description || 'Select a model'}
                        >
                            {/* Group models by provider */}
                            {models.filter(m => m.provider === 'gemini').length > 0 && (
                                <optgroup label="Gemini">
                                    {models.filter(m => m.provider === 'gemini').map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {models.filter(m => m.provider === 'openrouter').length > 0 && (
                                <optgroup label="OpenRouter">
                                    {models.filter(m => m.provider === 'openrouter').map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                        {currentModel?.supportsSearch && (
                            <button
                                onClick={() => setUseSearch(!useSearch)}
                                className={`script-chat-search-btn ${useSearch ? 'active' : ''}`}
                                title={useSearch ? 'Web search enabled' : 'Enable web search'}
                            >
                                🔍
                            </button>
                        )}
                    </div>
                    {messages.length > 0 && (
                        <button onClick={clearChat} className="script-chat-clear" title="Clear chat">
                            Clear
                        </button>
                    )}
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="script-chat-expand-btn"
                        title={isExpanded ? 'Minimize' : 'Expand'}
                    >
                        {isExpanded ? '⊟' : '⊞'}
                    </button>
                </div>
            </div>

            {/* Target Word Count Setting */}
            <div className="script-chat-settings">
                <label>
                    <span>Target words:</span>
                    <input
                        type="number"
                        value={targetWordCount}
                        onChange={(e) => onWordCountChange?.(parseInt(e.target.value) || 300)}
                        min={50}
                        max={5000}
                        step={50}
                    />
                </label>
                <span className="script-chat-hint">
                    Tip: You can also specify word count in your message (e.g., &quot;write a 500 word script&quot;)
                </span>
            </div>

            {/* Messages Area */}
            <div className="script-chat-messages">
                {messages.length === 0 ? (
                    <div className="script-chat-empty">
                        <h3>Your AI Writing Assistant</h3>
                        <p>Chat naturally to create your video script. I&apos;ll understand what you need!</p>
                        
                        <div className="script-chat-examples">
                            <div className="script-chat-example-group">
                                <span className="script-chat-example-label">Research first:</span>
                                <p>&quot;Research the topic of morning routines before writing&quot;</p>
                            </div>
                            <div className="script-chat-example-group">
                                <span className="script-chat-example-label">Write directly:</span>
                                <p>&quot;Write a 300 word motivational script about success&quot;</p>
                            </div>
                            <div className="script-chat-example-group">
                                <span className="script-chat-example-label">Iterate:</span>
                                <p>&quot;Make it shorter&quot; or &quot;Change the tone to be more casual&quot;</p>
                            </div>
                        </div>

                        <div className="script-chat-suggestions">
                            <button onClick={() => setInputValue('Write a motivational script about overcoming challenges')}>
                                Motivational script
                            </button>
                            <button onClick={() => setInputValue('Research AI technology trends, then write a script')}>
                                Research + Write
                            </button>
                            <button onClick={() => setInputValue('Write a 200 word script for a lifestyle video about morning routines')}>
                                Short lifestyle video
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`script-chat-message ${msg.role}`}
                            >
                                <div className="script-chat-message-content">
                                    {formatMessage(msg.content)}
                                </div>
                                {msg.role === 'assistant' && (
                                    <div className="script-chat-message-footer">
                                        <div className="script-chat-message-actions">
                                            <button
                                                onClick={() => handlePreviewScript(msg.content)}
                                                className="script-chat-use-btn"
                                            >
                                                Use as Script
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(msg.content)}
                                                className="script-chat-copy-btn"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                        <span className="script-chat-word-count">
                                            {msg.content.split(/\s+/).filter(w => w).length} words · {estimateDuration(msg.content.split(/\s+/).filter(w => w).length)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
                
                {/* Loading indicator */}
                {isLoading && (
                    <div className="script-chat-message assistant loading">
                        <div className="script-chat-typing">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            {lastResponse?.suggestedActions && lastResponse.suggestedActions.length > 0 && !isLoading && (
                <div className="script-chat-quick-actions">
                    {lastResponse.suggestedActions.map((action, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleQuickAction(action)}
                            className="script-chat-quick-action-btn"
                        >
                            {action}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="script-chat-input-area">
                <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Tell me what kind of script you need... (Press Enter to send)"
                    rows={1}
                    disabled={isLoading}
                />
                <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    isLoading={isLoading}
                >
                    Send
                </Button>
            </div>

            {/* Script Preview Modal */}
            {showScriptPreview && scriptToPreview && (
                <div className="script-preview-modal-overlay" onClick={() => setShowScriptPreview(false)}>
                    <div className="script-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="script-preview-header">
                            <h3>Preview Script</h3>
                            <button 
                                className="script-preview-close"
                                onClick={() => setShowScriptPreview(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="script-preview-stats">
                            <span className="script-preview-stat">
                                <strong>{scriptToPreview.wordCount}</strong> words
                            </span>
                            <span className="script-preview-stat">
                                <strong>{estimateDuration(scriptToPreview.wordCount)}</strong> estimated
                            </span>
                            <span className="script-preview-stat">
                                <strong>{Math.ceil(scriptToPreview.content.length / 1000)}k</strong> characters
                            </span>
                        </div>
                        <div className="script-preview-content">
                            {scriptToPreview.content}
                        </div>
                        <div className="script-preview-actions">
                            <Button
                                variant="secondary"
                                onClick={() => setShowScriptPreview(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleConfirmUseScript}
                            >
                                Use This Script
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}






