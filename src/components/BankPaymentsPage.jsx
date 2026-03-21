import React, { useMemo, useState } from 'react';
import { Download, Landmark, PlusCircle } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { JANUARY_2026_BANK_PAYMENTS_IMPORT } from '../data/bankPaymentsJanuary2026';

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
    const dailyEntries = entries
        .filter((entry) => entry.fecha === fecha)
        .sort((left, right) => Number(right.monto || 0) - Number(left.monto || 0));

    const totalDigital = dailyEntries.reduce((acc, entry) => acc + Number(entry.monto || 0), 0);
    const totalCombined = totalDigital + cashToday;
    const canSeeTotals = user.role === 'admin';
    const januaryImportAlreadyLoaded = entries.some((entry) => entry.batchId === JANUARY_2026_BANK_PAYMENTS_IMPORT.batchId);
    const januaryImportedEntries = entries.filter((entry) => entry.batchId === JANUARY_2026_BANK_PAYMENTS_IMPORT.batchId);

    const addEntry = () => {
        if (!monto || (metodo === 'Banco' && !cliente.trim())) return;
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

    const importJanuaryBatch = () => {
        if (januaryImportAlreadyLoaded) return;

        const existingKeys = new Set(
            entries.map((entry) => `${entry.fecha}|${entry.metodo}|${entry.cliente || ''}|${Number(entry.monto || 0)}`)
        );

        const freshEntries = JANUARY_2026_BANK_PAYMENTS_IMPORT.entries.filter((entry) => {
            const key = `${entry.fecha}|${entry.metodo}|${entry.cliente || ''}|${Number(entry.monto || 0)}`;
            return !existingKeys.has(key);
        });

        if (!freshEntries.length) return;

        updateConfig({
            bankPayments: [...freshEntries, ...entries]
        });
    };

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

            {canSeeTotals && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Importar lote Enero 2026</h3>
                            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                                Libro1.xlsx listo para cargar en Banco y Mercado Pago sin duplicar movimientos.
                            </p>
                        </div>
                        <button className="btn btn-secondary" onClick={importJanuaryBatch} disabled={januaryImportAlreadyLoaded}>
                            <Download size={16} /> {januaryImportAlreadyLoaded ? 'Enero 2026 cargado' : 'Importar Enero 2026'}
                        </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Banco enero</div>
                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 22 }}>${JANUARY_2026_BANK_PAYMENTS_IMPORT.totals.banco.toLocaleString('es-AR')}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mercado Pago enero</div>
                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 22 }}>${JANUARY_2026_BANK_PAYMENTS_IMPORT.totals.mercadoPago.toLocaleString('es-AR')}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total lote enero</div>
                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 22, color: 'var(--success)' }}>${JANUARY_2026_BANK_PAYMENTS_IMPORT.totals.combined.toLocaleString('es-AR')}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Movimientos importados</div>
                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 22 }}>{januaryImportedEntries.length || JANUARY_2026_BANK_PAYMENTS_IMPORT.totals.count}</div>
                        </div>
                    </div>
                </div>
            )}

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
                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{entry.cliente || 'Sin cliente'}</div>
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
