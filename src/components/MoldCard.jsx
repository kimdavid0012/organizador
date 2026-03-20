import React, { useState } from 'react';
import { Calendar, CheckCircle2, X, Image as ImageIcon } from 'lucide-react';
import { useData } from '../store/DataContext';
import { formatDate, isOverdue, isToday } from '../utils/helpers';
import { useI18n } from '../store/I18nContext';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

export default function MoldCard({ molde, onOpen }) {
    const { state } = useData();
    const { telas, config } = state;
    const { t } = useI18n();
    const [lightboxImg, setLightboxImg] = useState(null);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: molde.id,
        data: { type: 'molde', molde }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const coverImage = molde.coverImageId
        ? (molde.imagenes || []).find(i => i.id === molde.coverImageId)
        : (molde.imagenes && molde.imagenes.length > 0 ? molde.imagenes[0] : null);

    const moleTelas = (molde.telasIds || [])
        .map(id => telas.find(t => t.id === id))
        .filter(Boolean);

    const checklistTotal = (molde.checklist || []).length;
    const checklistDone = (molde.checklist || []).filter(c => c.completado).length;
    const imageCount = (molde.imagenes || []).length;

    const overdue = isOverdue(molde.fechaObjetivo);
    const today = isToday(molde.fechaObjetivo);

    const handleImageClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (coverImage) {
            setLightboxImg(coverImage.data);
        }
    };

    const handleCloseLightbox = (e) => {
        e.stopPropagation();
        setLightboxImg(null);
    };

    return (
        <>
            <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                className={`mold-card ${isDragging ? 'dragging' : ''}`}
                onDoubleClick={() => onOpen(molde)}
                title={t('dobleClickEditar')}
            >
                {/* Estado bar */}
                <div
                    className="mold-card-priority-bar"
                    style={{ background: getEstadoColor(molde.estado, config.columnas) }}
                />

                {/* Cover image - clickable to open lightbox */}
                {coverImage && (
                    <div style={{ position: 'relative' }}>
                        <img
                            src={coverImage.data}
                            alt={molde.nombre}
                            className="mold-card-cover"
                            loading="lazy"
                            onClick={handleImageClick}
                            style={{ cursor: 'zoom-in' }}
                        />
                        {imageCount > 1 && (
                            <span style={{
                                position: 'absolute', bottom: 4, right: 4,
                                background: 'rgba(0,0,0,0.7)', color: '#fff',
                                fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                display: 'flex', alignItems: 'center', gap: 3
                            }}>
                                <ImageIcon style={{ width: 10, height: 10 }} />
                                {imageCount}
                            </span>
                        )}
                    </div>
                )}

                <div className="mold-card-body">
                    <div className="mold-card-top">
                        <span className="mold-card-name">{molde.nombre || t('sinNombre')}</span>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <span
                                className="badge"
                                style={{
                                    background: getEstadoColor(molde.estado, config.columnas) + '22',
                                    color: getEstadoColor(molde.estado, config.columnas)
                                }}
                            >
                                {getEstadoName(molde.estado, config.columnas)}
                            </span>
                            {molde.estadoCorte && molde.estadoCorte !== 'sin-enviar' && (() => {
                                const corteState = (config.estadosCorte || []).find(ec => ec.id === molde.estadoCorte);
                                if (!corteState) return null;
                                return (
                                    <span
                                        className="badge"
                                        style={{
                                            background: corteState.color + '22',
                                            color: corteState.color,
                                            fontSize: '0.65rem'
                                        }}
                                    >
                                        ✂ {corteState.nombre}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>

                    {molde.codigo && (
                        <div className="mold-card-code">#{molde.codigo}</div>
                    )}

                    <div className="mold-card-meta">
                        {molde.categoria && <span className="tag">{molde.categoria}</span>}
                        {molde.talles && <span className="tag">{molde.talles}</span>}
                    </div>

                    {moleTelas.length > 0 && (
                        <div className="mold-card-telas">
                            {moleTelas.slice(0, 3).map(t => (
                                <span key={t.id} className="mold-card-tela">{t.nombre}</span>
                            ))}
                            {moleTelas.length > 3 && (
                                <span className="mold-card-tela">+{moleTelas.length - 3}</span>
                            )}
                        </div>
                    )}

                    <div className="mold-card-bottom">
                        {molde.fechaObjetivo && (
                            <span className={`mold-card-date ${overdue ? 'overdue' : ''} ${today ? 'today' : ''}`}>
                                <Calendar />
                                {formatDate(molde.fechaObjetivo)}
                            </span>
                        )}

                        {checklistTotal > 0 && (
                            <span className="mold-card-progress">
                                <CheckCircle2 style={{ width: 12, height: 12 }} />
                                {checklistDone}/{checklistTotal}
                                <div className="mold-card-progress-bar">
                                    <div
                                        className="mold-card-progress-fill"
                                        style={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
                                    />
                                </div>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Lightbox for enlarged image view */}
            {lightboxImg && (
                <div className="lightbox" onClick={handleCloseLightbox}>
                    <img src={lightboxImg} alt={molde.nombre || 'Imagen del molde'} />
                    <button className="lightbox-close" onClick={handleCloseLightbox}>
                        <X />
                    </button>
                </div>
            )}
        </>
    );
}

