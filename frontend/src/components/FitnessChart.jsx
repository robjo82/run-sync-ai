import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Area,
    ComposedChart,
    ReferenceLine,
} from 'recharts';

/**
 * Fitness Chart - CTL/ATL/TSB visualization
 */
export function FitnessChart({ data, loading }) {
    if (loading) {
        return (
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Fitness & Fatigue</h3>
                </div>
                <div className="skeleton" style={{ height: '300px' }} />
            </div>
        );
    }

    const chartData = data?.dates?.map((date, i) => ({
        date: new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
        ctl: data.ctl_values[i],
        atl: data.atl_values[i],
        tsb: data.tsb_values[i],
    })) || [];

    return (
        <div className="card animate-fade-in">
            <div className="card-header">
                <h3 className="card-title">Fitness & Fatigue</h3>
                <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--color-fitness)' }}>● Fitness (CTL)</span>
                    <span style={{ color: 'var(--color-fatigue)' }}>● Fatigue (ATL)</span>
                    <span style={{ color: 'var(--color-form)' }}>● Form (TSB)</span>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                        <linearGradient id="tsbGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-form)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--color-form)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                        dataKey="date"
                        stroke="var(--color-text-muted)"
                        fontSize={11}
                        tickLine={false}
                    />
                    <YAxis
                        stroke="var(--color-text-muted)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text-primary)',
                        }}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="3 3" />
                    <Area
                        type="monotone"
                        dataKey="tsb"
                        stroke="var(--color-form)"
                        fill="url(#tsbGradient)"
                        strokeWidth={2}
                    />
                    <Line
                        type="monotone"
                        dataKey="ctl"
                        stroke="var(--color-fitness)"
                        strokeWidth={2}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="atl"
                        stroke="var(--color-fatigue)"
                        strokeWidth={2}
                        dot={false}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}

/**
 * ACWR Gauge Component
 */
export function AcwrGauge({ acwr, status, zone, message }) {
    const getZoneColor = () => {
        switch (status) {
            case 'good': return 'var(--color-success)';
            case 'caution': return 'var(--color-warning)';
            case 'danger': return 'var(--color-danger)';
            default: return 'var(--color-warning)';
        }
    };

    const getZoneLabel = () => {
        switch (zone) {
            case 'optimal': return 'Zone optimale';
            case 'overreaching': return 'Surcharge';
            case 'danger': return 'Zone à risque';
            case 'detraining': return 'Désentraînement';
            default: return zone;
        }
    };

    // Calculate needle rotation (0.5 = 90deg center, range 0-2 mapped to 0-180deg)
    const rotation = Math.min(Math.max((acwr / 2) * 180, 0), 180);

    return (
        <div className="card animate-fade-in">
            <div className="card-header">
                <h3 className="card-title">Ratio de Charge (ACWR)</h3>
                <span className={`badge badge-${status === 'good' ? 'success' : status === 'caution' ? 'warning' : 'danger'}`}>
                    {getZoneLabel()}
                </span>
            </div>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 'var(--space-lg) 0'
            }}>
                {/* Gauge SVG */}
                <svg width="200" height="120" viewBox="0 0 200 120">
                    {/* Background arc */}
                    <path
                        d="M 20 100 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="var(--color-bg-tertiary)"
                        strokeWidth="16"
                        strokeLinecap="round"
                    />

                    {/* Colored zones */}
                    {/* Detraining zone (0-0.8) */}
                    <path
                        d="M 20 100 A 80 80 0 0 1 56 36"
                        fill="none"
                        stroke="var(--color-warning)"
                        strokeWidth="16"
                        strokeLinecap="round"
                        opacity="0.6"
                    />

                    {/* Optimal zone (0.8-1.3) */}
                    <path
                        d="M 56 36 A 80 80 0 0 1 144 36"
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="16"
                        opacity="0.6"
                    />

                    {/* Overreaching zone (1.3-1.5) */}
                    <path
                        d="M 144 36 A 80 80 0 0 1 165 55"
                        fill="none"
                        stroke="var(--color-warning)"
                        strokeWidth="16"
                        opacity="0.6"
                    />

                    {/* Danger zone (1.5+) */}
                    <path
                        d="M 165 55 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="var(--color-danger)"
                        strokeWidth="16"
                        strokeLinecap="round"
                        opacity="0.6"
                    />

                    {/* Needle */}
                    <line
                        x1="100"
                        y1="100"
                        x2="100"
                        y2="35"
                        stroke={getZoneColor()}
                        strokeWidth="3"
                        strokeLinecap="round"
                        transform={`rotate(${rotation - 90}, 100, 100)`}
                        style={{ transition: 'transform 0.5s ease-out' }}
                    />

                    {/* Center circle */}
                    <circle cx="100" cy="100" r="8" fill={getZoneColor()} />
                </svg>

                {/* Value display */}
                <div style={{ textAlign: 'center', marginTop: 'var(--space-md)' }}>
                    <div className="stat-value">{acwr?.toFixed(2) || '—'}</div>
                    <div className="stat-label">ACWR</div>
                </div>
            </div>

            {/* Message */}
            {message && (
                <p style={{
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    textAlign: 'center',
                    marginTop: 'var(--space-md)'
                }}>
                    {message}
                </p>
            )}
        </div>
    );
}

export default FitnessChart;
