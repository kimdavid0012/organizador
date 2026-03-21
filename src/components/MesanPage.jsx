import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Plus, Upload, Wallet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { MESAN_2026_GASTO_IMPORT } from '../data/mesanWorkbook2026';

const CATEGORIES = ['Alquiler', 'Servicios', 'Proveedor', 'Logistica', 'Comida', 'Publicidad', 'Varios'];
const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CHANNEL_LABELS = {
    EFECTIVO: 'Efectivo',
    MERCADO_PAGO: 'Mercado Pago',
    BANCO: 'Banco',
    USD: 'USD',
    AI: 'AI'
};

const normalizeText = (value) => (value || '').toString().replace(/\u00a0/g, ' ').trim();
const padDateValue = (value) => value.toString().padStart(2, '0');
const toDateInputValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${padDateValue(date.getMonth() + 1)}-${padDateValue(date.getDate())}`;
};
const getMonthKey = (value) => (value || '').slice(0, 7);
const getMonthLabel = (monthKey) => {
    const [year, month] = monthKey.split('-');
    return `${MONTH_LABELS[(Number(month) || 1) - 1] || month} ${year}`;
};
const getDateLabel = (value) => {
    const [year, month, day] = (value || '').split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
};
const parseExcelNumber = (value) => {
    if (typeof value === 'number') return value;
    if (value === null || value === undefined || value === '') return 0;
    const normalized = value.toString().trim().replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
};
const formatExcelDate = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateInputValue(value);
    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) return `${parsed.y}-${padDateValue(parsed.m)}-${padDateValue(parsed.d)}`;
    }
    const normalized = normalizeText(value);
    const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (slashMatch) {
        const [, day, month, year] = slashMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${padDateValue(month)}-${padDateValue(day)}`;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : toDateInputValue(date);
};
const inferLegacySign = (item) => {
    if (item?.tipo === 'ingreso' || item?.tipo === 'saldo') return 1;
    if (item?.tipo === 'gasto') return -1;
    return -1;
};
const toSignedAmount = (item) => {
    const value = Number(item?.monto || 0);
    if (item?.tipo) return value;
    return Math.abs(value) * inferLegacySign(item);
};
const getMovementType = (signedAmount, concepto, categoria) => {
    const normalizedConcept = normalizeText(concepto).toUpperCase();
    const normalizedCategory = normalizeText(categoria).toUpperCase();
    if (normalizedConcept === 'SALDO ANTERIOR' || normalizedCategory === 'SALDO ANTERIOR') return 'saldo';
    return signedAmount >= 0 ? 'ingreso' : 'gasto';
};
const SHEET_MONTHS = { enero: '01', febrero: '02', marzo: '03' };
const isEmbeddedMesanItem = (item) =>
    normalizeText(item?.importedBatchId) === MESAN_2026_GASTO_IMPORT.batchId ||
    normalizeText(item?.batchId) === MESAN_2026_GASTO_IMPORT.batchId;
const shouldReplaceLegacyMesanEntry = (item) => {
    const source = normalizeText(item?.source).toUpperCase();
    const importedSheet = normalizeText(item?.importedSheet).toLowerCase();
    const fecha = normalizeText(item?.fecha);
    if (normalizeText(item?.importedBatchId) === MESAN_2026_GASTO_IMPORT.batchId) return true;
    if (source === 'GASTO 26.XLSX') return true;
    if (['enero', 'febrero', 'marzo'].includes(importedSheet)) {
        const expectedMonth = SHEET_MONTHS[importedSheet];
        return !fecha || fecha.slice(5, 7) !== expectedMonth;
    }
    return false;
};

export default function MesanPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [fecha, setFecha] = useState(() => toDateInputValue(new Date()));
    const [concepto, setConcepto] = useState('');
    const [categoria, setCategoria] = useState(CATEGORIES[0]);
    const [monto, setMonto] = useState('');
    const fileInputRef = useRef(null);

    if (user.role !== 'admin') {
        return <div style={{ padding: 'var(--sp-4)' }}>Solo visible para administrador.</div>;
    }

    const movimientos = state.config.mesanMovimientos || [];
    const ventasDiarias = state.config.mesanVentasDiarias || [];
    const embeddedImports = state.config.mesanEmbeddedImports || [];
    const gastosPosDia = (state.config.posGastos || [])
        .filter((item) => (item.fecha || '').slice(0, 10) === fecha)
        .map((item) => ({
            id: `pos-${item.id}`,
            fecha,
            concepto: item.concepto,
            categoria: item.tipo,
            monto: -Math.abs(Number(item.monto || 0)),
            syncedFromPos: true,
            canal: 'POS',
            moneda: 'ARS',
            tipo: 'gasto'
        }));

    const ventaActual = ventasDiarias.find((item) => item.fecha === fecha) || {};
    const legacyVentaDia = movimientos.find((item) => item.fecha === fecha && Number(item.ventasDia || 0) > 0)?.ventasDia || 0;
    const ventaDelDia = Number(ventaActual.monto || ventaActual.efectivo || legacyVentaDia || 0);
    const movimientosDia = [...gastosPosDia, ...movimientos.filter((item) => item.fecha === fecha)];

    const monthKey = getMonthKey(fecha);
    const monthMovements = movimientos.filter((item) => getMonthKey(item.fecha) === monthKey);
    const saldoAcumuladoARS = useMemo(() => {
        const closingPoint = [...(MESAN_2026_GASTO_IMPORT.closingBalances || [])]
            .filter((item) => item.fecha <= fecha)
            .sort((left, right) => right.fecha.localeCompare(left.fecha))[0];

        if (closingPoint) {
            const postClosingVentas = ventasDiarias
                .filter((item) => item.fecha > closingPoint.fecha && item.fecha <= fecha)
                .reduce((acc, item) => acc + Number(item.monto || item.efectivo || 0), 0);

            const postClosingMovements = movimientos
                .filter((item) => item.fecha > closingPoint.fecha && item.fecha <= fecha && (item.moneda || 'ARS') === 'ARS')
                .filter((item) => item.tipo !== 'saldo')
                .reduce((acc, item) => acc + toSignedAmount(item), 0);

            return Number(closingPoint.efectivo || 0) + postClosingVentas + postClosingMovements;
        }

        const ventasPorFecha = new Map(
            ventasDiarias.map((item) => [
                item.fecha,
                Number(item.monto || item.efectivo || 0)
            ])
        );

        const fechas = new Set([
            ...movimientos
                .filter((item) => (item.moneda || 'ARS') === 'ARS' && item.fecha)
                .map((item) => item.fecha),
            ...ventasDiarias
                .filter((item) => item.fecha)
                .map((item) => item.fecha)
        ]);

        return Array.from(fechas)
            .filter((item) => item <= fecha)
            .sort((left, right) => left.localeCompare(right))
            .reduce((acc, currentFecha) => {
                const venta = ventasPorFecha.get(currentFecha) || 0;
                const netoMovimientos = movimientos
                    .filter((item) => item.fecha === currentFecha && (item.moneda || 'ARS') === 'ARS')
                    .reduce((total, item) => total + toSignedAmount(item), 0);
                return acc + venta + netoMovimientos;
            }, 0);
    }, [fecha, movimientos, ventasDiarias]);

    const gastoTotalAcumuladoARS = useMemo(() => (
        movimientos
            .filter((item) => item.fecha <= fecha && (item.moneda || 'ARS') === 'ARS')
            .reduce((acc, item) => {
                const signedAmount = toSignedAmount(item);
                return signedAmount < 0 ? acc + Math.abs(signedAmount) : acc;
            }, 0)
    ), [fecha, movimientos]);

    const categorySummary = useMemo(() => {
        const byCategory = {};
        monthMovements.forEach((item) => {
            if ((item.moneda || 'ARS') !== 'ARS') return;
            const signedAmount = toSignedAmount(item);
            if (signedAmount >= 0) return;
            const key = normalizeText(item.categoria) || 'Sin categoria';
            byCategory[key] = (byCategory[key] || 0) + Math.abs(signedAmount);
        });
        return Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    }, [monthMovements]);

    const monthlyGroups = useMemo(() => {
        const grouped = new Map();

        movimientos.forEach((item) => {
            const movementMonthKey = getMonthKey(item.fecha);
            if (!movementMonthKey) return;

            if (!grouped.has(movementMonthKey)) {
                grouped.set(movementMonthKey, { monthKey: movementMonthKey, byDay: new Map() });
            }

            const monthGroup = grouped.get(movementMonthKey);
            if (!monthGroup.byDay.has(item.fecha)) {
                monthGroup.byDay.set(item.fecha, { fecha: item.fecha, movements: [], venta: ventasDiarias.find((entry) => entry.fecha === item.fecha) || null });
            }
            monthGroup.byDay.get(item.fecha).movements.push(item);
        });

        ventasDiarias.forEach((entry) => {
            const entryMonthKey = getMonthKey(entry.fecha);
            if (!entryMonthKey) return;

            if (!grouped.has(entryMonthKey)) {
                grouped.set(entryMonthKey, { monthKey: entryMonthKey, byDay: new Map() });
            }

            const monthGroup = grouped.get(entryMonthKey);
            if (!monthGroup.byDay.has(entry.fecha)) {
                monthGroup.byDay.set(entry.fecha, { fecha: entry.fecha, movements: [], venta: entry });
            } else {
                monthGroup.byDay.get(entry.fecha).venta = entry;
            }
        });

        return Array.from(grouped.values())
            .sort((left, right) => right.monthKey.localeCompare(left.monthKey))
            .map((monthGroup) => {
                const days = Array.from(monthGroup.byDay.values())
                    .sort((left, right) => right.fecha.localeCompare(left.fecha))
                    .map((dayGroup) => {
                        const arsExpenses = dayGroup.movements
                            .filter((item) => (item.moneda || 'ARS') === 'ARS' && toSignedAmount(item) < 0)
                            .reduce((acc, item) => acc + Math.abs(toSignedAmount(item)), 0);
                        const arsIncome = dayGroup.movements
                            .filter((item) => (item.moneda || 'ARS') === 'ARS' && toSignedAmount(item) > 0)
                            .reduce((acc, item) => acc + toSignedAmount(item), 0);
                        const usdNet = dayGroup.movements
                            .filter((item) => (item.moneda || 'ARS') === 'USD')
                            .reduce((acc, item) => acc + toSignedAmount(item), 0);

                        return {
                            ...dayGroup,
                            arsExpenses,
                            arsIncome,
                            usdNet
                        };
                    });

                return {
                    monthKey: monthGroup.monthKey,
                    label: getMonthLabel(monthGroup.monthKey),
                    days
                };
            });
    }, [movimientos, ventasDiarias]);

    const applyMesanImportBatch = (batch, options = {}) => {
        const {
            replaceExisting = false,
            replacePredicate = shouldReplaceLegacyMesanEntry
        } = options;

        const currentMovimientos = replaceExisting
            ? movimientos.filter((item) => !replacePredicate(item))
            : movimientos;
        const currentVentas = replaceExisting
            ? ventasDiarias.filter((item) => !replacePredicate(item))
            : ventasDiarias;

        const ventasMap = new Map(currentVentas.map((item) => [item.fecha, { ...item }]));
        batch.sales.forEach((sale) => {
            ventasMap.set(sale.fecha, {
                ...ventasMap.get(sale.fecha),
                ...sale
            });
        });

        const existingMovementKeys = new Set(
            currentMovimientos.map((item) => [
                item.fecha,
                normalizeText(item.concepto),
                normalizeText(item.categoria),
                item.canal || 'EFECTIVO',
                item.moneda || 'ARS',
                Number(item.monto || 0),
                item.tipo || 'legacy'
            ].join('|'))
        );

        const freshMovements = batch.movements.filter((item) => {
            const key = [
                item.fecha,
                normalizeText(item.concepto),
                normalizeText(item.categoria),
                item.canal || 'EFECTIVO',
                item.moneda || 'ARS',
                Number(item.monto || 0),
                item.tipo || 'legacy'
            ].join('|');
            return !existingMovementKeys.has(key);
        });

        updateConfig({
            mesanMovimientos: [...freshMovements, ...currentMovimientos],
            mesanVentasDiarias: Array.from(ventasMap.values()).sort((left, right) => right.fecha.localeCompare(left.fecha)),
            mesanEmbeddedImports: Array.from(new Set([...(embeddedImports || []), batch.batchId]))
        });
    };

    useEffect(() => {
        const hasEmbeddedBatch = movimientos.some(isEmbeddedMesanItem) || ventasDiarias.some(isEmbeddedMesanItem);
        const hasBrokenEmbeddedDates = [...movimientos, ...ventasDiarias].some((item) => {
            const importedSheet = normalizeText(item?.importedSheet).toLowerCase();
            if (!['enero', 'febrero', 'marzo'].includes(importedSheet)) return false;
            return normalizeText(item?.fecha).slice(5, 7) !== SHEET_MONTHS[importedSheet];
        });

        if (embeddedImports.includes(MESAN_2026_GASTO_IMPORT.batchId) && hasEmbeddedBatch && !hasBrokenEmbeddedDates) return;
        applyMesanImportBatch(MESAN_2026_GASTO_IMPORT, { replaceExisting: true });
    }, [embeddedImports, movimientos, ventasDiarias]);

    const addMovement = () => {
        if (!concepto.trim() || !monto) return;
        updateConfig({
            mesanMovimientos: [
                {
                    id: `${Date.now()}`,
                    fecha,
                    concepto: concepto.trim(),
                    categoria,
                    monto: Math.abs(Number(monto)),
                    canal: 'EFECTIVO',
                    moneda: 'ARS',
                    tipo: 'gasto'
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
                    ...ventaActual,
                    fecha,
                    monto: Number(value || 0),
                    efectivo: Number(value || 0)
                }
            ]
        });
    };

    const importMesanWorkbook = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            const importedMovements = [];
            const ventasMap = new Map(ventasDiarias.map((item) => [item.fecha, { ...item }]));

            workbook.SheetNames.forEach((sheetName) => {
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                rows.slice(1).forEach((row, index) => {
                    const [rawFecha, rawConcepto, rawCategoria, rawEfectivo, rawMercadoPago, rawBanco, rawUsd, rawAi] = row;
                    const parsedDate = formatExcelDate(rawFecha);
                    if (!parsedDate) return;

                    const conceptoValue = normalizeText(rawConcepto);
                    const categoriaValue = normalizeText(rawCategoria);
                    const columns = [
                        { canal: 'EFECTIVO', moneda: 'ARS', amount: parseExcelNumber(rawEfectivo) },
                        { canal: 'MERCADO_PAGO', moneda: 'ARS', amount: parseExcelNumber(rawMercadoPago) },
                        { canal: 'BANCO', moneda: 'ARS', amount: parseExcelNumber(rawBanco) },
                        { canal: 'USD', moneda: 'USD', amount: parseExcelNumber(rawUsd) },
                        { canal: 'AI', moneda: 'ARS', amount: parseExcelNumber(rawAi) }
                    ].filter((item) => item.amount !== 0);

                    columns.forEach((column, columnIndex) => {
                        const signedAmount = Number(column.amount);
                        const normalizedCategory = categoriaValue.toUpperCase();
                        const normalizedConcept = conceptoValue.toUpperCase();
                        const isMesanSale = column.canal === 'EFECTIVO' && normalizedCategory === 'MESAN' && normalizedConcept === 'MESAN' && signedAmount > 0;

                        if (isMesanSale) {
                            const previous = ventasMap.get(parsedDate) || { fecha: parsedDate, monto: 0, efectivo: 0, mercadoPago: 0, banco: 0, usd: 0 };
                            ventasMap.set(parsedDate, {
                                ...previous,
                                fecha: parsedDate,
                                monto: signedAmount,
                                efectivo: signedAmount,
                                importedSheet: sheetName
                            });
                            return;
                        }

                        importedMovements.push({
                            id: `mesan-import-${sheetName}-${index + 1}-${columnIndex + 1}`,
                            fecha: parsedDate,
                            concepto: conceptoValue || 'Sin concepto',
                            categoria: categoriaValue || 'Sin categoria',
                            monto: signedAmount,
                            canal: column.canal,
                            moneda: column.moneda,
                            tipo: getMovementType(signedAmount, conceptoValue, categoriaValue),
                            importedBatchId: `mesan-${file.name.toLowerCase().replace(/\s+/g, '-')}-${sheetName.toLowerCase()}`,
                            importedSheet: sheetName,
                            source: file.name
                        });
                    });
                });
            });

            const batchId = `mesan-${file.name.toLowerCase().replace(/\s+/g, '-')}`;
            applyMesanImportBatch({
                batchId,
                workbookName: file.name,
                movements: importedMovements.map((item) => ({ ...item, importedBatchId: `${batchId}-${item.importedSheet}` })),
                sales: Array.from(ventasMap.values()).map((sale) => ({ ...sale, source: file.name, batchId }))
            });

            alert(`Se importaron ${importedMovements.length} movimientos y ${ventasMap.size} dias de venta desde ${file.name}.`);
        } catch (error) {
            console.error('Error importando Excel de Mesan:', error);
            alert(`No pude importar ese Excel: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    };

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <BarChart3 size={22} /> Mesan
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Gastos diarios del local, ventas por fecha e importacion por mes desde Excel sin perder los datos ya guardados.
                </p>
            </div>

            <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Importar Excel mensual</h3>
                        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                            Cada hoja se toma como un mes. El archivo base de Mesan 2026 ya queda guardado adentro de la app y tambien podés sumar otros Excel sin borrar memoria anterior.
                        </p>
                    </div>
                    <div>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importMesanWorkbook} />
                        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                            <Upload size={16} /> Importar Excel de Mesan
                        </button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(220px, 1fr)', gap: 12, alignItems: 'end' }}>
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
                    {movimientosDia.length === 0 ? (
                        <div
                            style={{
                                minHeight: 260,
                                borderRadius: 18,
                                background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(16,185,129,0.05))',
                                border: '1px solid rgba(255,255,255,0.06)',
                                display: 'grid',
                                placeItems: 'center',
                                padding: 24
                            }}
                        >
                            <div style={{ textAlign: 'center', maxWidth: 460 }}>
                                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Saldo total en pesos arrastrado desde enero</div>
                                <div style={{ fontSize: '2.3rem', fontWeight: 'var(--fw-bold)', color: saldoAcumuladoARS < 0 ? '#fca5a5' : 'var(--success)' }}>
                                    {saldoAcumuladoARS < 0 ? '-' : ''}${Math.abs(saldoAcumuladoARS).toLocaleString('es-AR')}
                                </div>
                                <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>Gasto total acumulado</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: 'var(--fw-bold)', color: '#fca5a5' }}>
                                    ${gastoTotalAcumuladoARS.toLocaleString('es-AR')}
                                </div>
                                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                                    Incluye venta diaria, ingresos y gastos en ARS hasta el {getDateLabel(fecha)}. No se reinicia cada mes.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {movimientosDia.map((item) => {
                                const signedAmount = toSignedAmount(item);
                                const isNegative = signedAmount < 0;
                                const displayAmount = Math.abs(signedAmount);
                                return (
                                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr auto auto', gap: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                        <div>
                                            <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.concepto}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {item.categoria || 'Sin categoria'}
                                                {` · ${CHANNEL_LABELS[item.canal] || item.canal || 'Efectivo'}`}
                                                {item.moneda === 'USD' ? ' · USD' : ''}
                                                {item.syncedFromPos ? ' · POS' : ''}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Venta dia: ${Number(ventaDelDia || 0).toLocaleString('es-AR')}
                                        </div>
                                        <div style={{ color: isNegative ? '#fca5a5' : 'var(--success)', fontWeight: 'var(--fw-bold)' }}>
                                            {isNegative ? '-' : '+'}{item.moneda === 'USD' ? 'US$' : '$'}{displayAmount.toLocaleString('es-AR')}
                                        </div>
                                    </div>
                                );
                            })}
                            <div
                                style={{
                                    marginTop: 8,
                                    padding: 14,
                                    borderRadius: 14,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap'
                                }}
                            >
                                <span style={{ color: 'var(--text-secondary)' }}>Saldo total en pesos arrastrado desde enero</span>
                                <strong style={{ color: saldoAcumuladoARS < 0 ? '#fca5a5' : 'var(--success)', fontSize: '1.05rem' }}>
                                    {saldoAcumuladoARS < 0 ? '-' : ''}${Math.abs(saldoAcumuladoARS).toLocaleString('es-AR')}
                                </strong>
                            </div>
                            <div
                                style={{
                                    padding: 14,
                                    borderRadius: 14,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    flexWrap: 'wrap'
                                }}
                            >
                                <span style={{ color: 'var(--text-secondary)' }}>Gasto total acumulado</span>
                                <strong style={{ color: '#fca5a5', fontSize: '1.05rem' }}>
                                    ${gastoTotalAcumuladoARS.toLocaleString('es-AR')}
                                </strong>
                            </div>
                        </div>
                    )}
                </div>

                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Wallet size={18} /> Resumen por categoria
                    </h3>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {categorySummary.map(([name, total]) => (
                            <div key={name}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                    <span>{name}</span>
                                    <strong>${Number(total).toLocaleString('es-AR')}</strong>
                                </div>
                                <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }}>
                                    <div style={{ height: '100%', borderRadius: 999, width: `${Math.min(100, Number(total) / 50000)}%`, background: 'linear-gradient(90deg, var(--accent), #34d399)' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 12 }}>
                <div>
                    <h3 style={{ margin: 0 }}>Historial por mes y por dia</h3>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                        Cada dia muestra venta cargada, gastos, ingresos, USD y movimientos extra del Excel.
                    </p>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                    {monthlyGroups.map((monthGroup, monthIndex) => (
                        <details key={monthGroup.monthKey} open={monthIndex === 0} style={{ borderRadius: 16, background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                            <summary style={{ listStyle: 'none', cursor: 'pointer', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 18 }}>{monthGroup.label}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{monthGroup.days.length} dias con movimientos</div>
                                </div>
                            </summary>

                            <div style={{ padding: '0 16px 16px', display: 'grid', gap: 10 }}>
                                {monthGroup.days.map((dayGroup) => (
                                    <details key={dayGroup.fecha} open={dayGroup.fecha === fecha} style={{ borderRadius: 14, background: 'rgba(10, 12, 24, 0.55)', overflow: 'hidden' }}>
                                        <summary style={{ listStyle: 'none', cursor: 'pointer', padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{getDateLabel(dayGroup.fecha)}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dayGroup.movements.length} movimientos</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Venta ${Number(dayGroup.venta?.monto || dayGroup.venta?.efectivo || 0).toLocaleString('es-AR')}</span>
                                                <span style={{ fontSize: 12, color: '#fca5a5' }}>Gastos ${dayGroup.arsExpenses.toLocaleString('es-AR')}</span>
                                                <span style={{ fontSize: 12, color: 'var(--success)' }}>Ingresos ${dayGroup.arsIncome.toLocaleString('es-AR')}</span>
                                                {dayGroup.usdNet !== 0 && (
                                                    <span style={{ fontSize: 12, color: dayGroup.usdNet < 0 ? '#fca5a5' : 'var(--success)' }}>
                                                        USD {dayGroup.usdNet < 0 ? '-' : '+'}{Math.abs(dayGroup.usdNet).toLocaleString('es-AR')}
                                                    </span>
                                                )}
                                            </div>
                                        </summary>

                                        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
                                            {dayGroup.movements.map((item) => {
                                                const signedAmount = toSignedAmount(item);
                                                const isNegative = signedAmount < 0;
                                                return (
                                                    <div
                                                        key={item.id}
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'minmax(0, 1.3fr) auto auto',
                                                            gap: 12,
                                                            padding: 12,
                                                            borderRadius: 12,
                                                            background: isNegative ? 'rgba(239,68,68,0.09)' : 'rgba(34,197,94,0.09)',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: 'var(--fw-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {item.concepto}
                                                            </div>
                                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                                {item.categoria || 'Sin categoria'} · {CHANNEL_LABELS[item.canal] || item.canal || 'Efectivo'} · {item.moneda || 'ARS'}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.tipo || (isNegative ? 'gasto' : 'ingreso')}</div>
                                                        <div style={{ fontWeight: 'var(--fw-bold)', color: isNegative ? '#fca5a5' : 'var(--success)' }}>
                                                            {isNegative ? '-' : '+'}{item.moneda === 'USD' ? 'US$' : '$'}{Math.abs(signedAmount).toLocaleString('es-AR')}
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
