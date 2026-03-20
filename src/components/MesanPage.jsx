import React, { useMemo, useState } from 'react';
import { BarChart3, Plus, Wallet } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

const CATEGORIES = ['Alquiler', 'Servicios', 'Proveedor', 'Logistica', 'Comida', 'Publicidad', 'Varios'];

export default function MesanPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [concepto, setConcepto] = useState('');
    const [categoria, setCategoria] = useState(CATEGORIES[0]);
    const [monto, setMonto] = useState('');

    if (user.role !== 'admin') {
        return <div style={{ padding: 'var(--sp-4)' }}>Solo visible para administrador.</div>;
    }

    const movimientos = state.config.mesanMovimientos || [];
    const ventasDiarias = state.config.mesanVentasDiarias || [];
    const gastosPosDia = (state.config.posGastos || [])
        .filter((item) => (item.fecha || '').slice(0, 10) === fecha)
        .map((item) => ({
            id: `pos-${item.id}`,
            fecha,
            concepto: item.concepto,
            categoria: item.tipo,
            monto: Number(item.monto || 0),
            syncedFromPos: true
        }));

    const legacyVentaDia = movimientos.find((item) => item.fecha === fecha && Number(item.ventasDia || 0) > 0)?.ventasDia || 0;
    const ventaDelDia = ventasDiarias.find((item) => item.fecha === fecha)?.monto || legacyVentaDia || 0;
    const movimientosDia = [...gastosPosDia, ...movimientos.filter((item) => item.fecha === fecha)];

    const weeklySummary = useMemo(() => {
        const byCategory = {};
        [...movimientos, ...gastosPosDia].forEach((item) => {
            byCategory[item.categoria] = (byCategory[item.categoria] || 0) + Number(item.monto || 0);
        });
        return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    }, [movimientos, gastosPosDia]);

    const addMovement = () => {
        if (!concepto.trim() || !monto) return;
        updateConfig({
            mesanMovimientos: [
                {
                    id: `${Date.now()}`,
                    fecha,
                    concepto: concepto.trim(),
                    categoria,
                    monto: Number(monto)
                },
                ...movimientos
            ]
        });
        setConcepto('');
        setMonto('');
    };

    const updateVentaDia = (value) => {
        const nextEntries = ventasDiarias.filter((item) => item.fecha !== fecha);
        updateConfig({
            mesanVentasDiarias: [
                ...nextEntries,
                {
                    fecha,
                    monto: Number(value || 0)
                }
            ]
        });
    };

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <BarChart3 size={22} /> Mesan
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Gastos diarios del local y control simple de ventas del dia.
                </p>
            </div>

            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(220px, 1fr)', gap: 12, alignItems: 'end', marginBottom: 16 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-input" value={fecha} onChange={(event) => setFecha(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Venta total del dia</label>
                        <input type="number" className="form-input" value={ventaDelDia} onChange={(event) => updateVentaDia(event.target.value)} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Categoria</label>
                        <select className="form-select" value={categoria} onChange={(event) => setCategoria(event.target.value)}>
                            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Concepto</label>
                        <input className="form-input" value={concepto} onChange={(event) => setConcepto(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Gasto</label>
                        <input type="number" className="form-input" value={monto} onChange={(event) => setMonto(event.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={addMovement}><Plus size={16} /> Agregar</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ marginBottom: 12 }}>Movimientos del {fecha}</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {movimientosDia.map((item) => (
                            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div>
                                    <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.concepto}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.categoria}{item.syncedFromPos ? ' · POS' : ''}</div>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Venta dia: ${Number(ventaDelDia || 0).toLocaleString('es-AR')}</div>
                                <div style={{ color: '#fca5a5', fontWeight: 'var(--fw-bold)' }}>-${Number(item.monto || 0).toLocaleString('es-AR')}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Wallet size={18} /> Resumen por categoria
                    </h3>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {weeklySummary.map(([name, total]) => (
                            <div key={name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                    <span>{name}</span>
                                    <strong>${Number(total).toLocaleString('es-AR')}</strong>
                                </div>
                                <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }}>
                                    <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, Number(total) / 2000)}%`, background: 'linear-gradient(90deg, var(--accent), #34d399)' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
