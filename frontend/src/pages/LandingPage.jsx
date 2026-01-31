import React, { useState } from 'react';
import { Activity, Zap, TrendingUp, Calendar, ArrowRight, CheckCircle } from 'lucide-react';
import AuthModal from "../components/AuthModal";

export function LandingPage() {
    const [showAuth, setShowAuth] = useState(false);
    const [authMode, setAuthMode] = useState('login');

    const handleStart = (mode = 'register') => {
        setAuthMode(mode);
        setShowAuth(true);
    };

    return (
        <div className="landing-container">
            {/* Header */}
            <header className="landing-header">
                <div className="logo">
                    <svg className="logo-icon" viewBox="0 0 100 100" style={{ width: 40, height: 40 }}>
                        <defs>
                            <linearGradient id="landingLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style={{ stopColor: '#6366f1' }} />
                                <stop offset="100%" style={{ stopColor: '#8b5cf6' }} />
                            </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="45" fill="url(#landingLogoGrad)" />
                        <path d="M35 65 L50 35 L65 65" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="logo-text">Run Sync AI</span>
                </div>
                <div className="header-actions">
                    <button className="btn btn-ghost" onClick={() => handleStart('login')}>
                        Se connecter
                    </button>
                    <button className="btn btn-primary" onClick={() => handleStart('register')}>
                        Commencer
                    </button>
                </div>
            </header>

            {/* Hero Section */}
            <section className="hero">
                <div className="hero-content animate-fade-in">
                    <h1 className="hero-title">
                        Votre coach de running <span className="text-gradient">intelligent</span>
                    </h1>
                    <p className="hero-subtitle">
                        Plans d'entraînement adaptatifs, synchronisation Strava et conseils personnalisés par IA.
                        Progressez à votre rythme, sans risque de blessure.
                    </p>
                    <div className="hero-buttons">
                        <button className="btn btn-primary btn-lg" onClick={() => handleStart('register')}>
                            Je me lance gratuitement
                            <ArrowRight size={20} />
                        </button>
                    </div>
                </div>

                {/* Visual / Screenshot placeholder */}
                <div className="hero-visual animate-slide-up">
                    <div className="visual-card">
                        <div className="stat-row">
                            <Activity className="text-primary" />
                            <div className="stat-info">
                                <span className="stat-label">Volume hebdo</span>
                                <span className="stat-value">42.5 km</span>
                            </div>
                            <div className="stat-chart">
                                <div className="bar" style={{ height: '40%' }}></div>
                                <div className="bar" style={{ height: '60%' }}></div>
                                <div className="bar" style={{ height: '85%' }}></div>
                                <div className="bar full" style={{ height: '100%' }}></div>
                            </div>
                        </div>
                        <div className="stat-row">
                            <Zap className="text-warning" />
                            <div className="stat-info">
                                <span className="stat-label">Forme</span>
                                <span className="stat-value">+12%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="features">
                <div className="feature-card">
                    <div className="feature-icon bg-blue">
                        <Calendar size={24} />
                    </div>
                    <h3>Plans Dynamiques</h3>
                    <p>Votre plan s'adapte chaque semaine selon votre forme et vos disponibilités.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon bg-purple">
                        <TrendingUp size={24} />
                    </div>
                    <h3>Analyse ACWR</h3>
                    <p>Suivi de la charge d'entraînement pour prévenir les blessures et le surentraînement.</p>
                </div>
                <div className="feature-card">
                    <div className="feature-icon bg-green">
                        <Zap size={24} />
                    </div>
                    <h3>Coaching IA</h3>
                    <p>Discutez avec votre coach virtuel pour ajuster vos séances ou poser des questions.</p>
                </div>
            </section>

            {/* Auth Modal */}
            {showAuth && (
                <AuthModal
                    initialMode={authMode}
                    onClose={() => setShowAuth(false)}
                />
            )}

            <style>{`
                .landing-container {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.15), transparent 40%),
                                radial-gradient(circle at bottom left, rgba(139, 92, 246, 0.15), transparent 40%);
                }

                .landing-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-lg) var(--space-2xl);
                }

                .header-actions {
                    display: flex;
                    gap: var(--space-md);
                }

                .hero {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    padding: var(--space-2xl);
                    gap: var(--space-2xl);
                }

                .hero-content {
                    max-width: 800px;
                }

                .hero-title {
                    font-size: 3.5rem;
                    line-height: 1.1;
                    margin-bottom: var(--space-lg);
                    letter-spacing: -0.02em;
                }

                .hero-subtitle {
                    font-size: 1.25rem;
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-xl);
                    line-height: 1.6;
                    max-width: 600px;
                    margin-left: auto;
                    margin-right: auto;
                }

                .text-gradient {
                    background: linear-gradient(135deg, #6366f1, #a855f7);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .visual-card {
                    background: var(--color-bg-glass);
                    border: 1px solid var(--color-border-light);
                    padding: var(--space-xl);
                    border-radius: var(--radius-lg);
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.3);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                    min-width: 300px;
                    backdrop-filter: blur(10px);
                }

                .stat-row {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                }

                .stat-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                }

                .stat-label {
                    font-size: 0.75rem;
                    color: var(--color-text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                }

                .stat-chart {
                    display: flex;
                    gap: 4px;
                    align-items: flex-end;
                    height: 30px;
                }

                .bar {
                    width: 6px;
                    background: var(--color-primary);
                    opacity: 0.3;
                    border-radius: 2px;
                }

                .bar.full {
                    opacity: 1;
                }

                .features {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: var(--space-xl);
                    padding: var(--space-2xl);
                    max-width: 1200px;
                    margin: 0 auto;
                    width: 100%;
                }

                .feature-card {
                    background: var(--color-bg-elevated);
                    padding: var(--space-xl);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--color-border);
                    transition: transform 0.2s;
                }

                .feature-card:hover {
                    transform: translateY(-5px);
                }

                .feature-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: var(--space-md);
                    color: white;
                }

                .bg-blue { background: var(--color-primary); }
                .bg-purple { background: #a855f7; }
                .bg-green { background: #10b981; }

                @media (max-width: 768px) {
                    .hero-title { font-size: 2.5rem; }
                    .features { grid-template-columns: 1fr; }
                    .landing-header { padding: var(--space-md); }
                }
            `}</style>
        </div>
    );
}

export default LandingPage;
