import React from 'react';
import { Activity, Bike, Footprints, Waves, Mountain, Dumbbell } from 'lucide-react';

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
    workout: { label: '🏃 Entraînement', class: 'badge-info' },
    commute: { label: '🚲 Trajet', class: 'badge-warning' },
    recovery: { label: '🧘 Récupération', class: 'badge-success' },
    race: { label: '🏆 Course', class: 'badge-danger' },
    unknown: { label: '❓ Inconnu', class: '' },
};

/**
 * Single activity item component
 */
function ActivityItem({ activity, onClassify }) {
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
        <div className="activity-item animate-slide-in">
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

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-xs)' }}>
                <span className={`badge ${classification.class}`}>
                    {classification.label}
                </span>
                {activity.classification_confidence < 0.7 && (
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
        <div className="card animate-fade-in">
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
            }}>
                {activities?.length > 0 ? (
                    activities.map((activity) => (
                        <ActivityItem
                            key={activity.id}
                            activity={activity}
                            onClassify={onClassify}
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
