import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Factory, ChevronRight, BarChart3, Clock, AlertTriangle, DollarSign, Image as ImageIcon, CheckCircle2, PackageCheck } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { useAuth } from '../store/AuthContext';

const normalizeText = (value) => (value || '').toString().trim();
const normalizeUpper = (value) => normalizeText(value).toUpperCase();
const normalizeComparable = (value) => normalizeUpper(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
const formatTallerLabel = (value) => normalizeText(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const extractCorteNumber = (value) => {
    const raw = normalizeText(value);
    if (!raw) return '';
    const match = raw.match(/(\d+)/);
    return match ? match[1] : raw.toUpperCase();
};

const diffDays = (start, end) => {
    if (!start || !end) return null;
    const startDate = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    return Math.max(0, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
};

const daysElapsed = (date) => {
    if (!date) return null;
    const startDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(startDate.getTime())) return null;
    return Math.max(0, Math.round((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
};

const getMatchScore = (articleCandidates, conteo) => {
    const conteoCandidates = [
        conteo.articuloFabrica,
        conteo.articuloVenta,
        conteo.codigoInterno,
        conteo.articulo,
        conteo.descripcion
    ]
        .map(normalizeComparable)
        .filter(Boolean);

    let best = 0;
    articleCandidates.forEach((articleCandidate) => {
        conteoCandidates.forEach((conteoCandidate) => {
            if (!articleCandidate || !conteoCandidate) return;
            if (articleCandidate === conteoCandidate) best = Math.max(best, 120);
            else if (articleCandidate.includes(conteoCandidate) || conteoCandidate.includes(articleCandidate)) best = Math.max(best, 90);
            else {
                const prefixLength = Math.min(articleCandidate.length, conteoCandidate.length, 10);
                if (prefixLength >= 5 && articleCandidate.slice(0, prefixLength) === conteoCandidate.slice(0, prefixLength)) {
                    best = Math.max(best, 65);
                }
            }
        });
    });

    return best;
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
        const merged = new Map();
        const registerTaller = (rawName) => {
            const normalizedName = normalizeText(rawName);
            const key = normalizeUpper(normalizedName);
            if (!key) return;

            const preferredLabel = formatTallerLabel(normalizedName);
            if (!merged.has(key) || preferredLabel === normalizedName) {
                merged.set(key, preferredLabel);
            }
        };

        manualTalleres.forEach(registerTaller);

        cortes.forEach((corte) => {
            (corte.moldesData || []).forEach((item) => {
                registerTaller(item.tallerAsignado || item.taller);
            });
        });

        mercaderiaConteos.forEach((item) => {
            registerTaller(item.taller);
        });

        return Array.from(merged.values()).sort((left, right) => left.localeCompare(right, 'es'));
    }, [manualTalleres, cortes, mercaderiaConteos]);

    const conteosByTaller = useMemo(() => {
        const map = new Map();
        const byTallerOnly = new Map();
        const byCorteOnly = new Map(); // fallback: conteos without taller, grouped by corte number
        const allConteos = [...mercaderiaConteos]; // broadest fallback

        mercaderiaConteos.forEach((item) => {
            const taller = normalizeUpper(item.taller);
            const corteNum = extractCorteNumber(item.numeroCorte);

            if (taller) {
                // Group by corte+taller
                if (corteNum) {
                    const signature = [corteNum, taller].join('|');
                    if (!map.has(signature)) map.set(signature, []);
                    map.get(signature).push(item);
                }
                // Group by taller only
                if (!byTallerOnly.has(taller)) byTallerOnly.set(taller, []);
                byTallerOnly.get(taller).push(item);
            } else {
                // No taller — index by corte number for fallback
                if (corteNum) {
                    if (!byCorteOnly.has(corteNum)) byCorteOnly.set(corteNum, []);
                    byCorteOnly.get(corteNum).push(item);
                }
            }
        });

        return { byCorteAndTaller: map, byTallerOnly, byCorteOnly, allConteos };
    }, [mercaderiaConteos]);

    const tallerRecords = useMemo(() => {
        const grouped = {};

        talleres.forEach((name) => {
            grouped[name] = [];
        });

        const globalUsedConteoIds = new Set();

        cortes.forEach((corte) => {
            const corteNumber = extractCorteNumber(corte?.nombre);
            const corteDate = corte?.fecha || '';
            const usedConteoIds = new Set();

            (corte.moldesData || []).forEach((item) => {
                const tallerName = formatTallerLabel(item.tallerAsignado || item.taller);
                if (!tallerName) return;

                const molde = moldeMap.get(item.id);
                const articleCandidates = [
                    normalizeUpper(molde?.codigo),
                    normalizeUpper(molde?.nombre),
                    normalizeUpper(item.articuloFabrica),
                    normalizeUpper(item.articuloVenta),
                    normalizeUpper(item.descripcion)
                ].filter(Boolean);
                const comparableArticleCandidates = articleCandidates.map(normalizeComparable).filter(Boolean);

                const groupKey = [corteNumber, normalizeUpper(tallerName)].join('|');
                // Priority: corte+taller → taller-only → corte-only (no taller) → all conteos
                const primaryConteos = conteosByTaller.byCorteAndTaller.get(groupKey) || [];
                const tallerOnlyConteos = conteosByTaller.byTallerOnly.get(normalizeUpper(tallerName)) || [];
                const corteOnlyConteos = corteNumber ? (conteosByTaller.byCorteOnly.get(corteNumber) || []) : [];
                let candidatePool = primaryConteos.length > 0 ? primaryConteos
                    : tallerOnlyConteos.length > 0 ? tallerOnlyConteos
                    : corteOnlyConteos;
                const groupConteos = candidatePool.filter((conteo) => !usedConteoIds.has(conteo.id));

                let matchedConteo = null;
                let matchedScore = 0;

                for (const conteo of groupConteos) {
                    let score = getMatchScore(comparableArticleCandidates, conteo);

                    if (Number(item.cantidad || 0) > 0 && Number(conteo.cantidadOriginal || 0) > 0 && Number(item.cantidad || 0) === Number(conteo.cantidadOriginal || 0)) {
                        score += 10;
                    }

                    if (score > matchedScore) {
                        matchedScore = score;
                        matchedConteo = conteo;
                    }
                }

                if (matchedConteo && matchedScore < 40) {
                    matchedConteo = null;
                }

                if (!matchedConteo && groupConteos.length === 1 && (corte.moldesData || []).length === 1) {
                    matchedConteo = groupConteos[0];
                }

                if (matchedConteo?.id) {
                    usedConteoIds.add(matchedConteo.id);
                    globalUsedConteoIds.add(matchedConteo.id);
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

        // Add unmatched mercaderiaConteos as standalone "ingresado" records
        mercaderiaConteos.forEach((conteo) => {
            if (globalUsedConteoIds.has(conteo.id)) return;
            const tallerName = formatTallerLabel(conteo.taller);
            if (!tallerName) return;
            grouped[tallerName] = grouped[tallerName] || [];
            grouped[tallerName].push({
                id: `conteo-standalone-${conteo.id}`,
                moldeId: null,
                nombre: conteo.descripcion || conteo.articuloFabrica || conteo.articuloVenta || '(conteo directo)',
                codigo: conteo.articuloFabrica || conteo.articuloVenta || '',
                categoria: '',
                corteNombre: conteo.numeroCorte || '',
                corteNumero: extractCorteNumber(conteo.numeroCorte),
                fechaCorte: '',
                fechaIngreso: conteo.fechaIngreso || '',
                estado: 'ingresado',
                cantidad: Number(conteo.cantidadOriginal || 0),
                costoTaller: 0,
                pagadoTaller: false,
                fallado: Number(conteo.fallado || 0),
                cantidadContada: Number(conteo.cantidadContada || 0),
                comentarioControl: conteo.comentarioControl || '',
                chequeado: Boolean(conteo.chequeado),
                diasIngreso: null,
                diasPendientes: null,
                img: null,
                matchedConteoId: conteo.id
            });
        });

        return grouped;
    }, [talleres, cortes, moldeMap, conteosByTaller, mercaderiaConteos]);

    const stats = useMemo(() => {
        const map = {};

        talleres.forEach((name) => {
            const assigned = (tallerRecords[name] || []).sort((left, right) =>
                `${right.fechaCorte}-${right.corteNombre}`.localeCompare(`${left.fechaCorte}-${left.corteNombre}`)
            );

            const completed = assigned.filter((item) => item.matchedConteoId);
            const inProgress = assigned.filter((item) => !item.matchedConteoId);
            const deliveryDays = completed.map((item) => item.diasIngreso).filter((value) => value !== null);
            const pendingDays = inProgress.map((item) => item.diasPendientes).filter((value) => value !== null);
            const avgDeliveryDays = deliveryDays.length ? Math.round(deliveryDays.reduce((sum, value) => sum + value, 0) / deliveryDays.length) : null;
            const currentAvgDays = pendingDays.length ? Math.round(pendingDays.reduce((sum, value) => sum + value, 0) / pendingDays.length) : null;
            const avgDays = avgDeliveryDays ?? currentAvgDays;
            const delayedThreshold = avgDeliveryDays && avgDeliveryDays > 0 ? avgDeliveryDays + 3 : 12;
            const delayed = inProgress.filter((item) => (item.diasPendientes || 0) > delayedThreshold);
            const totalCost = assigned.reduce((sum, item) => sum + ((item.costoTaller || 0) * (item.cantidad || 0)), 0);
            const fallados = assigned.reduce((sum, item) => sum + (item.fallado || 0), 0);

            let score = null;
            if (assigned.length > 0) {
                score = 100;
                if ((avgDeliveryDays ?? currentAvgDays ?? 0) > 20) score -= 25;
                else if ((avgDeliveryDays ?? currentAvgDays ?? 0) > 12) score -= 15;
                else if ((avgDeliveryDays ?? currentAvgDays ?? 0) > 7) score -= 8;
                if (fallados > 0) score -= Math.min(25, fallados * 3);
                if (delayed.length > 0) score -= Math.min(30, Math.round((delayed.length / assigned.length) * 30));
                if (completed.length === 0 && inProgress.length > 0) score -= 8;
                score = Math.max(0, Math.round(score));
            }

            // Sum cantidadContada from mercaderiaConteos for this taller
            const tallerKey = normalizeUpper(name);
            const ingresadosTotal = mercaderiaConteos
                .filter(c => normalizeUpper(c.taller) === tallerKey)
                .reduce((sum, c) => sum + Number(c.cantidadContada || 0), 0);

            map[name] = {
                total: assigned.length,
                completed: completed.length,
                inProgress,
                avgDays,
                avgDeliveryDays,
                currentAvgDays,
                minDays: deliveryDays.length ? Math.min(...deliveryDays) : null,
                maxDays: deliveryDays.length ? Math.max(...deliveryDays) : null,
                delayed: delayed.length,
                fallados,
                totalCost,
                score,
                ingresadosTotal,
                moldes: assigned
            };
        });

        return map;
    }, [talleres, tallerRecords]);

    const visibleTalleres = useMemo(
        () => talleres.filter((name) => (stats[name]?.total || 0) > 0),
        [talleres, stats]
    );

    const selectedStats = selected ? stats[selected] : null;

    const markAsReceived = (item) => {
        const today = new Date().toISOString().split('T')[0];
        const newConteo = {
            id: `conteo-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            taller: selected,
            numeroCorte: item.corteNombre,
            articuloFabrica: item.codigo,
            descripcion: item.nombre,
            cantidadOriginal: item.cantidad,
            cantidadContada: item.cantidad,
            fechaIngreso: today,
            chequeado: false,
            fallado: 0,
            comentarioControl: 'Marcado manualmente como recibido',
            _manualEntry: true
        };
        updateConfig({
            mercaderiaConteos: [...mercaderiaConteos, newConteo]
        });
    };

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
                            {visibleTalleres.length === 0 && (
                                <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                                    {t('agregarTaller')}
                                </div>
                            )}
                            {visibleTalleres.map((name) => {
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
                                            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {name}
                                                {s?.total > 0 && (
                                                    <span style={{
                                                        fontSize: '9px',
                                                        fontWeight: 'var(--fw-bold)',
                                                        padding: '1px 6px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        background: s?.inProgress?.length === 0 ? 'var(--success-bg)' : 'var(--warning-bg)',
                                                        color: s?.inProgress?.length === 0 ? 'var(--success)' : 'var(--warning)',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        {s?.inProgress?.length === 0 ? 'Entregó todo' : `${s.inProgress.length} pendiente${s.inProgress.length > 1 ? 's' : ''}`}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {s?.total || 0} articulos
                                                {` · ${s?.completed || 0} ingresados`}
                                                {s?.ingresadosTotal > 0 ? ` · ${s.ingresadosTotal} prendas` : ''}
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

                            <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(7, 1fr)' : 'repeat(6, 1fr)', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
                                {[
                                    { value: selectedStats.total, label: 'Asignados', bg: 'var(--accent-light)', color: 'var(--accent)' },
                                    { value: selectedStats.completed, label: 'Ingresados', bg: 'var(--success-bg)', color: 'var(--success)' },
                                    { value: selectedStats.ingresadosTotal || 0, label: 'Prendas contadas', bg: 'rgba(52,211,153,0.08)', color: 'var(--success)', icon: PackageCheck },
                                    { value: selectedStats.inProgress.length, label: 'Pendientes', bg: 'var(--warning-bg)', color: 'var(--warning)' },
                                    { value: selectedStats.avgDays ?? '—', label: 'Promedio taller', bg: selectedStats.avgDays === null ? 'var(--glass-bg)' : selectedStats.avgDays <= 5 ? 'var(--success-bg)' : selectedStats.avgDays <= 10 ? 'var(--warning-bg)' : 'var(--danger-bg)', color: selectedStats.avgDays === null ? 'var(--text-muted)' : selectedStats.avgDays <= 5 ? 'var(--success)' : selectedStats.avgDays <= 10 ? 'var(--warning)' : 'var(--danger)', suffix: selectedStats.avgDays === null ? '' : 'd' },
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

                            {(selectedStats.completed > 0 || selectedStats.currentAvgDays !== null) && (
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
                                    <span>Min: <strong style={{ color: 'var(--success)' }}>{selectedStats.minDays ?? '—'}{selectedStats.minDays !== null ? 'd' : ''}</strong></span>
                                    <span>Prom: <strong style={{ color: 'var(--warning)' }}>{selectedStats.avgDays ?? '—'}{selectedStats.avgDays !== null ? 'd' : ''}</strong></span>
                                    <span>Max: <strong style={{ color: 'var(--danger)' }}>{selectedStats.maxDays ?? '—'}{selectedStats.maxDays !== null ? 'd' : ''}</strong></span>
                                    <span>Ranking: <strong style={{ color: getScoreColor(selectedStats.score) }}>{selectedStats.score ?? '—'}</strong></span>
                                </div>
                            )}
                        </div>

                        {/* Recent deliveries summary */}
                        {selectedStats.completed > 0 && (
                            <div className="settings-section" style={{ marginBottom: 'var(--sp-4)' }}>
                                <h3 style={{ fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <PackageCheck style={{ width: 16, height: 16, color: 'var(--success)' }} />
                                    Entregas recibidas ({selectedStats.completed})
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginTop: 'var(--sp-2)', maxHeight: 200, overflowY: 'auto' }}>
                                    {selectedStats.moldes
                                        .filter(item => item.matchedConteoId)
                                        .sort((a, b) => (b.fechaIngreso || '').localeCompare(a.fechaIngreso || ''))
                                        .map(item => (
                                            <div key={item.id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--sp-2)',
                                                padding: '6px 10px',
                                                background: 'rgba(52,211,153,0.06)',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '11px'
                                            }}>
                                                <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--success)', flexShrink: 0 }} />
                                                <span style={{ flex: 1, fontWeight: 'var(--fw-medium)' }}>{item.nombre}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{item.corteNombre}</span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{item.cantidad} u.</span>
                                                <span style={{ color: 'var(--success)', fontWeight: 'var(--fw-semibold)' }}>
                                                    {item.fechaIngreso || '—'}
                                                </span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                                    ({item.diasIngreso ?? '?'}d)
                                                </span>
                                                {item.fallado > 0 && (
                                                    <span style={{ color: 'var(--danger)', fontWeight: 'var(--fw-bold)' }}>
                                                        {item.fallado} fall.
                                                    </span>
                                                )}
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        )}

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
                                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 'var(--fw-bold)', color: isDelayed ? 'var(--danger)' : 'var(--warning)' }}>
                                                            {item.diasPendientes || 0}d esperando ingreso
                                                        </span>
                                                        {user?.role === 'admin' && (
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ fontSize: '9px', padding: '2px 8px', minWidth: 'auto' }}
                                                                onClick={(e) => { e.stopPropagation(); markAsReceived(item); }}
                                                            >
                                                                <CheckCircle2 style={{ width: 10, height: 10 }} /> Recibido
                                                            </button>
                                                        )}
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
                                                        <CheckCircle2 style={{ width: 12, height: 12 }} /> Chequeado
                                                    </span>
                                                )}
                                                {!item.matchedConteoId && user?.role === 'admin' && (
                                                    <button
                                                        className="btn"
                                                        style={{ fontSize: '10px', padding: '2px 8px', minWidth: 'auto', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)' }}
                                                        onClick={() => markAsReceived(item)}
                                                    >
                                                        Recibido
                                                    </button>
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
