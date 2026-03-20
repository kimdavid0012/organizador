import React, { useMemo, useRef, useState } from 'react';
import { Boxes, Plus, Trash2, Download, Upload, CheckCircle2, CircleAlert, Factory, ShoppingBag } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId } from '../utils/helpers';
import * as XLSX from 'xlsx';

const EMPTY_FORM = {
    articuloFabrica: '',
    articuloVenta: '',
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

const RESPONSABLES = ['Juan', 'Naara'];

const toNumber = (value) => Number.parseInt(value || 0, 10) || 0;
const normalizeCode = (value) => (value || '').toString().trim().toUpperCase();
const normalizeText = (value) => (value || '').toString().trim();

const parseExcelNumber = (value) => {
    if (typeof value === 'number') return Math.round(value);
    if (value === null || value === undefined || value === '') return 0;
    const normalized = value.toString().trim().replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed);
};

const formatExcelDate = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        if (date) return new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString().slice(0, 10);
    }
    const raw = value.toString().trim();
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return '';
};

const getFormCardStyle = (checked) => ({
    padding: 18,
    borderRadius: 18,
    background: checked ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.10)',
    border: `1px solid ${checked ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.22)'}`,
    boxShadow: '0 18px 40px rgba(8, 10, 24, 0.22)'
});

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

    const articleOptions = useMemo(() => {
        const map = new Map();

        productos.forEach((producto) => {
            const saleCode = normalizeCode(producto.codigoInterno);
            if (!saleCode) return;
            map.set(saleCode, {
                articuloVenta: saleCode,
                articuloFabrica: saleCode,
                descripcion: producto.detalleCorto || producto.detalleLargo || saleCode,
                stock: toNumber(producto.stock),
                proveedor: producto.proveedor || ''
            });
        });

        cortes.forEach((corte) => {
            (corte.moldesData || []).forEach((moldeData) => {
                const molde = state.moldes.find((item) => item.id === moldeData.id);
                const articleFactory = normalizeCode(molde?.codigo || molde?.nombre);
                if (!articleFactory || map.has(articleFactory)) return;
                map.set(articleFactory, {
                    articuloVenta: articleFactory,
                    articuloFabrica: articleFactory,
                    descripcion: molde?.nombre || articleFactory,
                    stock: toNumber(moldeData.cantidad),
                    proveedor: moldeData.tallerAsignado || ''
                });
            });
        });

        return Array.from(map.values()).sort((a, b) => a.articuloVenta.localeCompare(b.articuloVenta));
    }, [productos, cortes, state.moldes]);

    const filteredConteos = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return conteos;
        return conteos.filter((item) =>
            [
                item.articuloFabrica,
                item.articuloVenta,
                item.descripcion,
                item.tipoTela,
                item.color,
                item.taller,
                item.responsable
            ].some((value) => (value || '').toLowerCase().includes(q))
        );
    }, [conteos, search]);

    const saveConteos = (nextConteos) => {
        saveMercaderiaConteos(nextConteos);
    };

    const buildConteoItem = (baseItem) => {
        const articuloVenta = normalizeCode(baseItem.articuloVenta || baseItem.codigoInterno);
        const articuloFabrica = normalizeCode(baseItem.articuloFabrica || baseItem.articulo || articuloVenta);
        const linkedArticle = articleOptions.find((item) => item.articuloVenta === articuloVenta);
        return {
            ...baseItem,
            productId: baseItem.productId || productos.find((producto) => normalizeCode(producto.codigoInterno) === articuloVenta)?.id || null,
            codigoInterno: articuloVenta,
            articulo: articuloFabrica,
            articuloFabrica,
            articuloVenta,
            descripcion: baseItem.descripcion || linkedArticle?.descripcion || articuloVenta || articuloFabrica,
            tipoTela: normalizeText(baseItem.tipoTela),
            color: normalizeText(baseItem.color),
            fechaIngreso: normalizeText(baseItem.fechaIngreso),
            taller: normalizeText(baseItem.taller || linkedArticle?.proveedor || ''),
            responsable: normalizeText(baseItem.responsable),
            cantidadOriginal: toNumber(baseItem.cantidadOriginal || linkedArticle?.stock),
            cantidadContada: toNumber(baseItem.cantidadContada),
            cantidadEllos: toNumber(baseItem.cantidadEllos),
            fallado: toNumber(baseItem.fallado),
            chequeado: Boolean(baseItem.chequeado),
            chequeadoPor: baseItem.chequeadoPor || '',
            chequeadoAt: baseItem.chequeadoAt || '',
            comentarioControl: baseItem.comentarioControl || ''
        };
    };

    const upsertConteos = (incomingConteos) => {
        const existingMap = new Map(
            conteos.map((item) => [
                [
                    normalizeCode(item.articuloFabrica),
                    normalizeCode(item.articuloVenta || item.codigoInterno),
                    normalizeText(item.color).toUpperCase(),
                    normalizeText(item.taller).toUpperCase(),
                    normalizeText(item.fechaIngreso)
                ].join('|'),
                item
            ])
        );

        incomingConteos.forEach((item) => {
            const key = [
                normalizeCode(item.articuloFabrica),
                normalizeCode(item.articuloVenta || item.codigoInterno),
                normalizeText(item.color).toUpperCase(),
                normalizeText(item.taller).toUpperCase(),
                normalizeText(item.fechaIngreso)
            ].join('|');
            const previous = existingMap.get(key);
            existingMap.set(key, previous ? { ...previous, ...item, id: previous.id } : item);
        });

        saveConteos(Array.from(existingMap.values()));
    };

    const autofillSaleArticle = (rawArticuloVenta, currentForm = formData) => {
        const articuloVenta = normalizeCode(rawArticuloVenta);
        const linkedArticle = articleOptions.find((item) => item.articuloVenta === articuloVenta);
        return {
            ...currentForm,
            articuloVenta,
            descripcion: currentForm.descripcion || linkedArticle?.descripcion || '',
            taller: currentForm.taller || linkedArticle?.proveedor || '',
            cantidadOriginal: currentForm.cantidadOriginal || (linkedArticle ? String(linkedArticle.stock) : '')
        };
    };

    const handleAdd = () => {
        const articuloVenta = normalizeCode(formData.articuloVenta);
        if (!articuloVenta) {
            alert('El articulo de venta es obligatorio.');
            return;
        }

        const newItem = buildConteoItem({
            id: generateId(),
            ...formData,
            responsable: formData.responsable || (normalizedEmail === 'juan@celavie.com' ? 'Juan' : normalizedEmail === 'naara@celavie.com' ? 'Naara' : ''),
            createdAt: new Date().toISOString()
        });

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
                const articuloFabrica = normalizeCode(row[1]);
                const descripcion = normalizeText(row[2]);
                const tipoTela = normalizeText(row[3]);
                const cantidadOriginal = parseExcelNumber(row[4]);
                const fechaIngreso = formatExcelDate(row[5]);
                const cantidadContada = parseExcelNumber(row[6]);
                const taller = normalizeText(row[0]);

                const extraNumbers = row.slice(7).map((cell) => parseExcelNumber(cell)).filter((value) => value > 0);
                const cantidadEllos = extraNumbers[0] || 0;
                const fallado = extraNumbers[1] || 0;

                if (!articuloFabrica && !descripcion) return;

                importedConteos.push(buildConteoItem({
                    id: generateId(),
                    articuloFabrica: articuloFabrica || normalizeCode(descripcion),
                    articuloVenta: articuloFabrica || normalizeCode(descripcion),
                    descripcion,
                    tipoTela,
                    color: '',
                    fechaIngreso,
                    taller,
                    responsable: normalizedEmail === 'juan@celavie.com' ? 'Juan' : normalizedEmail === 'naara@celavie.com' ? 'Naara' : '',
                    cantidadOriginal,
                    cantidadContada,
                    cantidadEllos,
                    fallado,
                    createdAt: new Date().toISOString()
                }));
            });

            if (!importedConteos.length) {
                alert('No encontre filas validas para importar en ese Excel.');
                return;
            }

            upsertConteos(importedConteos);
            alert(`Se importaron o actualizaron ${importedConteos.length} filas desde Excel.`);
        } catch (error) {
            console.error('Error importando Excel de conteo:', error);
            alert(`No pude importar ese Excel: ${error.message}`);
        } finally {
            event.target.value = '';
        }
    };

    const handleCellChange = (id, field, value) => {
        const nextConteos = conteos.map((item) =>
            item.id === id
                ? buildConteoItem({
                    ...item,
                    [field]: ['articuloFabrica', 'articuloVenta'].includes(field)
                        ? normalizeCode(value)
                        : ['cantidadOriginal', 'cantidadContada', 'cantidadEllos', 'fallado'].includes(field)
                        ? toNumber(value)
                        : value
                })
                : item
        );
        saveConteos(nextConteos);
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
            return { ...item, [field]: value };
        });
        saveConteos(nextConteos);
    };

    const exportCsv = () => {
        const headers = ['Articulo fabrica', 'Articulo venta', 'Descripcion', 'Tipo tela', 'Color', 'Fecha ingreso', 'Taller', 'Responsable', 'Cantidad original', 'Cantidad contada', 'Cantidad ellos', 'Fallado', 'Chequeado', 'Comentario control', 'Diferencia'];
        const rows = conteos.map((item) => {
            const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
            return [
                item.articuloFabrica,
                item.articuloVenta,
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
        <div className="view-container" style={{ maxWidth: 1380, margin: '0 auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Boxes /> Conteo de Mercaderia
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 780 }}>
                        Ahora separamos articulo de fabrica y articulo de venta. El stock sincroniza por articulo de venta, mientras el codigo de fabrica queda guardado para produccion y control.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={!canEditInventoryRows}>
                        <Upload size={16} /> Importar Excel
                    </button>
                    <button className="btn btn-secondary" onClick={exportCsv}>
                        <Download size={16} /> Exportar CSV
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 20, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo fabrica</span><input className="form-input" placeholder="Codigo de fabrica" value={formData.articuloFabrica} onChange={(e) => setFormData((prev) => ({ ...prev, articuloFabrica: normalizeCode(e.target.value) }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo venta</span><input className="form-input" list="conteo-articulos-venta" placeholder="Codigo de venta" value={formData.articuloVenta} onChange={(e) => setFormData((prev) => autofillSaleArticle(e.target.value, prev))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Descripcion</span><input className="form-input" value={formData.descripcion} onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tela</span><input className="form-input" list="conteo-telas" value={formData.tipoTela} onChange={(e) => setFormData((prev) => ({ ...prev, tipoTela: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Color</span><input className="form-input" value={formData.color} onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fecha ingreso</span><input className="form-input" type="date" value={formData.fechaIngreso} onChange={(e) => setFormData((prev) => ({ ...prev, fechaIngreso: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Taller</span><input className="form-input" list="conteo-talleres" value={formData.taller} onChange={(e) => setFormData((prev) => ({ ...prev, taller: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Responsable</span><select className="form-input" value={formData.responsable} onChange={(e) => setFormData((prev) => ({ ...prev, responsable: e.target.value }))} disabled={!canEditInventoryRows}><option value="">Elegir responsable</option>{RESPONSABLES.map((responsable) => <option key={responsable} value={responsable}>{responsable}</option>)}</select></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cantidad original</span><input className="form-input" type="number" value={formData.cantidadOriginal} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadOriginal: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cantidad contada</span><input className="form-input" type="number" value={formData.cantidadContada} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadContada: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cantidad de ellos</span><input className="form-input" type="number" value={formData.cantidadEllos} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadEllos: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fallado</span><input className="form-input" type="number" value={formData.fallado} onChange={(e) => setFormData((prev) => ({ ...prev, fallado: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                </div>

                <datalist id="conteo-articulos-venta">{articleOptions.map((item) => <option key={item.articuloVenta} value={item.articuloVenta}>{item.descripcion}</option>)}</datalist>
                <datalist id="conteo-telas">{telasActivas.map((tela) => <option key={tela} value={tela} />)}</datalist>
                <datalist id="conteo-talleres">{talleres.map((taller) => <option key={taller} value={taller} />)}</datalist>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                    <input className="form-input" style={{ maxWidth: 420 }} placeholder="Buscar por articulo fabrica, venta, tela, descripcion, color o taller..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    <button className="btn btn-primary" onClick={handleAdd} disabled={!canEditInventoryRows}><Plus size={16} /> Agregar conteo</button>
                </div>
                {!canEditInventoryRows && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>Nadia solo controla: puede marcar chequeado y comentar, sin editar cantidades ni articulos.</div>}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
                {filteredConteos.map((item) => {
                    const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
                    const checked = Boolean(item.chequeado);
                    return (
                        <section key={item.id} style={getFormCardStyle(checked)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', fontSize: 12 }}><Factory size={14} /> Fab: {item.articuloFabrica || '-'}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', fontSize: 12 }}><ShoppingBag size={14} /> Venta: {item.articuloVenta || '-'}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: checked ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.16)', color: checked ? 'var(--success)' : '#ff7a7a', fontWeight: 700 }}>{checked ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}{checked ? 'Chequeado' : 'No chequeado'}</span>
                                </div>
                                <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(item.id)} disabled={!canEditInventoryRows}><Trash2 size={14} /></button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo fabrica</span><input className="form-input" value={item.articuloFabrica || ''} onChange={(e) => handleCellChange(item.id, 'articuloFabrica', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo venta</span><input className="form-input" list="conteo-articulos-venta" value={item.articuloVenta || ''} onChange={(e) => handleCellChange(item.id, 'articuloVenta', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6, gridColumn: 'span 2' }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Descripcion</span><input className="form-input" value={item.descripcion || ''} onChange={(e) => handleCellChange(item.id, 'descripcion', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tela</span><input className="form-input" list="conteo-telas" value={item.tipoTela || ''} onChange={(e) => handleCellChange(item.id, 'tipoTela', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Color</span><input className="form-input" value={item.color || ''} onChange={(e) => handleCellChange(item.id, 'color', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fecha ingreso</span><input className="form-input" type="date" value={item.fechaIngreso || ''} onChange={(e) => handleCellChange(item.id, 'fechaIngreso', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Taller</span><input className="form-input" list="conteo-talleres" value={item.taller || ''} onChange={(e) => handleCellChange(item.id, 'taller', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Responsable</span><select className="form-input" value={item.responsable || ''} onChange={(e) => handleCellChange(item.id, 'responsable', e.target.value)} disabled={!canEditInventoryRows}><option value="">Responsable</option>{RESPONSABLES.map((responsable) => <option key={responsable} value={responsable}>{responsable}</option>)}</select></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Original</span><input className="form-input" type="number" value={item.cantidadOriginal || 0} onChange={(e) => handleCellChange(item.id, 'cantidadOriginal', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Contada</span><input className="form-input" type="number" value={item.cantidadContada || 0} onChange={(e) => handleCellChange(item.id, 'cantidadContada', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ellos</span><input className="form-input" type="number" value={item.cantidadEllos || 0} onChange={(e) => handleCellChange(item.id, 'cantidadEllos', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fallado</span><input className="form-input" type="number" value={item.fallado || 0} onChange={(e) => handleCellChange(item.id, 'fallado', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <div style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Diferencia</span><div className="form-input" style={{ display: 'flex', alignItems: 'center', fontWeight: 700, color: diferencia < 0 ? '#ff7a7a' : 'var(--success)' }}>{diferencia}</div></div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 12, marginTop: 14 }}>
                                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.05)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: checked ? 'var(--success)' : '#ff7a7a' }}>
                                        <input type="checkbox" checked={checked} onChange={(e) => handleControlChange(item.id, 'chequeado', e.target.checked)} disabled={!(isNadiaController || user?.role === 'admin')} />
                                        {checked ? 'Chequeado en verde' : 'No chequeado en rojo'}
                                    </label>
                                    {item.chequeadoPor && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Revisado por {item.chequeadoPor}</div>}
                                </div>
                                <label style={{ display: 'grid', gap: 6 }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Comentarios de control</span>
                                    <textarea className="form-input" rows={3} value={item.comentarioControl || ''} onChange={(e) => handleControlChange(item.id, 'comentarioControl', e.target.value)} disabled={!(isNadiaController || user?.role === 'admin')} style={{ resize: 'vertical', minHeight: 90 }} />
                                </label>
                            </div>
                        </section>
                    );
                })}

                {filteredConteos.length === 0 && <div className="glass-panel" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No hay conteos cargados todavia.</div>}
            </div>
        </div>
    );
}
