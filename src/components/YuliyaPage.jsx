import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../store/firebase';
import './YuliyaPage.css';

const FIRESTORE_DOC = { col: 'app-data', id: 'yuliya' };

const DEFAULT_ROW = () => ({
    id: Date.now() + Math.random(),
    articuloFabrica: '',
    articuloLocal: '',
    descripcion: '',
    tela: '',
    cotizacion: 1500,
    costoReal: 0,
    tallerPrueba: 0,
    porcGanancia: 0.5,
    precioLuis: 0,
    precioReal: 0,
    precioLocal: 0,
    precioChloe: 0,
    talleres: '',
    precioTallerReal: 0,
    nCorte: '',
    cantidadPrenda: 0,
    fechaCorte: '',
    precioTelaXMetro: 0,
    kilajeMetroTotal: 0,
    porcTela: 0,
    rollos: 0,
    accesorios: 0,
    accesorios2: 0,
    molde: 0,
    fasonCosto: 0,
});

// ---- Formulas ----
const calcCostoReal = (row) => {
    const { precioTelaXMetro, kilajeMetroTotal, cotizacion, cantidadPrenda, tallerPrueba, accesorios, accesorios2 } = row;
    const porcTela = Number(row.porcTela) || 0;
    const molde = Number(row.molde) || 0;
    const fasonCosto = Number(row.fasonCosto) || 0;
    const qty = Number(cantidadPrenda) || 1;
    const costoTela = (Number(precioTelaXMetro) * Number(cotizacion || 1500) * Number(kilajeMetroTotal) * (porcTela || 1)) / qty;
    return costoTela + Number(tallerPrueba) + Number(accesorios) + molde + fasonCosto + Number(accesorios2);
};

// If the user overrode costoReal, downstream formulas use that value.
const getEffectiveCostoReal = (row) => Number(row.costoReal || 0) || calcCostoReal(row);

const calcPrecioReal = (row) => {
    const costo = getEffectiveCostoReal(row);
    const ganancia = Number(row.porcGanancia);
    if (ganancia >= 1) return costo;
    return costo / (1 - ganancia);
};

const calcPorcTela = (row) => {
    const costoReal = getEffectiveCostoReal(row);
    if (!costoReal) return 0;
    const qty = Number(row.cantidadPrenda) || 1;
    const porcTela = Number(row.porcTela) || 1;
    const costoTela = (Number(row.precioTelaXMetro) * Number(row.kilajeMetroTotal) * Number(row.cotizacion || 1500) * porcTela) / qty;
    return costoTela / costoReal;
};

// col.calc = auto-fill formula; when row[col.key] is 0/empty, the formula value is shown in blue.
// User can click and type to override — the stored value then takes over.
const COLUMNS = [
    { key: 'articuloFabrica', label: 'Art. Fábrica', type: 'text', sticky: true, width: 110 },
    { key: 'articuloLocal', label: 'Art. Local', type: 'text', sticky: true, width: 90 },
    { key: 'descripcion', label: 'Descripción', type: 'text', sticky: true, width: 160 },
    { key: 'tela', label: 'Tela', type: 'text', width: 120 },
    { key: 'cotizacion', label: 'Cotización', type: 'number', width: 90 },
    { key: 'costoReal', label: 'Costo Real', type: 'number', calc: calcCostoReal, width: 100 },
    { key: 'tallerPrueba', label: 'Taller Prueba', type: 'number', width: 105 },
    { key: 'porcGanancia', label: '% Ganancia', type: 'decimal', width: 90 },
    { key: 'precioLuis', label: 'Precio Luis', type: 'number', width: 95 },
    { key: 'precioReal', label: 'Precio Real', type: 'number', calc: calcPrecioReal, width: 100 },
    { key: 'precioLocal', label: 'Precio Local', type: 'number', width: 100 },
    { key: 'precioChloe', label: 'Precio Chloe', type: 'number', width: 100 },
    { key: 'talleres', label: 'Talleres', type: 'text', width: 120 },
    { key: 'precioTallerReal', label: 'Precio Taller', type: 'number', width: 105 },
    { key: 'nCorte', label: '# Corte', type: 'text', width: 80 },
    { key: 'cantidadPrenda', label: 'Cant. Prenda', type: 'number', width: 100 },
    { key: 'fechaCorte', label: 'Fecha Corte', type: 'date', width: 120 },
    { key: 'precioTelaXMetro', label: 'Tela $/m·kg', type: 'number', width: 100 },
    { key: 'kilajeMetroTotal', label: 'Kilaje/Metro', type: 'number', width: 100 },
    { key: 'porcTela', label: '% Tela', type: 'decimal', calc: calcPorcTela, width: 80 },
    { key: 'rollos', label: 'Rollos', type: 'number', width: 75 },
    { key: 'accesorios', label: 'Accesorios 1', type: 'number', width: 100 },
    { key: 'accesorios2', label: 'Accesorios 2', type: 'number', width: 100 },
    { key: 'molde', label: 'Molde', type: 'number', width: 80 },
    { key: 'fasonCosto', label: 'Fasón Costo', type: 'number', width: 100 },
];

const fmt = (n, isPercent = false) => {
    const num = Number(n);
    if (!isFinite(num) || isNaN(num)) return '—';
    if (isPercent) return (num * 100).toFixed(1) + '%';
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(num);
};

// Returns the value to display for a cell: stored value if the user overrode it, else formula.
const getDisplayVal = (row, col) => {
    const stored = Number(row[col.key] || 0);
    return col.calc && stored === 0 ? col.calc(row) : (col.type === 'text' || col.type === 'date' ? row[col.key] : stored);
};

const isUsingFormula = (row, col) => Boolean(col.calc) && Number(row[col.key] || 0) === 0;

function CellEditor({ value, type, onSave, onCancel }) {
    const initialVal = type === 'decimal' ? ((Number(value) || 0) * 100).toFixed(0) : (value ?? '');
    const [val, setVal] = useState(initialVal);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

    const commit = () => {
        let parsed = val;
        if (type === 'number') parsed = Number(val) || 0;
        if (type === 'decimal') parsed = (parseFloat(val) || 0) / 100;
        onSave(parsed);
    };

    const handleKey = (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
    };

    return (
        <input
            ref={inputRef}
            className="yuliya-cell-input"
            type={type === 'date' ? 'date' : (type === 'number' || type === 'decimal') ? 'number' : 'text'}
            step={type === 'decimal' ? '1' : undefined}
            placeholder={type === 'decimal' ? 'Ej: 50' : undefined}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKey}
        />
    );
}

export default function YuliyaPage() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [editingCell, setEditingCell] = useState(null); // { rowIdx, colKey }
    const saveTimer = useRef(null);

    // ---- Load from Firestore ----
    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(doc(db, FIRESTORE_DOC.col, FIRESTORE_DOC.id));
                if (snap.exists()) {
                    setRows(snap.data().rows || []);
                } else {
                    setRows([DEFAULT_ROW()]);
                }
            } catch (err) {
                console.error('YuliyaPage load error:', err);
                setRows([DEFAULT_ROW()]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // ---- Auto-save with debounce ----
    const persistRows = useCallback((updatedRows) => {
        setDirty(true);
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            setSaving(true);
            try {
                await setDoc(doc(db, FIRESTORE_DOC.col, FIRESTORE_DOC.id), { rows: updatedRows });
                setDirty(false);
            } catch (err) {
                console.error('YuliyaPage save error:', err);
            } finally {
                setSaving(false);
            }
        }, 1500);
    }, []);

    const updateRow = (rowIdx, key, value) => {
        setRows(prev => {
            const next = prev.map((r, i) => i === rowIdx ? { ...r, [key]: value } : r);
            persistRows(next);
            return next;
        });
    };

    const addRow = () => {
        setRows(prev => {
            const next = [...prev, DEFAULT_ROW()];
            persistRows(next);
            return next;
        });
    };

    const deleteRow = (rowIdx) => {
        setRows(prev => {
            const next = prev.filter((_, i) => i !== rowIdx);
            persistRows(next);
            return next;
        });
    };

    const handleSaveNow = async () => {
        clearTimeout(saveTimer.current);
        setSaving(true);
        try {
            await setDoc(doc(db, FIRESTORE_DOC.col, FIRESTORE_DOC.id), { rows });
            setDirty(false);
        } finally {
            setSaving(false);
        }
    };

    const totalCantidad = rows.reduce((s, r) => s + (Number(r.cantidadPrenda) || 0), 0);
    const avgCostoReal = rows.length ? rows.reduce((s, r) => s + getEffectiveCostoReal(r), 0) / rows.length : 0;
    const avgPrecioReal = rows.length ? rows.reduce((s, r) => s + (Number(r.precioReal || 0) || calcPrecioReal(r)), 0) / rows.length : 0;

    if (loading) {
        return (
            <div className="yuliya-page">
                <div className="yuliya-loading">Cargando planilla Yuliya...</div>
            </div>
        );
    }

    return (
        <div className="yuliya-page">
            <div className="yuliya-header">
                <div className="yuliya-title-row">
                    <h2 className="yuliya-title">Planilla Yuliya — Costos de Producción</h2>
                    <div className="yuliya-header-actions">
                        <span className={`yuliya-save-status ${dirty ? 'unsaved' : 'saved'}`}>
                            {saving ? 'Guardando...' : dirty ? 'Sin guardar' : 'Guardado'}
                        </span>
                        <button className="btn btn-primary btn-sm" onClick={handleSaveNow} disabled={saving || !dirty}>
                            <Save size={14} /> Guardar ahora
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={addRow}>
                            <Plus size={14} /> Agregar fila
                        </button>
                    </div>
                </div>
                <p className="yuliya-subtitle">
                    {rows.length} filas · Total prendas: <strong>{fmt(totalCantidad)}</strong> ·
                    Celdas en azul se calculan automáticamente — hacé clic para editar y fijar el valor.
                </p>
            </div>

            <div className="yuliya-table-wrap">
                <table className="yuliya-table">
                    <thead>
                        <tr>
                            <th className="yuliya-th yuliya-col-action" />
                            {COLUMNS.map((col, ci) => (
                                <th
                                    key={col.key}
                                    className={`yuliya-th${col.sticky ? ' sticky' : ''}${col.calc ? ' formula-col' : ''}`}
                                    style={{ minWidth: col.width, left: col.sticky ? getStickyLeft(ci) : undefined }}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIdx) => (
                            <tr key={row.id || rowIdx} className={`yuliya-tr ${rowIdx % 2 === 0 ? 'even' : 'odd'}`}>
                                <td className="yuliya-td yuliya-col-action">
                                    <button
                                        className="yuliya-delete-btn"
                                        onClick={() => deleteRow(rowIdx)}
                                        title="Eliminar fila"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                                {COLUMNS.map((col, ci) => {
                                    const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colKey === col.key;
                                    const formulaFallback = isUsingFormula(row, col);
                                    const displayVal = getDisplayVal(row, col);
                                    // When opening the editor, pre-populate with the effective value
                                    // so the user sees the calculated number and can adjust it.
                                    const editInitVal = col.calc
                                        ? (Number(row[col.key] || 0) || col.calc(row))
                                        : row[col.key];

                                    return (
                                        <td
                                            key={col.key}
                                            className={`yuliya-td editable-cell${col.sticky ? ' sticky' : ''}${formulaFallback ? ' formula-cell' : ''}`}
                                            style={{ minWidth: col.width, left: col.sticky ? getStickyLeft(ci) : undefined }}
                                            onClick={() => setEditingCell({ rowIdx, colKey: col.key })}
                                        >
                                            {isEditing ? (
                                                <CellEditor
                                                    value={editInitVal}
                                                    type={col.type}
                                                    onSave={(v) => {
                                                        updateRow(rowIdx, col.key, v);
                                                        setEditingCell(null);
                                                    }}
                                                    onCancel={() => setEditingCell(null)}
                                                />
                                            ) : (
                                                <span className="yuliya-cell-display">
                                                    {col.type === 'decimal'
                                                        ? ((Number(displayVal) || 0) * 100).toFixed(1) + '%'
                                                        : col.type === 'number'
                                                            ? fmt(displayVal)
                                                            : (displayVal || <span className="yuliya-empty">—</span>)}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="yuliya-totals">
                            <td className="yuliya-td" />
                            {COLUMNS.map((col) => (
                                <td key={col.key} className="yuliya-td yuliya-total-cell">
                                    {col.key === 'cantidadPrenda' ? <strong>{fmt(totalCantidad)}</strong> :
                                     col.key === 'costoReal' ? <strong>{fmt(avgCostoReal)}</strong> :
                                     col.key === 'precioReal' ? <strong>{fmt(avgPrecioReal)}</strong> :
                                     null}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="yuliya-footer">
                <button className="btn btn-secondary" onClick={addRow}>
                    <Plus size={14} /> Agregar fila
                </button>
            </div>
        </div>
    );
}

// Sticky left offsets for first 3 columns (action col = 36px, then col widths)
function getStickyLeft(columnIndex) {
    const ACTION_W = 36;
    const offsets = [0, 110, 200];
    return ACTION_W + (offsets[columnIndex] ?? 0) + 'px';
}
