import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, Target, Map, Timer, MessageSquare, Archive } from 'lucide-react';
import api from '../services/api';
import CoachingChat from './CoachingChat';

const SESSION_COLORS = {
    easy: 'var(--color-success)',
    long: 'var(--color-primary)',
    tempo: 'var(--color-warning)',
    interval: 'var(--color-danger)',
    recovery: 'var(--color-text-muted)',
    rest: 'var(--color-border)',
    cross: 'var(--color-secondary)',
};

const SESSION_ICONS = {
    easy: '🏃',
    long: '🏃‍♂️',
    tempo: '⚡',
    interval: '🔥',
    recovery: '🧘',
    rest: '😴',
    cross: '🚴',
};

// Format pace from seconds to MM:SS
const formatPace = (secondsPerKm) => {
    if (!secondsPerKm) return null;
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = secondsPerKm % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
};

export function TrainingCalendar({ goalId, onSessionClick, onGoalArchived }) {
    const [goal, setGoal] = useState(null);
    const [calendarData, setCalendarData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedItem, setSelectedItem] = useState(null);

    // Coaching integration
    const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'chat'
    const [threads, setThreads] = useState([]);
    const [activeThread, setActiveThread] = useState(null);

    useEffect(() => {
        if (goalId) {
            loadData();
        }
    }, [goalId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [goalData, threadsData] = await Promise.all([
                api.getGoal(goalId),
                api.getGoalThreads(goalId)
            ]);

            setGoal(goalData);
            setThreads(threadsData);

            // Set active thread if exists, else create one or wait
            if (threadsData.length > 0) {
                setActiveThread(threadsData[0]);
            }

            if (goalData.plan_generated) {
                const calendar = await api.getGoalCalendar(goalId);
                setCalendarData(calendar);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Prepare calendar data
    const itemsByDate = useMemo(() => {
        const map = {};
        if (calendarData?.items) {
            calendarData.items.forEach(item => {
                const dateKey = item.date;
                if (!map[dateKey]) map[dateKey] = [];
                map[dateKey].push(item);
            });
        }
        return map;
    }, [calendarData]);

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Days from prev month
        const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const days = [];

        for (let i = startPadding; i > 0; i--) {
            const d = new Date(year, month, 1 - i);
            days.push({ date: d, isCurrentMonth: false });
        }

        // Current month
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const d = new Date(year, month, i);
            days.push({ date: d, isCurrentMonth: true });
        }

        // Next month padding
        const remainingCells = 42 - days.length;
        for (let i = 1; i <= remainingCells; i++) {
            const d = new Date(year, month + 1, i);
            days.push({ date: d, isCurrentMonth: false });
        }

        return days;
    }, [currentMonth]);

    const formatDate = (date) => {
        return date.toISOString().split('T')[0];
    };

    const isToday = (date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };

    const isRaceDay = (date) => {
        if (!goal?.race_date) return false;
        return formatDate(date) === goal.race_date;
    };

    const navigateMonth = (direction) => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

    const handleArchive = async () => {
        if (window.confirm('Voulez-vous vraiment archiver cet objectif ?')) {
            try {
                await api.deleteGoal(goalId);
                if (onGoalArchived) onGoalArchived();
            } catch (error) {
                console.error('Failed to archive goal:', error);
                alert("Erreur lors de l'archivage");
            }
        }
    };

    const handleThreadCreated = async (newThread) => {
        await loadData(); // Reload threads
        setActiveThread(newThread);
    };

    const handlePlanUpdate = async () => {
        // Reload goal and calendar to see new plan
        await loadData();
        setActiveTab('calendar'); // Switch back to calendar to see changes
    };

    if (loading && !goal) {
        return <div className="p-4 text-center">Chargement...</div>;
    }

    return (
        <div className="animate-fade-in">
            {/* Header with Tabs */}
            <div className="card-header" style={{ marginBottom: 'var(--space-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="tabs" style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button
                        className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('calendar')}
                    >
                        <Calendar size={16} /> Calendrier
                    </button>
                    <button
                        className={`btn ${activeTab === 'chat' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setActiveTab('chat')}
                    >
                        <MessageSquare size={16} /> Coach
                    </button>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button
                        className="btn btn-ghost text-danger"
                        onClick={handleArchive}
                        title="Archiver l'objectif"
                    >
                        <Archive size={16} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="card">
                {activeTab === 'chat' ? (
                    <CoachingChat
                        goalId={goalId}
                        threadId={activeThread?.id}
                        onThreadCreated={handleThreadCreated}
                        onPlanUpdate={handlePlanUpdate}
                    />
                ) : (
                    <>
                        {/* Calendar Navigation */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--space-lg)',
                            padding: 'var(--space-md)',
                            borderBottom: '1px solid var(--color-border-light)'
                        }}>
                            <div style={{
                                display: 'flex',
                                gap: 'var(--space-md)',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 600 }}>
                                    {goal?.name}
                                </div>
                                {!goal?.plan_generated && (
                                    <span className="badge badge-warning">Plan non généré</span>
                                )}
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 'var(--space-sm)'
                            }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigateMonth(-1)}
                                    style={{ padding: 'var(--space-xs)' }}
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <h4 style={{ margin: 0, minWidth: '140px', textAlign: 'center' }}>
                                    {currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                                </h4>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => navigateMonth(1)}
                                    style={{ padding: 'var(--space-xs)' }}
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Calendar Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '2px',
                        }}>
                            {/* Day headers */}
                            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                                <div key={day} style={{
                                    textAlign: 'center',
                                    padding: 'var(--space-xs)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: 'var(--color-text-muted)',
                                }}>
                                    {day}
                                </div>
                            ))}

                            {/* Calendar cells */}
                            {calendarDays.map(({ date, isCurrentMonth }, index) => {
                                const dateKey = formatDate(date);
                                const dayItems = itemsByDate[dateKey] || [];
                                const isCurrentDay = isToday(date);
                                const isRace = isRaceDay(date);

                                return (
                                    <div
                                        key={index}
                                        onClick={() => dayItems.length > 0 && setSelectedItem(dayItems[0])}
                                        style={{
                                            minHeight: '70px',
                                            padding: 'var(--space-xs)',
                                            background: isRace
                                                ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))'
                                                : isCurrentDay
                                                    ? 'rgba(99, 102, 241, 0.1)'
                                                    : isCurrentMonth
                                                        ? 'var(--color-bg-glass)'
                                                        : 'transparent',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: dayItems.length > 0 ? 'pointer' : 'default',
                                            opacity: isCurrentMonth ? 1 : 0.4,
                                            transition: 'all var(--transition-fast)',
                                            border: isCurrentDay ? '2px solid var(--color-primary)' : 'none',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '0.75rem',
                                            fontWeight: isCurrentDay || isRace ? 600 : 400,
                                            color: isRace ? 'white' : 'var(--color-text-secondary)',
                                            marginBottom: '2px',
                                        }}>
                                            {date.getDate()}
                                            {isRace && ' 🏁'}
                                        </div>

                                        {dayItems.map((item, i) => (
                                            <div
                                                key={i}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    padding: '2px 4px',
                                                    background: item.type === 'activity'
                                                        ? 'rgba(16, 185, 129, 0.2)'
                                                        : `${SESSION_COLORS[item.session_type] || 'var(--color-primary)'}22`,
                                                    borderLeft: item.type === 'activity'
                                                        ? '3px solid var(--color-success)'
                                                        : `3px solid ${SESSION_COLORS[item.session_type] || 'var(--color-primary)'}`,
                                                    borderRadius: 'var(--radius-sm)',
                                                    fontSize: '0.65rem',
                                                    marginBottom: '2px',
                                                    overflow: 'hidden',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {item.type === 'activity' ? (
                                                    <>
                                                        <CheckCircle size={10} style={{ color: 'var(--color-success)' }} />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                                            {item.distance_km}km
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>{SESSION_ICONS[item.session_type] || '🏃'}</span>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                                            {item.target_duration_min}min
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Selected Session Details */}
                        {selectedItem && (
                            <div style={{
                                marginTop: 'var(--space-lg)',
                                padding: 'var(--space-md)',
                                background: 'var(--color-bg-glass)',
                                borderRadius: 'var(--radius-md)',
                                border: `2px solid ${selectedItem.type === 'activity' ? 'var(--color-success)' : SESSION_COLORS[selectedItem.session_type] || 'var(--color-primary)'}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h4 style={{ margin: 0, marginBottom: 'var(--space-xs)' }}>
                                            {selectedItem.type === 'activity' ? (
                                                <>✓ {selectedItem.title}</>
                                            ) : (
                                                <>{SESSION_ICONS[selectedItem.session_type]} {selectedItem.title}</>
                                            )}
                                        </h4>
                                        <p style={{
                                            fontSize: '0.875rem',
                                            color: 'var(--color-text-muted)',
                                            margin: 0
                                        }}>
                                            {new Date(selectedItem.date).toLocaleDateString('fr-FR', {
                                                weekday: 'long',
                                                day: 'numeric',
                                                month: 'long'
                                            })}
                                        </p>
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setSelectedItem(null)}
                                        style={{ padding: 'var(--space-xs)' }}
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                                    gap: 'var(--space-md)',
                                    marginTop: 'var(--space-md)',
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                            <Timer size={14} /> Durée
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                            {selectedItem.type === 'activity'
                                                ? `${selectedItem.duration_min}min`
                                                : `${selectedItem.target_duration_min}min`
                                            }
                                        </div>
                                    </div>

                                    {selectedItem.type === 'activity' ? (
                                        <>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                    <Map size={14} /> Distance
                                                </div>
                                                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                                    {selectedItem.distance_km}km
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                    <Target size={14} /> Allure
                                                </div>
                                                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                                    {formatPace(selectedItem.pace_per_km) || 'N/A'}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                    <Target size={14} /> Allure cible
                                                </div>
                                                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                                    {formatPace(selectedItem.target_pace_per_km) || 'Libre'}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {selectedItem.workout_details && (
                                    <div style={{ marginTop: 'var(--space-md)', padding: 'var(--space-md)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>Détails de la séance</div>
                                        <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-line' }}>{selectedItem.workout_details}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default TrainingCalendar;
