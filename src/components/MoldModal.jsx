import React, { useState, useEffect } from 'react';
import { X, Trash2, Check, AlertCircle } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { formatDateInput, PRIORIDAD_OPTIONS, generateId } from '../utils/helpers';
import Checklist from './Checklist';
import ImageUploader from './ImageUploader';
import ImageGallery from './ImageGallery';
import './MoldModal.css';

export default function MoldModal({ molde, onClose }) {
    const { state, updateMolde, deleteMolde, addImageToMolde, removeImageFromMolde, setCoverImage } = useData();
    const { t } = useI18n();
    const { config, telas } = state;

    const [form, setForm] = useState({ ...molde });
    const [errors, setErrors] = useState({});
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Sync form with global state when molde images change externally
    useEffect(() => {
        const current = state.moldes.find(m => m.id === molde.id);
        if (current) {
            setForm(prev => ({
                ...prev,
                imagenes: current.imagenes,
                coverImageId: current.coverImageId
            }));
        }
    }, [state.moldes, molde.id]);

    // Auto-save on form change (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (form.nombre && form.nombre.trim()) {
                updateMolde(form);
                setErrors({});
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [form]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleChecklistChange = (checklist) => {
        setForm(prev => ({ ...prev, checklist }));
    };

    const toggleTela = (telaId) => {
        setForm(prev => {
            const current = prev.telasIds || [];
            const next = current.includes(telaId)
                ? current.filter(id => id !== telaId)
                : [...current, telaId];
            return { ...prev, telasIds: next };
        });
    };

    const handleImageUpload = (imagen) => {
        // Dispatch to global state (which generates the ID and adds the image)
        addImageToMolde(molde.id, imagen);
        // The sync useEffect above will update our local form automatically
    };

    const handleRemoveImage = (imagenId) => {
        removeImageFromMolde(molde.id, imagenId);
        // The sync useEffect above will update our local form automatically
    };

    const handleSetCover = (imagenId) => {
        setCoverImage(molde.id, imagenId);
        // The sync useEffect above will update our local form automatically
    };

    const handleSaveAndClose = () => {
        if (!form.nombre || !form.nombre.trim()) {
            setErrors({ nombre: t('nombreObligatorio') });
            return;
        }
        updateMolde(form);
        onClose();
    };

    const handleDelete = () => {
        if (confirmDelete) {
            deleteMolde(molde.id);
            onClose();
        } else {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
        }
    };

    // Listen for escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                handleSaveAndClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [form]);

    return (
        <>
            <div className="modal-backdrop" onClick={handleSaveAndClose} />
            <div className="modal mold-modal">
                <div className="modal-header">
                    <h2>{form.nombre || t('nuevoMolde')}</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`}
                            onClick={handleDelete}
                        >
                            <Trash2 />
                            {confirmDelete ? t('confirmar') : t('eliminar')}
                        </button>
                        <button className="btn-icon" onClick={handleSaveAndClose}>
                            <X />
                        </button>
                    </div>
                </div>

                <div className="modal-body">
                    {/* LEFT COLUMN */}
                    <div className="mold-modal-col">
                        <div className="form-group">
                            <label className="form-label">{t('nombreMolde')} *</label>
                            <input
                                className={`form-input ${errors.nombre ? 'error' : ''}`}
                                value={form.nombre || ''}
                                onChange={(e) => handleChange('nombre', e.target.value)}
                                placeholder={t('placeholderNombre')}
                                autoFocus
                                id="molde-nombre"
                            />
                            {errors.nombre && (
                                <span className="form-error">
                                    <AlertCircle style={{ width: 12, height: 12, display: 'inline' }} /> {errors.nombre}
                                </span>
                            )}
                        </div>

                        <div className="mold-modal-row">
                            <div className="form-group">
                                <label className="form-label">{t('codigoInterno')}</label>
                                <input
                                    className="form-input"
                                    value={form.codigo || ''}
                                    onChange={(e) => handleChange('codigo', e.target.value)}
                                    placeholder="4501"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('categoria')}</label>
                                <select
                                    className="form-select"
                                    value={form.categoria || ''}
                                    onChange={(e) => handleChange('categoria', e.target.value)}
                                >
                                    <option value="">{t('seleccionar')}</option>
                                    {config.categorias.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mold-modal-row">
                            <div className="form-group">
                                <label className="form-label">{t('tallesRango')}</label>
                                <input
                                    className="form-input"
                                    value={form.talles || ''}
                                    onChange={(e) => handleChange('talles', e.target.value)}
                                    placeholder="S-XL o 1-5"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('estadoMolde')}</label>
                                <select
                                    className="form-select"
                                    value={form.estado || ''}
                                    onChange={(e) => handleChange('estado', e.target.value)}
                                >
                                    {config.columnas.map(c => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mold-modal-row">
                            <div className="form-group">
                                <label className="form-label">{t('prioridad')}</label>
                                <select
                                    className="form-select"
                                    value={form.prioridad || 'Media'}
                                    onChange={(e) => handleChange('prioridad', e.target.value)}
                                >
                                    {PRIORIDAD_OPTIONS.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('temporada')}</label>
                                <select
                                    className="form-select"
                                    value={form.temporada || ''}
                                    onChange={(e) => handleChange('temporada', e.target.value)}
                                >
                                    <option value="">{t('seleccionar')}</option>
                                    {config.temporadas.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mold-modal-row">
                            <div className="form-group">
                                <label className="form-label">{t('responsable')}</label>
                                <select
                                    className="form-select"
                                    value={form.responsable || ''}
                                    onChange={(e) => handleChange('responsable', e.target.value)}
                                >
                                    <option value="">{t('seleccionar')}</option>
                                    {config.personas.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('fechaObjetivo')}</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formatDateInput(form.fechaObjetivo) || ''}
                                    onChange={(e) => handleChange('fechaObjetivo', e.target.value || null)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">{t('observaciones')}</label>
                            <textarea
                                className="form-textarea"
                                value={form.observaciones || ''}
                                onChange={(e) => handleChange('observaciones', e.target.value)}
                                placeholder={t('placeholderNotas')}
                                rows={2}
                            />
                        </div>

                        {/* Corte Section */}
                        <div className="form-group" style={{
                            background: 'var(--bg-surface)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--sp-3)',
                            border: '1px solid var(--border-color)',
                            display: 'none' // Se oculta porque estos datos pasaron a especificarse por Cada Corte individualmente
                        }}>
                            <label className="form-label" style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', marginBottom: 8 }}>
                                ✂️ {t('corte')} (Parámetros legacy - ahora en sección Cortes)
                            </label>
                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">{t('estadoCorte')}</label>
                                    <select
                                        className="form-select"
                                        value={form.estadoCorte || 'sin-enviar'}
                                        onChange={(e) => handleChange('estadoCorte', e.target.value)}
                                    >
                                        {(config.estadosCorte || []).map(ec => (
                                            <option key={ec.id} value={ec.id}>{ec.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('cantidadCortes')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.cortesCount || 0}
                                        min={0}
                                        onChange={(e) => handleChange('cortesCount', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                            </div>
                            <div className="mold-modal-row" style={{ marginTop: 8 }}>
                                <div className="form-group">
                                    <label className="form-label">{t('cortador')}</label>
                                    <select
                                        className="form-select"
                                        value={form.cortador || ''}
                                        onChange={(e) => handleChange('cortador', e.target.value)}
                                    >
                                        <option value="">{t('seleccionar')}</option>
                                        {(config.cortadores || []).map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('costoPorPrendaCorte')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.costoCortador || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="0.00"
                                        onChange={(e) => handleChange('costoCortador', e.target.value)}
                                    />
                                </div>
                            </div>
                            {/* Payment status cortador */}
                            {form.costoCortador && (
                                <div style={{ marginTop: 6 }}>
                                    <button
                                        className={`btn btn-sm ${form.pagadoCortador ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => handleChange('pagadoCortador', !form.pagadoCortador)}
                                        style={{ fontSize: '11px', width: '100%' }}
                                    >
                                        {form.pagadoCortador ? '✅' : '❌'} {form.pagadoCortador ? t('pagado') : t('noPagado')}
                                    </button>
                                </div>
                            )}
                            <div className="form-group" style={{ marginTop: 8 }}>
                                <label className="form-label">{t('notasCorte')}</label>
                                <textarea
                                    className="form-textarea"
                                    value={form.notasCorte || ''}
                                    onChange={(e) => handleChange('notasCorte', e.target.value)}
                                    placeholder={t('placeholderNotasCorte')}
                                    rows={2}
                                />
                            </div>
                        </div>

                        {/* Confección / Taller Section */}
                        <div className="form-group" style={{
                            background: 'var(--glass-bg)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--sp-3)',
                            border: '1px solid var(--glass-border)',
                            display: 'none' // Oculto. Parámetros legacy traspasados a Cortes individual
                        }}>
                            <label className="form-label" style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', marginBottom: 8 }}>
                                🏭 {t('confeccionTaller')} (Parámetros legacy - ahora en sección Cortes)
                            </label>
                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">{t('taller')}</label>
                                    <select
                                        className="form-select"
                                        value={form.taller || ''}
                                        onChange={(e) => handleChange('taller', e.target.value)}
                                    >
                                        <option value="">{t('seleccionar')}</option>
                                        {(config.talleres || []).map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="mold-modal-row" style={{ marginTop: 8 }}>
                                <div className="form-group">
                                    <label className="form-label">{t('fechaEnvioTaller')}</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formatDateInput(form.fechaEnvioTaller) || ''}
                                        onChange={(e) => handleChange('fechaEnvioTaller', e.target.value || null)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('fechaRetornoTaller')}</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formatDateInput(form.fechaRetornoTaller) || ''}
                                        onChange={(e) => handleChange('fechaRetornoTaller', e.target.value || null)}
                                    />
                                </div>
                            </div>
                            <div className="mold-modal-row" style={{ marginTop: 8 }}>
                                <div className="form-group">
                                    <label className="form-label">{t('costoPorPrenda')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.costoTaller || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="0.00"
                                        onChange={(e) => handleChange('costoTaller', e.target.value)}
                                    />
                                </div>
                            </div>
                            {/* Payment status taller */}
                            {form.costoTaller && (
                                <div style={{ marginTop: 6 }}>
                                    <button
                                        className={`btn btn-sm ${form.pagadoTaller ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => handleChange('pagadoTaller', !form.pagadoTaller)}
                                        style={{ fontSize: '11px', width: '100%' }}
                                    >
                                        {form.pagadoTaller ? '✅' : '❌'} {form.pagadoTaller ? t('pagado') : t('noPagado')}
                                    </button>
                                </div>
                            )}
                            {form.fechaEnvioTaller && form.fechaRetornoTaller && (() => {
                                const d1 = new Date(form.fechaEnvioTaller);
                                const d2 = new Date(form.fechaRetornoTaller);
                                const dias = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
                                return (
                                    <div style={{
                                        marginTop: 8,
                                        padding: '6px 12px',
                                        background: dias <= 7 ? 'var(--success-bg)' : dias <= 14 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--fs-sm)',
                                        color: dias <= 7 ? 'var(--success)' : dias <= 14 ? 'var(--warning)' : 'var(--danger)',
                                        fontWeight: 'var(--fw-semibold)'
                                    }}>
                                        ⏱️ {dias} {t('diasConfeccion')}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* COSTEO Section */}
                        <div className="mold-modal-section">
                            <h3 className="mold-modal-section-title">💰 {t('costeo')}</h3>

                            {/* Cotización override or use global */}
                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">{t('cotizacionUSD')} (1 USD = $ ARS)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.cotizacion || config.cotizacionUSD || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder={config.cotizacionUSD || '1500'}
                                        onChange={(e) => handleChange('cotizacion', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('cantidad')} Estimada / Producción General ({t('unidades')})</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.cantidadCorte || ''}
                                        min={1}
                                        placeholder="1500"
                                        onChange={(e) => handleChange('cantidadCorte', e.target.value)}
                                    />
                                    <div style={{ fontSize: '9px', color: 'var(--warning)', marginTop: 4 }}>* Esta es la cantidad promedio. En "Cortes" podés definirla específicamente por tirada.</div>
                                </div>
                            </div>

                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">{t('consumoTela')} (m/kg)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.consumoTela || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="4.9"
                                        onChange={(e) => handleChange('consumoTela', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">% {t('porcentajeTela')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.porcentajeTela || ''}
                                        min={0}
                                        max={100}
                                        placeholder="70"
                                        onChange={(e) => handleChange('porcentajeTela', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">{t('costoAccesorio')} 1</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.costoAccesorio || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="0"
                                        onChange={(e) => handleChange('costoAccesorio', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('costoAccesorio')} 2</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.costoAccesorio2 || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="0"
                                        onChange={(e) => handleChange('costoAccesorio2', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">{t('costoMolde')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.costoMolde || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="0"
                                        onChange={(e) => handleChange('costoMolde', e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('costoGason')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.costoGason || ''}
                                        min={0}
                                        step="0.01"
                                        placeholder="0"
                                        onChange={(e) => handleChange('costoGason', e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mold-modal-row">
                                <div className="form-group">
                                    <label className="form-label">% {t('margenGanancia')}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.margenGanancia || ''}
                                        min={0}
                                        max={500}
                                        placeholder="70"
                                        onChange={(e) => handleChange('margenGanancia', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Auto-calculated results */}
                            {(() => {
                                // Get tela price
                                const telaId = (form.telasIds || [])[0];
                                const telaObj = telaId ? telas.find(t => t.id === telaId) : null;
                                const precioTela = telaObj ? (parseFloat(telaObj.precioPorUnidad) || 0) : 0;

                                const cotiz = parseFloat(form.cotizacion) || parseFloat(config.cotizacionUSD) || 0;
                                const consumo = parseFloat(form.consumoTela) || 0;
                                const pctTela = parseFloat(form.porcentajeTela) || 0;
                                const cantidadU = parseFloat(form.cantidadCorte) || 1;
                                const costoTallerVal = parseFloat(form.costoTaller) || 0;
                                const costoCortadorVal = parseFloat(form.costoCortador) || 0;
                                const acc1 = parseFloat(form.costoAccesorio) || 0;
                                const acc2 = parseFloat(form.costoAccesorio2) || 0;
                                const moldeC = parseFloat(form.costoMolde) || 0;
                                const gason = parseFloat(form.costoGason) || 0;
                                const margen = parseFloat(form.margenGanancia) || 0;

                                // Formula: COSTO = (precioTela × cotiz × consumo × %tela/100) / cantidad + cortador + taller + acc1 + acc2 + (molde + gason)/cantidad
                                let valorTela = precioTela * consumo * (pctTela / 100);
                                if (telaObj?.moneda === 'ARS') {
                                    // Si está en pesos, no cotizamos
                                } else {
                                    // Si está en USD, pasamos a pesos
                                    valorTela = valorTela * cotiz;
                                }

                                const costoTela = cantidadU > 0 ? valorTela / cantidadU : 0;
                                const costoTotal = costoTela + costoCortadorVal + costoTallerVal + acc1 + acc2 + (moldeC + gason) / (cantidadU || 1);
                                const precioVenta = costoTotal * (1 + (margen / 100));
                                const precioLocal = parseFloat(form.precioLocal) || precioVenta;

                                if (costoTotal <= 0) return null;

                                return (
                                    <div style={{
                                        marginTop: 'var(--sp-3)',
                                        borderRadius: 'var(--radius-md)',
                                        overflow: 'hidden',
                                        border: '1px solid var(--glass-border)',
                                    }}>
                                        {/* Cost breakdown */}
                                        <div style={{
                                            padding: '8px 12px',
                                            background: 'var(--glass-bg)',
                                            fontSize: 'var(--fs-xs)',
                                            color: 'var(--text-secondary)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 2,
                                        }}>
                                            {costoTela > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>🧵 Tela {telaObj?.nombre || ''} ({precioTela} USD × {cotiz} × {consumo} × {pctTela}%) / {cantidadU}</span>
                                                    <strong>${costoTela.toFixed(2)}</strong>
                                                </div>
                                            )}
                                            {costoCortadorVal > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>✂️ Cortador</span>
                                                    <strong>${costoCortadorVal.toFixed(2)}</strong>
                                                </div>
                                            )}
                                            {costoTallerVal > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>🏭 Taller</span>
                                                    <strong>${costoTallerVal.toFixed(2)}</strong>
                                                </div>
                                            )}
                                            {(acc1 + acc2) > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>🪡 Accesorios</span>
                                                    <strong>${(acc1 + acc2).toFixed(2)}</strong>
                                                </div>
                                            )}
                                            {(moldeC + gason) > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>📐 Molde + Gasón</span>
                                                    <strong>${(moldeC + gason).toFixed(2)}</strong>
                                                </div>
                                            )}
                                        </div>

                                        {/* Total cost */}
                                        <div style={{
                                            padding: '8px 12px',
                                            background: 'var(--accent-light)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--accent)' }}>
                                                📊 {t('costoUnitario')}
                                            </span>
                                            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--accent)' }}>
                                                ${costoTotal.toFixed(2)}
                                            </span>
                                        </div>

                                        {/* Sale price sugerido */}
                                        {margen > 0 && (
                                            <div style={{
                                                padding: '10px 12px',
                                                background: 'rgba(255,255,255,0.03)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-secondary)' }}>
                                                    💡 Venta Sugerida (+{margen}%)
                                                </span>
                                                <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)', color: 'var(--text-primary)' }}>
                                                    ${precioVenta.toFixed(2)}
                                                </span>
                                            </div>
                                        )}

                                        {/* Precio Local (Real) Input */}
                                        <div style={{
                                            padding: '10px 12px',
                                            background: 'var(--success-bg)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                💰 Precio Venta Final (Real)
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>$</span>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    style={{ width: 100, fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--success)', padding: '2px 8px', textAlign: 'right', background: 'rgba(255,255,255,0.2)' }}
                                                    value={form.precioLocal || ''}
                                                    placeholder={precioVenta.toFixed(0)}
                                                    onChange={(e) => handleChange('precioLocal', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="mold-modal-col">
                        {/* Telas */}
                        <div className="form-group mold-modal-telas">
                            <label className="form-label">{t('telasCompatibles')}</label>
                            <div className="mold-modal-telas-selected">
                                {(form.telasIds || []).map(tid => {
                                    const tela = telas.find(t => t.id === tid);
                                    if (!tela) return null;
                                    return (
                                        <span key={tid} className="tag">
                                            {tela.nombre}
                                            <span className="tag-remove" onClick={() => toggleTela(tid)}>
                                                <X style={{ width: 10, height: 10 }} />
                                            </span>
                                        </span>
                                    );
                                })}
                            </div>
                            <div className="mold-modal-telas-dropdown">
                                {telas.length === 0 ? (
                                    <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                                        {t('noHayTelas')}
                                    </div>
                                ) : (
                                    telas.map(tela => {
                                        const isSelected = (form.telasIds || []).includes(tela.id);
                                        return (
                                            <div
                                                key={tela.id}
                                                className={`mold-modal-tela-option ${isSelected ? 'selected' : ''}`}
                                                onClick={() => toggleTela(tela.id)}
                                            >
                                                {isSelected ? (
                                                    <Check className="check-icon" />
                                                ) : (
                                                    <span className="check-icon" />
                                                )}
                                                {tela.nombre}
                                                {tela.color && (
                                                    <span style={{
                                                        width: 8, height: 8,
                                                        borderRadius: '50%',
                                                        background: tela.color,
                                                        border: '1px solid var(--border-color)',
                                                        marginLeft: 'auto'
                                                    }} />
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Checklist */}
                        <div className="form-group">
                            <Checklist
                                items={form.checklist || []}
                                onChange={handleChecklistChange}
                            />
                        </div>

                        {/* Images */}
                        <div className="form-group">
                            <ImageGallery
                                imagenes={form.imagenes || []}
                                coverImageId={form.coverImageId}
                                onSetCover={handleSetCover}
                                onRemove={handleRemoveImage}
                            />
                            <ImageUploader onUpload={handleImageUpload} />
                        </div>

                        {/* Pattern Files */}
                        <div className="form-group" style={{
                            background: 'var(--glass-bg)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--sp-3)',
                            border: '1px solid var(--glass-border)',
                        }}>
                            <label className="form-label" style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', marginBottom: 8 }}>
                                📐 {t('archivosMolde')}
                            </label>

                            {/* File list */}
                            {(form.archivosMolde || []).map((archivo, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 8px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: 4,
                                    fontSize: 'var(--fs-xs)',
                                }}>
                                    <span style={{ fontSize: 16 }}>📄</span>
                                    <a
                                        href={archivo.data}
                                        download={archivo.nombre}
                                        style={{ flex: 1, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {archivo.nombre}
                                    </a>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>
                                        {archivo.size ? `${(archivo.size / 1024).toFixed(0)} KB` : ''}
                                    </span>
                                    <button
                                        className="btn-icon"
                                        onClick={() => {
                                            const arr = (form.archivosMolde || []).filter((_, i) => i !== idx);
                                            handleChange('archivosMolde', arr);
                                        }}
                                        style={{ width: 22, height: 22, padding: 0 }}
                                    >
                                        <Trash2 style={{ width: 11, height: 11 }} />
                                    </button>
                                </div>
                            ))}

                            {/* Upload button */}
                            <input
                                type="file"
                                id="pattern-file-input"
                                accept=".dxf,.pdf,.ai,.svg,.plt,.hpgl,.rul,.pat,.zip,.rar"
                                multiple
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const files = Array.from(e.target.files);
                                    files.forEach(file => {
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                            const newFile = {
                                                nombre: file.name,
                                                size: file.size,
                                                tipo: file.type || file.name.split('.').pop(),
                                                data: reader.result,
                                            };
                                            setForm(prev => ({
                                                ...prev,
                                                archivosMolde: [...(prev.archivosMolde || []), newFile],
                                            }));
                                        };
                                        reader.readAsDataURL(file);
                                    });
                                    e.target.value = '';
                                }}
                            />
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => document.getElementById('pattern-file-input')?.click()}
                                style={{ width: '100%', fontSize: '11px' }}
                            >
                                📁 {t('subirArchivoMolde')}
                            </button>
                            <div style={{ marginTop: 4, fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                DXF, PDF, AI, SVG, PLT, ZIP
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleSaveAndClose}>
                        {t('cerrarAutoguardado')}
                    </button>
                </div>
            </div>
        </>
    );
}
