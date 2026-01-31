import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Play, CheckCircle, AlertCircle, Clock, Target, Map, Timer, TrendingUp } from 'lucide-react';
import api from '../services/api';

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

export function TrainingCalendar({ goalId, onSessionClick }) {
    const [goal, setGoal] = useState(null);
    const [calendarData, setCalendarData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [generating, setGenerating] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        if (goalId) {
            loadCalendar();
        }
    }, [goalId]);

    const loadCalendar = async () => {
        setLoading(true);
        try {
            // Get goal details first
            const goalData = await api.getGoal(goalId);
            setGoal(goalData);

            // Then get unified calendar if plan exists
            if (goalData.plan_generated) {
                const calendar = await api.getGoalCalendar(goalId);
                setCalendarData(calendar);
            }
        } catch (error) {
            console.error('Failed to load calendar:', error);
        } finally {
            setLoading(false);
        }
    };

    const generatePlan = async () => {
        setGenerating(true);
        try {
            const result = await api.generatePlan(goalId);
            console.log('Plan generated:', result);
            await loadCalendar();
        } catch (error) {
            console.error('Failed to generate plan:', error);
        } finally {
            setGenerating(false);
        }
    };

    // Group items by date
    const itemsByDate = useMemo(() => {
        const map = {};
        if (calendarData?.items) {
            calendarData.items.forEach(item => {
                const dateKey = item.date;
                if (!map[dateKey]) {
                    map[dateKey] = [];
                }
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

        const startPadding = (firstDay.getDay() + 6) % 7; // Monday = 0
        const days = [];

        // Previous month padding
        for (let i = startPadding - 1; i >= 0; i--) {
            const date = new Date(year, month, -i);
            days.push({ date, isCurrentMonth: false });
        }

        // Current month
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(year, month, i);
            days.push({ date, isCurrentMonth: true });
        }

        // Next month padding
        const endPadding = 42 - days.length;
        for (let i = 1; i <= endPadding; i++) {
            const date = new Date(year, month + 1, i);
            days.push({ date, isCurrentMonth: false });
        }

        return days;
    }, [currentMonth]);

    const formatDate = (date) => {
        return date.toISOString().split('T')[0];
    };

    const isToday = (date) => {
        const today = new Date();
        return formatDate(date) === formatDate(today);
    };

    const isRaceDay = (date) => {
        return goal && formatDate(date) === goal.race_date;
    };

    const navigateMonth = (direction) => {
        setCurrentMonth(prev => {
            const next = new Date(prev);
            next.setMonth(next.getMonth() + direction);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="card">
                <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                    <div className="spinner" />
                    <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--space-md)' }}>
                        Chargement du plan...
                    </p>
                </div>
            </div>
        );
    }

    if (!goal) {
        return (
            <div className="card">
                <div style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                    <AlertCircle size={32} style={{ color: 'var(--color-warning)' }} />
                    <p style={{ marginTop: 'var(--space-md)' }}>Sélectionnez un objectif</p>
                </div>
            </div>
        );
    }

    return (
        <div className="card animate-fade-in">
            {/* Header */}
            <div className="card-header">
                <div>
                    <h3 className="card-title">
                        <Calendar size={20} />
                        {goal.name}
                    </h3>
                    <p style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-muted)',
                        marginTop: 'var(--space-xs)'
                    }}>
                        {goal.race_type.toUpperCase()} • {new Date(goal.race_date).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        })}
                        {goal.weeks_until_race && ` • ${goal.weeks_until_race} semaines`}
                    </p>
                </div>
                {!goal.plan_generated && (
                    <button
                        className="btn btn-primary"
                        onClick={generatePlan}
                        disabled={generating}
                    >
                        <Play size={16} />
                        {generating ? 'Génération...' : 'Générer le plan'}
                    </button>
                )}
            </div>

            {/* Coach Explanation */}
            {calendarData?.plan_explanation && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-md)',
                    marginBottom: 'var(--space-lg)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-sm)',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                    }}>
                        <TrendingUp size={18} />
                        Explication du Coach
                    </div>
                    <div style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        maxHeight: '200px',
                        overflow: 'auto',
                    }}>
                        {calendarData.plan_explanation.slice(0, 500)}
                        {calendarData.plan_explanation.length > 500 && '...'}
                    </div>
                </div>
            )}

            {/* Calendar Navigation */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-md)',
            }}>
                <button
                    className="btn btn-secondary"
                    onClick={() => navigateMonth(-1)}
                    style={{ padding: 'var(--space-xs)' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <h4 style={{ margin: 0 }}>
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
                                            ? 'rgba(16, 185, 129, 0.2)'  // Green for completed activities
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
                        {/* Duration */}
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

                        {/* Distance/Pace */}
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
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                        <Map size={14} /> Terrain
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
                                        {selectedItem.terrain_type || 'Route'}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Workout Details */}
                    {selectedItem.workout_details && (
                        <div style={{
                            marginTop: 'var(--space-md)',
                            padding: 'var(--space-sm)',
                            background: 'rgba(99, 102, 241, 0.05)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.875rem',
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.5,
                        }}>
                            {selectedItem.workout_details}
                        </div>
                    )}

                    {/* Intervals */}
                    {selectedItem.intervals && selectedItem.intervals.length > 0 && (
                        <div style={{ marginTop: 'var(--space-md)' }}>
                            <div style={{
                                fontSize: '0.75rem',
                                color: 'var(--color-text-muted)',
                                marginBottom: 'var(--space-xs)'
                            }}>
                                🔥 Structure du fractionné:
                            </div>
                            {selectedItem.intervals.map((interval, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    gap: 'var(--space-sm)',
                                    padding: 'var(--space-xs)',
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.875rem',
                                }}>
                                    <strong>{interval.reps}x{interval.distance_m}m</strong>
                                    <span>@ {formatPace(interval.pace_per_km)}</span>
                                    <span style={{ color: 'var(--color-text-muted)' }}>
                                        (récup {interval.recovery_seconds}s)
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Legend */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-sm)',
                marginTop: 'var(--space-lg)',
                paddingTop: 'var(--space-md)',
                borderTop: '1px solid var(--color-border-light)',
            }}>
                {/* Completed activity legend */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-xs)',
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                }}>
                    <span style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--color-success)',
                    }} />
                    ✓ Réalisé
                </div>
                {Object.entries(SESSION_ICONS).map(([type, icon]) => (
                    <div
                        key={type}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-xs)',
                            fontSize: '0.75rem',
                            color: 'var(--color-text-muted)',
                        }}
                    >
                        <span style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: SESSION_COLORS[type],
                        }} />
                        {icon} {type}
                    </div>
                ))}
            </div>

            <style>{`
                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid var(--color-border-light);
                    border-top-color: var(--color-primary);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default TrainingCalendar;
