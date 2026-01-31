import React, { useState } from 'react';
import { Moon, Zap, Brain, Heart, AlertCircle, Check } from 'lucide-react';

const EMOJI_SCALES = {
    sleep: ['😴', '😪', '😐', '😊', '🌟'],
    energy: ['🪫', '😓', '😐', '⚡', '🔥'],
    stress: ['😌', '🙂', '😐', '😰', '😱'],
    mood: ['😢', '😕', '😐', '🙂', '😄'],
};

const BODY_PARTS = [
    'Cheville', 'Genou', 'Hanche', 'Mollet', 'Quadriceps',
    'Ischio-jambiers', 'Bas du dos', 'Épaule', 'Autre'
];

/**
 * Daily Check-in Form
 */
export function DailyCheckin({ onSubmit, existingCheckin, loading }) {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        rpe: existingCheckin?.rpe || 5,
        sleep_quality: existingCheckin?.sleep_quality || 3,
        energy_level: existingCheckin?.energy_level || 3,
        stress_level: existingCheckin?.stress_level || 2,
        mood: existingCheckin?.mood || 3,
        soreness_level: existingCheckin?.soreness_level || 0,
        soreness_location: existingCheckin?.soreness_location || '',
        notes: existingCheckin?.notes || '',
    });

    const [submitted, setSubmitted] = useState(false);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        await onSubmit(formData);
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 2000);
    };

    const EmojiSlider = ({ field, label, icon: Icon, scale }) => (
        <div style={{ marginBottom: 'var(--space-lg)' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                marginBottom: 'var(--space-sm)'
            }}>
                <Icon size={16} style={{ color: 'var(--color-primary-light)' }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                    {label}
                </span>
            </div>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--color-bg-glass)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-sm)',
            }}>
                {scale.map((emoji, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => handleChange(field, i + 1)}
                        style={{
                            background: formData[field] === i + 1 ? 'var(--color-primary)' : 'transparent',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            padding: 'var(--space-sm)',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                            transform: formData[field] === i + 1 ? 'scale(1.2)' : 'scale(1)',
                        }}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="card animate-fade-in">
            <div className="card-header">
                <h3 className="card-title">Check-in du jour</h3>
                {submitted && (
                    <span className="badge badge-success">
                        <Check size={12} /> Enregistré
                    </span>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <EmojiSlider
                    field="sleep_quality"
                    label="Qualité du sommeil"
                    icon={Moon}
                    scale={EMOJI_SCALES.sleep}
                />

                <EmojiSlider
                    field="energy_level"
                    label="Niveau d'énergie"
                    icon={Zap}
                    scale={EMOJI_SCALES.energy}
                />

                <EmojiSlider
                    field="stress_level"
                    label="Niveau de stress"
                    icon={Brain}
                    scale={EMOJI_SCALES.stress}
                />

                <EmojiSlider
                    field="mood"
                    label="Humeur"
                    icon={Heart}
                    scale={EMOJI_SCALES.mood}
                />

                {/* Soreness section */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        marginBottom: 'var(--space-sm)'
                    }}>
                        <AlertCircle size={16} style={{ color: 'var(--color-warning)' }} />
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Douleur / Courbatures ({formData.soreness_level}/10)
                        </span>
                    </div>

                    <input
                        type="range"
                        min="0"
                        max="10"
                        value={formData.soreness_level}
                        onChange={(e) => handleChange('soreness_level', parseInt(e.target.value))}
                        className="slider"
                        style={{ width: '100%' }}
                    />

                    {formData.soreness_level > 0 && (
                        <div style={{ marginTop: 'var(--space-md)' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                Localisation
                            </label>
                            <select
                                value={formData.soreness_location}
                                onChange={(e) => handleChange('soreness_location', e.target.value)}
                                className="input"
                                style={{ marginTop: 'var(--space-xs)' }}
                            >
                                <option value="">Sélectionner...</option>
                                {BODY_PARTS.map((part) => (
                                    <option key={part} value={part.toLowerCase()}>{part}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* RPE */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        display: 'block',
                        marginBottom: 'var(--space-sm)'
                    }}>
                        RPE (Effort perçu hier) : {formData.rpe}/10
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={formData.rpe}
                        onChange={(e) => handleChange('rpe', parseInt(e.target.value))}
                        className="slider"
                    />
                </div>

                {/* Notes */}
                <div style={{ marginBottom: 'var(--space-lg)' }}>
                    <label style={{
                        fontSize: '0.875rem',
                        color: 'var(--color-text-secondary)',
                        display: 'block',
                        marginBottom: 'var(--space-sm)'
                    }}>
                        Notes (optionnel)
                    </label>
                    <textarea
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                        className="input"
                        rows={2}
                        placeholder="Comment vous sentez-vous aujourd'hui?"
                        style={{ resize: 'vertical' }}
                    />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                    {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
            </form>
        </div>
    );
}

export default DailyCheckin;
