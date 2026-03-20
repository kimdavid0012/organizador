import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Package } from 'lucide-react';
import { useI18n } from '../store/I18nContext';
import MoldCard from './MoldCard';
import TaskCard from './TaskCard';

export default function KanbanColumn({ column, tareas, onAddTarea, onOpenTarea }) {
    const { t } = useI18n();
    const { setNodeRef, isOver } = useDroppable({
        id: `column-${column.id}`,
        data: { type: 'column', columnId: column.id }
    });

    const sortedTareas = [...tareas].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const tareaIds = sortedTareas.map(t => t.id);

    return (
        <div className={`kanban-column ${isOver ? 'drag-over' : ''}`}>
            <div className="kanban-column-header">
                <div className="kanban-column-title">
                    <div className="kanban-column-dot" style={{ background: column.color }} />
                    <h3>{column.nombre}</h3>
                    <span className="kanban-column-count">{tareas.length}</span>
                </div>
                <div className="kanban-column-actions">
                    <button
                        className="btn-icon"
                        onClick={() => onAddTarea(column.id)}
                        title={t('agregarMolde')}
                    >
                        <Plus />
                    </button>
                </div>
            </div>

            <div className="kanban-column-body" ref={setNodeRef}>
                <SortableContext items={tareaIds} strategy={verticalListSortingStrategy}>
                    {sortedTareas.length === 0 ? (
                        <div className="kanban-column-empty">
                            <Package />
                            <span>{t('sinMoldes')}</span>
                            <span>{t('arrastrarOCrear')}</span>
                        </div>
                    ) : (
                        sortedTareas.map(tarea => (
                            <TaskCard
                                key={tarea.id}
                                tarea={tarea}
                                onOpen={onOpenTarea}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    );
}
