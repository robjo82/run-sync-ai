import React from 'react';
import { Bot, ArrowRight, Sparkles, AlertTriangle, CheckCircle, PauseCircle } from 'lucide-react';

const ACTION_STYLES = {
    maintain: {
        icon: CheckCircle,
        color: 'var(--color-success)',
        bgColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
        label: 'Continuer le plan',
    },
    adjust: {
        icon: AlertTriangle,
        color: 'var(--color-warning)',
        bgColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        label: 'Ajustement recommandé',
    },
    rest: {
        icon: PauseCircle,
        color: 'var(--color-danger)',
        bgColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        label: 'Repos conseillé',
    },
};

/**
 * Coaching Panel - AI recommendations display
 */
export function CoachingPanel({ recommendation, loading, onApplyAdjustment }) {
    if (loading) {
        return (
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        <Bot size={18} style={{ marginRight: 'var(--space-sm)' }} />
                        Coach IA
                    </h3>
                </div>
                <div className="skeleton" style={{ height: '150px' }} />
            </div>
        );
    }

    if (!recommendation) {
        return (
            <div className="card animate-fade-in">
                <div className="card-header">
                    <h3 className="card-title">
                        <Bot size={18} style={{ marginRight: 'var(--space-sm)' }} />
                        Coach IA
                    </h3>
                </div>
                <div style={{
                    textAlign: 'center',
                    padding: 'var(--space-xl)',
                    color: 'var(--color-text-muted)'
                }}>
                    <Sparkles size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                    <p>Synchronisez vos activités pour obtenir des recommandations personnalisées</p>
                </div>
            </div>
        );
    }

    const actionStyle = ACTION_STYLES[recommendation.action] || ACTION_STYLES.maintain;
    const ActionIcon = actionStyle.icon;

    return (
        <div className="card animate-fade-in">
            <div className="card-header">
                <h3 className="card-title">
                    <Bot size={18} style={{ marginRight: 'var(--space-sm)', color: 'var(--color-primary-light)' }} />
                    Coach IA
                </h3>
                <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)'
                }}>
                    Confiance: {(recommendation.confidence * 100).toFixed(0)}%
                </span>
            </div>

            {/* Action badge */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                padding: 'var(--space-md)',
                background: actionStyle.bgColor,
                border: `1px solid ${actionStyle.borderColor}`,
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-lg)',
            }}>
                <ActionIcon size={24} style={{ color: actionStyle.color }} />
                <span style={{
                    fontWeight: 600,
                    color: actionStyle.color,
                    textTransform: 'uppercase',
                    fontSize: '0.875rem',
                    letterSpacing: '0.05em'
                }}>
                    {actionStyle.label}
                </span>
            </div>

            {/* Message to user */}
            <div className="coaching-message">
                <p style={{
                    color: 'var(--color-text-primary)',
                    fontWeight: 500,
                    marginBottom: 'var(--space-sm)',
                    paddingLeft: 'var(--space-md)'
                }}>
                    {recommendation.message_to_user}
                </p>
            </div>

            {/* Reasoning (collapsible) */}
            <details style={{ marginTop: 'var(--space-lg)' }}>
                <summary style={{
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.875rem',
                    marginBottom: 'var(--space-sm)'
                }}>
                    Voir l'analyse détaillée
                </summary>
                <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    padding: 'var(--space-md)',
                    background: 'var(--color-bg-glass)',
                    borderRadius: 'var(--radius-md)',
                    marginTop: 'var(--space-sm)'
                }}>
                    {recommendation.reasoning}
                </p>
            </details>

            {/* Adjustments if any */}
            {recommendation.adjustments && recommendation.adjustments.length > 0 && (
                <div style={{ marginTop: 'var(--space-lg)' }}>
                    <h4 style={{
                        fontSize: '0.875rem',
                        marginBottom: 'var(--space-md)',
                        color: 'var(--color-text-secondary)'
                    }}>
                        Ajustements proposés
                    </h4>
                    {recommendation.adjustments.map((adj, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--color-bg-glass)',
                                borderRadius: 'var(--radius-sm)',
                                marginBottom: 'var(--space-xs)',
                            }}
                        >
                            <div>
                                <span style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-primary-light)',
                                    textTransform: 'uppercase'
                                }}>
                                    {adj.type.replace('_', ' ')}
                                </span>
                                <p style={{
                                    fontSize: '0.875rem',
                                    color: 'var(--color-text-primary)',
                                    marginTop: 'var(--space-xs)'
                                }}>
                                    {adj.details}
                                </p>
                            </div>
                            <button
                                className="btn btn-secondary btn-icon"
                                onClick={() => onApplyAdjustment?.(adj)}
                                title="Appliquer"
                            >
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default CoachingPanel;
