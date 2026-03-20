import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, Circle, Search } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

const FOTO_TASKS = [
    { id: 'web_single', label: '1 prenda web' },
    { id: 'web_variants', label: 'Perchero colores web' },
    { id: 'web_model', label: 'Modelo web' },
    { id: 'ig_flatlay', label: 'Flat lay IG' },
    { id: 'ig_rack', label: 'Perchero IG' },
    { id: 'ig_model', label: 'Modelo IG' }
];

export default function FotosPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [search, setSearch] = useState('');

    const allProducts = state.config.posProductos || [];
    const fotoTasks = state.config.fotoTasks || [];

    const visibleProducts = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        return allProducts
            .filter((product) => product.activo !== false)
            .filter((product) => {
                if (!normalized) return true;
                return (
                    (product.codigoInterno || '').toLowerCase().includes(normalized) ||
                    (product.detalleCorto || '').toLowerCase().includes(normalized)
                );
            })
            .slice(0, 120);
    }, [allProducts, search]);

    const getTaskRecord = (productId) =>
        fotoTasks.find((entry) => entry.productId === productId) || {
            productId,
            states: {},
            updatedAt: null
        };

    const toggleTask = (productId, taskId) => {
        const current = getTaskRecord(productId);
        const nextTasks = fotoTasks.filter((entry) => entry.productId !== productId);
        const nextRecord = {
            ...current,
            updatedAt: new Date().toISOString(),
            updatedBy: user.email,
            states: {
                ...(current.states || {}),
                [taskId]: !current.states?.[taskId]
            }
        };
        updateConfig({ fotoTasks: [...nextTasks, nextRecord] });
    };

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Camera size={22} /> Flujo de Fotos
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            Rocio puede marcar las 6 tareas visuales por artículo para web e Instagram.
                        </p>
                    </div>
                    <div className="form-group" style={{ margin: 0, minWidth: 260 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 34 }}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar por codigo o articulo"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                {visibleProducts.map((product) => {
                    const record = getTaskRecord(product.id);
                    const completed = FOTO_TASKS.filter((task) => record.states?.[task.id]).length;

                    return (
                        <div
                            key={product.id}
                            className="glass-panel"
                            style={{ padding: 'var(--sp-4)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{product.detalleCorto}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{product.codigoInterno || 'Sin codigo'}</div>
                                </div>
                                <div style={{ color: completed === FOTO_TASKS.length ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 'var(--fw-semibold)' }}>
                                    {completed}/{FOTO_TASKS.length} completas
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                                {FOTO_TASKS.map((task) => {
                                    const done = Boolean(record.states?.[task.id]);
                                    return (
                                        <button
                                            key={task.id}
                                            className="btn btn-secondary"
                                            onClick={() => toggleTask(product.id, task.id)}
                                            style={{
                                                justifyContent: 'space-between',
                                                borderColor: done ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.25)',
                                                background: done ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.08)',
                                                color: done ? 'var(--success)' : '#fca5a5'
                                            }}
                                        >
                                            <span>{task.label}</span>
                                            {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
