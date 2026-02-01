import { Activity, Bike, Footprints, Waves, Mountain, Dumbbell, Check, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import api from '../services/api';

const ACTIVITY_ICONS = {
    Run: Footprints,
    Ride: Bike,
    Swim: Waves,
    Hike: Mountain,
    Walk: Footprints,
    Workout: Dumbbell,
    default: Activity,
};

const CLASSIFICATION_BADGES = {
    workout: { label: '🏃 Entraînement', class: 'badge-info', key: 'workout' },
    commute: { label: '🚲 Trajet', class: 'badge-warning', key: 'commute' },
    recovery: { label: '🧘 Récupération', class: 'badge-success', key: 'recovery' },
    race: { label: '🏆 Course', class: 'badge-danger', key: 'race' },
    unknown: { label: '❓ Inconnu', class: '', key: 'unknown' },
};

/**
 * Dropdown for manual classification selection
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
 * Single activity item component
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

/**
 * Activity list component
 */
export function ActivityList({ activities, loading, onClassify }) {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isReclassifying, setIsReclassifying] = useState(false);
    const [activeDropdownId, setActiveDropdownId] = useState(null);

    const handleActivityClick = (e, activityId) => {
        e.preventDefault(); // Prevent text selection

        const newSelected = new Set(selectedIds);

        if (e.shiftKey && lastSelectedId && activities) {
            // Range selection
            const lastIndex = activities.findIndex(a => a.id === lastSelectedId);
            const currentIndex = activities.findIndex(a => a.id === activityId);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);

                const range = activities.slice(start, end + 1);

                // If current item is being selected, select range. If deselecting, deselect range?
                // Standard behavior: select range inclusive
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

    const handleBatchClassify = async () => {
        if (selectedIds.size === 0) return;

        setIsReclassifying(true);
        try {
            const result = await api.reclassifyActivities(Array.from(selectedIds));
            setSelectedIds(new Set()); // Clear selection
            setLastSelectedId(null);
            if (onClassify) onClassify(); // Refresh list
        } catch (error) {
            console.error("Batch classification failed:", error);
            alert("Erreur lors de la requalification");
        } finally {
            setIsReclassifying(false);
        }
    };

    const handleManualBatchClassify = async (classificationKey, sourceActivityId) => {
        // If source activity is part of selection, update ALL selection.
        // Otherwise, update ONLY source activity.
        let idsToUpdate = [];

        if (selectedIds.has(sourceActivityId)) {
            idsToUpdate = Array.from(selectedIds);
        } else {
            idsToUpdate = [sourceActivityId];
        }

        setActiveDropdownId(null); // Close dropdown
        setIsReclassifying(true);

        try {
            // Prepare classification object
            const classificationObj = {
                classification: classificationKey,
                confidence: 1.0,
                reasoning: "Manually updated by user",
                include_in_training_load: classificationKey !== 'commute' // Default logic
            };

            // Override include_in_training_load logic based on key if needed, or stick to simple
            if (classificationKey === 'workout' || classificationKey === 'race') {
                classificationObj.include_in_training_load = true;
            } else if (classificationKey === 'commute') {
                // Often commutes are excluded, but let's assume false for now as per prompt example
                classificationObj.include_in_training_load = false;
            } else {
                classificationObj.include_in_training_load = true; // Recovery
            }

            await api.batchUpdateClassification(idsToUpdate, classificationObj);

            // If we updated the selection, clear it
            if (selectedIds.has(sourceActivityId)) {
                setSelectedIds(new Set());
                setLastSelectedId(null);
            }

            if (onClassify) onClassify(); // Refresh list
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

    if (loading) {
        return (
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Activités récentes</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="skeleton" style={{ height: '70px' }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="card animate-fade-in" style={{ position: 'relative' }}>
            <div className="card-header">
                <h3 className="card-title">Activités récentes</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {activities?.length || 0} activités
                </span>
            </div>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-sm)',
                maxHeight: '400px',
                overflowY: 'auto',
                paddingBottom: selectedIds.size > 0 ? '60px' : '0' // Space for action bar
            }}>
                {activities?.length > 0 ? (
                    activities.map((activity) => (
                        <ActivityItem
                            key={activity.id}
                            activity={activity}
                            selected={selectedIds.has(activity.id)}
                            onClick={(e) => handleActivityClick(e, activity.id)}
                            activeDropdown={activeDropdownId === activity.id}
                            onToggleDropdown={() => setActiveDropdownId(activeDropdownId === activity.id ? null : activity.id)}
                            onManualClassify={(type) => handleManualBatchClassify(type, activity.id)}
                        />
                    ))
                ) : (
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--space-xl)',
                        color: 'var(--color-text-muted)'
                    }}>
                        <Activity size={48} style={{ marginBottom: 'var(--space-md)', opacity: 0.5 }} />
                        <p>Aucune activité trouvée</p>
                        <p style={{ fontSize: '0.875rem' }}>
                            Synchronisez vos activités Strava pour commencer
                        </p>
                    </div>
                )}
            </div>

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
}

/**
 * Activity stats cards
 */
export function ActivityStats({ stats, loading }) {
    if (loading) {
        return (
            <div className="grid grid-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="card">
                        <div className="skeleton" style={{ height: '60px' }} />
                    </div>
                ))}
            </div>
        );
    }

    const statCards = [
        {
            label: 'Activités',
            value: stats?.total_activities || 0,
            suffix: '',
            icon: Activity,
        },
        {
            label: 'Distance',
            value: stats?.total_distance_km?.toFixed(1) || 0,
            suffix: 'km',
            icon: Footprints,
        },
        {
            label: 'Durée',
            value: stats?.total_time_hours?.toFixed(1) || 0,
            suffix: 'h',
            icon: Activity,
        },
        {
            label: 'TRIMP Total',
            value: stats?.total_trimp?.toFixed(0) || 0,
            suffix: '',
            icon: Dumbbell,
        },
    ];

    return (
        <div className="grid grid-4">
            {statCards.map((stat, i) => (
                <div key={i} className="card animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--color-bg-glass)',
                            borderRadius: 'var(--radius-md)',
                        }}>
                            <stat.icon size={24} style={{ color: 'var(--color-primary-light)' }} />
                        </div>
                        <div>
                            <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                                {stat.value}{stat.suffix}
                            </div>
                            <div className="stat-label">{stat.label}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default ActivityList;
