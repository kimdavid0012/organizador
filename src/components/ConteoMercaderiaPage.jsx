import React, { useMemo, useRef, useState } from 'react';
import { Boxes, Plus, Trash2, Download, Upload } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId } from '../utils/helpers';
import * as XLSX from 'xlsx';

const EMPTY_FORM = {
    articulo: '',
    descripcion: '',
    tipoTela: '',
    color: '',
    fechaIngreso: '',
    taller: '',
    responsable: '',
    cantidadOriginal: '',
    cantidadContada: '',
    cantidadEllos: '',
    fallado: ''
};

const toNumber = (value) => Number.parseInt(value || 0, 10) || 0;
const normalizeCode = (value) => (value || '').toString().trim().toUpperCase();
const normalizeText = (value) => (value || '').toString().trim();

const parseExcelNumber = (value) => {
    if (typeof value === 'number') return Math.round(value);
    if (value === null || value === undefined || value === '') return 0;
    const normalized = value
        .toString()
        .trim()
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed);
};

const formatExcelDate = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        if (date) {
            const safeDate = new Date(Date.UTC(date.y, date.m - 1, date.d));
            return safeDate.toISOString().slice(0, 10);
        }
    }

    const raw = value.toString().trim();
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    const shortMonthMap = {
        ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
        jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12'
    };
    const match = raw.toLowerCase().match(/^(\d{1,2})[-/ ]([a-z]{3}|\d{1,2})(?:[-/ ](\d{2,4}))?$/);
    if (!match) return '';

    const day = match[1].padStart(2, '0');
    const month = shortMonthMap[match[2]] || match[2].padStart(2, '0');
    const year = match[3] ? match[3].padStart(4, '20') : new Date().getFullYear().toString();
    return `${year}-${month}-${day}`;
};

export default function ConteoMercaderiaPage() {
    const { user } = useAuth();
    const { state, saveMercaderiaConteos } = useData();
    const conteos = state.config?.mercaderiaConteos || [];
    const productos = state.config?.posProductos || [];
    const cortes = state.config?.cortes || [];
    const talleres = state.config?.talleres || [];
    const telasActivas = (state.telas || [])
        .filter((tela) => tela?.activo !== false)
        .map((tela) => tela?.nombre || tela?.descripcion || '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [search, setSearch] = useState('');
    const fileInputRef = useRef(null);
    const normalizedEmail = (user?.email || '').toLowerCase();
    const isNadiaController = normalizedEmail === 'nadia@celavie.com';
    const canEditInventoryRows = user?.role === 'admin' || normalizedEmail === 'naara@celavie.com' || normalizedEmail === 'juan@celavie.com';
    const responsableOptions = ['Juan', 'Naara'];

    const articleOptions = useMemo(() => {
        const map = new Map();

        productos.forEach((producto) => {
            const code = normalizeCode(producto.codigoInterno);
            if (!code) return;
            map.set(code, {
                codigoInterno: code,
                descripcion: producto.detalleCorto || producto.detalleLargo || code,
                stock: toNumber(producto.stock),
                proveedor: producto.proveedor || ''
            });
        });

        cortes.forEach((corte) => {
            (corte.moldesData || []).forEach((moldeData) => {
                const molde = state.moldes.find((item) => item.id === moldeData.id);
                const code = normalizeCode(molde?.codigo || molde?.nombre);
                if (!code) return;
                if (!map.has(code)) {
                    map.set(code, {
                        codigoInterno: code,
                        descripcion: molde?.nombre || code,
                        stock: toNumber(moldeData.cantidad),
                        proveedor: moldeData.tallerAsignado || ''
                    });
                }
            });
        });

        return Array.from(map.values()).sort((a, b) => a.codigoInterno.localeCompare(b.codigoInterno));
    }, [productos, cortes, state.moldes]);

    const filteredConteos = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return conteos;
        return conteos.filter((item) =>
            [item.articulo, item.codigoInterno, item.descripcion, item.tipoTela, item.color, item.taller]
                .some((value) => (value || '').toLowerCase().includes(q))
        );
    }, [conteos, search]);

    const saveConteos = (nextConteos) => {
        saveMercaderiaConteos(nextConteos);
    };

    const upsertConteos = (incomingConteos) => {
        const existingMap = new Map(
            conteos.map((item) => [
                [
                    normalizeCode(item.codigoInterno || item.articulo),
                    normalizeText(item.color).toUpperCase(),
                    normalizeText(item.taller).toUpperCase(),
                    normalizeText(item.fechaIngreso)
                ].join('|'),
                item
            ])
        );

        incomingConteos.forEach((item) => {
            const key = [
                normalizeCode(item.codigoInterno || item.articulo),
                normalizeText(item.color).toUpperCase(),
                normalizeText(item.taller).toUpperCase(),
                normalizeText(item.fechaIngreso)
            ].join('|');
            const previous = existingMap.get(key);
            existingMap.set(key, previous ? { ...previous, ...item, id: previous.id } : item);
        });

        saveConteos(Array.from(existingMap.values()));
    };

    const autofillArticle = (rawArticulo, currentForm = formData) => {
        const articulo = normalizeCode(rawArticulo);
        const linkedArticle = articleOptions.find((item) => item.codigoInterno === articulo);
        return {
            ...currentForm,
            articulo,
            descripcion: currentForm.descripcion || linkedArticle?.descripcion || '',
            taller: currentForm.taller || linkedArticle?.proveedor || '',
            cantidadOriginal: currentForm.cantidadOriginal || (linkedArticle ? String(linkedArticle.stock) : '')
        };
    };

    const handleAdd = () => {
        const articulo = normalizeCode(formData.articulo);
        if (!articulo) {
            alert('El articulo es obligatorio.');
            return;
        }

        const linkedArticle = articleOptions.find((item) => item.codigoInterno === articulo);
        const newItem = {
            id: generateId(),
            ...formData,
            productId: productos.find((producto) => normalizeCode(producto.codigoInterno) === articulo)?.id || null,
            codigoInterno: articulo,
            articulo,
            descripcion: formData.descripcion || linkedArticle?.descripcion || articulo,
            tipoTela: formData.tipoTela || '',
            taller: formData.taller || linkedArticle?.proveedor || '',
            responsable: formData.responsable || (normalizedEmail === 'juan@celavie.com' ? 'Juan' : normalizedEmail === 'naara@celavie.com' ? 'Naara' : ''),
            cantidadOriginal: toNumber(formData.cantidadOriginal || linkedArticle?.stock),
            cantidadContada: toNumber(formData.cantidadContada),
            cantidadEllos: toNumber(formData.cantidadEllos),
            fallado: toNumber(formData.fallado),
            chequeado: false,
            chequeadoPor: '',
            chequeadoAt: '',
            comentarioControl: '',
            createdAt: new Date().toISOString()
        };

        saveConteos([newItem, ...conteos]);
        setFormData(EMPTY_FORM);
    };

    const handleDelete = (id) => {
        if (!window.confirm('Eliminar este conteo?')) return;
        saveConteos(conteos.filter((item) => item.id !== id));
    };

    const handleImportExcel = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });

            if (!rows.length) {
                alert('El Excel esta vacio.');
                return;
            }

            const importedConteos = [];

            rows.slice(1).forEach((row) => {
                const articulo = normalizeCode(row[1]);
                const descripcion = normalizeText(row[2]);
                const tipoTela = normalizeText(row[3]);
                const cantidadOriginal = parseExcelNumber(row[4]);
                const fechaIngreso = formatExcelDate(row[5]);
                const cantidadContada = parseExcelNumber(row[6]);
                const taller = normalizeText(row[0]);

                const extraNumbers = row
                    .slice(7)
                    .map((cell) => parseExcelNumber(cell))
                    .filter((value) => value > 0);

                const cantidadEllos = extraNumbers[0] || 0;
                const fallado = extraNumbers[1] || 0;

                if (!articulo && !descripcion) return;

                const linkedArticle = articleOptions.find((item) => item.codigoInterno === articulo);
                importedConteos.push({
                    id: generateId(),
                    productId: productos.find((producto) => normalizeCode(producto.codigoInterno) === articulo)?.id || null,
                    codigoInterno: articulo || normalizeCode(descripcion),
                    articulo: articulo || normalizeCode(descripcion),
                    descripcion: descripcion || linkedArticle?.descripcion || articulo,
                    tipoTela,
                    color: '',
                    fechaIngreso,
                    taller: taller || linkedArticle?.proveedor || '',
                    responsable: normalizedEmail === 'juan@celavie.com' ? 'Juan' : normalizedEmail === 'naara@celavie.com' ? 'Naara' : '',
                    cantidadOriginal,
                    cantidadContada,
                    cantidadEllos,
                    fallado,
                    chequeado: false,
                    chequeadoPor: '',
                    chequeadoAt: '',
                    comentarioControl: '',
                    createdAt: new Date().toISOString()
                });
            });

            if (!importedConteos.length) {
                alert('No encontre filas validas para importar en ese Excel.');
                return;
            }

            upsertConteos(importedConteos);
            alert(`✅ Se importaron/actualizaron ${importedConteos.length} filas de conteo desde Excel.`);
        } catch (error) {
            console.error('Error importando Excel de conteo:', error);
            alert(`❌ No pude importar ese Excel: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    };

    const handleCellChange = (id, field, value) => {
        const nextConteos = conteos.map((item) =>
            item.id === id
                ? {
                    ...item,
                    [field]: field === 'articulo'
                        ? normalizeCode(value)
                        : ['cantidadOriginal', 'cantidadContada', 'cantidadEllos', 'fallado'].includes(field)
                        ? toNumber(value)
                        : value
                }
                : item
        );

        const normalizedConteos = nextConteos.map((item) => {
            const linkedArticle = articleOptions.find((option) => option.codigoInterno === normalizeCode(item.articulo || item.codigoInterno));
            return {
                ...item,
                codigoInterno: normalizeCode(item.articulo || item.codigoInterno),
                articulo: normalizeCode(item.articulo || item.codigoInterno),
                descripcion: item.descripcion || linkedArticle?.descripcion || '',
                tipoTela: item.tipoTela || '',
                productId: item.productId || productos.find((producto) => normalizeCode(producto.codigoInterno) === normalizeCode(item.articulo || item.codigoInterno))?.id || null
            };
        });
        saveConteos(normalizedConteos);
    };

    const handleControlChange = (id, field, value) => {
        const nextConteos = conteos.map((item) => {
            if (item.id !== id) return item;
            if (field === 'chequeado') {
                return {
                    ...item,
                    chequeado: value,
                    chequeadoPor: value ? (user?.name || user?.email || 'Nadia') : '',
                    chequeadoAt: value ? new Date().toISOString() : ''
                };
            }
            return {
                ...item,
                [field]: value
            };
        });
        saveConteos(nextConteos);
    };

    const exportCsv = () => {
        const headers = ['Articulo', 'Descripcion', 'Tipo tela', 'Color', 'Fecha ingreso', 'Taller', 'Responsable', 'Cantidad original', 'Cantidad contada', 'Cantidad ellos', 'Fallado', 'Chequeado', 'Comentario control', 'Diferencia'];
        const rows = conteos.map((item) => {
            const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
            return [
                item.articulo,
                item.descripcion,
                item.tipoTela,
                item.color,
                item.fechaIngreso,
                item.taller,
                item.responsable,
                item.cantidadOriginal,
                item.cantidadContada,
                item.cantidadEllos,
                item.fallado,
                item.chequeado ? 'SI' : 'NO',
                item.comentarioControl,
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
                        Registro de stock contado por articulo, tela, color y taller. Juan y Naara cargan; Nadia controla con chequeado y comentarios.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        style={{ display: 'none' }}
                        onChange={handleImportExcel}
                    />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={!canEditInventoryRows}>
                        <Upload size={16} /> Importar Excel
                    </button>
                    <button className="btn btn-secondary" onClick={exportCsv}>
                        <Download size={16} /> Exportar CSV
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 18, marginBottom: 18, opacity: canEditInventoryRows ? 1 : 0.92 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <input
                        className="form-input"
                        list="conteo-articulos"
                        placeholder="Articulo / codigo"
                        value={formData.articulo}
                        onChange={(e) => setFormData((prev) => autofillArticle(e.target.value, prev))}
                        disabled={!canEditInventoryRows}
                    />
                    <input className="form-input" placeholder="Descripcion" value={formData.descripcion} onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" list="conteo-telas" placeholder="Tipo de tela" value={formData.tipoTela} onChange={(e) => setFormData((prev) => ({ ...prev, tipoTela: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" placeholder="Color / modelo" value={formData.color} onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" type="date" value={formData.fechaIngreso} onChange={(e) => setFormData((prev) => ({ ...prev, fechaIngreso: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" list="conteo-talleres" placeholder="Taller" value={formData.taller} onChange={(e) => setFormData((prev) => ({ ...prev, taller: e.target.value }))} disabled={!canEditInventoryRows} />
                    <select className="form-input" value={formData.responsable} onChange={(e) => setFormData((prev) => ({ ...prev, responsable: e.target.value }))} disabled={!canEditInventoryRows}>
                        <option value="">Responsable</option>
                        {responsableOptions.map((responsable) => (
                            <option key={responsable} value={responsable}>{responsable}</option>
                        ))}
                    </select>
                    <input className="form-input" type="number" placeholder="Cantidad original" value={formData.cantidadOriginal} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadOriginal: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" type="number" placeholder="Cantidad contada" value={formData.cantidadContada} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadContada: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" type="number" placeholder="Cantidad de ellos" value={formData.cantidadEllos} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadEllos: e.target.value }))} disabled={!canEditInventoryRows} />
                    <input className="form-input" type="number" placeholder="Fallado" value={formData.fallado} onChange={(e) => setFormData((prev) => ({ ...prev, fallado: e.target.value }))} disabled={!canEditInventoryRows} />
                </div>
                <datalist id="conteo-articulos">
                    {articleOptions.map((item) => (
                        <option key={item.codigoInterno} value={item.codigoInterno}>
                            {item.descripcion}
                        </option>
                    ))}
                </datalist>
                <datalist id="conteo-telas">
                    {telasActivas.map((tela) => (
                        <option key={tela} value={tela} />
                    ))}
                </datalist>
                <datalist id="conteo-talleres">
                    {talleres.map((taller) => (
                        <option key={taller} value={taller} />
                    ))}
                </datalist>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                    <input
                        className="form-input"
                        style={{ maxWidth: 320 }}
                        placeholder="Buscar por articulo, tela, descripcion, color o taller..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={handleAdd} disabled={!canEditInventoryRows}>
                        <Plus size={16} /> Agregar conteo
                    </button>
                </div>
                {!canEditInventoryRows && (
                    <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                        Nadia solo controla esta seccion: puede marcar chequeado/no chequeado y dejar comentarios, sin modificar cantidades.
                    </div>
                )}
            </div>

            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1450 }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                {['Articulo', 'Descripcion', 'Tela', 'Color', 'Fecha ingreso', 'Taller', 'Responsable', 'Original', 'Contada', 'Ellos', 'Fallado', 'Chequeado', 'Comentarios', 'Diferencia', 'Accion'].map((label) => (
                                    <th key={label} style={{ padding: '12px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredConteos.map((item) => {
                                const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
                                const rowBackground = item.chequeado ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.08)';
                                return (
                                    <tr key={item.id} style={{ borderTop: '1px solid var(--glass-border)', background: rowBackground }}>
                                        <td style={{ padding: 10 }}><input className="form-input" list="conteo-articulos" value={item.articulo || ''} onChange={(e) => handleCellChange(item.id, 'articulo', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.descripcion || ''} onChange={(e) => handleCellChange(item.id, 'descripcion', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" list="conteo-telas" value={item.tipoTela || ''} onChange={(e) => handleCellChange(item.id, 'tipoTela', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.color || ''} onChange={(e) => handleCellChange(item.id, 'color', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="date" value={item.fechaIngreso || ''} onChange={(e) => handleCellChange(item.id, 'fechaIngreso', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" list="conteo-talleres" value={item.taller || ''} onChange={(e) => handleCellChange(item.id, 'taller', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}>
                                            <select className="form-input" value={item.responsable || ''} onChange={(e) => handleCellChange(item.id, 'responsable', e.target.value)} disabled={!canEditInventoryRows}>
                                                <option value="">Responsable</option>
                                                {responsableOptions.map((responsable) => (
                                                    <option key={responsable} value={responsable}>{responsable}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadOriginal || 0} onChange={(e) => handleCellChange(item.id, 'cantidadOriginal', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadContada || 0} onChange={(e) => handleCellChange(item.id, 'cantidadContada', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadEllos || 0} onChange={(e) => handleCellChange(item.id, 'cantidadEllos', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.fallado || 0} onChange={(e) => handleCellChange(item.id, 'fallado', e.target.value)} disabled={!canEditInventoryRows} /></td>
                                        <td style={{ padding: 10, minWidth: 150 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: item.chequeado ? 'var(--success)' : 'var(--danger)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!item.chequeado}
                                                    onChange={(e) => handleControlChange(item.id, 'chequeado', e.target.checked)}
                                                    disabled={!(isNadiaController || user?.role === 'admin')}
                                                />
                                                {item.chequeado ? 'Chequeado' : 'No chequeado'}
                                            </label>
                                            {item.chequeadoPor && (
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                    {item.chequeadoPor}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: 10, minWidth: 220 }}>
                                            <textarea
                                                className="form-input"
                                                rows={2}
                                                value={item.comentarioControl || ''}
                                                onChange={(e) => handleControlChange(item.id, 'comentarioControl', e.target.value)}
                                                placeholder="Comentarios de control..."
                                                disabled={!(isNadiaController || user?.role === 'admin')}
                                                style={{ resize: 'vertical', minHeight: 64 }}
                                            />
                                        </td>
                                        <td style={{ padding: 10, fontWeight: 700, color: diferencia < 0 ? 'var(--danger)' : 'var(--success)' }}>
                                            {diferencia}
                                        </td>
                                        <td style={{ padding: 10 }}>
                                            <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(item.id)} disabled={!canEditInventoryRows}>
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
