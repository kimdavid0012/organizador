import React, { useMemo, useState } from 'react';
import { Landmark, PlusCircle } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

const METHODS = ['Banco', 'Mercado Pago'];

export default function BankPaymentsPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [cliente, setCliente] = useState('');
    const [metodo, setMetodo] = useState(METHODS[0]);
    const [monto, setMonto] = useState('');

    const entries = state.config.bankPayments || [];
    const cashToday = (state.config.posVentas || [])
        .filter((sale) => sale.fecha?.slice(0, 10) === fecha)
        .reduce((acc, sale) => acc + Number(sale.total || 0), 0);
    const dailyEntries = entries.filter((entry) => entry.fecha === fecha);

    const totalDigital = dailyEntries.reduce((acc, entry) => acc + Number(entry.monto || 0), 0);
    const totalCombined = totalDigital + cashToday;

    const addEntry = () => {
        if (!cliente.trim() || !monto) return;
        updateConfig({
            bankPayments: [
                {
                    id: `${Date.now()}`,
                    fecha,
                    cliente: cliente.trim(),
                    metodo,
                    monto: Number(monto),
                    createdBy: user.email
                },
                ...entries
            ]
        });
        setCliente('');
        setMonto('');
    };

    const canSeeTotals = user.role === 'admin';

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Landmark size={22} /> Banco y Mercado Pago
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Nadia puede controlar ingresos individuales. Los totales quedan visibles solo para admin.
                </p>
            </div>

            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-input" value={fecha} onChange={(event) => setFecha(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Cliente</label>
                        <input className="form-input" value={cliente} onChange={(event) => setCliente(event.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Metodo</label>
                        <select className="form-select" value={metodo} onChange={(event) => setMetodo(event.target.value)}>
                            {METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Monto</label>
                        <input type="number" className="form-input" value={monto} onChange={(event) => setMonto(event.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={addEntry}>
                        <PlusCircle size={16} /> Agregar ingreso
                    </button>
                </div>
            </div>

            {canSeeTotals && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Digital del dia</div>
                        <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>${totalDigital.toLocaleString('es-AR')}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Cash del dia</div>
                        <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>${cashToday.toLocaleString('es-AR')}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total combinado</div>
                        <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>${totalCombined.toLocaleString('es-AR')}</div>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h3 style={{ marginBottom: 12 }}>Movimientos del {fecha}</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                    {dailyEntries.map((entry) => (
                        <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                            <div>
                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{entry.cliente}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry.metodo}</div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entry.fecha}</div>
                            <div style={{ fontWeight: 'var(--fw-bold)' }}>${Number(entry.monto || 0).toLocaleString('es-AR')}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
