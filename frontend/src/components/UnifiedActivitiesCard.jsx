import React, { useState, useEffect, useMemo } from 'react';
import {
    List, Calendar, CalendarDays, ChevronLeft, ChevronRight,
    Footprints, Bike, Waves, Mountain, CheckCircle, Target,
    Timer, Dumbbell, Wand2, X, Check, Activity
} from 'lucide-react';
import api from '../services/api';

// Activity type icons
const ACTIVITY_ICONS = {
    Run: Footprints,
    Ride: Bike,
    Swim: Waves,
    Hike: Mountain,
    Walk: Footprints,
    Workout: Dumbbell,
    default: Activity,
};

// Classification badges with styling
const CLASSIFICATION_BADGES = {
    workout: { label: '🏃 Entraînement', class: 'badge-info', key: 'workout' },
    commute: { label: '🚲 Trajet', class: 'badge-warning', key: 'commute' },
    recovery: { label: '🧘 Récupération', class: 'badge-success', key: 'recovery' },
    race: { label: '🏆 Course', class: 'badge-danger', key: 'race' },
    unknown: { label: '❓ Inconnu', class: '', key: 'unknown' },
};

// Session type colors (for planned sessions)
const SESSION_COLORS = {
    easy: '#22c55e',
    long: '#3b82f6',
    tempo: '#f59e0b',
    interval: '#ef4444',
    recovery: '#a855f7',
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

/**
 * Classification dropdown for manual selection
 */
function ClassificationDropdown({ onSelect, onClose }) {
    return (
        <>
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
            />
            <div className="animate-fade-in" style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 50,
                overflow: 'hidden',
                minWidth: '160px'
            }}>
                {Object.values(CLASSIFICATION_BADGES).filter(c => c.key !== 'unknown').map((type) => (
                    <button
                        key={type.key}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(type.key);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            width: '100%',
                            padding: 'var(--space-sm) var(--space-md)',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.875rem',
                            gap: '8px'
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'var(--color-bg-glass)'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        <span className={`badge ${type.class}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                            {type.label}
                        </span>
                    </button>
                ))}
            </div>
        </>
    );
}

/**
 * Single activity item for list view
 */
function ActivityItem({ activity, selected, onClick, activeDropdown, onToggleDropdown, onManualClassify }) {
    const IconComponent = ACTIVITY_ICONS[activity.activity_type] || ACTIVITY_ICONS.default;
    const classification = CLASSIFICATION_BADGES[activity.classification] || CLASSIFICATION_BADGES.unknown;

    const formatDistance = (meters) => {
        if (!meters) return '—';
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '—';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        });
    };

    return (
        <div
            className={`activity-item animate-slide-in ${selected ? 'selected' : ''}`}
            onClick={onClick}
            style={{
                cursor: 'pointer',
                border: selected ? '1px solid var(--color-primary)' : '1px solid transparent',
                background: selected ? 'var(--color-primary-light-10)' : undefined,
                position: 'relative',
                userSelect: 'none'
            }}
        >
            {selected && (
                <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'var(--color-primary)',
                    borderRadius: '50%',
                    width: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10
                }}>
                    <Check size={10} color="white" />
                </div>
            )}

            <div className="activity-icon">
                <IconComponent size={20} />
            </div>

            <div className="activity-details">
                <div className="activity-name">{activity.name}</div>
                <div className="activity-meta">
                    <span>{formatDate(activity.start_date)}</span>
                    <span>{formatDistance(activity.distance)}</span>
                    <span>{formatDuration(activity.moving_time)}</span>
                    {activity.trimp_score && (
                        <span style={{ color: 'var(--color-primary-light)' }}>
                            TRIMP: {activity.trimp_score.toFixed(0)}
                        </span>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-xs)', position: 'relative' }}>
                <button
                    className={`badge ${classification.class}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleDropdown();
                    }}
                    style={{
                        cursor: 'pointer',
                        border: 'none',
                        transition: 'transform 0.1s'
                    }}
                    onMouseDown={(e) => e.target.style.transform = 'scale(0.95)'}
                    onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
                >
                    {classification.label}
                </button>

                {activeDropdown && (
                    <ClassificationDropdown
                        onSelect={(type) => onManualClassify(type)}
                        onClose={() => onToggleDropdown()}
                    />
                )}

                {activity.classification_confidence < 0.7 && !activity.manually_classified && (
                    <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)' }}>
                        Confiance: {(activity.classification_confidence * 100).toFixed(0)}%
                    </span>
                )}
            </div>
        </div>
    );
}

function UnifiedActivitiesCard({
    activities = [],
    goalId = null,
    onClassify,
    onSessionClick,
    loading = false
}) {
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'month' | 'week'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [plan, setPlan] = useState(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [calendarData, setCalendarData] = useState(null);

    // Selection state
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isReclassifying, setIsReclassifying] = useState(false);
    const [activeDropdownId, setActiveDropdownId] = useState(null);

    // Load training plan data if goalId is provided
    useEffect(() => {
        if (goalId && viewMode !== 'list') {
            loadCalendarData();
        }
    }, [goalId, viewMode]);

    const loadCalendarData = async () => {
        if (!goalId) return;
        setPlanLoading(true);
        try {
            const calendar = await api.getGoalCalendar(goalId);
            setCalendarData(calendar);
        } catch (err) {
            console.error('Error loading calendar:', err);
        } finally {
            setPlanLoading(false);
        }
    };

    // Activity click handler with shift-select support
    const handleActivityClick = (e, activityId) => {
        e.preventDefault();

        const newSelected = new Set(selectedIds);

        if (e.shiftKey && lastSelectedId && activities) {
            // Range selection
            const lastIndex = activities.findIndex(a => a.id === lastSelectedId);
            const currentIndex = activities.findIndex(a => a.id === activityId);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);
                const range = activities.slice(start, end + 1);
                range.forEach(a => newSelected.add(a.id));
            }
        } else {
            // Toggle
            if (newSelected.has(activityId)) {
                newSelected.delete(activityId);
            } else {
                newSelected.add(activityId);
            }
        }

        setSelectedIds(newSelected);
        setLastSelectedId(activityId);
    };

    // AI batch reclassification
    const handleBatchClassify = async () => {
        if (selectedIds.size === 0) return;

        setIsReclassifying(true);
        try {
            await api.reclassifyActivities(Array.from(selectedIds));
            setSelectedIds(new Set());
            setLastSelectedId(null);
            if (onClassify) onClassify();
        } catch (error) {
            console.error("Batch classification failed:", error);
            alert("Erreur lors de la requalification");
        } finally {
            setIsReclassifying(false);
        }
    };

    // Manual batch classification
    const handleManualBatchClassify = async (classificationKey, sourceActivityId) => {
        let idsToUpdate = [];

        if (selectedIds.has(sourceActivityId)) {
            idsToUpdate = Array.from(selectedIds);
        } else {
            idsToUpdate = [sourceActivityId];
        }

        setActiveDropdownId(null);
        setIsReclassifying(true);

        try {
            const classificationObj = {
                classification: classificationKey,
                confidence: 1.0,
                reasoning: "Manually updated by user",
                include_in_training_load: classificationKey !== 'commute'
            };

            if (classificationKey === 'workout' || classificationKey === 'race') {
                classificationObj.include_in_training_load = true;
            } else if (classificationKey === 'commute') {
                classificationObj.include_in_training_load = false;
            } else {
                classificationObj.include_in_training_load = true;
            }

            await api.batchUpdateClassification(idsToUpdate, classificationObj);

            if (selectedIds.has(sourceActivityId)) {
                setSelectedIds(new Set());
                setLastSelectedId(null);
            }

            if (onClassify) onClassify();
        } catch (error) {
            console.error("Manual batch update failed:", error);
            alert("Erreur lors de la mise à jour");
        } finally {
            setIsReclassifying(false);
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
        setLastSelectedId(null);
    };

    // Helper functions
    const formatDateStr = (date) => {
        return date.toISOString().split('T')[0];
    };

    const formatDistance = (meters) => {
        if (!meters) return '-';
        return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '-';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`;
    };

    // Navigate calendar
    const navigateMonth = (direction) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(newDate.getMonth() + direction);
            return newDate;
        });
    };

    const navigateWeek = (direction) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + (direction * 7));
            return newDate;
        });
    };

    // Build activities map by date
    const activitiesByDate = useMemo(() => {
        const map = {};
        activities.forEach(activity => {
            const date = activity.start_date?.split('T')[0];
            if (date) {
                if (!map[date]) map[date] = [];
                map[date].push(activity);
            }
        });
        return map;
    }, [activities]);

    // Build calendar items map (sessions + activities from goal calendar)
    const calendarItemsByDate = useMemo(() => {
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

    // Get calendar days
    const getCalendarDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Start from Monday of first week
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1));

        const days = [];
        const current = new Date(startDate);

        while (current <= lastDay || days.length % 7 !== 0) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
            if (days.length > 42) break; // Max 6 weeks
        }

        return days;
    };

    // Get week days
    const getWeekDays = () => {
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1)); // Monday

        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    };

    // Hours for week view (6am - 10pm)
    const weekHours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

    const isToday = (date) => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    // Render List View
    const renderListView = () => (
        <div className="activity-list" style={{ position: 'relative', paddingBottom: selectedIds.size > 0 ? '60px' : '0' }}>
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="skeleton" style={{ height: '70px' }} />
                    ))}
                </div>
            ) : activities.length === 0 ? (
                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <Activity size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                    <p>Aucune activité synchronisée</p>
                    <p style={{ fontSize: '0.875rem' }}>Synchronisez vos activités Strava pour commencer</p>
                </div>
            ) : (
                <div className="activity-items" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {activities.slice(0, 30).map(activity => (
                        <ActivityItem
                            key={activity.id}
                            activity={activity}
                            selected={selectedIds.has(activity.id)}
                            onClick={(e) => handleActivityClick(e, activity.id)}
                            activeDropdown={activeDropdownId === activity.id}
                            onToggleDropdown={() => setActiveDropdownId(activeDropdownId === activity.id ? null : activity.id)}
                            onManualClassify={(type) => handleManualBatchClassify(type, activity.id)}
                        />
                    ))}
                </div>
            )}

            {/* Action Bar */}
            {selectedIds.size > 0 && (
                <div className="animate-slide-up" style={{
                    position: 'absolute',
                    bottom: 'var(--space-md)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: 'var(--radius-full)',
                    padding: 'var(--space-xs) var(--space-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-md)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    zIndex: 100,
                    width: 'max-content'
                }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {selectedIds.size} sélectionnée(s)
                    </span>

                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleBatchClassify}
                        disabled={isReclassifying}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        {isReclassifying ? (
                            <>
                                <span className="spinner-small"></span>
                                Traitement...
                            </>
                        ) : (
                            <>
                                <Wand2 size={14} />
                                Requalifier via IA
                            </>
                        )}
                    </button>

                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={clearSelection}
                        style={{ padding: '4px' }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );

    // Render Day Cell (shared for month and week views)
    const renderDayCell = (date, isWeekView = false) => {
        const dateStr = formatDateStr(date);
        const dayActivities = activitiesByDate[dateStr] || [];
        const calendarItems = calendarItemsByDate[dateStr] || [];
        const isCurrentMonth = date.getMonth() === currentDate.getMonth();

        return (
            <div
                key={dateStr}
                className={`calendar-day ${isToday(date) ? 'today' : ''} ${!isCurrentMonth && !isWeekView ? 'other-month' : ''}`}
                style={{
                    minHeight: isWeekView ? '120px' : '80px',
                    flex: isWeekView ? 1 : undefined,
                }}
            >
                <div className="day-header">
                    <span className="day-number">{date.getDate()}</span>
                    {isWeekView && (
                        <span className="day-name">{date.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                    )}
                </div>

                {/* Calendar items (scheduled sessions) from goal */}
                {calendarItems.map((item, idx) => (
                    <div
                        key={idx}
                        className="session-item"
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
                            cursor: 'pointer',
                        }}
                        onClick={() => onSessionClick?.(item)}
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
                                {isWeekView && <span className="session-title">{item.title || item.session_type}</span>}
                                {!isWeekView && <span>{item.target_duration_min}min</span>}
                            </>
                        )}
                    </div>
                ))}

                {/* Completed activities (if not already in calendarItems) */}
                {dayActivities.filter(a => !calendarItems.some(c => c.type === 'activity' && c.strava_id === a.strava_id)).map((activity, idx) => {
                    const Icon = ACTIVITY_ICONS[activity.activity_type] || Footprints;
                    return (
                        <div
                            key={`act-${idx}`}
                            className="activity-dot"
                            title={`${activity.name} - ${formatDistance(activity.distance)}`}
                        >
                            <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />
                            {isWeekView && (
                                <span className="activity-title">{activity.name}</span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Render Month View
    const renderMonthView = () => {
        const days = getCalendarDays();
        const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

        return (
            <div className="calendar-month">
                <div className="calendar-header-row">
                    {weekDays.map(day => (
                        <div key={day} className="calendar-weekday">{day}</div>
                    ))}
                </div>
                <div className="calendar-grid">
                    {days.map(date => renderDayCell(date, false))}
                </div>
            </div>
        );
    };

    // Render Week View with hours
    const renderWeekView = () => {
        const days = getWeekDays();

        return (
            <div className="calendar-week">
                {/* Header row with day names */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-light)' }}>
                    <div style={{ width: '50px', flexShrink: 0 }}></div>
                    {days.map(date => (
                        <div
                            key={formatDateStr(date)}
                            style={{
                                flex: 1,
                                textAlign: 'center',
                                padding: 'var(--space-sm)',
                                fontWeight: isToday(date) ? 600 : 400,
                                background: isToday(date) ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                            }}
                        >
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                {date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                            </div>
                            <div style={{ fontSize: '1rem' }}>{date.getDate()}</div>
                        </div>
                    ))}
                </div>

                {/* Time slots */}
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {weekHours.map(hour => (
                        <div key={hour} style={{ display: 'flex', borderBottom: '1px solid var(--color-border-light)' }}>
                            <div style={{
                                width: '50px',
                                flexShrink: 0,
                                padding: 'var(--space-xs)',
                                fontSize: '0.7rem',
                                color: 'var(--color-text-muted)',
                                textAlign: 'right',
                                borderRight: '1px solid var(--color-border-light)',
                            }}>
                                {hour}:00
                            </div>
                            {days.map(date => {
                                const dateStr = formatDateStr(date);
                                const calendarItems = calendarItemsByDate[dateStr] || [];
                                const dayActivities = activitiesByDate[dateStr] || [];

                                // Filter activities that start at this hour
                                const activitiesAtHour = dayActivities.filter(a => {
                                    if (!a.start_date) return false;
                                    const activityDate = new Date(a.start_date);
                                    return activityDate.getHours() === hour;
                                });

                                // Filter sessions by approximate time if they have one
                                const sessionsAtHour = calendarItems.filter(item => {
                                    // Sessions don't have exact times, show them at 8am by default
                                    if (item.type === 'activity' && item.time) {
                                        const hours = parseInt(item.time.split(':')[0], 10);
                                        return hours === hour;
                                    }
                                    return hour === 8 && item.type !== 'activity';
                                });

                                return (
                                    <div
                                        key={`${dateStr}-${hour}`}
                                        style={{
                                            flex: 1,
                                            minHeight: '30px',
                                            borderRight: '1px solid var(--color-border-light)',
                                            padding: '2px',
                                            background: isToday(date) ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                        }}
                                    >
                                        {sessionsAtHour.map((item, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 4px',
                                                    background: item.type === 'activity'
                                                        ? 'rgba(16, 185, 129, 0.2)'
                                                        : `${SESSION_COLORS[item.session_type] || 'var(--color-primary)'}22`,
                                                    borderLeft: `3px solid ${item.type === 'activity' ? 'var(--color-success)' : SESSION_COLORS[item.session_type] || 'var(--color-primary)'}`,
                                                    borderRadius: 'var(--radius-sm)',
                                                    marginBottom: '2px',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => onSessionClick?.(item)}
                                            >
                                                {item.type === 'activity' ? (
                                                    <span>✓ {item.distance_km}km</span>
                                                ) : (
                                                    <span>{SESSION_ICONS[item.session_type]} {item.target_duration_min}min</span>
                                                )}
                                            </div>
                                        ))}
                                        {activitiesAtHour.map((activity, idx) => (
                                            <div
                                                key={`act-${idx}`}
                                                style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 4px',
                                                    background: 'rgba(16, 185, 129, 0.2)',
                                                    borderLeft: '3px solid var(--color-success)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    marginBottom: '2px',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                                title={activity.name}
                                            >
                                                ✓ {formatDistance(activity.distance)}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="card unified-activities-card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <Calendar size={20} />
                    Activités
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                        {activities?.length || 0}
                    </span>
                </h3>

                <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                    {/* Calendar navigation (only for calendar views) */}
                    {viewMode !== 'list' && (
                        <>
                            <button
                                className="btn btn-icon"
                                onClick={() => viewMode === 'week' ? navigateWeek(-1) : navigateMonth(-1)}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span style={{ minWidth: '120px', textAlign: 'center', fontSize: '0.875rem' }}>
                                {viewMode === 'week'
                                    ? `Semaine du ${currentDate.toLocaleDateString('fr-FR')}`
                                    : currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                                }
                            </span>
                            <button
                                className="btn btn-icon"
                                onClick={() => viewMode === 'week' ? navigateWeek(1) : navigateMonth(1)}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </>
                    )}

                    {/* View toggle */}
                    <div className="view-toggle">
                        <button
                            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="Vue liste"
                        >
                            <List size={16} />
                        </button>
                        <button
                            className={`view-btn ${viewMode === 'month' ? 'active' : ''}`}
                            onClick={() => setViewMode('month')}
                            title="Vue mois"
                        >
                            <Calendar size={16} />
                        </button>
                        <button
                            className={`view-btn ${viewMode === 'week' ? 'active' : ''}`}
                            onClick={() => setViewMode('week')}
                            title="Vue semaine"
                        >
                            <CalendarDays size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="card-content">
                {viewMode === 'list' && renderListView()}
                {viewMode === 'month' && renderMonthView()}
                {viewMode === 'week' && renderWeekView()}
            </div>

            <style>{`
                .unified-activities-card .card-content {
                    padding: 0;
                }
                
                .view-toggle {
                    display: flex;
                    gap: 2px;
                    background: var(--color-bg-glass);
                    padding: 4px;
                    border-radius: var(--radius-md);
                }
                
                .view-btn {
                    padding: 6px 10px;
                    border: none;
                    background: transparent;
                    color: var(--color-text-muted);
                    cursor: pointer;
                    border-radius: var(--radius-sm);
                    transition: all var(--transition-fast);
                }
                
                .view-btn:hover {
                    background: rgba(255,255,255,0.1);
                }
                
                .view-btn.active {
                    background: var(--color-primary);
                    color: white;
                }
                
                .btn-icon {
                    padding: 6px;
                    border: none;
                    background: var(--color-bg-glass);
                    color: var(--color-text-primary);
                    cursor: pointer;
                    border-radius: var(--radius-sm);
                }
                
                .btn-icon:hover {
                    background: rgba(255,255,255,0.15);
                }
                
                /* List View */
                .activity-list {
                    max-height: 500px;
                    overflow-y: auto;
                }
                
                .activity-item {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-md);
                    border-bottom: 1px solid var(--color-border-light);
                    transition: background 0.15s ease;
                }
                
                .activity-item:hover {
                    background: rgba(255,255,255,0.02);
                }
                
                .activity-icon {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--color-bg-glass);
                    border-radius: 50%;
                    color: var(--color-primary);
                }
                
                .activity-details {
                    flex: 1;
                }
                
                .activity-name {
                    font-weight: 500;
                    margin-bottom: 2px;
                }
                
                .activity-meta {
                    font-size: 0.75rem;
                    color: var(--color-text-muted);
                    display: flex;
                    gap: var(--space-sm);
                }
                
                /* Calendar Views */
                .calendar-header-row {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    text-align: center;
                    padding: var(--space-sm);
                    border-bottom: 1px solid var(--color-border-light);
                }
                
                .calendar-weekday {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--color-text-muted);
                    text-transform: uppercase;
                }
                
                .calendar-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                }
                
                .calendar-day {
                    padding: var(--space-xs);
                    border-right: 1px solid var(--color-border-light);
                    border-bottom: 1px solid var(--color-border-light);
                    min-height: 80px;
                }
                
                .calendar-day.other-month {
                    opacity: 0.4;
                }
                
                .calendar-day.today {
                    background: rgba(99, 102, 241, 0.1);
                }
                
                .calendar-day.today .day-number {
                    background: var(--color-primary);
                    color: white;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .day-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--space-xs);
                }
                
                .day-number {
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                
                .day-name {
                    font-size: 0.7rem;
                    color: var(--color-text-muted);
                    text-transform: uppercase;
                }
                
                .session-item:hover {
                    filter: brightness(1.1);
                }
                
                .activity-dot {
                    font-size: 0.7rem;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-bottom: 2px;
                }
                
                .activity-title {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 100px;
                }
                
                /* Week View */
                .week-grid {
                    display: flex;
                }
                
                .calendar-week .calendar-day {
                    flex: 1;
                    min-height: 150px;
                }
            `}</style>
        </div>
    );
}

export default UnifiedActivitiesCard;
export { UnifiedActivitiesCard };
