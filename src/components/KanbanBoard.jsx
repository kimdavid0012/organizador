import React, { useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import KanbanColumn from './KanbanColumn';
import TaskCard from './TaskCard';
import './KanbanBoard.css';

const getCurrentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function KanbanBoard({ tareas, onOpenTarea, onAddTarea }) {
    const { state, updateTarea, updateConfig } = useData();
    const { user } = useAuth();
    const { config } = state;
    const [activeTarea, setActiveTarea] = useState(null);
    const monthKey = getCurrentMonthKey();
    const reminders = config.monthlyPaymentReminders || [];
    const reminderStatus = config.monthlyReminderStatus || {};
    const visibleReminders = user?.role === 'admin'
        ? reminders.filter((item) => item.soloAdmin !== false)
        : [];

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 }
        })
    );

    const findColumn = (id) => {
        // Check if id is a column
        if (typeof id === 'string' && id.startsWith('column-')) {
            return id.replace('column-', '');
        }
        // Otherwise find the tarea's column
        const tarea = tareas.find(t => t.id === id);
        return tarea ? tarea.estado : null;
    };

    const handleDragStart = (event) => {
        const { active } = event;
        const tarea = tareas.find(t => t.id === active.id);
        setActiveTarea(tarea || null);
    };

    const handleDragOver = (event) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        const activeColumn = findColumn(activeId);
        const overColumn = findColumn(overId);

        if (!activeColumn || !overColumn || activeColumn === overColumn) return;

        // Moving to a different column
        // Just update visually or immediately let's update DB
        const overColTareas = tareas.filter(t => t.estado === overColumn);
        updateTarea(activeId, { estado: overColumn, orden: overColTareas.length });
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        setActiveTarea(null);

        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        const activeColumn = findColumn(activeId);
        const overColumn = findColumn(overId);

        if (!activeColumn || !overColumn) return;

        if (activeColumn === overColumn) {
            // Reordering within same column
            const colTareas = state.tareas
                .filter(t => t.estado === activeColumn)
                .sort((a, b) => (a.orden || 0) - (b.orden || 0));
            const oldIndex = colTareas.findIndex(t => t.id === activeId);
            const newIndex = colTareas.findIndex(t => t.id === overId);

            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                const newOrder = arrayMove(colTareas, oldIndex, newIndex);
                // Update their order locally
                newOrder.forEach((t, i) => {
                    updateTarea(t.id, { orden: i });
                });
            }
        } else {
            // Handled in over, finalize
            const overColTareas = state.tareas
                .filter(t => t.estado === overColumn)
                .sort((a, b) => (a.orden || 0) - (b.orden || 0));

            const overIndex = overColTareas.findIndex(t => t.id === overId);
            const targetIndex = overIndex !== -1 ? overIndex : overColTareas.length;
            updateTarea(activeId, { estado: overColumn, orden: targetIndex });
        }
    };

    const sortedColumns = [...config.columnas].sort((a, b) => a.orden - b.orden);

    const toggleReminderDone = (reminderId) => {
        if (user?.role !== 'admin') return;
        const monthStatus = reminderStatus[monthKey] || {};
        updateConfig({
            monthlyReminderStatus: {
                ...reminderStatus,
                [monthKey]: {
                    ...monthStatus,
                    [reminderId]: !monthStatus[reminderId]
                }
            }
        });
    };

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            {visibleReminders.length > 0 && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)' }}>Recordatorios mensuales</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                Solo visible para vos. Te recuerda los pagos mensuales importantes del mes.
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {monthKey}
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                        {visibleReminders.map((item) => {
                            const done = Boolean(reminderStatus[monthKey]?.[item.id]);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => toggleReminderDone(item.id)}
                                    style={{
                                        textAlign: 'left',
                                        padding: 12,
                                        borderRadius: 14,
                                        border: done ? '1px solid rgba(20,184,166,0.35)' : '1px solid rgba(255,255,255,0.08)',
                                        background: done ? 'rgba(20,184,166,0.09)' : 'rgba(255,255,255,0.03)',
                                        color: 'var(--text-primary)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                        <strong>{item.nombre}</strong>
                                        <span style={{ fontSize: 11, color: done ? 'var(--success)' : 'var(--warning)' }}>
                                            {done ? 'Pagado' : 'Pendiente'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                                        {item.categoria}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="kanban-board">
                    {sortedColumns.map(column => {
                        const columnTareas = tareas.filter(t => t.estado === column.id);
                        return (
                            <KanbanColumn
                                key={column.id}
                                column={column}
                                tareas={columnTareas}
                                onAddTarea={onAddTarea}
                                onOpenTarea={onOpenTarea}
                            />
                        );
                    })}
                </div>

                <DragOverlay>
                    {activeTarea ? (
                        <div style={{ opacity: 0.9, transform: 'rotate(3deg)' }}>
                            <TaskCard tarea={activeTarea} onOpen={() => { }} />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
