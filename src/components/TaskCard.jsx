import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, CheckSquare } from 'lucide-react';
import { useI18n } from '../store/I18nContext';
// MoldCard styles are assumed to be loaded globally or via KanbanBoard.css

export default function TaskCard({ tarea, onOpen }) {
    const { t } = useI18n();

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: tarea.id,
        data: {
            type: 'tarea',
            tarea
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="mold-card mold-card-dragging"
            />
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="mold-card"
            onDoubleClick={(e) => {
                e.stopPropagation();
                onOpen(tarea);
            }}
            title={t('dobleClickEditar')}
        >
            <div className="mold-card-header">
                <span className="mold-card-title">{tarea.nombre || 'Sin título'}</span>
            </div>

            {tarea.descripcion && (
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {tarea.descripcion}
                </div>
            )}

            <div className="mold-card-footer">
                <div className="mold-card-meta">
                    <CheckSquare size={14} />
                    <span style={{ fontSize: 'var(--fs-xs)' }}>Tarea</span>
                </div>
                {tarea.fechaObjetivo && (
                    <div className="mold-card-date">
                        <Clock size={12} />
                        {new Date(tarea.fechaObjetivo).toLocaleDateString()}
                    </div>
                )}
            </div>
        </div>
    );
}
