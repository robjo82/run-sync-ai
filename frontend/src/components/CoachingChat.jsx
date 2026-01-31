import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../services/api';

const CoachingChat = ({ goalId, threadId, onThreadCreated, onPlanUpdate }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [scrolling, setScrolling] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    // Initial load
    useEffect(() => {
        if (threadId) {
            loadMessages();
        } else if (goalId) {
            // No thread selected, maybe auto-create or show empty state?
            // For now, checks if there's a default thread or lets user create one via first message
        }
    }, [threadId, goalId]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (messagesEndRef.current && !scrolling) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, loading]);

    const loadMessages = async () => {
        setLoading(true);
        try {
            const thread = await api.getThread(threadId);
            setMessages(thread.messages || []);
        } catch (err) {
            console.error('Failed to load thread:', err);
            setError("Impossible de charger la conversation.");
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const content = newMessage.trim();
        setNewMessage('');

        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Optimistic UI update
        const tempId = Date.now();
        const optimisticMessage = {
            id: tempId,
            role: 'user',
            content: content,
            created_at: new Date().toISOString(),
            pending: true
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setLoading(true);

        try {
            if (!threadId) {
                // First message -> create thread
                const thread = await api.createThread(goalId, {
                    initialMessage: content
                });
                if (onThreadCreated) onThreadCreated(thread);
                // The thread creation processing will include the response
                // We'll reload the full thread to get everything correct
                const fullThread = await api.getThread(thread.id);
                setMessages(fullThread.messages);
            } else {
                // Existing thread
                const response = await api.sendMessage(threadId, content);

                // Remove optimistic message and add real ones
                setMessages(prev => [
                    ...prev.filter(m => m.id !== tempId),
                    response.user_message,
                    response.coach_response
                ]);

                // Check if plan was modified
                if (response.sessions_modified && response.sessions_modified.length > 0) {
                    if (onPlanUpdate) onPlanUpdate();
                }
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            setError("Erreur lors de l'envoi du message.");
            // Remove optimistic message on error
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
        target.style.height = `${Math.min(target.scrollHeight, 150)}px`; // Max height 150px
        setNewMessage(target.value);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--color-bg-glass)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--color-border-light)',
        }}>
            {/* Messages Area */}
            <div style={{
                flex: 1,
                padding: 'var(--space-md)',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-md)',
            }}
                onScroll={() => setScrolling(true)}
            >
                {messages.length === 0 && !loading && (
                    <div style={{
                        textAlign: 'center',
                        color: 'var(--color-text-muted)',
                        marginTop: 'var(--space-xl)',
                        padding: 'var(--space-lg)',
                    }}>
                        <Bot size={48} style={{ opacity: 0.5, marginBottom: 'var(--space-md)' }} />
                        <p>Je suis ton coach IA. Je peux t'aider à créer ou adapter ton plan d'entraînement.</p>
                        <p style={{ fontSize: '0.9em' }}>Exemples :</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-sm)' }}>
                            <small>"Génère un plan pour mon marathon en 3h45"</small>
                            <small>"Déplace ma sortie longue au dimanche"</small>
                            <small>"C'est quoi une séance de seuil ?"</small>
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`animate-fade-in`}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '100%',
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            gap: 'var(--space-xs)',
                            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                            maxWidth: '85%',
                        }}>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: msg.role === 'user' ? 'var(--color-primary)' : 'rgba(16, 185, 129, 0.2)', // Green tint for coach
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                color: msg.role === 'user' ? 'white' : 'var(--color-success)',
                            }}>
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>

                            <div style={{
                                background: msg.role === 'user'
                                    ? 'var(--color-primary)'
                                    : 'var(--color-bg-elevated)',
                                padding: 'var(--space-sm) var(--space-md)',
                                borderRadius: 'var(--radius-md)',
                                borderTopRightRadius: msg.role === 'user' ? 0 : 'var(--radius-md)',
                                borderTopLeftRadius: msg.role === 'user' ? 'var(--radius-md)' : 0,
                                color: msg.role === 'user' ? 'white' : 'var(--color-text)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                whiteSpace: 'pre-wrap',
                                fontSize: '0.95rem',
                                lineHeight: '1.5',
                            }}>
                                {msg.content}

                                {msg.sessions_affected && msg.sessions_affected.length > 0 && (
                                    <div style={{
                                        marginTop: 'var(--space-sm)',
                                        padding: 'var(--space-xs) var(--space-sm)',
                                        background: 'rgba(0,0,0,0.1)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-xs)',
                                    }}>
                                        <RefreshCw size={12} />
                                        {msg.sessions_affected.length} séance(s) mise(s) à jour
                                    </div>
                                )}
                            </div>
                        </div>
                        <span style={{
                            fontSize: '0.75rem',
                            color: 'var(--color-text-muted)',
                            marginTop: '4px',
                            marginRight: msg.role === 'user' ? '40px' : 0,
                            marginLeft: msg.role === 'user' ? 0 : '40px',
                        }}>
                            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                            {msg.pending && ' (envoi...)'}
                        </span>
                    </div>
                ))}

                {loading && (
                    <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', color: 'var(--color-text-muted)', marginLeft: '40px' }}>
                        <Loader className="spin" size={16} />
                        <small>Le coach réfléchit...</small>
                    </div>
                )}

                {error && (
                    <div style={{
                        margin: 'var(--space-md) auto',
                        padding: 'var(--space-sm)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--color-danger)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)'
                    }}>
                        <AlertTriangle size={16} />
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} style={{
                padding: 'var(--space-md)',
                background: 'rgba(0,0,0,0.2)', // Slightly darker
                borderTop: '1px solid var(--color-border-light)',
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
                        placeholder="Posez une question ou demandez un ajustement..."
                        disabled={loading}
                        rows={1}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            padding: 'var(--space-sm)',
                            color: 'var(--color-text)',
                            fontSize: '0.95rem',
                            resize: 'none',
                            outline: 'none',
                            fontFamily: 'inherit',
                            maxHeight: '150px',
                            minHeight: '24px',
                        }}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || loading}
                        className="btn btn-primary"
                        style={{
                            borderRadius: '50%',
                            width: '40px',
                            height: '40px',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '2px', // Align with bottom of textarea
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>
                <div style={{
                    textAlign: 'center',
                    marginTop: 'var(--space-xs)',
                    fontSize: '0.7rem',
                    color: 'var(--color-text-muted)',
                    opacity: 0.7,
                }}>
                    L'IA peut faire des erreurs. Vérifiez les informations importantes.
                </div>
            </form>

            <style>{`
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

export default CoachingChat;
