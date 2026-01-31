import React, { useState, useEffect } from 'react';
import { RefreshCw, Link, Target, BarChart3, Plus, LogIn, LogOut, User } from 'lucide-react';
import api from './services/api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FitnessChart, AcwrGauge } from './components/FitnessChart';
import { ActivityList, ActivityStats } from './components/ActivityList';
import { DailyCheckin } from './components/DailyCheckin';
import { CoachingPanel } from './components/CoachingPanel';
import { RaceGoalForm } from './components/RaceGoalForm';
import { TrainingCalendar } from './components/TrainingCalendar';
import { AuthPage } from './pages/AuthPage';

function AppContent() {
    const { user, isAuthenticated, logout } = useAuth();

    // State
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'goals'
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [selectedGoalId, setSelectedGoalId] = useState(null);
    const [goals, setGoals] = useState([]);

    const [loading, setLoading] = useState({
        activities: true,
        fitness: true,
        metrics: true,
        recommendation: true,
        stats: true,
        sync: false,
        goals: false,
    });

    const [data, setData] = useState({
        activities: [],
        fitnessHistory: null,
        acwrStatus: null,
        recommendation: null,
        stats: null,
        authStatus: null,
    });

    const [error, setError] = useState(null);

    // Fetch all data on mount
    useEffect(() => {
        loadDashboardData();
    }, []);

    useEffect(() => {
        if (activeTab === 'goals') {
            loadGoals();
        }
    }, [activeTab]);

    const loadDashboardData = async () => {
        try {
            const [activities, fitnessHistory, acwrStatus, recommendation, stats, authStatus] = await Promise.all([
                api.getActivities({ limit: 200, include_excluded: true }).catch(() => []),
                api.getFitnessHistory(90).catch(() => null),
                api.getAcwrStatus().catch(() => null),
                api.getRecommendation().catch(() => null),
                api.getActivityStats(7).catch(() => null),
                api.getAuthStatus().catch(() => null),
            ]);

            setData({
                activities,
                fitnessHistory,
                acwrStatus,
                recommendation,
                stats,
                authStatus,
            });
        } catch (err) {
            console.error('Error loading dashboard:', err);
            setError('Erreur lors du chargement des données');
        } finally {
            setLoading({
                activities: false,
                fitness: false,
                metrics: false,
                recommendation: false,
                stats: false,
                sync: false,
                goals: false,
            });
        }
    };

    const loadGoals = async () => {
        setLoading(prev => ({ ...prev, goals: true }));
        try {
            const goalsData = await api.getGoals();
            setGoals(goalsData);
            if (goalsData.length > 0 && !selectedGoalId) {
                setSelectedGoalId(goalsData[0].id);
            }
        } catch (err) {
            console.error('Error loading goals:', err);
        } finally {
            setLoading(prev => ({ ...prev, goals: false }));
        }
    };

    const handleSync = async () => {
        setLoading(prev => ({ ...prev, sync: true }));
        setError(null);

        try {
            const result = await api.syncStrava(30);
            console.log('Sync result:', result);
            await loadDashboardData();
        } catch (err) {
            console.error('Sync error:', err);
            setError('Erreur lors de la synchronisation Strava');
        } finally {
            setLoading(prev => ({ ...prev, sync: false }));
        }
    };

    const handleCheckinSubmit = async (checkinData) => {
        try {
            await api.createCheckin(checkinData);
            const recommendation = await api.getRecommendation().catch(() => null);
            setData(prev => ({ ...prev, recommendation }));
        } catch (err) {
            console.error('Checkin error:', err);
            setError('Erreur lors de l\'enregistrement du check-in');
        }
    };

    const handleApplyAdjustment = async (adjustment) => {
        console.log('Applying adjustment:', adjustment);
    };

    const handleGoalCreated = (goal) => {
        setShowGoalForm(false);
        loadGoals();
        setSelectedGoalId(goal.id);
    };

    return (
        <div className="app-container">
            {/* Auth Modal */}
            {showAuthModal && (
                <AuthPage onClose={() => setShowAuthModal(false)} />
            )}

            {/* Header */}
            <header className="header">
                <div className="logo">
                    <svg className="logo-icon" viewBox="0 0 100 100">
                        <defs>
                            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style={{ stopColor: '#6366f1' }} />
                                <stop offset="100%" style={{ stopColor: '#8b5cf6' }} />
                            </linearGradient>
                        </defs>
                        <circle cx="50" cy="50" r="45" fill="url(#logoGrad)" />
                        <path d="M35 65 L50 35 L65 65" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="50" cy="28" r="6" fill="white" />
                        <path d="M30 75 Q50 85 70 75" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                    <span className="logo-text">Run Sync AI</span>
                </div>

                {/* Navigation Tabs */}
                <nav className="nav-tabs">
                    <button
                        className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveTab('dashboard')}
                    >
                        <BarChart3 size={16} />
                        Dashboard
                    </button>
                    <button
                        className={`nav-tab ${activeTab === 'goals' ? 'active' : ''}`}
                        onClick={() => setActiveTab('goals')}
                    >
                        <Target size={16} />
                        Objectifs
                    </button>
                </nav>

                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                    {data.authStatus?.strava_connected ? (
                        <span className="badge badge-success">Strava connecté</span>
                    ) : (
                        <a href="/api/v1/auth/strava" className="btn btn-secondary">
                            <Link size={16} /> Connecter Strava
                        </a>
                    )}

                    <button
                        className="btn btn-primary"
                        onClick={handleSync}
                        disabled={loading.sync}
                    >
                        <RefreshCw size={16} className={loading.sync ? 'animate-pulse' : ''} />
                        {loading.sync ? 'Sync...' : 'Sync'}
                    </button>

                    {isAuthenticated ? (
                        <button className="btn btn-secondary" onClick={logout}>
                            <LogOut size={16} />
                        </button>
                    ) : (
                        <button className="btn btn-secondary" onClick={() => setShowAuthModal(true)}>
                            <LogIn size={16} />
                        </button>
                    )}
                </div>
            </header>

            {/* Error banner */}
            {error && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-md)',
                    marginBottom: 'var(--space-lg)',
                    color: 'var(--color-danger-light)',
                }}>
                    {error}
                </div>
            )}

            {/* Dashboard View */}
            {activeTab === 'dashboard' && (
                <>
                    <section style={{ marginBottom: 'var(--space-xl)' }}>
                        <ActivityStats stats={data.stats} loading={loading.stats} />
                    </section>

                    <div className="dashboard-grid">
                        <div className="dashboard-main" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                            <FitnessChart data={data.fitnessHistory} loading={loading.fitness} />
                            <ActivityList activities={data.activities} loading={loading.activities} />
                        </div>

                        <div className="dashboard-sidebar">
                            {data.acwrStatus && (
                                <AcwrGauge
                                    acwr={data.acwrStatus.acwr}
                                    status={data.acwrStatus.status}
                                    zone={data.acwrStatus.zone}
                                    message={data.acwrStatus.message}
                                />
                            )}
                            <CoachingPanel
                                recommendation={data.recommendation}
                                loading={loading.recommendation}
                                onApplyAdjustment={handleApplyAdjustment}
                            />
                            <DailyCheckin onSubmit={handleCheckinSubmit} loading={false} />
                        </div>
                    </div>
                </>
            )}

            {/* Goals View */}
            {activeTab === 'goals' && (
                <div className="goals-view">
                    <div className="goals-header" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-lg)'
                    }}>
                        <h2 style={{ margin: 0 }}>
                            <Target size={24} style={{ verticalAlign: 'middle', marginRight: 'var(--space-sm)' }} />
                            Mes Objectifs
                        </h2>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowGoalForm(!showGoalForm)}
                        >
                            <Plus size={16} />
                            Nouvel objectif
                        </button>
                    </div>

                    <div className="dashboard-grid">
                        <div className="dashboard-main" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                            {/* Goal Form */}
                            {showGoalForm && (
                                <RaceGoalForm
                                    onGoalCreated={handleGoalCreated}
                                    onCancel={() => setShowGoalForm(false)}
                                />
                            )}

                            {/* Training Calendar */}
                            {selectedGoalId && !showGoalForm && (
                                <TrainingCalendar
                                    goalId={selectedGoalId}
                                    onSessionClick={(session) => console.log('Session clicked:', session)}
                                />
                            )}

                            {/* No goals message */}
                            {goals.length === 0 && !showGoalForm && !loading.goals && (
                                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                                    <Target size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)' }} />
                                    <h3>Aucun objectif défini</h3>
                                    <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>
                                        Créez votre premier objectif pour générer un plan d'entraînement personnalisé
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => setShowGoalForm(true)}
                                    >
                                        <Plus size={16} />
                                        Créer un objectif
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Goals Sidebar */}
                        <div className="dashboard-sidebar">
                            <div className="card">
                                <div className="card-header">
                                    <h3 className="card-title">Objectifs actifs</h3>
                                </div>

                                {loading.goals ? (
                                    <p style={{ color: 'var(--color-text-muted)' }}>Chargement...</p>
                                ) : goals.length === 0 ? (
                                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                        Aucun objectif
                                    </p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                                        {goals.map(goal => (
                                            <button
                                                key={goal.id}
                                                onClick={() => { setSelectedGoalId(goal.id); setShowGoalForm(false); }}
                                                style={{
                                                    padding: 'var(--space-md)',
                                                    background: selectedGoalId === goal.id
                                                        ? 'var(--color-primary)'
                                                        : 'var(--color-bg-glass)',
                                                    border: '1px solid',
                                                    borderColor: selectedGoalId === goal.id
                                                        ? 'var(--color-primary)'
                                                        : 'var(--color-border-light)',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    color: 'var(--color-text-primary)',
                                                }}
                                            >
                                                <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                                    {goal.name}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                    {goal.race_type.toUpperCase()} • {new Date(goal.race_date).toLocaleDateString('fr-FR')}
                                                </div>
                                                {goal.plan_generated && (
                                                    <span className="badge badge-success" style={{ marginTop: 'var(--space-xs)' }}>
                                                        Plan généré
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer style={{
                marginTop: 'var(--space-2xl)',
                paddingTop: 'var(--space-lg)',
                borderTop: '1px solid var(--color-border-light)',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem'
            }}>
                <p>Run Sync AI • Coaching adaptatif propulsé par Gemini</p>
            </footer>

            <style>{`
                .nav-tabs {
                    display: flex;
                    gap: var(--space-xs);
                    background: var(--color-bg-glass);
                    padding: var(--space-xs);
                    border-radius: var(--radius-lg);
                }

                .nav-tab {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                    padding: var(--space-sm) var(--space-md);
                    background: transparent;
                    border: none;
                    border-radius: var(--radius-md);
                    color: var(--color-text-muted);
                    cursor: pointer;
                    font-size: 0.875rem;
                    font-weight: 500;
                    transition: all var(--transition-fast);
                }

                .nav-tab:hover {
                    color: var(--color-text-primary);
                    background: rgba(255, 255, 255, 0.05);
                }

                .nav-tab.active {
                    background: var(--color-primary);
                    color: white;
                }
            `}</style>
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;
