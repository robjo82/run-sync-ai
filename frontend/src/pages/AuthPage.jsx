import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';

export function AuthPage({ onClose }) {
    const [mode, setMode] = useState('login'); // 'login' or 'register'
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'login') {
                await login(formData.email, formData.password);
            } else {
                if (!formData.name.trim()) {
                    throw new Error('Le nom est requis');
                }
                await register(formData.email, formData.password, formData.name);
            }
            onClose?.();
        } catch (err) {
            setError(err.message || 'Une erreur est survenue');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="auth-overlay" onClick={onClose}>
            <div className="auth-modal card animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="auth-header">
                    <div className="logo" style={{ marginBottom: 'var(--space-md)' }}>
                        <svg className="logo-icon" viewBox="0 0 100 100" style={{ width: 48, height: 48 }}>
                            <defs>
                                <linearGradient id="authLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style={{ stopColor: '#6366f1' }} />
                                    <stop offset="100%" style={{ stopColor: '#8b5cf6' }} />
                                </linearGradient>
                            </defs>
                            <circle cx="50" cy="50" r="45" fill="url(#authLogoGrad)" />
                            <path d="M35 65 L50 35 L65 65" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="50" cy="28" r="6" fill="white" />
                        </svg>
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
                        {mode === 'login' ? 'Connexion' : 'Créer un compte'}
                    </h2>
                    <p style={{ color: 'var(--color-text-muted)', margin: 'var(--space-sm) 0 0' }}>
                        {mode === 'login'
                            ? 'Connectez-vous pour accéder à votre tableau de bord'
                            : 'Rejoignez Run Sync AI pour optimiser votre entraînement'
                        }
                    </p>
                </div>

                {error && (
                    <div className="auth-error">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {mode === 'register' && (
                        <div className="form-group">
                            <label>
                                <User size={16} />
                                Nom
                            </label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Votre nom"
                                value={formData.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>
                            <Mail size={16} />
                            Email
                        </label>
                        <input
                            type="email"
                            className="input"
                            placeholder="votre@email.com"
                            value={formData.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>
                            <Lock size={16} />
                            Mot de passe
                        </label>
                        <input
                            type="password"
                            className="input"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={(e) => handleChange('password', e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: 'var(--space-md)' }}
                        disabled={loading}
                    >
                        {loading ? 'Chargement...' : (
                            <>
                                {mode === 'login' ? 'Se connecter' : "S'inscrire"}
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    {mode === 'login' ? (
                        <p>
                            Pas encore de compte ?{' '}
                            <button
                                type="button"
                                className="link-button"
                                onClick={() => { setMode('register'); setError(''); }}
                            >
                                Créer un compte
                            </button>
                        </p>
                    ) : (
                        <p>
                            Déjà un compte ?{' '}
                            <button
                                type="button"
                                className="link-button"
                                onClick={() => { setMode('login'); setError(''); }}
                            >
                                Se connecter
                            </button>
                        </p>
                    )}
                </div>
            </div>

            <style>{`
                .auth-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(4px);
                }

                .auth-modal {
                    width: 100%;
                    max-width: 400px;
                    margin: var(--space-md);
                }

                .auth-header {
                    text-align: center;
                    margin-bottom: var(--space-lg);
                }

                .auth-error {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: var(--radius-md);
                    padding: var(--space-sm) var(--space-md);
                    margin-bottom: var(--space-md);
                    color: var(--color-danger-light);
                    font-size: 0.875rem;
                }

                .form-group {
                    margin-bottom: var(--space-md);
                }

                .form-group label {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    font-size: 0.875rem;
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-xs);
                }

                .auth-footer {
                    text-align: center;
                    margin-top: var(--space-lg);
                    padding-top: var(--space-lg);
                    border-top: 1px solid var(--color-border-light);
                }

                .auth-footer p {
                    margin: 0;
                    color: var(--color-text-muted);
                    font-size: 0.875rem;
                }

                .link-button {
                    background: none;
                    border: none;
                    color: var(--color-primary-light);
                    cursor: pointer;
                    font-size: inherit;
                    padding: 0;
                    text-decoration: underline;
                }

                .link-button:hover {
                    color: var(--color-primary);
                }
            `}</style>
        </div>
    );
}

export default AuthPage;
