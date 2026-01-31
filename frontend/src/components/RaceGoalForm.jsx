import React, { useState } from 'react';
import { Target, Calendar, Clock, Trophy, Plus, ChevronDown } from 'lucide-react';
import api from '../services/api';

const RACE_TYPES = [
    { value: '5k', label: '5 km', icon: '🏃' },
    { value: '10k', label: '10 km', icon: '🏃‍♂️' },
    { value: 'half', label: 'Semi-marathon', icon: '🥈' },
    { value: 'marathon', label: 'Marathon', icon: '🏅' },
    { value: 'trail', label: 'Trail', icon: '⛰️' },
    { value: 'ultra', label: 'Ultra', icon: '🦸' },
];

const PRIORITIES = [
    { value: 'A', label: 'Objectif principal', color: 'var(--color-success)' },
    { value: 'B', label: 'Objectif secondaire', color: 'var(--color-warning)' },
    { value: 'C', label: 'Course de préparation', color: 'var(--color-text-muted)' },
];

const DAYS = [
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mer' },
    { value: 4, label: 'Jeu' },
    { value: 5, label: 'Ven' },
    { value: 6, label: 'Sam' },
    { value: 7, label: 'Dim' },
];

export function RaceGoalForm({ onGoalCreated, onCancel }) {
    const [formData, setFormData] = useState({
        name: '',
        race_date: '',
        race_type: 'half',
        target_hours: 1,
        target_minutes: 45,
        target_seconds: 0,
        priority: 'A',
        available_days: [1, 2, 3, 5, 6, 7],
        long_run_day: 6,
        max_weekly_hours: 8,
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const toggleDay = (day) => {
        setFormData(prev => ({
            ...prev,
            available_days: prev.available_days.includes(day)
                ? prev.available_days.filter(d => d !== day)
                : [...prev.available_days, day].sort()
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Convert target time to seconds
            const target_time_seconds =
                formData.target_hours * 3600 +
                formData.target_minutes * 60 +
                formData.target_seconds;

            const goalData = {
                name: formData.name,
                race_date: formData.race_date,
                race_type: formData.race_type,
                target_time_seconds,
                priority: formData.priority,
                available_days: formData.available_days.join(','),
                long_run_day: formData.long_run_day,
                max_weekly_hours: formData.max_weekly_hours,
            };

            const goal = await api.createGoal(goalData);
            onGoalCreated?.(goal);
        } catch (err) {
            setError(err.message || 'Erreur lors de la création de l\'objectif');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card animate-fade-in">
            <div className="card-header">
                <h3 className="card-title">
                    <Target size={20} />
                    Nouvel objectif course
                </h3>
            </div>

            <form onSubmit={handleSubmit}>
                {error && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-sm) var(--space-md)',
                        marginBottom: 'var(--space-md)',
                        color: 'var(--color-danger-light)',
                        fontSize: '0.875rem',
                    }}>
                        {error}
                    </div>
                )}

                {/* Race Name */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xs)'
                    }}>
                        <Trophy size={14} />
                        Nom de la course
                    </label>
                    <input
                        type="text"
                        className="input"
                        placeholder="Marathon de Paris 2026"
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        required
                    />
                </div>

                {/* Race Date */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xs)'
                    }}>
                        <Calendar size={14} />
                        Date de la course
                    </label>
                    <input
                        type="date"
                        className="input"
                        value={formData.race_date}
                        onChange={(e) => handleChange('race_date', e.target.value)}
                        required
                        min={new Date().toISOString().split('T')[0]}
                    />
                </div>

                {/* Race Type */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xs)',
                        display: 'block'
                    }}>
                        Type de course
                    </label>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 'var(--space-sm)',
                    }}>
                        {RACE_TYPES.map((type) => (
                            <button
                                key={type.value}
                                type="button"
                                onClick={() => handleChange('race_type', type.value)}
                                style={{
                                    padding: 'var(--space-sm)',
                                    background: formData.race_type === type.value
                                        ? 'var(--color-primary)'
                                        : 'var(--color-bg-glass)',
                                    border: '1px solid',
                                    borderColor: formData.race_type === type.value
                                        ? 'var(--color-primary)'
                                        : 'var(--color-border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    transition: 'all var(--transition-fast)',
                                    color: 'var(--color-text-primary)',
                                }}
                            >
                                <span style={{ fontSize: '1.25rem' }}>{type.icon}</span>
                                <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                                    {type.label}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Target Time */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xs)'
                    }}>
                        <Clock size={14} />
                        Temps cible (optionnel)
                    </label>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                        <input
                            type="number"
                            className="input"
                            placeholder="H"
                            min="0"
                            max="23"
                            value={formData.target_hours}
                            onChange={(e) => handleChange('target_hours', parseInt(e.target.value) || 0)}
                            style={{ width: '60px', textAlign: 'center' }}
                        />
                        <span>:</span>
                        <input
                            type="number"
                            className="input"
                            placeholder="M"
                            min="0"
                            max="59"
                            value={formData.target_minutes}
                            onChange={(e) => handleChange('target_minutes', parseInt(e.target.value) || 0)}
                            style={{ width: '60px', textAlign: 'center' }}
                        />
                        <span>:</span>
                        <input
                            type="number"
                            className="input"
                            placeholder="S"
                            min="0"
                            max="59"
                            value={formData.target_seconds}
                            onChange={(e) => handleChange('target_seconds', parseInt(e.target.value) || 0)}
                            style={{ width: '60px', textAlign: 'center' }}
                        />
                    </div>
                </div>

                {/* Priority */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <label style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--space-xs)',
                        display: 'block'
                    }}>
                        Priorité
                    </label>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        {PRIORITIES.map((p) => (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => handleChange('priority', p.value)}
                                style={{
                                    flex: 1,
                                    padding: 'var(--space-sm)',
                                    background: formData.priority === p.value
                                        ? 'var(--color-bg-glass)'
                                        : 'transparent',
                                    border: '2px solid',
                                    borderColor: formData.priority === p.value
                                        ? p.color
                                        : 'var(--color-border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    color: 'var(--color-text-primary)',
                                    fontSize: '0.75rem',
                                }}
                            >
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: '2px',
                                    color: formData.priority === p.value ? p.color : 'inherit'
                                }}>
                                    {p.value}
                                </div>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Advanced Options Toggle */}
                <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-xs)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-primary-light)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        marginBottom: 'var(--space-md)',
                        padding: 0,
                    }}
                >
                    <ChevronDown
                        size={16}
                        style={{
                            transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform var(--transition-fast)'
                        }}
                    />
                    Options avancées
                </button>

                {showAdvanced && (
                    <div style={{
                        background: 'var(--color-bg-glass)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-md)',
                        marginBottom: 'var(--space-md)',
                    }}>
                        {/* Available Days */}
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={{
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                marginBottom: 'var(--space-xs)',
                                display: 'block'
                            }}>
                                Jours disponibles pour s'entraîner
                            </label>
                            <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                {DAYS.map((day) => (
                                    <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => toggleDay(day.value)}
                                        style={{
                                            flex: 1,
                                            padding: 'var(--space-xs)',
                                            background: formData.available_days.includes(day.value)
                                                ? 'var(--color-primary)'
                                                : 'transparent',
                                            border: '1px solid',
                                            borderColor: formData.available_days.includes(day.value)
                                                ? 'var(--color-primary)'
                                                : 'var(--color-border-light)',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer',
                                            color: 'var(--color-text-primary)',
                                            fontSize: '0.75rem',
                                        }}
                                    >
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Long Run Day */}
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <label style={{
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                marginBottom: 'var(--space-xs)',
                                display: 'block'
                            }}>
                                Jour préféré pour la sortie longue
                            </label>
                            <select
                                className="input"
                                value={formData.long_run_day}
                                onChange={(e) => handleChange('long_run_day', parseInt(e.target.value))}
                            >
                                {DAYS.map((day) => (
                                    <option key={day.value} value={day.value}>{day.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Max Weekly Hours */}
                        <div>
                            <label style={{
                                fontSize: '0.875rem',
                                color: 'var(--color-text-secondary)',
                                marginBottom: 'var(--space-xs)',
                                display: 'block'
                            }}>
                                Heures max d'entraînement par semaine: {formData.max_weekly_hours}h
                            </label>
                            <input
                                type="range"
                                min="4"
                                max="20"
                                value={formData.max_weekly_hours}
                                onChange={(e) => handleChange('max_weekly_hours', parseInt(e.target.value))}
                                className="slider"
                            />
                        </div>
                    </div>
                )}

                {/* Submit Buttons */}
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    {onCancel && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onCancel}
                            style={{ flex: 1 }}
                        >
                            Annuler
                        </button>
                    )}
                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ flex: 2 }}
                        disabled={loading}
                    >
                        <Plus size={16} />
                        {loading ? 'Création...' : 'Créer l\'objectif'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default RaceGoalForm;
