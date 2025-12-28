'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { ChatMessage, GeminiChatModel, Niche } from 'shared/src/types';
import './ScriptChat.css';

interface ScriptChatProps {
    onUseAsScript: (script: string) => void;
    initialScript?: string;
    niche?: Niche | null;
}

export function ScriptChat({ onUseAsScript, initialScript, niche }: ScriptChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [model, setModel] = useState<GeminiChatModel>('gemini-2.5-flash');
    const [models, setModels] = useState<Array<{ id: GeminiChatModel; name: string; description: string }>>([]);
    const [mode, setMode] = useState<'chat' | 'script'>('script');
    const [wordCount, setWordCount] = useState<number>(300);
    const [selectedResponse, setSelectedResponse] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load available models
    useEffect(() => {
        api.listChatModels()
            .then(data => setModels(data.models))
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

        try {
            if (mode === 'script') {
                // Use script generation endpoint
                const response = await api.generateScript({
                    prompt: userMessage.content,
                    wordCount,
                    niche: niche || undefined,
                    model
                });

                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: response.script,
                    timestamp: Date.now()
                };

                setMessages(prev => [...prev, assistantMessage]);
                setSelectedResponse(response.script);
            } else {
                // Use chat endpoint
                const allMessages = [...messages, userMessage];
                const response = await api.sendChatMessage({
                    messages: allMessages,
                    model,
                    systemPrompt: `You are a helpful assistant for video content creation. You help users brainstorm ideas, write scripts, and refine their content. ${niche ? `The content is for the ${niche} niche.` : ''}`
                });

                setMessages(prev => [...prev, response.message]);
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

    const handleUseScript = (content: string) => {
        onUseAsScript(content);
    };

    const clearChat = () => {
        setMessages([]);
        setSelectedResponse(null);
    };

    return (
        <div className="script-chat">
            <div className="script-chat-header">
                <div className="script-chat-tabs">
                    <button
                        className={`script-chat-tab ${mode === 'script' ? 'active' : ''}`}
                        onClick={() => setMode('script')}
                    >
                        📝 Script Mode
                    </button>
                    <button
                        className={`script-chat-tab ${mode === 'chat' ? 'active' : ''}`}
                        onClick={() => setMode('chat')}
                    >
                        💬 Chat Mode
                    </button>
                </div>
                <div className="script-chat-controls">
                    <select
                        value={model}
                        onChange={(e) => setModel(e.target.value as GeminiChatModel)}
                        className="script-chat-model-select"
                    >
                        {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                    {messages.length > 0 && (
                        <button onClick={clearChat} className="script-chat-clear" title="Clear chat">
                            🗑️
                        </button>
                    )}
                </div>
            </div>

            {mode === 'script' && (
                <div className="script-chat-settings">
                    <label>
                        <span>Target word count:</span>
                        <input
                            type="number"
                            value={wordCount}
                            onChange={(e) => setWordCount(parseInt(e.target.value) || 300)}
                            min={50}
                            max={5000}
                            step={50}
                        />
                    </label>
                    <span className="script-chat-hint">
                        Describe your video topic and the AI will generate a script
                    </span>
                </div>
            )}

            <div className="script-chat-messages">
                {messages.length === 0 ? (
                    <div className="script-chat-empty">
                        {mode === 'script' ? (
                            <>
                                <div className="script-chat-empty-icon">📝</div>
                                <p>Describe your video idea and I&apos;ll write a script for you</p>
                                <div className="script-chat-suggestions">
                                    <button onClick={() => setInputValue('Write a motivational script about overcoming challenges')}>
                                        Motivational script
                                    </button>
                                    <button onClick={() => setInputValue('Create an educational video script explaining how AI works')}>
                                        Educational content
                                    </button>
                                    <button onClick={() => setInputValue('Write a script for a lifestyle video about morning routines')}>
                                        Lifestyle video
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="script-chat-empty-icon">💬</div>
                                <p>Chat with AI to brainstorm ideas for your video</p>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`script-chat-message ${msg.role}`}
                            >
                                <div className="script-chat-message-content">
                                    {msg.content}
                                </div>
                                {msg.role === 'assistant' && (
                                    <div className="script-chat-message-actions">
                                        <button
                                            onClick={() => handleUseScript(msg.content)}
                                            className="script-chat-use-btn"
                                        >
                                            ✓ Use as Script
                                        </button>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(msg.content)}
                                            className="script-chat-copy-btn"
                                        >
                                            📋 Copy
                                        </button>
                                        <span className="script-chat-word-count">
                                            {msg.content.split(/\s+/).length} words
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
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

            <div className="script-chat-input-area">
                <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={mode === 'script' 
                        ? 'Describe your video topic... (Press Enter to send)' 
                        : 'Type your message... (Press Enter to send)'}
                    rows={1}
                    disabled={isLoading}
                />
                <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    isLoading={isLoading}
                >
                    {mode === 'script' ? 'Generate' : 'Send'}
                </Button>
            </div>
        </div>
    );
}






