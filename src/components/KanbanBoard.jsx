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
import KanbanColumn from './KanbanColumn';
import TaskCard from './TaskCard';
import './KanbanBoard.css';

export default function KanbanBoard({ tareas, onOpenTarea, onAddTarea }) {
    const { state, updateTarea } = useData();
    const { config } = state;
    const [activeTarea, setActiveTarea] = useState(null);

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

    return (
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
    );
}
