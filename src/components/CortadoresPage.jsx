import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Scissors, ChevronRight, BarChart3 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';

export default function CortadoresPage() {
    const { state, updateConfig } = useData();
    const { t } = useI18n();
    const { config, moldes } = state;
    const manualCortadores = config.cortadores || [];
    const cortes = config.cortes || [];

    const [newName, setNewName] = useState('');
    const [selected, setSelected] = useState(null);

    const moldeMap = useMemo(() => {
        return new Map((moldes || []).map((molde) => [molde.id, molde]));
    }, [moldes]);

    const cortadores = useMemo(() => {
        const merged = new Set(manualCortadores);

        cortes.forEach((corte) => {
            (corte.moldesData || []).forEach((item) => {
                const assignedName = (item.cortadorAsignado || item.cortador || '').trim();
                if (assignedName) {
                    merged.add(assignedName);
                }
            });
        });

        return Array.from(merged).sort((left, right) => left.localeCompare(right, 'es'));
    }, [manualCortadores, cortes]);

    const addCortador = () => {
        const name = newName.trim();
        if (!name || manualCortadores.includes(name)) return;
        updateConfig({ cortadores: [...manualCortadores, name] });
        setNewName('');
    };

    const removeCortador = (name) => {
        updateConfig({ cortadores: manualCortadores.filter(c => c !== name) });
        if (selected === name) setSelected(null);
    };

    // Performance stats per cortador
    const stats = useMemo(() => {
        const map = {};
        cortadores.forEach(name => {
            const assigned = [];

            cortes.forEach((corte) => {
                (corte.moldesData || []).forEach((item) => {
                    const assignedName = (item.cortadorAsignado || item.cortador || '').trim();
                    if (assignedName !== name) return;

                    const molde = moldeMap.get(item.id);
                    assigned.push({
                        id: `${corte.id}-${item.id}`,
                        moldeId: item.id,
                        nombre: molde?.nombre || '(sin nombre)',
                        codigo: molde?.codigo || '',
                        corteNombre: corte.nombre || 'Corte',
                        fecha: corte.fecha || '',
                        cantidad: Number(item.cantidad || 0),
                        costoCortador: Number(item.costoCortador || 0),
                        pagadoCortador: Boolean(item.pagadoCortador),
                        estado: item.estadoTaller || molde?.estadoCorte || 'sin-enviar'
                    });
                });
            });

            const completed = assigned.filter((item) => item.estado === 'cortado');
            const totalCortes = assigned.reduce((sum, item) => sum + item.cantidad, 0);
            const totalMonto = assigned.reduce((sum, item) => sum + (item.costoCortador * (item.cantidad || 0)), 0);
            map[name] = {
                total: assigned.length,
                completed: completed.length,
                pending: assigned.length - completed.length,
                totalCortes,
                totalMonto,
                moldes: assigned.sort((left, right) => `${right.fecha}-${right.corteNombre}`.localeCompare(`${left.fecha}-${left.corteNombre}`)),
            };
        });
        return map;
    }, [cortadores, cortes, moldeMap]);

    const selectedStats = selected ? stats[selected] : null;

    return (
        <div className="settings" style={{ maxWidth: 1000 }}>
            <h2><Scissors style={{ display: 'inline', marginRight: 8 }} /> {t('cortadores')}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap: 'var(--sp-5)' }}>
                {/* Left: Cortadores List */}
                <div>
                    <div className="settings-section">
                        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                            <input
                                className="form-input"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={t('agregarCortador') + '...'}
                                onKeyDown={(e) => e.key === 'Enter' && addCortador()}
                            />
                            <button className="btn btn-primary" onClick={addCortador}>
                                <Plus />
                            </button>
                        </div>

                        <div className="settings-list">
                            {cortadores.length === 0 && (
                                <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                                    {t('agregarCortador')}
                                </div>
                            )}
                            {cortadores.map(name => (
                                <div
                                    key={name}
                                    className="settings-list-item"
                                    style={{
                                        cursor: 'pointer',
                                        border: selected === name ? '1px solid var(--accent)' : '1px solid transparent',
                                        background: selected === name ? 'var(--accent-light)' : undefined,
                                    }}
                                    onClick={() => setSelected(selected === name ? null : name)}
                                >
                                    <Scissors style={{ width: 16, height: 16, color: 'var(--accent)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)' }}>{name}</span>
                                    <span className="badge badge-accent" style={{ marginRight: 4 }}>
                                        {stats[name]?.total || 0}
                                    </span>
                                    <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                                    <button
                                        className="remove-btn"
                                        onClick={(e) => { e.stopPropagation(); removeCortador(name); }}
                                        style={{ opacity: 1 }}
                                    >
                                        <Trash2 style={{ width: 14, height: 14 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Stats */}
                {selected && selectedStats && (
                    <div>
                        <div className="settings-section">
                            <h3><BarChart3 /> {selected}</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
                                <div style={{
                                    padding: 'var(--sp-3)',
                                    background: 'var(--accent-light)',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--accent)' }}>
                                        {selectedStats.total}
                                    </div>
                                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                                        {t('moldesAsignados')}
                                    </div>
                                </div>
                                <div style={{
                                    padding: 'var(--sp-3)',
                                    background: 'var(--success-bg)',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>
                                        {selectedStats.completed}
                                    </div>
                                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                                        {t('cortados')}
                                    </div>
                                </div>
                                <div style={{
                                    padding: 'var(--sp-3)',
                                    background: 'var(--warning-bg)',
                                    borderRadius: 'var(--radius-md)',
                                    textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-bold)', color: 'var(--warning)' }}>
                                        {selectedStats.totalCortes}
                                    </div>
                                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                                        {t('totalCortes')}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.04)' }}>
                                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                                    Total a pagar cortador
                                </div>
                                <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>
                                    ${selectedStats.totalMonto.toLocaleString('es-AR')}
                                </div>
                            </div>

                            {/* Moldes list */}
                            <h3 style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-2)' }}>
                                Cortes asignados
                            </h3>
                            {selectedStats.moldes.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', padding: 'var(--sp-4)', textAlign: 'center' }}>
                                    Sin cortes asignados
                                </div>
                            ) : (
                                <div className="settings-list">
                                    {selectedStats.moldes.map(m => (
                                        <div key={m.id} className="settings-list-item" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-medium)' }}>{m.nombre || '(sin nombre)'}</div>
                                                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                                                    {m.corteNombre} · {m.fecha || 'sin fecha'} · {m.cantidad} prendas
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <span style={{ fontSize: 'var(--fs-xs)', color: m.pagadoCortador ? 'var(--success)' : 'var(--text-muted)' }}>
                                                    {m.pagadoCortador ? 'Pagado' : 'Pendiente'}
                                                </span>
                                                <span className={`badge badge-${m.estado === 'cortado' ? 'baja' : m.estado === 'enviado' ? 'media' : 'accent'}`}>
                                                    {m.estado || 'sin-enviar'}
                                                </span>
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
