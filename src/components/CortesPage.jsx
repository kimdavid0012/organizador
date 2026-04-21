import React, { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, ChevronRight, Scissors, Save, Upload } from 'lucide-react';
import { useData } from '../store/DataContext';
import { generateId } from '../utils/helpers';
import * as XLSX from 'xlsx';

export default function CortesPage() {
    const { state, updateConfig } = useData();
    const { config } = state;
    const cortes = config.cortes || [];

    const [selected, setSelected] = useState(null);
    const [newCorteData, setNewCorteData] = useState({ nombre: '', fason: '', fecha: '', tela: '' });

    const selectedCorte = cortes.find(c => c.id === selected);

    const updateCorte = (id, changes) => {
        updateConfig({ cortes: cortes.map(c => c.id === id ? { ...c, ...changes } : c) });
    };

    const addCorte = () => {
        const nombre = newCorteData.nombre.trim() || `Corte ${cortes.length + 1}`;
        const newCorte = {
            id: generateId(),
            nombre,
            fason: newCorteData.fason.trim(),
            fecha: newCorteData.fecha,
            tela: newCorteData.tela.trim(),
            consumoTelas: [] // array of { color, rollo, kilo, cantidad }
        };
        updateConfig({ cortes: [...cortes, newCorte] });
        setSelected(newCorte.id);
        setNewCorteData({ nombre: '', fason: '', fecha: '', tela: '' });
    };

    const deleteCorte = (id) => {
        if (!window.confirm('¿Eliminar este corte?')) return;
        updateConfig({ cortes: cortes.filter(c => c.id !== id) });
        if (selected === id) setSelected(null);
    };

    const addRow = () => {
        if (!selectedCorte) return;
        const newRow = { id: generateId(), color: '', rollo: 0, kilo: 0, cantidad: 0 };
        updateCorte(selected, { consumoTelas: [...(selectedCorte.consumoTelas || []), newRow] });
    };

    const updateRow = (rowId, field, value) => {
        if (!selectedCorte) return;
        const rows = (selectedCorte.consumoTelas || []).map(r =>
            r.id === rowId ? { ...r, [field]: field === 'color' ? value : (Number(value) || 0) } : r
        );
        updateCorte(selected, { consumoTelas: rows });
    };

    const deleteRow = (rowId) => {
        if (!selectedCorte) return;
        updateCorte(selected, { consumoTelas: (selectedCorte.consumoTelas || []).filter(r => r.id !== rowId) });
    };

    const fileInputRef = useRef(null);

    const handleImportExcel = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);
        const imported = [];
        const TELA_KEYWORDS = ['MODAL', 'LANILLA', 'DARLON', 'KERRY', 'ALGOD', 'GAMUZ', 'FRIZADO', 'SWETER', 'BRUSH', 'MELLOW', 'SWEET', 'CORTE'];

        wb.SheetNames.forEach(sheetName => {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            const fason = sheetName.trim();
            let currentCorte = null;

            rows.forEach(row => {
                const first = String(row[0] || '').trim();
                if (!first) return;
                const upper = first.toUpperCase();
                if (upper === 'COLORES' || upper.startsWith('TOTAL')) return;

                const isTitle = TELA_KEYWORDS.some(k => upper.includes(k));
                if (isTitle) {
                    if (currentCorte && currentCorte.consumoTelas.length > 0) imported.push(currentCorte);
                    const tela = first.split(/\s+CORTE/i)[0].trim();
                    currentCorte = { id: generateId(), nombre: first, fason, fecha: '', tela, consumoTelas: [] };
                    return;
                }
                if (!currentCorte) return;
                const kilo = Number(row[1]) || 0;
                const cantidad = Math.round(Number(row[2]) || 0);
                const rollo = Math.round(Number(row[3]) || 0);
                if (!kilo && !cantidad && !rollo) return;
                currentCorte.consumoTelas.push({ id: generateId(), color: first.toUpperCase(), kilo: Math.round(kilo * 100) / 100, cantidad, rollo });
            });
            if (currentCorte && currentCorte.consumoTelas.length > 0) imported.push(currentCorte);
        });

        if (imported.length === 0) { alert('No se encontraron cortes en el Excel.'); return; }
        if (!window.confirm(`Se encontraron ${imported.length} cortes. ¿Reemplazar los cortes actuales con estos datos?`)) return;
        updateConfig({ cortes: imported });
        setSelected(imported[0]?.id || null);
        alert(`✅ ${imported.length} cortes importados correctamente.`);
        event.target.value = '';
    };

    // Totals for selected corte
    const totals = useMemo(() => {
        if (!selectedCorte) return { cantidad: 0, kilo: 0, rollo: 0, colorCounts: {} };
        const rows = selectedCorte.consumoTelas || [];
        const colorCounts = {};
        let cantidad = 0, kilo = 0, rollo = 0;
        rows.forEach(r => {
            cantidad += Number(r.cantidad) || 0;
            kilo += Number(r.kilo) || 0;
            rollo += Number(r.rollo) || 0;
            const c = (r.color || '').trim().toUpperCase();
            if (c) colorCounts[c] = (colorCounts[c] || 0) + (Number(r.cantidad) || 0);
        });
        return { cantidad, kilo: Math.round(kilo * 100) / 100, rollo, colorCounts };
    }, [selectedCorte]);

    return (
        <div style={{ display: 'flex', height: '100%', gap: 0 }}>
            {/* Sidebar — Lista de Cortes */}
            <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)' }}>
                <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Scissors size={20} /> Cortes
                    </h2>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <input className="form-input" placeholder="Nombre del corte..." value={newCorteData.nombre} onChange={e => setNewCorteData(p => ({ ...p, nombre: e.target.value }))} style={{ fontSize: 13 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <input className="form-input" placeholder="Fasón..." value={newCorteData.fason} onChange={e => setNewCorteData(p => ({ ...p, fason: e.target.value }))} style={{ fontSize: 12 }} />
                            <input className="form-input" placeholder="Tela..." value={newCorteData.tela} onChange={e => setNewCorteData(p => ({ ...p, tela: e.target.value }))} style={{ fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input type="date" className="form-input" value={newCorteData.fecha} onChange={e => setNewCorteData(p => ({ ...p, fecha: e.target.value }))} style={{ flex: 1, fontSize: 12 }} />
                            <button className="btn btn-primary btn-sm" onClick={addCorte} style={{ whiteSpace: 'nowrap' }}><Plus size={14} /> Agregar</button>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', marginTop: 4 }}>
                            <Upload size={14} /> Importar desde Excel
                        </button>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {cortes.length === 0 && (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No hay cortes. Agregá uno nuevo.</div>
                    )}
                    {cortes.map(corte => {
                        const rows = corte.consumoTelas || [];
                        const totalCant = rows.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
                        return (
                            <div
                                key={corte.id}
                                onClick={() => setSelected(corte.id)}
                                style={{
                                    padding: '12px 16px', cursor: 'pointer',
                                    borderBottom: '1px solid var(--border-color)',
                                    background: selected === corte.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                                    borderLeft: selected === corte.id ? '3px solid var(--accent)' : '3px solid transparent',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{corte.nombre}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {corte.tela && <span>{corte.tela} · </span>}
                                        {corte.fason && <span>{corte.fason} · </span>}
                                        {corte.fecha && <span>{corte.fecha} · </span>}
                                        <span>{rows.length} rollos · {totalCant} prendas</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); deleteCorte(corte.id); }} style={{ color: 'var(--danger)', padding: 4 }}>
                                        <Trash2 size={14} />
                                    </button>
                                    <ChevronRight size={16} style={{ opacity: 0.4 }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Main — Detalle del Corte Seleccionado */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {!selectedCorte ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
                        <div style={{ textAlign: 'center' }}>
                            <Scissors size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                            <p>Seleccioná un corte de la lista para ver su detalle</p>
                        </div>
                    </div>
                ) : (
                    <div>
                        {/* Header editable */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del Corte</label>
                                    <input className="form-input" value={selectedCorte.nombre || ''} onChange={e => updateCorte(selected, { nombre: e.target.value })} style={{ fontSize: 14, fontWeight: 700 }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fasón / Taller</label>
                                    <input className="form-input" value={selectedCorte.fason || ''} onChange={e => updateCorte(selected, { fason: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha</label>
                                    <input type="date" className="form-input" value={selectedCorte.fecha || ''} onChange={e => updateCorte(selected, { fecha: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tela</label>
                                    <input className="form-input" value={selectedCorte.tela || ''} onChange={e => updateCorte(selected, { tela: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* Tabla de consumo — COLOR | ROLLO | KILO | CANTIDAD */}
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: 14 }}>Consumo de Stock en Telas</h3>
                                <button className="btn btn-secondary btn-sm" onClick={addRow}><Plus size={14} /> Agregar Fila</button>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, width: '35%' }}>Color</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '15%' }}>Rollo</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '20%' }}>Kilo</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '20%' }}>Cantidad</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: '10%' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedCorte.consumoTelas || []).map((row, idx) => (
                                        <tr key={row.id || idx} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '6px 12px' }}>
                                                <input className="form-input" value={row.color || ''} onChange={e => updateRow(row.id, 'color', e.target.value)} style={{ width: '100%', fontSize: 13, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                <input type="number" className="form-input" value={row.rollo || ''} onChange={e => updateRow(row.id, 'rollo', e.target.value)} style={{ width: 70, textAlign: 'center', fontSize: 13, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                <input type="number" step="0.1" className="form-input" value={row.kilo || ''} onChange={e => updateRow(row.id, 'kilo', e.target.value)} style={{ width: 80, textAlign: 'center', fontSize: 13, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                <input type="number" className="form-input" value={row.cantidad || ''} onChange={e => updateRow(row.id, 'cantidad', e.target.value)} style={{ width: 80, textAlign: 'center', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px' }} />
                                            </td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                <button onClick={() => deleteRow(row.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Totals row */}
                            <div style={{ padding: '12px 16px', borderTop: '2px solid var(--border-color)', background: 'rgba(99,102,241,0.05)', display: 'grid', gridTemplateColumns: '35% 15% 20% 20% 10%', fontSize: 13 }}>
                                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>TOTAL</div>
                                <div style={{ textAlign: 'center', fontWeight: 700 }}>{totals.rollo}</div>
                                <div style={{ textAlign: 'center', fontWeight: 700 }}>{totals.kilo}</div>
                                <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--success)' }}>{totals.cantidad}</div>
                                <div></div>
                            </div>
                        </div>

                        {/* Resumen por color */}
                        {Object.keys(totals.colorCounts).length > 0 && (
                            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                                <h4 style={{ margin: '0 0 10px', fontSize: 13 }}>Resumen por Color</h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {Object.entries(totals.colorCounts).sort((a, b) => b[1] - a[1]).map(([color, count]) => (
                                        <div key={color} style={{ padding: '6px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', fontSize: 12 }}>
                                            <span style={{ fontWeight: 600 }}>{color}</span>
                                            <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 700 }}>{count}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                    Total: {totals.cantidad} prendas · {totals.rollo} rollos · {totals.kilo} kg
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
