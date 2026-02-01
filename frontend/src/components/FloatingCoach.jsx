import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    MessageCircle, X, Send, Loader, Bot, User,
    Minimize2, Maximize2, ChevronDown, RefreshCw
} from 'lucide-react';
import api from '../services/api';

/**
 * FloatingCoach - A floating chat widget that provides AI coaching
 * Features:
 * - Floating button in bottom-right corner
 * - Expands to full chat interface
 * - Goal-aware context (separate thread per goal)
 * - Auto-sends initial message on new goal creation
 * - Minimizable to compact view
 */
const FloatingCoach = ({
    goals,
    selectedGoalId,
    onGoalUpdated,
    autoMessage = null,
    onAutoMessageConsumed = null
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [threadId, setThreadId] = useState(null);
    const [hasNewMessage, setHasNewMessage] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const processedAutoMessageRef = useRef(null);

    // Get current goal
    const currentGoal = goals?.find(g => g.id === selectedGoalId);

    // Load thread when goal changes
    useEffect(() => {
        if (selectedGoalId && isOpen) {
            loadGoalThread();
        }
    }, [selectedGoalId, isOpen]);

    // Scroll to bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current && isOpen && !isMinimized) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isMinimized]);

    // Handle auto-message for new goals
    useEffect(() => {
        if (autoMessage &&
            processedAutoMessageRef.current !== autoMessage &&
            selectedGoalId &&
            !loading) {
            processedAutoMessageRef.current = autoMessage;
            setIsOpen(true);
            setIsMinimized(false);

            // Give time for thread to load, then send
            setTimeout(() => {
                handleSendMessage(null, autoMessage);
                if (onAutoMessageConsumed) onAutoMessageConsumed();
            }, 500);
        }
    }, [autoMessage, selectedGoalId]);

    const loadGoalThread = async () => {
        if (!selectedGoalId) return;

        try {
            // Try to get existing threads for this goal
            const threads = await api.getGoalThreads(selectedGoalId);
            if (threads && threads.length > 0) {
                // Use most recent thread
                const latestThread = threads[threads.length - 1];
                setThreadId(latestThread.id);

                // Load messages
                const fullThread = await api.getThread(latestThread.id);
                setMessages(fullThread.messages || []);
            } else {
                // No thread yet
                setThreadId(null);
                setMessages([]);
            }
        } catch (err) {
            console.error('Error loading goal thread:', err);
            setMessages([]);
            setThreadId(null);
        }
    };

    const handleSendMessage = async (e, contentOverride = null) => {
        if (e) e.preventDefault();
        const content = contentOverride || newMessage.trim();
        if (!content || !selectedGoalId) return;

        setNewMessage('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Optimistic UI
        const tempId = Date.now();
        const optimisticMessage = {
            id: tempId,
            role: 'user',
            content,
            created_at: new Date().toISOString(),
            pending: true
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setLoading(true);

        try {
            if (!threadId) {
                // Create new thread
                const thread = await api.createThread(selectedGoalId, {
                    initialMessage: content
                });
                setThreadId(thread.id);

                // Reload full thread to get all messages
                const fullThread = await api.getThread(thread.id);
                setMessages(fullThread.messages || []);
            } else {
                // Send to existing thread
                const response = await api.sendMessage(threadId, content);

                setMessages(prev => [
                    ...prev.filter(m => m.id !== tempId),
                    response.user_message,
                    response.coach_response
                ]);

                // Check if plan was modified
                if (response.sessions_modified?.length > 0 && onGoalUpdated) {
                    onGoalUpdated();
                }
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    };

    const handleTextareaInput = (e) => {
        const target = e.target;
        target.style.height = 'auto';
        target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
        setNewMessage(target.value);
    };

    const toggleOpen = () => {
        setIsOpen(!isOpen);
        setHasNewMessage(false);
        if (!isOpen && selectedGoalId) {
            loadGoalThread();
        }
    };

    // Floating button (when closed)
    if (!isOpen) {
        return (
            <button
                onClick={toggleOpen}
                className="floating-coach-button"
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    zIndex: 1000,
                    transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                title="Coach IA"
            >
                <MessageCircle size={28} />
                {hasNewMessage && (
                    <span style={{
                        position: 'absolute',
                        top: '0',
                        right: '0',
                        width: '16px',
                        height: '16px',
                        background: 'var(--color-danger)',
                        borderRadius: '50%',
                        border: '2px solid white',
                    }} />
                )}
            </button>
        );
    }

    // Minimized view
    if (isMinimized) {
        return (
            <div
                className="floating-coach-minimized"
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    width: '280px',
                    background: 'var(--color-bg-elevated)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--color-border-light)',
                    zIndex: 1000,
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-sm) var(--space-md)',
                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                        color: 'white',
                        cursor: 'pointer',
                    }}
                    onClick={() => setIsMinimized(false)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <Bot size={18} />
                        <span style={{ fontWeight: 500 }}>Coach IA</span>
                        {currentGoal && (
                            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                • {currentGoal.name}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
                            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
                        >
                            <Maximize2 size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Expanded chat view
    return (
        <div
            className="floating-coach-expanded"
            style={{
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                width: '400px',
                height: '500px',
                background: '#1e1e2f',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-sm) var(--space-md)',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                color: 'white',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <Bot size={20} />
                    <div>
                        <div style={{ fontWeight: 600 }}>Coach IA</div>
                        {currentGoal && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                {currentGoal.name}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <button
                        onClick={() => setIsMinimized(true)}
                        style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
                        title="Réduire"
                    >
                        <Minimize2 size={18} />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}
                        title="Fermer"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* No goal selected message */}
            {!selectedGoalId && (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--space-lg)',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                }}>
                    <Bot size={48} style={{ opacity: 0.5, marginBottom: 'var(--space-md)' }} />
                    <p>Sélectionnez un objectif dans la sidebar pour discuter avec le coach.</p>
                </div>
            )}

            {/* Messages area */}
            {selectedGoalId && (
                <div style={{
                    flex: 1,
                    padding: 'var(--space-md)',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-md)',
                    background: 'rgba(0, 0, 0, 0.3)',
                }}>
                    {messages.length === 0 && !loading && (
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--color-text-muted)',
                            marginTop: 'var(--space-xl)',
                            padding: 'var(--space-lg)',
                        }}>
                            <Bot size={40} style={{ opacity: 0.5, marginBottom: 'var(--space-sm)' }} />
                            <p style={{ fontSize: '0.9rem' }}>
                                Je suis ton coach pour <strong>{currentGoal?.name}</strong>.
                            </p>
                            <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                                Demande-moi de créer ou modifier ton plan d'entraînement !
                            </p>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                gap: 'var(--space-xs)',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                maxWidth: '90%',
                            }}>
                                <div style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: msg.role === 'user' ? 'var(--color-primary)' : 'rgba(16, 185, 129, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: msg.role === 'user' ? 'white' : 'var(--color-success)',
                                }}>
                                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                                </div>

                                <div style={{
                                    background: msg.role === 'user' ? 'var(--color-primary)' : '#2a2a3d',
                                    padding: 'var(--space-sm) var(--space-md)',
                                    borderRadius: 'var(--radius-md)',
                                    borderTopRightRadius: msg.role === 'user' ? 0 : 'var(--radius-md)',
                                    borderTopLeftRadius: msg.role === 'user' ? 'var(--radius-md)' : 0,
                                    color: msg.role === 'user' ? 'white' : 'var(--color-text)',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.5,
                                }}>
                                    <ReactMarkdown
                                        components={{
                                            p: ({ node, ...props }) => <p style={{ margin: '0 0 6px 0' }} {...props} />,
                                            ul: ({ node, ...props }) => <ul style={{ margin: '0 0 6px 16px', padding: 0 }} {...props} />,
                                            li: ({ node, ...props }) => <li style={{ margin: '2px 0' }} {...props} />,
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>

                                    {msg.sessions_affected?.length > 0 && (
                                        <div style={{
                                            marginTop: 'var(--space-xs)',
                                            padding: '4px 8px',
                                            background: 'rgba(0,0,0,0.1)',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                        }}>
                                            <RefreshCw size={10} />
                                            {msg.sessions_affected.length} séance(s) modifiée(s)
                                        </div>
                                    )}
                                </div>
                            </div>
                            <span style={{
                                fontSize: '0.7rem',
                                color: 'var(--color-text-muted)',
                                marginTop: '2px',
                                marginRight: msg.role === 'user' ? '36px' : 0,
                                marginLeft: msg.role === 'user' ? 0 : '36px',
                            }}>
                                {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                {msg.pending && ' (envoi...)'}
                            </span>
                        </div>
                    ))}

                    {loading && (
                        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', color: 'var(--color-text-muted)', marginLeft: '36px' }}>
                            <Loader className="spin" size={14} />
                            <small>Le coach réfléchit...</small>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input area */}
            {selectedGoalId && (
                <form onSubmit={handleSendMessage} style={{
                    padding: 'var(--space-sm)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    background: '#181825',
                }}>
                    <div style={{
                        display: 'flex',
                        gap: 'var(--space-sm)',
                        alignItems: 'flex-end',
                        background: 'var(--color-bg)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-xs)',
                        border: '1px solid var(--color-border)',
                    }}>
                        <textarea
                            ref={textareaRef}
                            value={newMessage}
                            onChange={handleTextareaInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Message au coach..."
                            disabled={loading}
                            rows={1}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                padding: 'var(--space-sm)',
                                color: 'var(--color-text)',
                                fontSize: '0.9rem',
                                resize: 'none',
                                outline: 'none',
                                fontFamily: 'inherit',
                                maxHeight: '120px',
                                minHeight: '20px',
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || loading}
                            className="btn btn-primary"
                            style={{
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </form>
            )}

            <style>{`
                .floating-coach-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 6px 24px rgba(99, 102, 241, 0.5);
                }
                .spin {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default FloatingCoach;
