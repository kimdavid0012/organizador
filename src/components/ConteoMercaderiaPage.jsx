import React, { useMemo, useState } from 'react';
import { Boxes, Plus, Trash2, Download } from 'lucide-react';
import { useData } from '../store/DataContext';
import { generateId } from '../utils/helpers';

const EMPTY_FORM = {
    articulo: '',
    descripcion: '',
    color: '',
    fechaIngreso: '',
    taller: '',
    cantidadOriginal: '',
    cantidadContada: '',
    cantidadEllos: '',
    fallado: ''
};

const toNumber = (value) => Number.parseInt(value || 0, 10) || 0;

export default function ConteoMercaderiaPage() {
    const { state, updateConfig } = useData();
    const conteos = state.config?.mercaderiaConteos || [];
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');

    const filteredConteos = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return conteos;
        return conteos.filter((item) =>
            [item.articulo, item.descripcion, item.color, item.taller]
                .some((value) => (value || '').toLowerCase().includes(q))
        );
    }, [conteos, search]);

    const saveConteos = (nextConteos) => {
        updateConfig({ mercaderiaConteos: nextConteos });
    };

    const handleAdd = () => {
        if (!formData.articulo.trim()) {
            alert('El articulo es obligatorio.');
            return;
        }

        const newItem = {
            id: generateId(),
            ...formData,
            cantidadOriginal: toNumber(formData.cantidadOriginal),
            cantidadContada: toNumber(formData.cantidadContada),
            cantidadEllos: toNumber(formData.cantidadEllos),
            fallado: toNumber(formData.fallado),
            createdAt: new Date().toISOString()
        };

        saveConteos([newItem, ...conteos]);
        setFormData(EMPTY_FORM);
    };

    const handleDelete = (id) => {
        if (!window.confirm('Eliminar este conteo?')) return;
        saveConteos(conteos.filter((item) => item.id !== id));
    };

    const handleCellChange = (id, field, value) => {
        const nextConteos = conteos.map((item) =>
            item.id === id
                ? {
                    ...item,
                    [field]: ['cantidadOriginal', 'cantidadContada', 'cantidadEllos', 'fallado'].includes(field)
                        ? toNumber(value)
                        : value
                }
                : item
        );
        saveConteos(nextConteos);
    };

    const exportCsv = () => {
        const headers = ['Articulo', 'Descripcion', 'Color', 'Fecha ingreso', 'Taller', 'Cantidad original', 'Cantidad contada', 'Cantidad ellos', 'Fallado', 'Diferencia'];
        const rows = conteos.map((item) => {
            const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
            return [
                item.articulo,
                item.descripcion,
                item.color,
                item.fechaIngreso,
                item.taller,
                item.cantidadOriginal,
                item.cantidadContada,
                item.cantidadEllos,
                item.fallado,
                diferencia
            ];
        });

        const csv = [headers, ...rows]
            .map((row) => row.map((cell) => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `conteo-mercaderia-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="view-container" style={{ maxWidth: 1250, margin: '0 auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <Boxes /> Conteo de Mercaderia
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Registro de stock contado por articulo, color y taller.
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={exportCsv}>
                    <Download size={16} /> Exportar CSV
                </button>
            </div>

            <div className="glass-panel" style={{ padding: 18, marginBottom: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <input className="form-input" placeholder="Articulo" value={formData.articulo} onChange={(e) => setFormData((prev) => ({ ...prev, articulo: e.target.value }))} />
                    <input className="form-input" placeholder="Descripcion" value={formData.descripcion} onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))} />
                    <input className="form-input" placeholder="Color / modelo" value={formData.color} onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))} />
                    <input className="form-input" type="date" value={formData.fechaIngreso} onChange={(e) => setFormData((prev) => ({ ...prev, fechaIngreso: e.target.value }))} />
                    <input className="form-input" placeholder="Taller" value={formData.taller} onChange={(e) => setFormData((prev) => ({ ...prev, taller: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Cantidad original" value={formData.cantidadOriginal} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadOriginal: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Cantidad contada" value={formData.cantidadContada} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadContada: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Cantidad de ellos" value={formData.cantidadEllos} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadEllos: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Fallado" value={formData.fallado} onChange={(e) => setFormData((prev) => ({ ...prev, fallado: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                    <input
                        className="form-input"
                        style={{ maxWidth: 320 }}
                        placeholder="Buscar por articulo, descripcion, color o taller..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={handleAdd}>
                        <Plus size={16} /> Agregar conteo
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                {['Articulo', 'Descripcion', 'Color', 'Fecha ingreso', 'Taller', 'Original', 'Contada', 'Ellos', 'Fallado', 'Diferencia', 'Accion'].map((label) => (
                                    <th key={label} style={{ padding: '12px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredConteos.map((item) => {
                                const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
                                return (
                                    <tr key={item.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.articulo || ''} onChange={(e) => handleCellChange(item.id, 'articulo', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.descripcion || ''} onChange={(e) => handleCellChange(item.id, 'descripcion', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.color || ''} onChange={(e) => handleCellChange(item.id, 'color', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="date" value={item.fechaIngreso || ''} onChange={(e) => handleCellChange(item.id, 'fechaIngreso', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.taller || ''} onChange={(e) => handleCellChange(item.id, 'taller', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadOriginal || 0} onChange={(e) => handleCellChange(item.id, 'cantidadOriginal', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadContada || 0} onChange={(e) => handleCellChange(item.id, 'cantidadContada', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadEllos || 0} onChange={(e) => handleCellChange(item.id, 'cantidadEllos', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.fallado || 0} onChange={(e) => handleCellChange(item.id, 'fallado', e.target.value)} /></td>
                                        <td style={{ padding: 10, fontWeight: 700, color: diferencia < 0 ? 'var(--danger)' : 'var(--success)' }}>
                                            {diferencia}
                                        </td>
                                        <td style={{ padding: 10 }}>
                                            <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(item.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredConteos.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No hay conteos cargados todavía.
                    </div>
                )}
            </div>
        </div>
    );
}
