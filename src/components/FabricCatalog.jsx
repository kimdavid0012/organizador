import React, { useState, useRef, useMemo } from 'react';
import { Plus, Edit2, Trash2, X, Save, Scissors, Camera, Loaderr, ChevronDown, ChevronRight, Hash, Trash } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { findTelaStock } from '../data/telasData';
import { useAuth } from '../store/AuthContext';
import ImageUploader from './ImageUploader';
import ImageGallery from './ImageGallery';
import { generateId } from '../utils/helpers';
import './FabricCatalog.css';

function FabricModal({ tela, onClose }) {
    const { state, updateTela, deleteTela, addImageToTela, removeImageFromTela } = useData();
    const { t } = useI18n();
    const { user } = useAuth();
    const [form, setForm] = useState({ ...tela });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [batchText, setBatchText] = useState('');
    const [showBatch, setShowBatch] = useState(false);
    const [expandedColor, setExpandedColor] = useState(null);
    const scanInputRef = useRef(null);

    React.useEffect(() => {
        const current = state.telas.find(t => t.id === tela.id);
        if (current) setForm(prev => ({ ...prev, imagenes: current.imagenes }));
    }, [state.telas, tela.id]);

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSave = () => {
        if (!form.nombre || !form.nombre.trim()) { alert(t('nombreTelaObligatorio')); return; }
        // Sync totals from coloresStock
        const colors = form.coloresStock || [];
        const totalR = colors.reduce((s, c) => {
            if (c.items && c.items.length > 0) return s + c.items.length;
            return s + (parseFloat(c.rollos) || 0);
        }, 0);
        const totalC = colors.reduce((s, c) => {
            if (c.items && c.items.length > 0) return s + c.items.reduce((ss, i) => ss + (parseFloat(i.cantidad) || 0), 0);
            return s + (parseFloat(c.cantidad) || 0);
        }, 0);
        updateTela({ ...form, cantidadRollos: String(totalR || form.cantidadRollos || 0), cantidadTotal: String(totalC || form.cantidadTotal || 0) });
        onClose();
    };

    const handleDelete = () => {
        if (confirmDelete) { deleteTela(tela.id); onClose(); }
        else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
    };

    const handleImageUpload = (imagen) => addImageToTela(tela.id, { ...imagen, tipo: 'Cabezal' });
    const handleRemoveImage = (imagenId) => removeImageFromTela(tela.id, imagenId);

    // Multi-color helpers
    const coloresStock = form.coloresStock || [];
    const addColor = () => {
        const newColor = { id: generateId(), nombre: '', hex: '#888888', rollos: '', cantidad: '', items: [] };
        const updated = [...coloresStock, newColor];
        handleChange('coloresStock', updated);
        setExpandedColor(newColor.id);
    };

    const updateColor = (idx, field, value) => {
        const arr = [...coloresStock];
        arr[idx] = { ...arr[idx], [field]: value };
        handleChange('coloresStock', arr);
    };

    const removeColor = (idx) => handleChange('coloresStock', coloresStock.filter((_, i) => i !== idx));

    // Sub-items (Rolls) helpers
    const addItemToColor = (colorIdx) => {
        const arr = [...coloresStock];
        const color = { ...arr[colorIdx] };
        color.items = [...(color.items || []), { id: generateId(), cantidad: '' }];
        arr[colorIdx] = color;
        handleChange('coloresStock', arr);
    };

    const updateItemInColor = (colorIdx, itemIdx, value) => {
        const arr = [...coloresStock];
        const color = { ...arr[colorIdx] };
        const items = [...(color.items || [])];
        items[itemIdx] = { ...items[itemIdx], cantidad: value };
        color.items = items;
        arr[colorIdx] = color;
        handleChange('coloresStock', arr);
    };

    const removeItemFromColor = (colorIdx, itemIdx) => {
        const arr = [...coloresStock];
        const color = { ...arr[colorIdx] };
        color.items = (color.items || []).filter((_, i) => i !== itemIdx);
        arr[colorIdx] = color;
        handleChange('coloresStock', arr);
    };

    const handleBatchProcess = () => {
        if (!batchText.trim()) return;
        const nums = batchText.split(/[\s,;\n]+/).map(n => parseFloat(n.replace(',', '.'))).filter(n => !isNaN(n) && n > 0);
        if (nums.length === 0) return;

        const total = nums.reduce((s, n) => s + n, 0);
        const newColors = [...coloresStock];

        // If there's an expanded color, add to its items
        const expIdx = expandedColor ? newColors.findIndex(c => c.id === expandedColor) : (newColors.length - 1);

        if (expIdx >= 0) {
            const color = { ...newColors[expIdx] };
            const newItems = nums.map(n => ({ id: generateId(), cantidad: String(n) }));
            color.items = [...(color.items || []), ...newItems];
            newColors[expIdx] = color;
        } else {
            // Create new color with these items
            newColors.push({
                id: generateId(),
                nombre: 'Lote ' + new Date().toLocaleDateString(),
                hex: '#888888',
                items: nums.map(n => ({ id: generateId(), cantidad: String(n) }))
            });
        }

        handleChange('coloresStock', newColors);
        setBatchText('');
        setShowBatch(false);
    };

    // Totals logic
    const cortes = state.config.cortes || [];
    const getConsumoColor = (colorHex) => {
        let cant = 0, rollos = 0;
        cortes.forEach(c => {
            (c.consumos || []).forEach(cons => {
                if (cons.telaId === tela.id && (!colorHex || cons.colorHex === colorHex)) {
                    cant += parseFloat(cons.cantidad) || 0;
                    rollos += parseInt(cons.rollos) || 0;
                }
            });
        });
        return { cant, rollos };
    };

    const totalConsumos = getConsumoColor(null);
    const totalRollos = Math.max(0, (coloresStock.reduce((s, c) => s + (c.items?.length || parseFloat(c.rollos) || 0), 0)) - totalConsumos.rollos);
    const totalCantidad = Math.max(0, (coloresStock.reduce((s, c) => s + (c.items?.reduce((ss, i) => ss + (parseFloat(i.cantidad) || 0), 0) || parseFloat(c.cantidad) || 0), 0)) - totalConsumos.cant);
    const prezzoU = parseFloat(form.precioPorUnidad) || 0;
    const valorTotal = prezzoU * totalCantidad;
    const unidad = form.unidadPrecio === 'kg' ? 'kg' : 'mts';
    const isAdmin = user?.role === 'admin';
    const pagosUSD = form.pagosUSD || [];
    const totalPagadoUSD = pagosUSD.reduce((acc, pago) => acc + (parseFloat(pago.montoUSD) || 0), 0);
    const deudaUSD = Math.max(0, valorTotal - totalPagadoUSD);

    const addPagoUSD = () => {
        const pagos = [...pagosUSD, { id: generateId(), fecha: new Date().toISOString().slice(0, 10), montoUSD: '', cotizacion: state.config.cotizacionUSD || '', nota: '' }];
        handleChange('pagosUSD', pagos);
    };

    const updatePagoUSD = (index, field, value) => {
        const pagos = [...pagosUSD];
        pagos[index] = { ...pagos[index], [field]: value };
        handleChange('pagosUSD', pagos);
    };

    const removePagoUSD = (index) => handleChange('pagosUSD', pagosUSD.filter((_, idx) => idx !== index));

    // Talonario Scanner
    const handleScanTalonario = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setScanning(true);
        setScanResult(null);
        try {
            const reader = new FileReader();
            const imgData = await new Promise(r => { reader.onload = () => r(reader.result); reader.readAsDataURL(file); });
            handleChange('talonarioImg', imgData);
            const Tesseract = await import('tesseract.js');
            const { data } = await Tesseract.recognize(file, 'spa+eng', { logger: () => { } });
            const text = data.text;

            // Extract concentrations of numbers per line to detect columns
            const lines = text.split('\n');
            const foundNums = [];
            lines.forEach(line => {
                // Find all sequences that look like prices/weights (e.g. 25,80)
                const matches = line.match(/(\d+[.,]\d{1,2})/g);
                if (matches && matches.length >= 1) {
                    // In your voucher (CANTIDAD | P.UNIT | PIEZAS), CANTIDAD is the first one.
                    // We parse the first number found on the line as the weight.
                    // We also ensure it's not a common small value like 1.00 (qty) if possible.

                    let weightCandidate = matches[0].replace(',', '.');
                    let v = parseFloat(weightCandidate);

                    // If the first number is explicitly "1.00" and there's a second one, the second might be the weight
                    // (though in your voucher 1.00 is the LAST one, so matches[0] is correct)
                    if (v === 1 && matches.length > 1) {
                        weightCandidate = matches[1].replace(',', '.');
                        v = parseFloat(weightCandidate);
                    }

                    // Ignore prices like 4.90 if they are in the wrong position or repeat too much
                    // For now, picking the first number > 1.1 on each valid line is the best heuristic
                    if (v > 1.1) {
                        foundNums.push(v);
                    }
                }
            });

            // Try to find summary totals
            const summary = { rollos: null, total: null };
            for (const line of lines.map(l => l.toLowerCase())) {
                const totalMatch = line.match(/(?:total|valor|suma)[:\s]*(\d+[.,]?\d*)/);
                if (totalMatch && !summary.total) summary.total = parseFloat(totalMatch[1].replace(',', '.'));

                const piezasMatch = line.match(/(?:piezas|total\s*de\s*piezas|rollos)[:\s]*(\d+)/);
                if (piezasMatch) summary.rollos = parseInt(piezasMatch[1]);
            }

            setScanResult({
                text: text.substring(0, 300),
                foundNums,
                summary,
                success: foundNums.length > 0
            });
        } catch (err) {
            setScanResult({ text: 'Error: ' + err.message, success: false });
        } finally {
            setScanning(false);
            e.target.value = '';
        }
    };

    const applyScanResult = () => {
        if (!scanResult || scanResult.foundNums.length === 0) return;
        const newColors = [...coloresStock];
        const expIdx = expandedColor ? newColors.findIndex(c => c.id === expandedColor) : (newColors.length - 1);

        if (expIdx >= 0) {
            const color = { ...newColors[expIdx] };
            const newItems = scanResult.foundNums.map(n => ({ id: generateId(), cantidad: String(n) }));
            color.items = [...(color.items || []), ...newItems];
            newColors[expIdx] = color;
        } else {
            newColors.push({
                id: generateId(),
                nombre: 'Escaneo ' + new Date().toLocaleTimeString(),
                hex: '#888888',
                items: scanResult.foundNums.map(n => ({ id: generateId(), cantidad: String(n) }))
            });
        }
        handleChange('coloresStock', newColors);
        setScanResult(null);
    };

    return (
        <>
            <div className="modal-backdrop" onClick={handleSave} />
            <div className="modal fabric-modal" style={{ maxWidth: 620 }}>
                <div className="modal-header">
                    <h2>{form.nombre || t('nuevaTela')}</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`} onClick={handleDelete}>
                            <Trash2 size={16} /> {confirmDelete ? t('confirmar') : t('eliminar')}
                        </button>
                        <button className="btn-icon" onClick={handleSave}><X /></button>
                    </div>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="form-group">
                        <label className="form-label">{t('nombre')} *</label>
                        <input className="form-input" value={form.nombre || ''} onChange={(e) => handleChange('nombre', e.target.value)} placeholder="Ej: Modal Soft, Morley, Rib Kami" autoFocus />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                            <label className="form-label">{t('composicion')}</label>
                            <input className="form-input" value={form.composicion || ''} onChange={(e) => handleChange('composicion', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('proveedor')}</label>
                            <input className="form-input" value={form.proveedor || ''} onChange={(e) => handleChange('proveedor', e.target.value)} />
                        </div>
                    </div>

                    <div className="form-group" style={{ background: 'var(--glass-bg)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-3)', border: '1px solid var(--glass-border)', marginTop: 'var(--sp-2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <label className="form-label" style={{ margin: 0, fontWeight: 'bold' }}>📦 {t('stockYPrecios')}</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <select className="form-select" value={form.moneda || 'USD'} onChange={(e) => handleChange('moneda', e.target.value)} style={{ padding: '2px 8px', fontSize: '11px' }}>
                                    <option value="USD">USD</option>
                                    <option value="ARS">ARS ($)</option>
                                </select>
                                <select className="form-select" value={form.unidadPrecio || 'metro'} onChange={(e) => handleChange('unidadPrecio', e.target.value)} style={{ padding: '2px 8px', fontSize: '11px' }}>
                                    <option value="metro">{t('porMetro')}</option>
                                    <option value="kg">{t('porKg')}</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 15 }}>
                            <label className="form-label" style={{ fontSize: '11px' }}>{t('precioPorUnidad')}</label>
                            <input type="number" className="form-input" value={form.precioPorUnidad || ''} step="0.01" onChange={(e) => handleChange('precioPorUnidad', e.target.value)} />
                        </div>

                        <label className="form-label" style={{ fontSize: '11px', marginBottom: 8, display: 'block' }}>🎨 {t('coloresYVariantes')}</label>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {coloresStock.map((c, idx) => {
                                const isExpanded = expandedColor === c.id;
                                const cons = getConsumoColor(c.hex);
                                const hasItems = c.items && c.items.length > 0;

                                // Category totals
                                const catRollos = hasItems ? c.items.length : (parseFloat(c.rollos) || 0);
                                const catCant = hasItems ? c.items.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0) : (parseFloat(c.cantidad) || 0);
                                const dispR = Math.max(0, catRollos - cons.rollos);
                                const dispC = Math.max(0, catCant - cons.cant);

                                return (
                                    <div key={idx} style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8 }}>
                                            <button className="btn-icon" onClick={() => setExpandedColor(isExpanded ? null : c.id)} style={{ padding: 0, width: 24, height: 24 }}>
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                            <input type="color" value={c.hex || '#888888'} onChange={(e) => updateColor(idx, 'hex', e.target.value)} style={{ width: 20, height: 20, border: 'none', cursor: 'pointer', padding: 0 }} />
                                            <input className="form-input" value={c.nombre || ''} placeholder="Nombre Color" onChange={(e) => updateColor(idx, 'nombre', e.target.value)} style={{ fontSize: '12px', flex: 1, height: '30px', background: 'transparent', border: 'none', padding: 0 }} />

                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', minWidth: '120px' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>{catRollos} R</span> · <span>{catCant.toFixed(1)} {unidad}</span>
                                                {cons.cant > 0 && <div style={{ fontSize: '9px', color: 'var(--warning)' }}>Disp: {dispC.toFixed(1)}</div>}
                                            </div>

                                            <button className="btn-icon" onClick={() => removeColor(idx)} style={{ color: 'var(--danger)', opacity: 0.6 }}><Trash size={14} /></button>
                                        </div>

                                        {isExpanded && (
                                            <div style={{ padding: '0 10px 10px 42px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                {hasItems ? (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                                                        {c.items.map((item, idy) => (
                                                            <div key={idy} style={{ position: 'relative' }}>
                                                                <input
                                                                    type="number"
                                                                    className="form-input"
                                                                    value={item.cantidad || ''}
                                                                    onChange={(e) => updateItemInColor(idx, idy, e.target.value)}
                                                                    style={{ fontSize: '11px', padding: '4px 20px 4px 6px', height: '26px' }}
                                                                    placeholder="P. Rollo"
                                                                />
                                                                <button
                                                                    onClick={() => removeItemFromColor(idx, idy)}
                                                                    style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--danger)', padding: 0, cursor: 'pointer' }}
                                                                >
                                                                    <X size={10} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                        <button className="btn btn-ghost" onClick={() => addItemToColor(idx)} style={{ padding: '4px', height: '26px', border: '1px dashed' }}>
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <label style={{ fontSize: '9px', display: 'block' }}>Rollos Totales</label>
                                                            <input type="number" className="form-input" value={c.rollos || ''} onChange={(e) => updateColor(idx, 'rollos', e.target.value)} style={{ padding: '4px', height: '26px' }} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <label style={{ fontSize: '9px', display: 'block' }}>Cantidad Total</label>
                                                            <input type="number" className="form-input" value={c.cantidad || ''} onChange={(e) => updateColor(idx, 'cantidad', e.target.value)} style={{ padding: '4px', height: '26px' }} />
                                                        </div>
                                                        <button className="btn btn-sm btn-ghost" onClick={() => addItemToColor(idx)} style={{ marginTop: 14 }}>
                                                            <Hash size={12} /> Convertir a Lista
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-sm btn-secondary" onClick={addColor} style={{ flex: 1 }}>
                                <Plus size={14} /> {t('agregarColor')}
                            </button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setShowBatch(!showBatch)}>
                                📋 {showBatch ? t('ocultar') : 'Carga Lote'}
                            </button>
                        </div>

                        {showBatch && (
                            <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)' }}>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: 6 }}>Pegá los pesos separados por espacio o coma:</p>
                                <textarea className="form-textarea" value={batchText} onChange={(e) => setBatchText(e.target.value)} placeholder="20.5 18,3 22..." style={{ fontSize: '12px', minHeight: '60px' }} />
                                <button className="btn btn-sm btn-primary" onClick={handleBatchProcess} style={{ width: '100%', marginTop: 6 }}>Procesar al color seleccionado</button>
                            </div>
                        )}

                        <div style={{ marginTop: 15, padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '13px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Total Final: </span>
                                <strong>{totalRollos} R</strong> · <strong>{totalCantidad.toFixed(1)} {unidad}</strong>
                            </div>
                            {valorTotal > 0 && <div style={{ color: 'var(--success)', fontWeight: 'bold' }}>$ {valorTotal.toLocaleString()}</div>}
                        </div>

                        {/* Scanner Actions */}
                        <div style={{ marginTop: 10 }}>
                            <input ref={scanInputRef} type="file" accept="image/*" onChange={handleScanTalonario} style={{ display: 'none' }} />
                            <button className="btn btn-sm btn-secondary" onClick={() => scanInputRef.current.click()} disabled={scanning} style={{ width: '100%', gap: 8 }}>
                                {scanning ? <Loader size={16} className="spin" /> : <Camera size={16} />}
                                {scanning ? 'Escaneando...' : 'Escanear Talonario Multi-Rollo'}
                            </button>

                            {scanResult && scanResult.success && (
                                <div style={{ marginTop: 10, padding: 12, background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--success)' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: 6 }}>✅ Se encontraron {scanResult.foundNums.length} pesos:</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                                        {scanResult.foundNums.slice(0, 10).map((n, i) => <span key={i} style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>{n}</span>)}
                                        {scanResult.foundNums.length > 10 && <span>...</span>}
                                    </div>
                                    <button className="btn btn-sm btn-primary" onClick={applyScanResult} style={{ width: '100%' }}>Importar {scanResult.foundNums.length} rollos al color seleccionado</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('notas')}</label>
                        <textarea className="form-textarea" value={form.notas || ''} onChange={(e) => handleChange('notas', e.target.value)} rows={2} />
                    </div>

                    {isAdmin && (
                        <div className="form-group" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                                <div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>Pagos en dolares y deuda</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Valor tela: US$ {valorTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} · Pagado: US$ {totalPagadoUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })} · Debe: US$ {deudaUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <button className="btn btn-sm btn-secondary" onClick={addPagoUSD}><Plus size={14} /> Agregar pago</button>
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                                {pagosUSD.map((pago, index) => (
                                    <div key={pago.id} style={{ display: 'grid', gridTemplateColumns: '120px 120px 120px 1fr auto', gap: 8, alignItems: 'center' }}>
                                        <input type="date" className="form-input" value={pago.fecha || ''} onChange={(e) => updatePagoUSD(index, 'fecha', e.target.value)} />
                                        <input type="number" className="form-input" placeholder="USD" value={pago.montoUSD || ''} onChange={(e) => updatePagoUSD(index, 'montoUSD', e.target.value)} />
                                        <input type="number" className="form-input" placeholder="Coti" value={pago.cotizacion || ''} onChange={(e) => updatePagoUSD(index, 'cotizacion', e.target.value)} />
                                        <input className="form-input" placeholder="Nota / textilera" value={pago.nota || ''} onChange={(e) => updatePagoUSD(index, 'nota', e.target.value)} />
                                        <button className="btn-icon" onClick={() => removePagoUSD(index)}><Trash2 size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="form-group">
                        <ImageGallery imagenes={form.imagenes || []} onRemove={handleRemoveImage} />
                        <ImageUploader onUpload={handleImageUpload} />
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}><Save size={18} /> {t('guardar')}</button>
                </div>
            </div>
        </>
    );
}

export default function FabricCatalog() {
    const { state, addTela, updateConfig } = useData();
    const { telas } = state;
    const { t } = useI18n();
    const { user } = useAuth();
    const [editingTela, setEditingTela] = useState(null);
    const [paymentDrafts, setPaymentDrafts] = useState({});

    const handleAddAndOpen = () => { addTela({ nombre: '' }); setTimeout(() => setEditingTela('latest'), 50); };
    const resolvedEditTela = editingTela === 'latest' ? telas[telas.length - 1] : (editingTela ? telas.find(t => t.id === editingTela) : null);
    const getCoverImage = (tela) => (!tela.imagenes || tela.imagenes.length === 0) ? null : tela.imagenes[0];

    // Global Statistics
    const globalStats = useMemo(() => {
        let totalR = 0;
        let totalV = 0;
        const cotizacion = parseFloat(state.config.cotizacionUSD) || 1;
        const cortes = state.config.cortes || [];

        telas.forEach(tela => {
            let consR = 0;
            let consC = 0;
            cortes.forEach(c => c.consumos?.forEach(co => {
                if (co.telaId === tela.id) {
                    consR += parseInt(co.rollos) || 0;
                    consC += parseFloat(co.cantidad) || 0;
                }
            }));

            const colors = tela.coloresStock || [];
            const r = colors.reduce((s, c) => s + (c.items?.length || parseFloat(c.rollos) || 0), 0) || (findTelaStock(tela.nombre)?.rollos || 0);
            const c = colors.reduce((s, c) => s + (c.items?.reduce((ss, i) => ss + (parseFloat(i.cantidad) || 0), 0) || parseFloat(c.cantidad) || 0), 0);

            totalR += Math.max(0, r - consR);
            const value = (parseFloat(tela.precioPorUnidad) || 0) * Math.max(0, c - consC);
            totalV += (tela.moneda === 'USD' ? value * cotizacion : value);
        });

        return { totalR, totalV };
    }, [telas, state.config.cortes, state.config.cotizacionUSD]);

    const consumoStats = useMemo(() => {
        const cortes = state.config.cortes || [];
        const cotizacion = parseFloat(state.config.cotizacionUSD) || 1;
        const telaMap = new Map((telas || []).map((tela) => [tela.id, tela]));
        const byTela = new Map();
        const byCategoria = new Map();

        const addCategoria = (name, kilos, totalArs) => {
            const key = name || 'Sin categoría';
            const current = byCategoria.get(key) || { categoria: key, kilos: 0, totalArs: 0, registros: 0 };
            current.kilos += kilos;
            current.totalArs += totalArs;
            current.registros += 1;
            byCategoria.set(key, current);
        };

        cortes.forEach((corte) => {
            (corte.consumos || []).forEach((consumo) => {
                const tela = consumo.telaId ? telaMap.get(consumo.telaId) : null;
                const telaNombre = tela?.nombre || consumo.telaNombreImportado || 'Tela sin identificar';
                const unidad = tela?.unidadPrecio === 'kg' ? 'kg' : 'mts';
                const precioUnidad = parseFloat(tela?.precioPorUnidad) || 0;
                const cantidad = parseFloat(consumo.kilos ?? consumo.cantidad) || 0;
                const moneda = tela?.moneda || 'ARS';
                const totalBase = precioUnidad * cantidad;
                const totalArs = moneda === 'USD' ? totalBase * cotizacion : totalBase;
                const categoria = tela?.composicion || tela?.proveedor || 'Sin categoría';
                const key = consumo.telaId || `imported:${telaNombre.toUpperCase()}`;
                const current = byTela.get(key) || {
                    key,
                    telaId: tela?.id || '',
                    nombre: telaNombre,
                    categoria,
                    kilos: 0,
                    rollos: 0,
                    precioUnidad,
                    unidad,
                    moneda,
                    totalBase: 0,
                    totalArs: 0
                };

                current.kilos += cantidad;
                current.rollos += parseFloat(consumo.rollos) || 0;
                current.totalBase += totalBase;
                current.totalArs += totalArs;
                if (!current.precioUnidad && precioUnidad) current.precioUnidad = precioUnidad;
                if ((!current.categoria || current.categoria === 'Sin categoría') && categoria) current.categoria = categoria;
                if ((!current.moneda || current.moneda === 'ARS') && moneda) current.moneda = moneda;
                byTela.set(key, current);
                addCategoria(categoria, cantidad, totalArs);
            });
        });

        return {
            totalKilos: Array.from(byTela.values()).reduce((acc, item) => acc + item.kilos, 0),
            totalArs: Array.from(byTela.values()).reduce((acc, item) => acc + item.totalArs, 0),
            byTela: Array.from(byTela.values()).sort((a, b) => b.totalArs - a.totalArs),
            byCategoria: Array.from(byCategoria.values()).sort((a, b) => b.totalArs - a.totalArs)
        };
    }, [telas, state.config.cortes, state.config.cotizacionUSD]);

    const providerPayments = state.config.fabricPayments || [];

    const providerSummary = useMemo(() => {
        const grouped = {};
        telas.forEach((tela) => {
            const provider = tela.proveedor || 'Sin proveedor';
            const totalValue = (parseFloat(tela.precioPorUnidad) || 0) * (parseFloat(tela.cantidadTotal) || 0);
            if (!grouped[provider]) grouped[provider] = { totalValue: 0, paid: 0, fallados: 0 };
            grouped[provider].totalValue += totalValue;
            grouped[provider].fallados += (tela.coloresStock || []).reduce((acc, color) => acc + ((color.items || []).filter((item) => Number(item.fallado || 0) > 0).length), 0);
        });

        providerPayments.forEach((payment) => {
            const provider = payment.proveedor || 'Sin proveedor';
            if (!grouped[provider]) grouped[provider] = { totalValue: 0, paid: 0, fallados: 0 };
            grouped[provider].paid += parseFloat(payment.montoUSD) || 0;
        });

        return Object.entries(grouped);
    }, [telas, providerPayments]);

    const updatePaymentDraft = (provider, field, value) => {
        setPaymentDrafts((prev) => ({
            ...prev,
            [provider]: {
                fecha: prev[provider]?.fecha || new Date().toISOString().slice(0, 10),
                montoUSD: prev[provider]?.montoUSD || '',
                cotizacion: prev[provider]?.cotizacion || state.config.cotizacionUSD || '',
                nota: prev[provider]?.nota || '',
                ...prev[provider],
                [field]: value
            }
        }));
    };

    const addProviderPayment = (provider) => {
        const draft = paymentDrafts[provider];
        if (!draft?.montoUSD) return;

        updateConfig({
            fabricPayments: [
                {
                    id: generateId(),
                    proveedor: provider,
                    fecha: draft.fecha || new Date().toISOString().slice(0, 10),
                    montoUSD: draft.montoUSD,
                    cotizacion: draft.cotizacion || state.config.cotizacionUSD || '',
                    nota: draft.nota || ''
                },
                ...providerPayments
            ]
        });

        setPaymentDrafts((prev) => ({
            ...prev,
            [provider]: {
                fecha: new Date().toISOString().slice(0, 10),
                montoUSD: '',
                cotizacion: state.config.cotizacionUSD || '',
                nota: ''
            }
        }));
    };

    return (
        <div className="fabric-catalog">
            <div className="fabric-catalog-header">
                <div>
                    <h2>{t('catalogoTelas')}</h2>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: 12, marginTop: 4 }}>
                        <span>📦 {telas.length} telas</span>
                        <span>🧵 {globalStats.totalR} rollos</span>
                        <span>💰 ${globalStats.totalV.toLocaleString(undefined, { maximumFractionDigits: 0 })} ARS</span>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={handleAddAndOpen}><Plus size={18} /> {t('nuevaTela')}</button>
            </div>

            {user?.role === 'admin' && providerSummary.length > 0 && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)', marginBottom: 16 }}>
                    <h3 style={{ marginBottom: 12 }}>Resumen por textilera</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {providerSummary.map(([provider, summary], index) => (
                            <div key={provider} style={{ padding: 12, borderRadius: 12, background: `linear-gradient(90deg, hsla(${(index * 57) % 360}, 70%, 60%, 0.12), rgba(255,255,255,0.02))` }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: 12, alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{provider}</div>
                                    <div>US$ {summary.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div>Pagado US$ {summary.paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                    <div style={{ color: summary.fallados ? 'var(--warning)' : 'var(--text-secondary)' }}>Fallados: {summary.fallados}</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 120px 1fr auto', gap: 8, marginTop: 10 }}>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={paymentDrafts[provider]?.fecha || new Date().toISOString().slice(0, 10)}
                                        onChange={(e) => updatePaymentDraft(provider, 'fecha', e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="Pago USD"
                                        value={paymentDrafts[provider]?.montoUSD || ''}
                                        onChange={(e) => updatePaymentDraft(provider, 'montoUSD', e.target.value)}
                                    />
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="Coti"
                                        value={paymentDrafts[provider]?.cotizacion || state.config.cotizacionUSD || ''}
                                        onChange={(e) => updatePaymentDraft(provider, 'cotizacion', e.target.value)}
                                    />
                                    <input
                                        className="form-input"
                                        placeholder="Nota del pago"
                                        value={paymentDrafts[provider]?.nota || ''}
                                        onChange={(e) => updatePaymentDraft(provider, 'nota', e.target.value)}
                                    />
                                    <button className="btn btn-sm btn-primary" onClick={() => addProviderPayment(provider)}>
                                        Agregar pago
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {consumoStats.byTela.length > 0 && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div>
                            <h3 style={{ marginBottom: 6 }}>Consumo registrado desde cortes</h3>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                Estas telas salen directo de lo cargado en <strong>Cortes</strong>, con kilaje consumido, precio por unidad y valor total.
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total consumido</div>
                                <div style={{ fontSize: 24, fontWeight: 800 }}>{consumoStats.totalKilos.toFixed(1)}</div>
                            </div>
                            <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Valor total ARS</div>
                                <div style={{ fontSize: 24, fontWeight: 800 }}>${consumoStats.totalArs.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 0.8fr)', gap: 16 }}>
                        <div style={{ display: 'grid', gap: 8 }}>
                            {consumoStats.byTela.slice(0, 12).map((item) => (
                                <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.7fr 0.8fr 0.8fr', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{item.nombre}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.categoria || 'Sin categoría'}</div>
                                    </div>
                                    <div style={{ fontSize: 13 }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Consumido</div>
                                        <strong>{item.kilos.toFixed(1)} {item.unidad}</strong>
                                    </div>
                                    <div style={{ fontSize: 13 }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Precio/{item.unidad}</div>
                                        <strong>{item.precioUnidad ? `${item.moneda === 'USD' ? 'US$' : '$'}${item.precioUnidad.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : 'Sin precio'}</strong>
                                    </div>
                                    <div style={{ fontSize: 13, textAlign: 'right' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Total ARS</div>
                                        <strong style={{ color: 'var(--warning)' }}>${item.totalArs.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>Consumo por categoría de tela</div>
                            {consumoStats.byCategoria.map((item) => (
                                <div key={item.categoria} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                                        <strong>{item.categoria}</strong>
                                        <span style={{ color: 'var(--warning)', fontWeight: 700 }}>${item.totalArs.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {item.kilos.toFixed(1)} kg/mts consumidos · {item.registros} registros
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {telas.length === 0 ? (
                <div className="fabric-empty">
                    <Scissors size={48} />
                    <p>{t('noHayTelasRegistradas')}</p>
                </div>
            ) : (
                <div className="fabric-grid">
                    {telas.map(tela => {
                        const cover = getCoverImage(tela);
                        const colors = tela.coloresStock || [];
                        let r = colors.reduce((s, c) => s + (c.items?.length || parseFloat(c.rollos) || 0), 0);
                        if (r === 0) { const seed = findTelaStock(tela.nombre); if (seed) r = seed.rollos; }
                        const unidad = tela.unidadPrecio === 'kg' ? 'kg' : 'mts';

                        return (
                            <div key={tela.id} className="fabric-card" onClick={() => setEditingTela(tela.id)}>
                                <div className="fabric-card-image">
                                    {cover ? <img src={cover.data} alt={tela.nombre} /> : <div className="fabric-card-placeholder"><Scissors /></div>}
                                </div>
                                <div className="fabric-card-body">
                                    <div className="fabric-card-name">
                                        <div style={{ display: 'flex', gap: 4, marginRight: 8 }}>
                                            {colors.slice(0, 4).map((c, i) => (
                                                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c.hex }} title={c.nombre} />
                                            ))}
                                            {colors.length > 4 && <span style={{ fontSize: '8px' }}>+{colors.length - 4}</span>}
                                        </div>
                                        {tela.nombre || t('sinNombre')}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        <span>📦 {r} rollos</span>
                                        <span>{tela.moneda === 'USD' ? 'US$' : '$'}{tela.precioPorUnidad || 0}/{unidad}</span>
                                    </div>
                                    <button className="btn btn-sm btn-ghost" style={{ width: '100%', marginTop: 10 }}>Editar Stock</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {resolvedEditTela && <FabricModal tela={resolvedEditTela} onClose={() => setEditingTela(null)} />}
        </div>
    );
}
