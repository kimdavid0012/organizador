import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Factory, ChevronRight, BarChart3, Clock, AlertTriangle, DollarSign, Image as ImageIcon, CheckCircle2, PackageCheck } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { useAuth } from '../store/AuthContext';

const normalizeText = (value) => (value || '').toString().trim();
const normalizeUpper = (value) => normalizeText(value).toUpperCase();
const extractCorteNumber = (value) => {
    const raw = normalizeText(value);
    if (!raw) return '';
    const match = raw.match(/(\d+)/);
    return match ? match[1] : raw.toUpperCase();
};

const diffDays = (start, end) => {
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    return Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
};

const daysElapsed = (date) => {
    if (!date) return null;
    const startDate = new Date(date);
    if (Number.isNaN(startDate.getTime())) return null;
    return Math.max(0, Math.round((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

export default function TalleresPage() {
    const { state, updateConfig } = useData();
    const { t } = useI18n();
    const { user } = useAuth();
    const { config, moldes } = state;
    const manualTalleres = config.talleres || [];
    const mercaderiaConteos = config.mercaderiaConteos || [];
    const cortes = config.cortes || [];

    const [newName, setNewName] = useState('');
    const [selected, setSelected] = useState(null);

    const moldeMap = useMemo(() => new Map((moldes || []).map((molde) => [molde.id, molde])), [moldes]);

    const getCoverImage = (molde) => {
        if (!molde?.imagenes || molde.imagenes.length === 0) return null;
        if (molde.coverImageId) {
            const cover = molde.imagenes.find((img) => img.id === molde.coverImageId);
            if (cover?.data) return cover.data;
        }
        return molde.imagenes[0]?.data || null;
    };

    const talleres = useMemo(() => {
        const merged = new Set(
            manualTalleres
                .map(normalizeText)
                .filter(Boolean)
        );

        cortes.forEach((corte) => {
            (corte.moldesData || []).forEach((item) => {
                const assigned = normalizeText(item.tallerAsignado || item.taller);
                if (assigned) merged.add(assigned);
            });
        });

        mercaderiaConteos.forEach((item) => {
            const taller = normalizeText(item.taller);
            if (taller) merged.add(taller);
        });

        return Array.from(merged).sort((left, right) => left.localeCompare(right, 'es'));
    }, [manualTalleres, cortes, mercaderiaConteos]);

    const conteosByTaller = useMemo(() => {
        const map = new Map();

        mercaderiaConteos.forEach((item) => {
            const taller = normalizeUpper(item.taller);
            if (!taller) return;

            const articleKeys = [
                normalizeUpper(item.articuloFabrica),
                normalizeUpper(item.articuloVenta),
                normalizeUpper(item.codigoInterno),
                normalizeUpper(item.articulo),
                normalizeUpper(item.descripcion)
            ].filter(Boolean);

            const signature = [extractCorteNumber(item.numeroCorte), taller, ...articleKeys].join('|');
            if (!map.has(signature)) {
                map.set(signature, []);
            }
            map.get(signature).push(item);
        });

        return map;
    }, [mercaderiaConteos]);

    const tallerRecords = useMemo(() => {
        const grouped = {};

        talleres.forEach((name) => {
            grouped[name] = [];
        });

        cortes.forEach((corte) => {
            const corteNumber = extractCorteNumber(corte?.nombre);
            const corteDate = corte?.fecha || '';

            (corte.moldesData || []).forEach((item) => {
                const tallerName = normalizeText(item.tallerAsignado || item.taller);
                if (!tallerName) return;

                const molde = moldeMap.get(item.id);
                const articleCandidates = [
                    normalizeUpper(molde?.codigo),
                    normalizeUpper(molde?.nombre),
                    normalizeUpper(item.articuloFabrica),
                    normalizeUpper(item.articuloVenta),
                    normalizeUpper(item.descripcion)
                ].filter(Boolean);

                let matchedConteo = null;
                for (const articleKey of articleCandidates) {
                    const signature = [corteNumber, normalizeUpper(tallerName), articleKey].join('|');
                    const matches = conteosByTaller.get(signature);
                    if (matches?.length) {
                        matchedConteo = matches[0];
                        break;
                    }
                }

                const diasIngreso = diffDays(corteDate, matchedConteo?.fechaIngreso);
                const diasPendientes = matchedConteo ? null : daysElapsed(corteDate);

                grouped[tallerName] = grouped[tallerName] || [];
                grouped[tallerName].push({
                    id: `${corte.id}-${item.id}`,
                    moldeId: item.id,
                    nombre: molde?.nombre || item.descripcion || '(sin nombre)',
                    codigo: molde?.codigo || item.articuloFabrica || item.articuloVenta || '',
                    categoria: molde?.categoria || '',
                    corteNombre: corte.nombre || 'Corte',
                    corteNumero: corteNumber,
                    fechaCorte: corteDate,
                    fechaIngreso: matchedConteo?.fechaIngreso || '',
                    estado: item.estadoTaller || (matchedConteo ? 'ingresado' : 'pendiente'),
                    cantidad: Number(item.cantidad || 0),
                    costoTaller: Number(item.costoTaller || 0),
                    pagadoTaller: Boolean(item.pagadoTaller),
                    fallado: Number(matchedConteo?.fallado || 0),
                    cantidadContada: Number(matchedConteo?.cantidadContada || 0),
                    comentarioControl: matchedConteo?.comentarioControl || '',
                    chequeado: Boolean(matchedConteo?.chequeado),
                    diasIngreso,
                    diasPendientes,
                    img: getCoverImage(molde),
                    matchedConteoId: matchedConteo?.id || null
                });
            });
        });

        return grouped;
    }, [talleres, cortes, moldeMap, conteosByTaller]);

    const stats = useMemo(() => {
        const map = {};

        talleres.forEach((name) => {
            const assigned = (tallerRecords[name] || []).sort((left, right) =>
                `${right.fechaCorte}-${right.corteNombre}`.localeCompare(`${left.fechaCorte}-${left.corteNombre}`)
            );

            const completed = assigned.filter((item) => item.matchedConteoId);
            const inProgress = assigned.filter((item) => !item.matchedConteoId);
            const deliveryDays = completed.map((item) => item.diasIngreso).filter((value) => value !== null);
            const avgDays = deliveryDays.length ? Math.round(deliveryDays.reduce((sum, value) => sum + value, 0) / deliveryDays.length) : 0;
            const delayedThreshold = avgDays > 0 ? avgDays + 3 : 10;
            const delayed = inProgress.filter((item) => (item.diasPendientes || 0) > delayedThreshold);
            const totalCost = assigned.reduce((sum, item) => sum + ((item.costoTaller || 0) * (item.cantidad || 0)), 0);
            const fallados = assigned.reduce((sum, item) => sum + (item.fallado || 0), 0);

            let score = null;
            if (assigned.length > 0) {
                score = 100;
                if (avgDays > 10) score -= 18;
                else if (avgDays > 5) score -= 8;
                if (fallados > 0) score -= Math.min(25, fallados * 3);
                if (delayed.length > 0) score -= Math.min(30, Math.round((delayed.length / assigned.length) * 30));
                score = Math.max(0, Math.round(score));
            }

            map[name] = {
                total: assigned.length,
                completed: completed.length,
                inProgress,
                avgDays,
                minDays: deliveryDays.length ? Math.min(...deliveryDays) : 0,
                maxDays: deliveryDays.length ? Math.max(...deliveryDays) : 0,
                delayed: delayed.length,
                fallados,
                totalCost,
                score,
                moldes: assigned
            };
        });

        return map;
    }, [talleres, tallerRecords]);

    const selectedStats = selected ? stats[selected] : null;

    const addTaller = () => {
        const name = normalizeText(newName);
        if (!name || manualTalleres.some((item) => normalizeUpper(item) === normalizeUpper(name))) return;
        updateConfig({ talleres: [...manualTalleres, name] });
        setNewName('');
    };

    const removeTaller = (name) => {
        updateConfig({ talleres: manualTalleres.filter((item) => normalizeUpper(item) !== normalizeUpper(name)) });
        if (selected === name) setSelected(null);
    };

    const getScoreColor = (score) => {
        if (score === null || score === undefined) return 'var(--text-muted)';
        if (score >= 80) return 'var(--success)';
        if (score >= 50) return 'var(--warning)';
        return 'var(--danger)';
    };

    const getScoreLabel = (score) => {
        if (score === null || score === undefined) return '—';
        if (score >= 80) return 'Excelente';
        if (score >= 60) return 'Bueno';
        if (score >= 40) return 'Regular';
        return 'Bajo';
    };

    return (
        <div className="settings" style={{ maxWidth: 1120 }}>
            <h2><Factory style={{ display: 'inline', marginRight: 8 }} /> {t('talleres')}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 'var(--sp-5)', transition: 'all 0.3s ease' }}>
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
                            {talleres.map((name) => {
                                const s = stats[name];
                                return (
                                    <div
                                        key={name}
                                        className="settings-list-item"
                                        style={{
                                            cursor: 'pointer',
                                            border: selected === name ? '1px solid var(--accent)' : '1px solid transparent',
                                            background: selected === name ? 'var(--accent-light)' : undefined,
                                            padding: '10px 12px'
                                        }}
                                        onClick={() => setSelected(selected === name ? null : name)}
                                    >
                                        <Factory style={{ width: 18, height: 18, color: 'var(--accent)', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>{name}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {s?.total || 0} articulos
                                                {` · ${s?.completed || 0} ingresados`}
                                                {s?.inProgress?.length ? ` · ${s.inProgress.length} pendientes` : ''}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 'var(--fw-bold)', color: getScoreColor(s?.score), minWidth: 30, textAlign: 'right' }}>
                                            {s?.score ?? '—'}
                                        </span>
                                        <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                                        {user?.role === 'admin' && manualTalleres.some((item) => normalizeUpper(item) === normalizeUpper(name)) && (
                                            <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeTaller(name); }} style={{ opacity: 1 }}>
                                                <Trash2 style={{ width: 14, height: 14 }} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {selected && selectedStats && (
                    <div>
                        <div className="settings-section" style={{ marginBottom: 'var(--sp-4)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <BarChart3 /> {selected}
                                <span style={{
                                    marginLeft: 'auto',
                                    fontSize: 'var(--fs-md)',
                                    fontWeight: 'var(--fw-bold)',
                                    color: getScoreColor(selectedStats.score),
                                    background: 'var(--glass-bg)',
                                    padding: '4px 12px',
                                    borderRadius: 'var(--radius-md)'
                                }}>
                                    {getScoreLabel(selectedStats.score)}
                                </span>
                            </h3>

                            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(6, 1fr)' : 'repeat(5, 1fr)', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
                                {[
                                    { value: selectedStats.total, label: 'Asignados', bg: 'var(--accent-light)', color: 'var(--accent)' },
                                    { value: selectedStats.completed, label: 'Ingresados', bg: 'var(--success-bg)', color: 'var(--success)' },
                                    { value: selectedStats.inProgress.length, label: 'Pendientes', bg: 'var(--warning-bg)', color: 'var(--warning)' },
                                    { value: selectedStats.avgDays || '—', label: 'Promedio taller', bg: selectedStats.avgDays <= 5 ? 'var(--success-bg)' : selectedStats.avgDays <= 10 ? 'var(--warning-bg)' : 'var(--danger-bg)', color: selectedStats.avgDays <= 5 ? 'var(--success)' : selectedStats.avgDays <= 10 ? 'var(--warning)' : 'var(--danger)', suffix: 'd' },
                                    { value: selectedStats.fallados || 0, label: 'Fallados', bg: selectedStats.fallados > 0 ? 'var(--danger-bg)' : 'var(--glass-bg)', color: selectedStats.fallados > 0 ? 'var(--danger)' : 'var(--text-muted)' },
                                    ...(user?.role === 'admin' ? [{ value: `$${selectedStats.totalCost.toLocaleString('es-AR')}`, label: 'Costo total', bg: 'rgba(52,211,153,0.08)', color: 'var(--success)', icon: DollarSign }] : [])
                                ].map((metric, index) => (
                                    <div key={index} style={{ padding: 'var(--sp-3)', background: metric.bg, borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', color: metric.color }}>
                                            {metric.value}{metric.suffix || ''}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                                            {metric.icon && <metric.icon style={{ width: 10, height: 10 }} />}
                                            {metric.label}
                                        </div>
                                    </div>
                                ))}
                            </div>

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
                                    flexWrap: 'wrap',
                                    gap: 8
                                }}>
                                    <span>Min: <strong style={{ color: 'var(--success)' }}>{selectedStats.minDays}d</strong></span>
                                    <span>Prom: <strong style={{ color: 'var(--warning)' }}>{selectedStats.avgDays}d</strong></span>
                                    <span>Max: <strong style={{ color: 'var(--danger)' }}>{selectedStats.maxDays}d</strong></span>
                                    <span>Ranking: <strong style={{ color: getScoreColor(selectedStats.score) }}>{selectedStats.score ?? '—'}</strong></span>
                                </div>
                            )}
                        </div>

                        {selectedStats.inProgress.length > 0 && (
                            <div className="settings-section" style={{ marginBottom: 'var(--sp-4)' }}>
                                <h3 style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock style={{ width: 16, height: 16, color: 'var(--warning)' }} />
                                    En taller ahora ({selectedStats.inProgress.length})
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' }}>
                                    {selectedStats.inProgress.map((item) => {
                                        const isDelayed = (item.diasPendientes || 0) > (selectedStats.avgDays > 0 ? selectedStats.avgDays + 3 : 10);
                                        return (
                                            <div key={item.id} style={{
                                                background: isDelayed ? 'var(--danger-bg)' : 'var(--glass-bg)',
                                                border: `1px solid ${isDelayed ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
                                                borderRadius: 'var(--radius-md)',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{ height: 88, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                    {item.img ? (
                                                        <img src={item.img} alt={item.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <ImageIcon style={{ width: 24, height: 24, color: 'var(--text-muted)', opacity: 0.3 }} />
                                                    )}
                                                </div>
                                                <div style={{ padding: '8px 10px' }}>
                                                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.nombre}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                        {item.corteNombre} · {item.cantidad} prendas
                                                    </div>
                                                    <div style={{ marginTop: 6, fontSize: '11px', fontWeight: 'var(--fw-bold)', color: isDelayed ? 'var(--danger)' : 'var(--warning)' }}>
                                                        {item.diasPendientes || 0}d esperando ingreso
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="settings-section">
                            <h3 style={{ fontSize: 'var(--fs-sm)' }}>
                                Articulos del taller ({selectedStats.total})
                            </h3>
                            {selectedStats.moldes.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-6)', textAlign: 'center' }}>
                                    Sin articulos asignados a este taller
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
                                    {selectedStats.moldes.map((item) => (
                                        <div key={item.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--sp-3)',
                                            padding: '10px 12px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: 'var(--radius-sm)'
                                        }}>
                                            <div style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 'var(--radius-sm)',
                                                overflow: 'hidden',
                                                flexShrink: 0,
                                                background: 'rgba(0,0,0,0.2)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {item.img ? (
                                                    <img src={item.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <ImageIcon style={{ width: 16, height: 16, color: 'var(--text-muted)', opacity: 0.3 }} />
                                                )}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.nombre}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    {item.corteNombre}
                                                    {item.codigo ? ` · #${item.codigo}` : ''}
                                                    {item.cantidad ? ` · ${item.cantidad} prendas` : ''}
                                                </div>
                                                {item.fechaIngreso && (
                                                    <div style={{ fontSize: '10px', color: 'var(--success)', marginTop: 2 }}>
                                                        Ingreso: {item.fechaIngreso}
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {item.matchedConteoId ? (
                                                    <span className="badge badge-baja" style={{ whiteSpace: 'nowrap' }}>
                                                        <PackageCheck style={{ width: 12, height: 12 }} /> {item.diasIngreso ?? 0}d
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-media" style={{ whiteSpace: 'nowrap' }}>
                                                        <Clock style={{ width: 12, height: 12 }} /> {item.diasPendientes ?? 0}d
                                                    </span>
                                                )}
                                                {item.chequeado && (
                                                    <span className="badge badge-success" style={{ whiteSpace: 'nowrap' }}>
                                                        <CheckCircle2 style={{ width: 12, height: 12 }} /> Nadia
                                                    </span>
                                                )}
                                                {item.fallado > 0 && (
                                                    <span className="badge badge-alta" style={{ whiteSpace: 'nowrap' }}>
                                                        <AlertTriangle style={{ width: 12, height: 12 }} /> {item.fallado}
                                                    </span>
                                                )}
                                                {user?.role === 'admin' && (
                                                    <span style={{ fontSize: '12px', fontWeight: 'var(--fw-semibold)', color: 'var(--success)', minWidth: 64, textAlign: 'right' }}>
                                                        ${((item.costoTaller || 0) * (item.cantidad || 0)).toLocaleString('es-AR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
