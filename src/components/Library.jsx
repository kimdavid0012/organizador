import React, { useState, useMemo } from 'react';
import { Package, Image as ImageIcon, ArrowUpDown, Plus, X, Filter } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { formatDate, isOverdue, isToday } from '../utils/helpers';
import './Library.css';

const ESTADO_COLORS = {
    'Por hacer': '#ef4444',
    'En progreso': '#eab308',
    'Listo': '#22c55e',
    'A revisar': '#ec4899',
    'Archivado': '#6b7280',
    'Cancelado': '#6b7280',
};

const getEstadoColor = (estadoId, columnas) => {
    const col = columnas.find(c => c.id === estadoId);
    if (!col) return '#6b7280';
    return ESTADO_COLORS[col.nombre] || col.color || '#6b7280';
};

const getEstadoName = (estadoId, columnas) => {
    const col = columnas.find(c => c.id === estadoId);
    return col ? col.nombre : estadoId;
};

export default function Library({ filteredMoldes, onOpenMolde, onAddMolde }) {
    const { state } = useData();
    const { telas, config } = state;
    const { t } = useI18n();

    const [sortField, setSortField] = useState('nombre');
    const [sortAsc, setSortAsc] = useState(true);
    const [lightboxImg, setLightboxImg] = useState(null);
    const [estadoFilter, setEstadoFilter] = useState('');
    const [corteFilter, setCorteFilter] = useState('');
    const [groupByTela, setGroupByTela] = useState(true);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

    // Apply estado filter on top of existing filters
    const displayMoldes = useMemo(() => {
        let result = filteredMoldes;
        if (estadoFilter) {
            result = result.filter(m => m.estado === estadoFilter);
        }
        if (corteFilter) {
            result = result.filter(m => (m.estadoCorte || 'sin-enviar') === corteFilter);
        }
        return [...result].sort((a, b) => {
            let va = a[sortField] || '';
            let vb = b[sortField] || '';
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });
    }, [filteredMoldes, sortField, sortAsc, estadoFilter, corteFilter]);

    // Group by tela
    const groupedByTela = useMemo(() => {
        if (!groupByTela) return null;
        const groups = {};
        // "Sin tela" group
        const sinTela = [];

        displayMoldes.forEach(molde => {
            const ids = molde.telasIds || [];
            if (ids.length === 0) {
                sinTela.push(molde);
            } else {
                ids.forEach(telaId => {
                    if (!groups[telaId]) groups[telaId] = [];
                    groups[telaId].push(molde);
                });
            }
        });

        const result = [];
        telas.forEach(tela => {
            if (groups[tela.id] && groups[tela.id].length > 0) {
                result.push({ tela, moldes: groups[tela.id] });
            }
        });
        if (sinTela.length > 0) {
            result.push({ tela: { id: 'sin-tela', nombre: t('sinTelaAsignada') }, moldes: sinTela });
        }
        return result;
    }, [displayMoldes, telas, groupByTela]);

    const getColumnName = (estadoId) => getEstadoName(estadoId, config.columnas);

    const getTelasNames = (telasIds) => {
        return (telasIds || [])
            .map(id => telas.find(t => t.id === id)?.nombre)
            .filter(Boolean)
            .join(', ');
    };

    const getCoverImage = (molde) => {
        if (molde.coverImageId && molde.imagenes) {
            const found = molde.imagenes.find(i => i.id === molde.coverImageId);
            if (found) return found;
        }
        if (molde.imagenes && molde.imagenes.length > 0) return molde.imagenes[0];
        return null;
    };

    const columns = [
        { key: 'thumb', label: '', sortable: false },
        { key: 'nombre', label: t('nombre'), sortable: true },
        { key: 'codigo', label: t('codigo'), sortable: true },
        { key: 'categoria', label: t('categoria'), sortable: true },
        { key: 'talles', label: t('tallesRango'), sortable: false },
        { key: 'estado', label: t('estadoMolde'), sortable: true },
        { key: 'estadoCorte', label: t('estadoCorte'), sortable: true },
        { key: 'temporada', label: t('temporada'), sortable: true },
        { key: 'responsable', label: t('responsable'), sortable: true },
        { key: 'fechaObjetivo', label: t('fecha'), sortable: true },
    ];

    const renderRow = (molde) => {
        const cover = getCoverImage(molde);
        const overdue = isOverdue(molde.fechaObjetivo);
        const today = isToday(molde.fechaObjetivo);
        const estadoColor = getEstadoColor(molde.estado, config.columnas);
        return (
            <tr key={molde.id} onDoubleClick={() => onOpenMolde(molde)}>
                <td>
                    {cover ? (
                        <img
                            src={cover.data}
                            alt=""
                            className="library-table-thumb"
                            onClick={(e) => { e.stopPropagation(); setLightboxImg(cover.data); }}
                            style={{ cursor: 'zoom-in' }}
                        />
                    ) : (
                        <div className="library-table-no-img">
                            <ImageIcon />
                        </div>
                    )}
                </td>
                <td><strong>{molde.nombre || t('sinNombre')}</strong></td>
                <td>{molde.codigo || '—'}</td>
                <td>{molde.categoria || '—'}</td>
                <td>{molde.talles || '—'}</td>
                <td>
                    <span
                        className="badge"
                        style={{
                            background: estadoColor + '22',
                            color: estadoColor,
                        }}
                    >
                        {getColumnName(molde.estado)}
                    </span>
                </td>
                <td>
                    {(() => {
                        const ecId = molde.estadoCorte || 'sin-enviar';
                        const ec = (config.estadosCorte || []).find(e => e.id === ecId);
                        if (!ec) return '—';

                        const isCortado = ec.nombre.toLowerCase() === 'cortado';
                        const overrideColor = isCortado ? '#22c55e' : '#ef4444'; // Verde si es cortado, rojo para el resto

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span className="badge" style={{
                                    background: overrideColor + '22',
                                    color: overrideColor,
                                }}>
                                    ✂ {ec.nombre}{molde.cortesCount ? ` (${molde.cortesCount})` : ''}
                                </span>
                                {molde.cortador && (
                                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                                        → {molde.cortador}
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                </td>
                <td>{molde.temporada || '—'}</td>
                <td>{molde.responsable || '—'}</td>
                <td style={{ color: overdue ? 'var(--danger)' : today ? 'var(--warning)' : undefined }}>
                    {molde.fechaObjetivo ? formatDate(molde.fechaObjetivo) : '—'}
                </td>
            </tr>
        );
    };

    const renderTable = (moldes, showTelasCol) => (
        <div className="library-table-wrapper">
            <table className="library-table">
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                className={sortField === col.key ? 'sorted' : ''}
                                onClick={() => col.sortable && handleSort(col.key)}
                                style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                            >
                                {col.label}
                                {col.sortable && sortField === col.key && (
                                    <ArrowUpDown style={{ width: 12, height: 12, marginLeft: 4, display: 'inline' }} />
                                )}
                            </th>
                        ))}
                        {showTelasCol && <th>{t('telas')}</th>}
                    </tr>
                </thead>
                <tbody>
                    {moldes.map(molde => {
                        const row = renderRow(molde);
                        if (showTelasCol) {
                            // Clone row and add telas cell
                            return (
                                <tr key={molde.id} onDoubleClick={() => onOpenMolde(molde)}>
                                    {row.props.children}
                                    <td>{getTelasNames(molde.telasIds) || '—'}</td>
                                </tr>
                            );
                        }
                        return row;
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="library">
            <div className="library-header">
                <h2>{t('bibliotecaMoldes')}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Estado filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Filter style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                        <select
                            className="form-select"
                            value={estadoFilter}
                            onChange={(e) => setEstadoFilter(e.target.value)}
                            style={{ width: 'auto', minWidth: 140, fontSize: 'var(--fs-xs)' }}
                        >
                            <option value="">{t('todosEstados')}</option>
                            {config.columnas.map(col => (
                                <option key={col.id} value={col.id}>{col.nombre}</option>
                            ))}
                        </select>
                    </div>
                    {/* Corte filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 14 }}>✂️</span>
                        <select
                            className="form-select"
                            value={corteFilter}
                            onChange={(e) => setCorteFilter(e.target.value)}
                            style={{ width: 'auto', minWidth: 140, fontSize: 'var(--fs-xs)' }}
                        >
                            <option value="">{t('todosCortes')}</option>
                            {(config.estadosCorte || []).map(ec => (
                                <option key={ec.id} value={ec.id}>{ec.nombre}</option>
                            ))}
                        </select>
                    </div>
                    {/* Group toggle */}
                    <button
                        className={`btn btn-sm ${groupByTela ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setGroupByTela(!groupByTela)}
                    >
                        {groupByTela ? t('agrupadoPorTela') : t('sinAgrupar')}
                    </button>
                    <button className="btn btn-primary" onClick={() => onAddMolde()}>
                        <Plus /> {t('nuevoMolde')}
                    </button>
                </div>
            </div>

            {displayMoldes.length === 0 ? (
                <div className="library-empty">
                    <Package />
                    <p>{t('noHayMoldesFiltros')}</p>
                </div>
            ) : groupByTela && groupedByTela ? (
                // Grouped view
                <div className="library-groups">
                    {groupedByTela.map(group => (
                        <div key={group.tela.id} className="library-group">
                            <div className="library-group-header">
                                <h3>{group.tela.nombre}</h3>
                                <span className="library-group-count">{group.moldes.length} {group.moldes.length !== 1 ? t('moldesPlural') : t('moldes')}</span>
                            </div>
                            {renderTable(group.moldes, false)}
                        </div>
                    ))}
                </div>
            ) : (
                // Flat view
                renderTable(displayMoldes, true)
            )}

            {lightboxImg && (
                <div className="lightbox" onClick={() => setLightboxImg(null)}>
                    <img src={lightboxImg} alt={t('vistaAmpliada')} />
                    <button className="lightbox-close" onClick={() => setLightboxImg(null)}>
                        <X />
                    </button>
                </div>
            )}
        </div>
    );
}
