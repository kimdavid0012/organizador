import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const generateDailyTasks = (userObj, state) => {
    const today = getTodayKey();
    const tasks = [];

    if (userObj.role === 'pedidos' || userObj.email === 'juan@celavie.com') {
        const pendingOrders = (state.config.pedidosOnline || [])
            .filter(p => p.estado === 'pendiente');
        pendingOrders.forEach(order => {
            tasks.push({
                id: `task-${order.id}`,
                text: `Procesar pedido de ${order.cliente || 'cliente'} (#${order.numeroPedido || ''})`,
                done: false,
                category: 'pedidos'
            });
        });
    }

    if (userObj.role === 'contenido_instagram' || userObj.email === 'erica@celavie.com') {
        const fotoTasks = state.config.fotoTasks || [];
        const pendingPhotos = fotoTasks.filter(f => !f.completada);
        tasks.push({
            id: `task-ig-${today}`,
            text: `Crear ${Math.max(3, pendingPhotos.length)} fotos de contenido para Instagram`,
            done: false,
            category: 'instagram'
        });
    }

    if (userObj.role === 'fotos' || userObj.email === 'rocio@celavie.com') {
        tasks.push({
            id: `task-tiktok-${today}`,
            text: 'Elegir y grabar opción de TikTok del día',
            done: false,
            category: 'tiktok'
        });
    }

    if (userObj.role === 'deposito' || userObj.email === 'naara@celavie.com') {
        tasks.push({
            id: `task-conteo-${today}`,
            text: 'Verificar conteo de mercadería del día',
            done: false,
            category: 'deposito'
        });
    }

    return tasks;
};

const KNOWN_USERS_MAP = {
    'nadia@celavie.com': { role: 'encargada', name: 'Nadia' },
    'juan@celavie.com': { role: 'pedidos', name: 'Juan' },
    'naara@celavie.com': { role: 'deposito', name: 'Naara' },
    'rocio@celavie.com': { role: 'fotos', name: 'Rocio' },
    'erica@celavie.com': { role: 'contenido_instagram', name: 'Erica' }
};

export default function DailyTasksPanel() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [collapsed, setCollapsed] = useState(false);
    const today = getTodayKey();

    const dailyTasks = state.config.dailyTasks || {};
    const todayTasks = dailyTasks[today] || {};

    const isManagerOrAdmin = user.role === 'admin' || user.role === 'encargada';

    // Generate tasks for this user if not already generated today
    useEffect(() => {
        if (!user?.email) return;
        const email = user.email.toLowerCase();

        if (isManagerOrAdmin) {
            // Generate tasks for all employees
            let needsUpdate = false;
            const updatedToday = { ...todayTasks };

            Object.entries(KNOWN_USERS_MAP).forEach(([empEmail, empData]) => {
                if (!updatedToday[empEmail]) {
                    const tasks = generateDailyTasks(empData, state);
                    if (tasks.length > 0) {
                        updatedToday[empEmail] = tasks;
                        needsUpdate = true;
                    }
                }
            });

            if (needsUpdate) {
                updateConfig({
                    dailyTasks: {
                        ...dailyTasks,
                        [today]: updatedToday
                    }
                });
            }
        } else {
            // Generate tasks only for current user
            if (!todayTasks[email]) {
                const tasks = generateDailyTasks({ role: user.role, email }, state);
                if (tasks.length > 0) {
                    updateConfig({
                        dailyTasks: {
                            ...dailyTasks,
                            [today]: {
                                ...todayTasks,
                                [email]: tasks
                            }
                        }
                    });
                }
            }
        }
    }, [user?.email, today]);

    const handleToggleTask = (email, taskId) => {
        const userTasks = todayTasks[email] || [];
        const updated = userTasks.map(t =>
            t.id === taskId ? { ...t, done: !t.done } : t
        );
        updateConfig({
            dailyTasks: {
                ...dailyTasks,
                [today]: {
                    ...todayTasks,
                    [email]: updated
                }
            }
        });
    };

    // Determine which tasks to show
    const taskGroups = useMemo(() => {
        if (isManagerOrAdmin) {
            // Show all employees' tasks grouped by person
            return Object.entries(todayTasks).map(([email, tasks]) => {
                const known = KNOWN_USERS_MAP[email];
                return {
                    email,
                    name: known?.name || email,
                    tasks: tasks || []
                };
            }).filter(g => g.tasks.length > 0);
        } else {
            const email = (user?.email || '').toLowerCase();
            const tasks = todayTasks[email] || [];
            if (tasks.length === 0) return [];
            return [{ email, name: user?.name || email, tasks }];
        }
    }, [todayTasks, user, isManagerOrAdmin]);

    if (taskGroups.length === 0) return null;

    const totalTasks = taskGroups.reduce((sum, g) => sum + g.tasks.length, 0);
    const doneTasks = taskGroups.reduce((sum, g) => sum + g.tasks.filter(t => t.done).length, 0);

    return (
        <div style={{
            margin: '0 0 20px 0',
            background: 'var(--bg-card, rgba(25, 25, 40, 0.55))',
            border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
            borderRadius: 14,
            overflow: 'hidden'
        }}>
            <div
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', cursor: 'pointer',
                    background: 'rgba(20, 184, 166, 0.06)',
                    borderBottom: collapsed ? 'none' : '1px solid var(--border-color, rgba(255,255,255,0.06))'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ClipboardList size={20} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        Tareas del día
                    </span>
                    <span style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '2px 8px', borderRadius: 10
                    }}>
                        {doneTasks}/{totalTasks}
                    </span>
                </div>
                {collapsed ? <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} />}
            </div>

            {!collapsed && (
                <div style={{ padding: '12px 20px 16px' }}>
                    {taskGroups.map(group => (
                        <div key={group.email} style={{ marginBottom: taskGroups.length > 1 ? 16 : 0 }}>
                            {isManagerOrAdmin && (
                                <div style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: 'var(--accent)', marginBottom: 8,
                                    textTransform: 'uppercase', letterSpacing: 0.5
                                }}>
                                    {group.name}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {group.tasks.map(task => (
                                    <div
                                        key={task.id}
                                        onClick={() => handleToggleTask(group.email, task.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 12px', borderRadius: 8,
                                            cursor: 'pointer',
                                            background: task.done ? 'rgba(34, 197, 94, 0.06)' : 'rgba(255,255,255,0.02)',
                                            transition: 'background 0.15s'
                                        }}
                                    >
                                        {task.done
                                            ? <CheckCircle2 size={18} style={{ color: 'var(--success, #22c55e)', flexShrink: 0 }} />
                                            : <Circle size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                        }
                                        <span style={{
                                            fontSize: 14,
                                            color: task.done ? 'var(--text-muted)' : 'var(--text-primary)',
                                            textDecoration: task.done ? 'line-through' : 'none',
                                            lineHeight: 1.4
                                        }}>
                                            {task.text}
                                        </span>
                                        {task.category && (
                                            <span style={{
                                                marginLeft: 'auto', fontSize: 10,
                                                color: 'var(--text-muted)',
                                                background: 'rgba(255,255,255,0.04)',
                                                padding: '2px 6px', borderRadius: 4,
                                                flexShrink: 0
                                            }}>
                                                {task.category}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
