import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, User, Bot, Loader, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../services/api';

const CoachingChat = ({ goalId, threadId, onThreadCreated, onPlanUpdate, initialAutoMessage, onAutoMessageConsumed }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [scrolling, setScrolling] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const processedAutoMessageRef = useRef(false);

    // Auto-Send effect
    useEffect(() => {
        if (initialAutoMessage && !processedAutoMessageRef.current && !loading) {
            processedAutoMessageRef.current = true;
            console.log('Auto-sending message:', initialAutoMessage);

            // Trigger send logic
            const fakeEvent = { preventDefault: () => { } };
            // Temporarily set new message to auto message so handleSendMessage uses it
            setNewMessage(initialAutoMessage);

            // Allow state to update then trigger
            setTimeout(() => {
                handleSendMessage(fakeEvent, initialAutoMessage);
                if (onAutoMessageConsumed) onAutoMessageConsumed();
            }, 100);
        }
    }, [initialAutoMessage]);

    const handleSendMessage = async (e, contentOverride = null) => {
        e.preventDefault();
        const content = contentOverride || newMessage.trim();
        if (!content) return;

        // Always clear the input
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

        // Placeholder for coach response to stream into
        const tempCoachId = tempId + 1;
        const optimisticCoachMessage = {
            id: tempCoachId,
            role: 'assistant',
            content: '',
            thinking: '', // NEW: Hold thoughts
            created_at: new Date().toISOString(),
            pending: true,
            isStreaming: true
        };

        setMessages(prev => [...prev, optimisticMessage, optimisticCoachMessage]);
        setLoading(true);
        setError(null);

        try {
            if (!threadId) {
                // First message -> create thread (still uses standard non-streaming for now, or convert?
                // The implementation plan mainly targeted existing threads.
                // Let's create thread then stream the response? 
                // Currently createThread takes initialMessage. 
                // To support streaming on first message, we'd need CreateThread to return stream or 
                // Create thread empty then stream message.
                // For simplicity/stability: Create thread normal, then reload. 
                // Streaming only works for subsequent messages in this iteration unless we refactor Create.

                const thread = await api.createThread(goalId, {
                    initialMessage: content
                });
                if (onThreadCreated) onThreadCreated(thread);
                const fullThread = await api.getThread(thread.id);
                setMessages(fullThread.messages);
            } else {
                // Existing thread - STREAMING
                let currentText = "";
                let currentThinking = "";

                for await (const event of api.streamMessage(threadId, content)) {
                    if (event.type === 'thought') {
                        currentThinking += event.content;
                        setMessages(prev => prev.map(m =>
                            m.id === tempCoachId
                                ? { ...m, thinking: currentThinking }
                                : m
                        ));
                    } else if (event.type === 'text') {
                        currentText += event.content;
                        setMessages(prev => prev.map(m =>
                            m.id === tempCoachId
                                ? { ...m, content: currentText }
                                : m
                        ));
                    } else if (event.type === 'meta') {
                        // Update IDs
                        setMessages(prev => prev.map(m => {
                            if (m.id === tempId) return { ...m, id: event.user_message_id, pending: false };
                            if (m.id === tempCoachId) return { ...m, id: event.coach_message_id, pending: false, isStreaming: false };
                            return m;
                        }));

                        // Check for sessions modified (needs to be passed in meta or separate event)
                        // TODO: Backend stream_process_message didn't look like it yielded session updates?
                        // We should probably check if 'meta' has sessions_modified
                    } else if (event.type === 'error') {
                        throw new Error(event.content);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            setError("Erreur lors de l'envoi du message.");
            // Remove optimistic messages on error? or keep as failed
            setMessages(prev => prev.filter(m => m.id !== tempId && m.id !== tempCoachId));
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
                                fontSize: '0.95rem',
                                lineHeight: '1.5',
                                overflowWrap: 'break-word',
                                maxWidth: '100%'
                            }}>
                                {/* Display Thinking Process */}
                                {msg.thinking && (
                                    <div style={{
                                        borderLeft: '2px solid var(--color-primary)',
                                        paddingLeft: 'var(--space-sm)',
                                        marginBottom: 'var(--space-sm)',
                                        fontStyle: 'italic',
                                        fontSize: '0.9em',
                                        color: 'var(--color-text-muted)',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                            <small style={{ fontWeight: 600, opacity: 0.7 }}>Réflexion</small>
                                            {msg.isStreaming && <Loader size={10} className="spin" />}
                                        </div>
                                        {msg.thinking}
                                    </div>
                                )}

                                <ReactMarkdown
                                    components={{
                                        p: ({ node, ...props }) => <p style={{ margin: '0 0 8px 0' }} {...props} />,
                                        ul: ({ node, ...props }) => <ul style={{ margin: '0 0 8px 20px', padding: 0 }} {...props} />,
                                        li: ({ node, ...props }) => <li style={{ margin: '4px 0' }} {...props} />,
                                        strong: ({ node, ...props }) => <strong style={{ fontWeight: 600 }} {...props} />
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>

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
                            {msg.pending && !msg.isStreaming && ' (envoi...)'}
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
