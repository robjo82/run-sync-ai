import React, { useState, useEffect } from 'react';
import { RefreshCw, Link, Target, BarChart3, Plus, LogIn, LogOut, User, Archive, Calendar, Trash2 } from 'lucide-react';
import api from './services/api';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FitnessChart, AcwrGauge } from './components/FitnessChart';
import { ActivityList, ActivityStats } from './components/ActivityList';
import { DailyCheckin } from './components/DailyCheckin';
import { CoachingPanel } from './components/CoachingPanel';
import { RaceGoalForm } from './components/RaceGoalForm';
import { TrainingCalendar } from './components/TrainingCalendar';
import { LandingPage } from './pages/LandingPage';
import AuthModal from './components/AuthModal';
import RecordsCard from './components/RecordsCard';
import UnifiedActivitiesCard from './components/UnifiedActivitiesCard';
import FloatingCoach from './components/FloatingCoach';

function AppContent() {
    const { user, isAuthenticated, logout } = useAuth();

    // State
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

    // Fetch all data on mount if authenticated
    useEffect(() => {
        if (isAuthenticated) {
            loadDashboardData();
            loadGoals(); // Load goals on mount too
        } else {
            setData({ ...data, activities: [], fitnessHistory: null, stats: null });
        }
    }, [isAuthenticated]);

    const loadDashboardData = async (options = {}) => {
        const { refreshStatsOnly = false } = options;

        setLoading(prev => ({
            ...prev,
            activities: true,
            stats: true,
            metrics: true,
            // Only show loading for heavy items if we are actually fetching them
            fitness: !refreshStatsOnly ? true : prev.fitness,
            recommendation: !refreshStatsOnly ? true : prev.recommendation,
        }));

        try {
            // Always fetch strictly necessary data for list updates
            const activitiesPromise = api.getActivities({ limit: 200, include_excluded: true }).catch(() => []);
            const statsPromise = api.getActivityStats(7).catch(() => null);
            const acwrPromise = api.getAcwrStatus().catch(() => null);

            // Conditional heavy fetches
            const fitnessPromise = !refreshStatsOnly ? api.getFitnessHistory(90).catch(() => null) : Promise.resolve(null);
            const recommendationPromise = !refreshStatsOnly ? api.getRecommendation().catch(() => null) : Promise.resolve(null);
            const authPromise = !refreshStatsOnly ? api.getAuthStatus().catch(() => null) : Promise.resolve(null);

            const [activities, fitnessHistory, acwrStatus, recommendation, stats, authStatus] = await Promise.all([
                activitiesPromise,
                fitnessPromise,
                acwrPromise,
                recommendationPromise,
                statsPromise,
                authPromise,
            ]);

            setData(prev => ({
                ...prev,
                activities,
                stats,
                acwrStatus,
                // Only update if we fetched them, otherwise keep previous
                fitnessHistory: fitnessHistory || prev.fitnessHistory,
                recommendation: recommendation || prev.recommendation,
                authStatus: authStatus || prev.authStatus,
                // If we did a full refresh, update everything
            }));
        } catch (err) {
            console.error('Error loading dashboard:', err);
            setError('Erreur lors du chargement des données');
        } finally {
            setLoading({
                activities: false,
                stats: false,
                metrics: false,
                sync: false,
                goals: false,
                fitness: false,
                recommendation: false,
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
            const result = await api.syncStrava(365);
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

    // State for coach auto-message
    const [coachAutoMessage, setCoachAutoMessage] = useState(null);

    const handleGoalCreated = (goal) => {
        setShowGoalForm(false);
        loadGoals();
        setSelectedGoalId(goal.id);

        // Trigger auto-message to coach with full context
        const autoMsg = `Bonjour Coach ! Je viens de créer un nouvel objectif : 
- **Nom** : ${goal.name}
- **Course** : ${goal.race_type} le ${new Date(goal.race_date).toLocaleDateString('fr-FR')}
- **Objectif temps** : ${goal.target_time || 'Non spécifié'}

Peux-tu m'aider à créer un plan d'entraînement adapté à mon profil et mon historique d'activités ?`;
        setCoachAutoMessage(autoMsg);
    };

    // State for archive confirmation
    const [archiveConfirmGoalId, setArchiveConfirmGoalId] = useState(null);

    const handleGoalArchive = (goalId) => {
        // Show confirmation modal instead of browser dialog
        setArchiveConfirmGoalId(goalId);
    };

    const confirmArchive = async () => {
        const goalId = archiveConfirmGoalId;
        setArchiveConfirmGoalId(null);
        try {
            await api.deleteGoal(goalId);
            if (selectedGoalId === goalId) {
                setSelectedGoalId(null);
            }
            await loadGoals();
        } catch (err) {
            console.error('Error archiving goal:', err);
            alert("Erreur lors de l'archivage");
        }
    };

    if (!isAuthenticated) {
        return (
            <>
                <LandingPage />
                {showAuthModal && (
                    <AuthModal onClose={() => setShowAuthModal(false)} />
                )}
            </>
        );
    }

    return (
        <div className="app-container">
            {/* Auth Modal (for re-auth or profile if needed) */}
            {showAuthModal && (
                <AuthModal onClose={() => setShowAuthModal(false)} />
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

            {/* Unified View */}
            <>
                <section style={{ marginBottom: 'var(--space-xl)' }}>
                    <ActivityStats stats={data.stats} loading={loading.stats} />
                </section>

                <div className="dashboard-grid">
                    <div className="dashboard-main" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                        <FitnessChart data={data.fitnessHistory} loading={loading.fitness} />
                        <UnifiedActivitiesCard
                            activities={data.activities}
                            goalId={selectedGoalId}
                            loading={loading.activities}
                            onClassify={() => loadDashboardData({ refreshStatsOnly: true })}
                        />
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

                        {/* Goals Card */}
                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                                    <Target size={18} /> Objectifs
                                </h3>
                                <button className="btn btn-sm" onClick={() => setShowGoalForm(!showGoalForm)} style={{ padding: '4px 8px' }}>
                                    <Plus size={14} />
                                </button>
                            </div>

                            {showGoalForm && (
                                <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--color-border-light)' }}>
                                    <RaceGoalForm
                                        onGoalCreated={handleGoalCreated}
                                        onCancel={() => setShowGoalForm(false)}
                                    />
                                </div>
                            )}

                            {loading.goals ? (
                                <p style={{ padding: 'var(--space-md)', color: 'var(--color-text-muted)' }}>Chargement...</p>
                            ) : goals.length === 0 && !showGoalForm ? (
                                <p style={{ padding: 'var(--space-md)', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                    Aucun objectif. Cliquez + pour créer.
                                </p>
                            ) : !showGoalForm && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', padding: 'var(--space-sm)' }}>
                                    {goals.map(goal => (
                                        <div
                                            key={goal.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--space-xs)',
                                            }}
                                        >
                                            <button
                                                onClick={() => setSelectedGoalId(goal.id)}
                                                style={{
                                                    flex: 1,
                                                    padding: 'var(--space-sm)',
                                                    background: selectedGoalId === goal.id
                                                        ? 'var(--color-primary)'
                                                        : 'var(--color-bg-glass)',
                                                    border: '1px solid',
                                                    borderColor: selectedGoalId === goal.id
                                                        ? 'var(--color-primary)'
                                                        : 'var(--color-border-light)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    color: 'var(--color-text-primary)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                                                        {goal.name}
                                                    </span>
                                                    {goal.plan_generated && (
                                                        <Calendar size={12} style={{ color: selectedGoalId === goal.id ? 'rgba(255,255,255,0.8)' : 'var(--color-success)' }} title="Plan généré" />
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: selectedGoalId === goal.id ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)' }}>
                                                    {goal.race_type.toUpperCase()} • {new Date(goal.race_date).toLocaleDateString('fr-FR')}
                                                </div>
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleGoalArchive(goal.id);
                                                }}
                                                className="btn btn-icon"
                                                style={{
                                                    padding: '6px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--color-text-muted)',
                                                    cursor: 'pointer',
                                                }}
                                                title="Archiver l'objectif"
                                            >
                                                <Archive size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <CoachingPanel
                            recommendation={data.recommendation}
                            loading={loading.recommendation}
                            onApplyAdjustment={handleApplyAdjustment}
                        />
                        <DailyCheckin onSubmit={handleCheckinSubmit} loading={false} />
                        <RecordsCard />
                    </div>
                </div>
            </>

            {/* Archive Confirmation Modal */}
            {archiveConfirmGoalId && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000,
                }}>
                    <div style={{
                        background: '#1e1e2f',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-lg)',
                        maxWidth: '400px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                    }}>
                        <h3 style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text)' }}>
                            Archiver l'objectif ?
                        </h3>
                        <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-text-muted)' }}>
                            Les séances associées seront également archivées. Cette action est irréversible.
                        </p>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setArchiveConfirmGoalId(null)}
                                className="btn"
                                style={{ background: 'var(--color-bg-glass)' }}
                            >
                                Annuler
                            </button>
                            <button
                                onClick={confirmArchive}
                                className="btn"
                                style={{ background: 'var(--color-danger)', color: 'white' }}
                            >
                                Archiver
                            </button>
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

            {/* Floating Coach Button */}
            <FloatingCoach
                goals={goals}
                selectedGoalId={selectedGoalId}
                onGoalUpdated={loadGoals}
                autoMessage={coachAutoMessage}
                onAutoMessageConsumed={() => setCoachAutoMessage(null)}
            />
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
