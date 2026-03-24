import React, { useMemo, useState, useRef } from 'react';
import { Download, Landmark, PlusCircle, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { JANUARY_2026_BANK_PAYMENTS_IMPORT } from '../data/bankPaymentsJanuary2026';
import { FEBRUARY_2026_BANK_PAYMENTS_IMPORT } from '../data/bankPaymentsFebruary2026';
import { MARCH_2026_BANK_PAYMENTS_IMPORT } from '../data/bankPaymentsMarch2026';

const METHODS = ['Banco', 'Mercado Pago'];
const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const IMPORT_BATCHES = [
    JANUARY_2026_BANK_PAYMENTS_IMPORT,
    FEBRUARY_2026_BANK_PAYMENTS_IMPORT,
    MARCH_2026_BANK_PAYMENTS_IMPORT
];

const getMonthKey = (value) => (value || '').slice(0, 7);
const getMonthLabel = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const monthIndex = Number(month) - 1;
    return `${MONTH_LABELS[monthIndex] || month} ${year}`;
};
const getDateLabel = (value) => {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
};

const excelDateToISO = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    if (typeof value === 'number') {
        const date = new Date(Math.round((value - 25569) * 86400 * 1000));
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) return value.slice(0, 10);
    return null;
};


const parseExcelFile = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

                const entries = [];
                let currentSection = null;

                rows.forEach((row) => {
                    const cell0 = row[0];
                    const cell0str = typeof cell0 === 'string' ? cell0.toUpperCase().trim() : '';

                    if (cell0str === 'BANCO') { currentSection = 'banco'; return; }
                    if (cell0str === 'MERCADO PAGO') { currentSection = 'mp'; return; }
                    if (cell0str === 'FECHA' || cell0str === 'TOTAL') return;
                    if (cell0str === 'TOTAL' || (typeof cell0 === 'string' && cell0.startsWith('Total'))) return;
                    if (!currentSection || !cell0) return;

                    const fecha = excelDateToISO(cell0);
                    if (!fecha) return;

                    const monto = Number(row[1] || 0);
                    if (!monto || typeof row[1] === 'string') return;

                    if (currentSection === 'banco') {
                        const cliente = (row[2] || '').toString().replace(/\xa0/g, '').trim();
                        entries.push({ fecha, monto, cliente, metodo: 'Banco' });
                    } else if (currentSection === 'mp') {
                        entries.push({ fecha, monto, cliente: '', metodo: 'Mercado Pago' });
                    }
                });

                if (!entries.length) { reject(new Error('No se encontraron movimientos en el archivo')); return; }

                const firstDate = entries.map(e => e.fecha).sort()[0];
                const [year, month] = firstDate.split('-');
                const monthLabel = `${MONTH_LABELS[Number(month) - 1]} ${year}`;
                const batchId = `xlsx-${year}-${month}-${Date.now()}`;

                const bancoTotal = entries.filter(e => e.metodo === 'Banco').reduce((a, e) => a + e.monto, 0);
                const mpTotal = entries.filter(e => e.metodo === 'Mercado Pago').reduce((a, e) => a + e.monto, 0);

                resolve({
                    batchId,
                    monthLabel,
                    sourceName: `${file.name} - ${monthLabel}`,
                    entries: entries.map((e, i) => ({ id: `${batchId}-${i + 1}`, batchId, importedAt: new Date().toISOString(), ...e })),
                    totals: { banco: bancoTotal, mercadoPago: mpTotal, combined: bancoTotal + mpTotal, count: entries.length }
                });
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Error leyendo el archivo'));
        reader.readAsArrayBuffer(file);
    });
};


export default function BankPaymentsPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    const [cliente, setCliente] = useState('');
    const [metodo, setMetodo] = useState(METHODS[0]);
    const [monto, setMonto] = useState('');
    const [xlsxStatus, setXlsxStatus] = useState(null);
    const fileInputRef = useRef(null);

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

    const importStatuses = useMemo(() => {
        return IMPORT_BATCHES.map((batch) => ({
            ...batch,
            alreadyLoaded: entries.some((entry) => entry.batchId === batch.batchId),
            importedCount: entries.filter((entry) => entry.batchId === batch.batchId).length
        }));
    }, [entries]);

    const xlsxBatchStatuses = useMemo(() => {
        const batchIds = new Set(
            entries.filter(e => e.batchId?.startsWith('xlsx-')).map(e => e.batchId)
        );
        return Array.from(batchIds).map(batchId => {
            const batchEntries = entries.filter(e => e.batchId === batchId);
            const first = batchEntries[0] || {};
            const banco = batchEntries.filter(e => e.metodo === 'Banco').reduce((a, e) => a + Number(e.monto || 0), 0);
            const mp = batchEntries.filter(e => e.metodo === 'Mercado Pago').reduce((a, e) => a + Number(e.monto || 0), 0);
            const firstDate = batchEntries.map(e => e.fecha).sort()[0] || '';
            const [y, m] = firstDate.split('-');
            return {
                batchId,
                monthLabel: y && m ? `${MONTH_LABELS[Number(m) - 1]} ${y}` : batchId,
                sourceName: first.sourceName || batchId,
                alreadyLoaded: true,
                importedCount: batchEntries.length,
                totals: { banco, mercadoPago: mp, combined: banco + mp, count: batchEntries.length }
            };
        });
    }, [entries]);


    const allBatchStatuses = useMemo(() => {
        const hardcoded = importStatuses;
        const fromXlsx = xlsxBatchStatuses.filter(xb => !hardcoded.some(h => h.batchId === xb.batchId));
        return [...hardcoded, ...fromXlsx];
    }, [importStatuses, xlsxBatchStatuses]);

    const monthlyGroups = useMemo(() => {
        const grouped = new Map();
        entries.forEach((entry) => {
            const monthKey = getMonthKey(entry.fecha);
            if (!monthKey) return;
            if (!grouped.has(monthKey)) grouped.set(monthKey, { monthKey, entries: [], byDay: new Map() });
            const monthGroup = grouped.get(monthKey);
            monthGroup.entries.push(entry);
            if (!monthGroup.byDay.has(entry.fecha)) monthGroup.byDay.set(entry.fecha, []);
            monthGroup.byDay.get(entry.fecha).push(entry);
        });
        return Array.from(grouped.values())
            .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
            .map((mg) => {
                const dayGroups = Array.from(mg.byDay.entries())
                    .sort((a, b) => b[0].localeCompare(a[0]))
                    .map(([dayKey, dayEntries]) => {
                        const sorted = [...dayEntries].sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0));
                        return {
                            dayKey, entries: sorted,
                            total: sorted.reduce((a, e) => a + Number(e.monto || 0), 0),
                            bancoTotal: sorted.filter(e => e.metodo === 'Banco').reduce((a, e) => a + Number(e.monto || 0), 0),
                            mercadoPagoTotal: sorted.filter(e => e.metodo === 'Mercado Pago').reduce((a, e) => a + Number(e.monto || 0), 0)
                        };
                    });
                return {
                    monthKey: mg.monthKey, label: getMonthLabel(mg.monthKey),
                    entryCount: mg.entries.length,
                    total: mg.entries.reduce((a, e) => a + Number(e.monto || 0), 0),
                    dayGroups
                };
            });
    }, [entries]);

    const addEntry = () => {
        if (!monto || (metodo === 'Banco' && !cliente.trim())) return;
        updateConfig({
            bankPayments: [{ id: `${Date.now()}`, fecha, cliente: cliente.trim(), metodo, monto: Number(monto), createdBy: user.email }, ...entries]
        });
        setCliente(''); setMonto('');
    };

    const importBatch = (batch) => {
        if (!batch || entries.some((e) => e.batchId === batch.batchId)) return;
        const existingKeys = new Set(entries.map(e => `${e.fecha}|${e.metodo}|${e.cliente || ''}|${Number(e.monto || 0)}`));
        const fresh = batch.entries.filter(e => !existingKeys.has(`${e.fecha}|${e.metodo}|${e.cliente || ''}|${Number(e.monto || 0)}`));
        if (!fresh.length) return;
        updateConfig({ bankPayments: [...fresh, ...entries] });
    };

    const handleXlsxUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setXlsxStatus({ loading: true, message: 'Procesando archivo...' });
        try {
            const batch = await parseExcelFile(file);
            const existingKeys = new Set(entries.map(e => `${e.fecha}|${e.metodo}|${e.cliente || ''}|${Number(e.monto || 0)}`));
            const fresh = batch.entries.filter(e => !existingKeys.has(`${e.fecha}|${e.metodo}|${e.cliente || ''}|${Number(e.monto || 0)}`));
            if (!fresh.length) { setXlsxStatus({ error: true, message: 'Todos los movimientos ya estaban cargados.' }); return; }
            updateConfig({ bankPayments: [...fresh, ...entries] });
            setXlsxStatus({ success: true, message: `✅ ${fresh.length} movimientos importados de ${batch.monthLabel} (Banco $${batch.totals.banco.toLocaleString('es-AR')} + MP $${batch.totals.mercadoPago.toLocaleString('es-AR')})` });
        } catch (err) {
            setXlsxStatus({ error: true, message: `Error: ${err.message}` });
        }
        e.target.value = '';
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Importar lotes mensuales</h3>
                            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                                Cada archivo se carga por separado, sin duplicar movimientos ya guardados.
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Upload size={16} /> Subir Excel (.xlsx)
                            </button>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleXlsxUpload} />
                            {xlsxStatus && (
                                <div style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, background: xlsxStatus.error ? 'rgba(239,68,68,0.15)' : xlsxStatus.loading ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.15)', color: xlsxStatus.error ? 'var(--error, #ef4444)' : xlsxStatus.loading ? 'var(--text-secondary)' : 'var(--success)', maxWidth: 360 }}>
                                    {xlsxStatus.message}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                        {allBatchStatuses.map((batch) => (
                            <div key={batch.batchId} style={{ padding: 14, borderRadius: 16, background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                                    <div>
                                        <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 18 }}>{batch.monthLabel || batch.sourceName?.replace(/^.*? - /, '')}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{batch.totals.count} movimientos</div>
                                    </div>
                                    <button className="btn btn-secondary" onClick={() => importBatch(batch)} disabled={batch.alreadyLoaded}>
                                        <Download size={16} /> {batch.alreadyLoaded ? 'Cargado' : 'Importar'}
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Banco</div>
                                        <div style={{ fontWeight: 'var(--fw-bold)' }}>${batch.totals.banco.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mercado Pago</div>
                                        <div style={{ fontWeight: 'var(--fw-bold)' }}>${batch.totals.mercadoPago.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total lote</div>
                                        <div style={{ fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>${batch.totals.combined.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Importados</div>
                                        <div style={{ fontWeight: 'var(--fw-bold)' }}>{batch.importedCount || batch.totals.count}</div>
                                    </div>
                                </div>
            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-input" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Cliente</label>
                        <input className="form-input" value={cliente} onChange={(e) => setCliente(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Metodo</label>
                        <select className="form-select" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                            {METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Monto</label>
                        <input type="number" className="form-input" value={monto} onChange={(e) => setMonto(e.target.value)} />
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

            <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 12 }}>
                <div>
                    <h3 style={{ margin: 0 }}>Historial por mes y por dia</h3>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                        Banco muestra cliente y Mercado Pago queda listado sin cliente cuando no corresponde.
                    </p>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                    {monthlyGroups.map((mg, mi) => (
                        <details key={mg.monthKey} open={mi === 0} style={{ borderRadius: 16, background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                            <summary style={{ listStyle: 'none', cursor: 'pointer', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 18 }}>{mg.label}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mg.entryCount} movimientos</div>
                                </div>
                                {canSeeTotals && <div style={{ fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>${mg.total.toLocaleString('es-AR')}</div>}
                            </summary>
                            <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
                                {mg.dayGroups.map((dg) => (
                                    <details key={dg.dayKey} open={dg.dayKey === fecha} style={{ borderRadius: 14, background: 'rgba(10,12,24,0.55)', overflow: 'hidden' }}>
                                        <summary style={{ listStyle: 'none', cursor: 'pointer', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{getDateLabel(dg.dayKey)}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dg.entries.length} movimientos</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {canSeeTotals && (<>
                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Banco ${dg.bancoTotal.toLocaleString('es-AR')}</span>
                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>MP ${dg.mercadoPagoTotal.toLocaleString('es-AR')}</span>
                                                </>)}
                                                <span style={{ fontWeight: 'var(--fw-bold)' }}>${dg.total.toLocaleString('es-AR')}</span>
                                            </div>
                                        </summary>
                                        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
                                            {dg.entries.map((entry) => (
                                                <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) auto auto', gap: 12, padding: 12, borderRadius: 12, background: entry.metodo === 'Banco' ? 'rgba(59,130,246,0.09)' : 'rgba(16,185,129,0.09)', alignItems: 'center' }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 'var(--fw-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {entry.metodo === 'Banco' ? (entry.cliente || 'Sin cliente') : 'Mercado Pago'}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry.metodo === 'Banco' ? 'Banco' : 'Sin cliente'}</div>
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entry.metodo}</div>
                                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>${Number(entry.monto || 0).toLocaleString('es-AR')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        </div>
    );
}
