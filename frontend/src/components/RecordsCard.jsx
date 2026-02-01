import { useState, useEffect } from 'react';
import api from '../services/api';

function RecordsCard() {
    const [records, setRecords] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        try {
            setLoading(true);
            const data = await api.fetch('/activities/records');
            setRecords(data);
        } catch (err) {
            console.error('Failed to load records:', err);
            setError('Impossible de charger les records');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="card records-card records-loading">
                <h3>🏆 Records Personnels</h3>
                <div className="loading-shimmer" style={{ height: '100px' }}></div>
            </div>
        );
    }

    if (error || !records) {
        return null; // Don't show card if no data
    }

    const { career, ytd, best_efforts } = records;

    const formatTime = (seconds) => {
        if (!seconds) return '-';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="card records-card">
            <h3 className="records-title">🏆 Records Personnels</h3>

            {/* Career Stats */}
            <div className="records-section">
                <h4>Carrière</h4>
                <div className="career-stats-grid">
                    <div className="career-stat">
                        <span className="stat-value">{career.total_runs || 0}</span>
                        <span className="stat-label">Courses</span>
                    </div>
                    <div className="career-stat">
                        <span className="stat-value">{career.total_km?.toLocaleString() || 0}</span>
                        <span className="stat-label">km</span>
                    </div>
                    <div className="career-stat">
                        <span className="stat-value">{career.total_elevation?.toLocaleString() || 0}</span>
                        <span className="stat-label">D+ (m)</span>
                    </div>
                </div>
            </div>

            {/* Best Efforts */}
            <div className="records-section">
                <h4>Meilleurs Temps</h4>
                <div className="best-efforts-grid">
                    {best_efforts?.['5k'] && (
                        <div className="best-effort">
                            <span className="effort-distance">5K</span>
                            <span className="effort-time">{best_efforts['5k'].time_formatted}</span>
                            <span className="effort-pace">{best_efforts['5k'].pace}</span>
                        </div>
                    )}
                    {best_efforts?.['10k'] && (
                        <div className="best-effort">
                            <span className="effort-distance">10K</span>
                            <span className="effort-time">{best_efforts['10k'].time_formatted}</span>
                            <span className="effort-pace">{best_efforts['10k'].pace}</span>
                        </div>
                    )}
                    {best_efforts?.half_marathon && (
                        <div className="best-effort">
                            <span className="effort-distance">Semi</span>
                            <span className="effort-time">{best_efforts.half_marathon.time_formatted}</span>
                            <span className="effort-pace">{best_efforts.half_marathon.pace}</span>
                        </div>
                    )}
                    {best_efforts?.marathon && (
                        <div className="best-effort">
                            <span className="effort-distance">Marathon</span>
                            <span className="effort-time">{best_efforts.marathon.time_formatted}</span>
                            <span className="effort-pace">{best_efforts.marathon.pace}</span>
                        </div>
                    )}
                    {!best_efforts?.['5k'] && !best_efforts?.['10k'] && !best_efforts?.half_marathon && !best_efforts?.marathon && (
                        <p className="no-records">Pas encore de records enregistrés</p>
                    )}
                </div>
            </div>

            {/* YTD Stats */}
            {ytd && ytd.runs > 0 && (
                <div className="records-section ytd-section">
                    <h4>Cette année</h4>
                    <p className="ytd-summary">
                        <strong>{ytd.runs}</strong> courses · <strong>{ytd.km?.toLocaleString()}</strong> km
                    </p>
                </div>
            )}

            <style>{`
                .records-card {
                    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.05) 100%);
                    border: 1px solid rgba(139, 92, 246, 0.3);
                }
                .records-title {
                    margin: 0 0 var(--space-md) 0;
                    font-size: 1.1rem;
                    color: var(--text-primary);
                }
                .records-section {
                    margin-bottom: var(--space-md);
                }
                .records-section h4 {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    margin: 0 0 var(--space-sm) 0;
                }
                .career-stats-grid {
                    display: flex;
                    gap: var(--space-md);
                }
                .career-stat {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    flex: 1;
                    padding: var(--space-sm);
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: var(--radius-sm);
                }
                .career-stat .stat-value {
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: var(--primary);
                }
                .career-stat .stat-label {
                    font-size: 0.7rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                }
                .best-efforts-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--space-sm);
                }
                .best-effort {
                    display: flex;
                    flex-direction: column;
                    padding: var(--space-sm);
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: var(--radius-sm);
                    border-left: 3px solid var(--primary);
                }
                .effort-distance {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                }
                .effort-time {
                    font-size: 1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .effort-pace {
                    font-size: 0.75rem;
                    color: var(--success);
                }
                .no-records {
                    color: var(--text-muted);
                    font-size: 0.85rem;
                    text-align: center;
                    grid-column: 1 / -1;
                }
                .ytd-section {
                    margin-bottom: 0;
                    padding-top: var(--space-sm);
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                .ytd-summary {
                    margin: 0;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }
                .ytd-summary strong {
                    color: var(--text-primary);
                }
                .records-loading {
                    min-height: 150px;
                }
            `}</style>
        </div>
    );
}

export default RecordsCard;
