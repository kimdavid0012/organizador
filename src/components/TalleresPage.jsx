import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Factory, ChevronRight, BarChart3, Clock, AlertTriangle, DollarSign, TrendingUp, TrendingDown, Image as ImageIcon } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { useAuth } from '../store/AuthContext';

export default function TalleresPage() {
    const { state, updateConfig } = useData();
    const { t } = useI18n();
    const { user } = useAuth();
    const { config, moldes, telas } = state;
    const talleres = config.talleres || [];

    const [newName, setNewName] = useState('');
    const [selected, setSelected] = useState(null);

    const addTaller = () => {
        const name = newName.trim();
        if (!name || talleres.includes(name)) return;
        updateConfig({ talleres: [...talleres, name] });
        setNewName('');
    };

    const removeTaller = (name) => {
        updateConfig({ talleres: talleres.filter(t => t !== name) });
        if (selected === name) setSelected(null);
    };

    // Helper: get cover image for a molde
    const getCoverImage = (molde) => {
        if (!molde.imagenes || molde.imagenes.length === 0) return null;
        if (molde.coverImageId) {
            const cover = molde.imagenes.find(img => img.id === molde.coverImageId);
            if (cover) return cover.data;
        }
        return molde.imagenes[0]?.data || null;
    };

    // Helper: days elapsed since sent (for in-progress items)
    const daysElapsed = (fechaEnvio) => {
        if (!fechaEnvio) return 0;
        const d1 = new Date(fechaEnvio);
        const now = new Date();
        return Math.round((now - d1) / (1000 * 60 * 60 * 24));
    };

    // Performance stats per taller
    const stats = useMemo(() => {
        const map = {};
        talleres.forEach(name => {
            const assigned = moldes.filter(m => m.taller === name);
            const withDates = assigned.filter(m => m.fechaEnvioTaller && m.fechaRetornoTaller);
            const inProgress = assigned.filter(m => m.fechaEnvioTaller && !m.fechaRetornoTaller);
            const days = withDates.map(m => {
                const d1 = new Date(m.fechaEnvioTaller);
                const d2 = new Date(m.fechaRetornoTaller);
                return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            });
            const avgDays = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;

            // Fallados
            const fallados = assigned.filter(m => {
                const notes = ((m.observaciones || '') + ' ' + (m.notasCorte || '')).toLowerCase();
                return notes.includes('fall') || notes.includes('defect') || notes.includes('error') || notes.includes('repara');
            });

            // Cost
            const totalCost = assigned.reduce((sum, m) => sum + (parseFloat(m.costoTaller) || 0), 0);
            const avgCost = assigned.length > 0 ? totalCost / assigned.length : 0;

            // Delayed items (in progress for more than avgDays or > 14 days)
            const threshold = avgDays > 0 ? avgDays + 3 : 14;
            const delayed = inProgress.filter(m => daysElapsed(m.fechaEnvioTaller) > threshold);

            // Performance score: 0-100
            let score = 100;
            if (assigned.length > 0) {
                if (avgDays > 14) score -= 20;
                else if (avgDays > 7) score -= 10;
                if (fallados.length > 0) score -= (fallados.length / assigned.length) * 30;
                if (delayed.length > 0) score -= (delayed.length / assigned.length) * 25;
                score = Math.max(0, Math.round(score));
            } else {
                score = null; // No data yet
            }

            map[name] = {
                total: assigned.length,
                completed: withDates.length,
                inProgress,
                avgDays,
                minDays: days.length > 0 ? Math.min(...days) : 0,
                maxDays: days.length > 0 ? Math.max(...days) : 0,
                fallados: fallados.length,
                delayed: delayed.length,
                totalCost,
                avgCost,
                score,
                moldes: assigned,
            };
        });
        return map;
    }, [talleres, moldes]);

    const selectedStats = selected ? stats[selected] : null;

    const getScoreColor = (score) => {
        if (score === null) return 'var(--text-muted)';
        if (score >= 80) return 'var(--success)';
        if (score >= 50) return 'var(--warning)';
        return 'var(--danger)';
    };

    const getScoreLabel = (score) => {
        if (score === null) return '—';
        if (score >= 80) return '⭐ Excelente';
        if (score >= 60) return '👍 Bueno';
        if (score >= 40) return '⚠️ Regular';
        return '❌ Bajo';
    };

    return (
        <div className="settings" style={{ maxWidth: 1100 }}>
            <h2><Factory style={{ display: 'inline', marginRight: 8 }} /> {t('talleres')}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: selected ? '300px 1fr' : '1fr', gap: 'var(--sp-5)', transition: 'all 0.3s ease' }}>
                {/* Left: Talleres List */}
                <div>
                    <div className="settings-section">
                        {user?.role === 'admin' && (
                            <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                                <input
                                    className="form-input"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder={t('agregarTaller') + '...'}
                                    onKeyDown={(e) => e.key === 'Enter' && addTaller()}
                                />
                                <button className="btn btn-primary" onClick={addTaller}>
                                    <Plus />
                                </button>
                            </div>
                        )}

                        <div className="settings-list">
                            {talleres.length === 0 && (
                                <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                                    {t('agregarTaller')}
                                </div>
                            )}
                            {talleres.map(name => {
                                const s = stats[name];
                                return (
                                    <div
                                        key={name}
                                        className="settings-list-item"
                                        style={{
                                            cursor: 'pointer',
                                            border: selected === name ? '1px solid var(--accent)' : '1px solid transparent',
                                            background: selected === name ? 'var(--accent-light)' : undefined,
                                            padding: '10px 12px',
                                        }}
                                        onClick={() => setSelected(selected === name ? null : name)}
                                    >
                                        <Factory style={{ width: 18, height: 18, color: 'var(--accent)', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>{name}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {s?.total || 0} moldes · {s?.inProgress?.length || 0} en taller
                                                {user?.role === 'admin' && s?.totalCost > 0 && ` · $${s.totalCost.toLocaleString()}`}
                                            </div>
                                        </div>
                                        {s?.delayed > 0 && (
                                            <span className="badge badge-alta" style={{ fontSize: 10 }}>
                                                <AlertTriangle style={{ width: 10, height: 10 }} /> {s.delayed}
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 'var(--fw-bold)',
                                            color: getScoreColor(s?.score),
                                            minWidth: 28,
                                            textAlign: 'right',
                                        }}>
                                            {s?.score !== null && s?.score !== undefined ? s.score : '—'}
                                        </span>
                                        <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                                        {user?.role === 'admin' && (
                                            <button
                                                className="remove-btn"
                                                onClick={(e) => { e.stopPropagation(); removeTaller(name); }}
                                                style={{ opacity: 1 }}
                                            >
                                                <Trash2 style={{ width: 14, height: 14 }} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Details */}
                {selected && selectedStats && (
                    <div>
                        {/* Performance Analysis */}
                        <div className="settings-section" style={{ marginBottom: 'var(--sp-4)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BarChart3 /> {selected}
                                <span style={{
                                    marginLeft: 'auto',
                                    fontSize: 'var(--fs-md)',
                                    fontWeight: 'var(--fw-bold)',
                                    color: getScoreColor(selectedStats.score),
                                    background: selectedStats.score !== null ? (selectedStats.score >= 80 ? 'var(--success-bg)' : selectedStats.score >= 50 ? 'var(--warning-bg)' : 'var(--danger-bg)') : 'var(--glass-bg)',
                                    padding: '4px 12px',
                                    borderRadius: 'var(--radius-md)',
                                }}>
                                    {getScoreLabel(selectedStats.score)}
                                </span>
                            </h3>

                            {/* Metric cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
                                {[
                                    { value: selectedStats.total, label: t('totalMoldes'), bg: 'var(--accent-light)', color: 'var(--accent)' },
                                    { value: selectedStats.completed, label: t('completados'), bg: 'var(--success-bg)', color: 'var(--success)' },
                                    { value: selectedStats.avgDays || '—', label: t('promedioTaller'), bg: selectedStats.avgDays <= 7 ? 'var(--success-bg)' : selectedStats.avgDays <= 14 ? 'var(--warning-bg)' : 'var(--danger-bg)', color: selectedStats.avgDays <= 7 ? 'var(--success)' : selectedStats.avgDays <= 14 ? 'var(--warning)' : 'var(--danger)', suffix: 'd' },
                                    { value: selectedStats.fallados, label: t('fallados'), bg: selectedStats.fallados > 0 ? 'var(--danger-bg)' : 'var(--glass-bg)', color: selectedStats.fallados > 0 ? 'var(--danger)' : 'var(--text-muted)', icon: AlertTriangle },
                                    ...(user?.role === 'admin' ? [{ value: `$${selectedStats.totalCost.toLocaleString()}`, label: t('costoTotal'), bg: 'rgba(52,211,153,0.08)', color: 'var(--success)', icon: DollarSign }] : []),
                                ].map((m, i) => (
                                    <div key={i} style={{ padding: 'var(--sp-3)', background: m.bg, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', color: m.color }}>
                                            {m.value}{m.suffix || ''}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                            {m.icon && <m.icon style={{ width: 10, height: 10 }} />}
                                            {m.label}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Time range bar */}
                            {selectedStats.completed > 0 && (
                                <div style={{
                                    marginTop: 'var(--sp-3)',
                                    padding: 'var(--sp-2) var(--sp-3)',
                                    background: 'var(--glass-bg)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 'var(--fs-xs)',
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    justifyContent: 'space-around',
                                }}>
                                    <span>⏱ Min: <strong style={{ color: 'var(--success)' }}>{selectedStats.minDays}d</strong></span>
                                    <span>📊 Prom: <strong style={{ color: 'var(--warning)' }}>{selectedStats.avgDays}d</strong></span>
                                    <span>⏰ Max: <strong style={{ color: 'var(--danger)' }}>{selectedStats.maxDays}d</strong></span>
                                    {user?.role === 'admin' && selectedStats.avgCost > 0 && (
                                        <span>💰 Prom/prenda: <strong style={{ color: 'var(--success)' }}>${selectedStats.avgCost.toFixed(0)}</strong></span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* In Progress Section */}
                        {selectedStats.inProgress.length > 0 && (
                            <div className="settings-section" style={{ marginBottom: 'var(--sp-4)' }}>
                                <h3 style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock style={{ width: 16, height: 16, color: 'var(--warning)' }} />
                                    En taller ahora ({selectedStats.inProgress.length})
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
                                    {selectedStats.inProgress.map(m => {
                                        const img = getCoverImage(m);
                                        const elapsed = daysElapsed(m.fechaEnvioTaller);
                                        const threshold = selectedStats.avgDays > 0 ? selectedStats.avgDays + 3 : 14;
                                        const isDelayed = elapsed > threshold;
                                        const isWarning = elapsed > (threshold * 0.7);
                                        return (
                                            <div key={m.id} style={{
                                                background: isDelayed ? 'var(--danger-bg)' : 'var(--glass-bg)',
                                                border: `1px solid ${isDelayed ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
                                                borderRadius: 'var(--radius-md)',
                                                overflow: 'hidden',
                                                transition: 'all 0.2s',
                                            }}>
                                                {/* Image */}
                                                <div style={{ height: 80, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                    {img ? (
                                                        <img src={img} alt={m.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <ImageIcon style={{ width: 24, height: 24, color: 'var(--text-muted)', opacity: 0.3 }} />
                                                    )}
                                                </div>
                                                {/* Info */}
                                                <div style={{ padding: '8px 10px' }}>
                                                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {m.nombre || '(sin nombre)'}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: 'var(--fw-bold)',
                                                            color: isDelayed ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--text-secondary)',
                                                            display: 'flex', alignItems: 'center', gap: 3,
                                                        }}>
                                                            {isDelayed ? <AlertTriangle style={{ width: 12, height: 12 }} /> : <Clock style={{ width: 12, height: 12 }} />}
                                                            {elapsed}d {isDelayed ? '⚠️ DEMORADO' : ''}
                                                        </span>
                                                        {user?.role === 'admin' && m.costoTaller && (
                                                            <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 'var(--fw-semibold)' }}>
                                                                ${parseFloat(m.costoTaller).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* All Articles */}
                        <div className="settings-section">
                            <h3 style={{ fontSize: 'var(--fs-sm)' }}>
                                {t('moldesAsignados')} ({selectedStats.total})
                            </h3>
                            {selectedStats.moldes.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-6)', textAlign: 'center' }}>
                                    Sin moldes asignados a este taller
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                                    {selectedStats.moldes.map(m => {
                                        const img = getCoverImage(m);
                                        let dias = null;
                                        let elapsed = null;
                                        const isInProgress = m.fechaEnvioTaller && !m.fechaRetornoTaller;
                                        if (m.fechaEnvioTaller && m.fechaRetornoTaller) {
                                            dias = Math.round((new Date(m.fechaRetornoTaller) - new Date(m.fechaEnvioTaller)) / (1000 * 60 * 60 * 24));
                                        }
                                        if (isInProgress) {
                                            elapsed = daysElapsed(m.fechaEnvioTaller);
                                        }
                                        const threshold = selectedStats.avgDays > 0 ? selectedStats.avgDays + 3 : 14;
                                        const isDelayed = isInProgress && elapsed > threshold;

                                        return (
                                            <div key={m.id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--sp-3)',
                                                padding: '8px 10px',
                                                background: isDelayed ? 'var(--danger-bg)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${isDelayed ? 'rgba(239,68,68,0.2)' : 'transparent'}`,
                                                borderRadius: 'var(--radius-sm)',
                                                transition: 'background 0.2s',
                                            }}>
                                                {/* Thumbnail */}
                                                <div style={{
                                                    width: 44, height: 44, borderRadius: 'var(--radius-sm)',
                                                    overflow: 'hidden', flexShrink: 0,
                                                    background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {img ? (
                                                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <ImageIcon style={{ width: 16, height: 16, color: 'var(--text-muted)', opacity: 0.3 }} />
                                                    )}
                                                </div>

                                                {/* Name & category */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {m.nombre || '(sin nombre)'}
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                        {m.categoria || ''}{m.codigo ? ` · #${m.codigo}` : ''}
                                                    </div>
                                                </div>

                                                {/* Status */}
                                                {isInProgress && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 'var(--fw-bold)',
                                                        color: isDelayed ? 'var(--danger)' : elapsed > (threshold * 0.7) ? 'var(--warning)' : 'var(--success)',
                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {isDelayed ? <TrendingDown style={{ width: 12, height: 12 }} /> : <Clock style={{ width: 12, height: 12 }} />}
                                                        {elapsed}d
                                                        {isDelayed && ' ⚠️'}
                                                    </span>
                                                )}
                                                {dias !== null && (
                                                    <span className={`badge badge-${dias <= 7 ? 'baja' : dias <= 14 ? 'media' : 'alta'}`} style={{ whiteSpace: 'nowrap' }}>
                                                        ✓ {dias}d
                                                    </span>
                                                )}
                                                {!isInProgress && dias === null && (
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sin fechas</span>
                                                )}

                                                {/* Cost */}
                                                {user?.role === 'admin' ? (
                                                    m.costoTaller ? (
                                                        <span style={{
                                                            fontSize: '12px',
                                                            fontWeight: 'var(--fw-semibold)',
                                                            color: 'var(--success)',
                                                            minWidth: 50,
                                                            textAlign: 'right',
                                                        }}>
                                                            ${parseFloat(m.costoTaller).toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: 50, textAlign: 'right' }}>—</span>
                                                    )
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
