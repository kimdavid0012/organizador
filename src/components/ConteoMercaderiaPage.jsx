import React, { useMemo, useRef, useState } from 'react';
import { Boxes, Plus, Trash2, Download, Upload, CheckCircle2, CircleAlert, Factory, ShoppingBag, Search, X } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId, getProductThumb } from '../utils/helpers';
import * as XLSX from 'xlsx';

const EMPTY_FORM = {
    articuloFabrica: '',
    articuloVenta: '',
    descripcion: '',
    tipoTela: '',
    color: '',
    numeroCorte: '',
    fechaIngreso: '',
    taller: '',
    responsable: '',
    cantidadOriginal: '',
    cantidadContada: '',
    cantidadEllos: '',
    fallado: '',
    trajoMuestra: false
};

const RESPONSABLES = ['Juan', 'Naara'];

const toNumber = (value) => Number.parseInt(value || 0, 10) || 0;
const normalizeCode = (value) => (value || '').toString().trim().toUpperCase();
const normalizeText = (value) => (value || '').toString().trim();
const extractCorteNumber = (value) => {
    const raw = normalizeText(value);
    if (!raw) return '';
    const match = raw.match(/(\d+)/);
    return match ? match[1] : raw.toUpperCase();
};

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
    const { state, saveMercaderiaConteos, updateConfig } = useData();
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
    const isNaaraController = normalizedEmail === 'naara@celavie.com';
    const canEditInventoryRows = user?.role === 'admin' || normalizedEmail === 'naara@celavie.com' || normalizedEmail === 'juan@celavie.com';
    const canMarkConteoChecked = isNadiaController || isNaaraController || user?.role === 'admin';

    const articleOptions = useMemo(() => {
        const mergedOptions = [];
        const mergeOption = (incomingOption) => {
            const articuloVenta = normalizeCode(incomingOption.articuloVenta);
            const articuloFabrica = normalizeCode(incomingOption.articuloFabrica);
            const descripcion = normalizeText(incomingOption.descripcion);
            const proveedor = normalizeText(incomingOption.proveedor);
            const stock = toNumber(incomingOption.stock);
            const numeroCorte = extractCorteNumber(incomingOption.numeroCorte);
            const fechaIngreso = normalizeText(incomingOption.fechaIngreso);

            const existingIndex = mergedOptions.findIndex((option) =>
                (articuloVenta && (option.articuloVenta === articuloVenta || option.articuloFabrica === articuloVenta)) ||
                (articuloFabrica && (option.articuloVenta === articuloFabrica || option.articuloFabrica === articuloFabrica))
            );

            if (existingIndex >= 0) {
                const current = mergedOptions[existingIndex];
                mergedOptions[existingIndex] = {
                    articuloVenta: current.articuloVenta || articuloVenta || articuloFabrica,
                    articuloFabrica: current.articuloFabrica || articuloFabrica || articuloVenta,
                    descripcion: current.descripcion || descripcion || articuloVenta || articuloFabrica,
                    stock: current.stock || stock,
                    proveedor: current.proveedor || proveedor,
                    numeroCorte: current.numeroCorte || numeroCorte,
                    fechaIngreso: current.fechaIngreso || fechaIngreso
                };
                return;
            }

            mergedOptions.push({
                articuloVenta: articuloVenta || articuloFabrica,
                articuloFabrica: articuloFabrica || articuloVenta,
                descripcion: descripcion || articuloVenta || articuloFabrica,
                stock,
                proveedor,
                numeroCorte,
                fechaIngreso
            });
        };

        productos.forEach((producto) => {
            const saleCode = normalizeCode(producto.codigoInterno);
            if (!saleCode) return;
            mergeOption({
                articuloVenta: saleCode,
                articuloFabrica: saleCode,
                descripcion: producto.detalleCorto || producto.detalleLargo || saleCode,
                stock: toNumber(producto.stock),
                proveedor: producto.proveedor || '',
                numeroCorte: '',
                fechaIngreso: ''
            });
        });

        cortes.forEach((corte) => {
            const numeroCorte = extractCorteNumber(corte?.nombre);
            const fechaIngreso = normalizeText(corte?.fecha);
            (corte.moldesData || []).forEach((moldeData) => {
                const molde = state.moldes.find((item) => item.id === moldeData.id);
                const articleFactory = normalizeCode(molde?.codigo || molde?.nombre);
                if (!articleFactory) return;
                mergeOption({
                    articuloVenta: '',
                    articuloFabrica: articleFactory,
                    descripcion: molde?.nombre || articleFactory,
                    stock: toNumber(moldeData.cantidad),
                    proveedor: moldeData.tallerAsignado || '',
                    numeroCorte,
                    fechaIngreso
                });
            });
        });

        conteos.forEach((conteo) => {
            mergeOption({
                articuloVenta: conteo.articuloVenta || conteo.codigoInterno,
                articuloFabrica: conteo.articuloFabrica || conteo.articulo,
                descripcion: conteo.descripcion,
                stock: conteo.cantidadContada,
                proveedor: conteo.taller,
                numeroCorte: conteo.numeroCorte,
                fechaIngreso: conteo.fechaIngreso
            });
        });

        return mergedOptions.sort((a, b) => (a.articuloVenta || a.articuloFabrica).localeCompare(b.articuloVenta || b.articuloFabrica));
    }, [productos, cortes, conteos, state.moldes]);

    const findLinkedArticleByAnyCode = (rawCode) => {
        const normalizedCode = normalizeCode(rawCode);
        if (!normalizedCode) return null;
        return articleOptions.find((item) => item.articuloVenta === normalizedCode || item.articuloFabrica === normalizedCode) || null;
    };

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
                item.numeroCorte,
                item.taller,
                item.responsable
            ].some((value) => (value || '').toLowerCase().includes(q))
        );
    }, [conteos, search]);

    const saveConteos = (nextConteos) => {
        saveMercaderiaConteos(nextConteos);
    };

    const STOCK_DEDUCTIONS = {
        '6000': 550, '6001': 817, '6002': 842, '6003': 318,
        '6004': 575, '6005': null,
        '6007': 10, '6008': 199, '6009': 205, '6010': 120,
        '6011': 105, '6200': 206, '6201': 115, '6202': 340,
        '6203': 308, '6204': 267, '6205': 215,
        '6206': 98, '6207': 29, '6208': 100, '6209': 209,
        '6210': 35, '6211': 14, '6212': 27, '6213': 15,
        '6300': 201, '6300B': 36, '6302': 203, '6303': 330,
        '6304': 373, '6305': 49, '6306': 36, '6307': 30,
        '6308': 168, '6309': 160, '6310': 32
    };

    const handleApplyStockAjuste = () => {
        if (state.config?.stockAjusteAplicado) {
            alert('[AJUSTE APLICADO] Este ajuste ya fue aplicado anteriormente.');
            return;
        }
        if (!window.confirm('¿Aplicar ajuste de ventas al stock? Esta acción descuenta las unidades vendidas del conteo actual y no se puede revertir fácilmente.')) return;

        const updated = conteos.map(item => {
            const codeV = normalizeCode(item.articuloVenta);
            const codeF = normalizeCode(item.articuloFabrica);
            const matchedCode = Object.keys(STOCK_DEDUCTIONS).find(c => normalizeCode(c) === codeV || normalizeCode(c) === codeF);
            if (!matchedCode) return item;

            const deduction = STOCK_DEDUCTIONS[matchedCode];
            // Special case 6005: set to 957 total
            if (matchedCode === '6005') {
                return { ...item, cantidadContada: 957 };
            }
            const current = toNumber(item.cantidadContada);
            const next = current - (deduction || 0);
            // 6205 and 6310: if negative, set to 0
            if ((matchedCode === '6205' || matchedCode === '6310') && next < 0) {
                return { ...item, cantidadContada: 0 };
            }
            return { ...item, cantidadContada: Math.max(0, next) };
        });

        saveMercaderiaConteos(updated);
        updateConfig({ stockAjusteAplicado: true });
        alert('Ajuste de ventas aplicado correctamente al stock.');
    };

    const buildConteoItem = (baseItem) => {
        const linkedArticle =
            findLinkedArticleByAnyCode(baseItem.articuloVenta) ||
            findLinkedArticleByAnyCode(baseItem.articuloFabrica) ||
            findLinkedArticleByAnyCode(baseItem.codigoInterno) ||
            findLinkedArticleByAnyCode(baseItem.articulo);
        const hasArticuloVenta = Object.prototype.hasOwnProperty.call(baseItem, 'articuloVenta');
        const hasArticuloFabrica = Object.prototype.hasOwnProperty.call(baseItem, 'articuloFabrica');
        const hasDescripcion = Object.prototype.hasOwnProperty.call(baseItem, 'descripcion');
        const hasNumeroCorte = Object.prototype.hasOwnProperty.call(baseItem, 'numeroCorte');
        const hasFechaIngreso = Object.prototype.hasOwnProperty.call(baseItem, 'fechaIngreso');
        const hasTaller = Object.prototype.hasOwnProperty.call(baseItem, 'taller');
        const hasCantidadOriginal = Object.prototype.hasOwnProperty.call(baseItem, 'cantidadOriginal');

        const articuloVenta = normalizeCode(
            hasArticuloVenta
                ? baseItem.articuloVenta
                : (linkedArticle?.articuloVenta ?? baseItem.codigoInterno ?? linkedArticle?.articuloFabrica ?? '')
        );
        const articuloFabrica = normalizeCode(
            hasArticuloFabrica
                ? baseItem.articuloFabrica
                : (linkedArticle?.articuloFabrica ?? baseItem.articulo ?? articuloVenta)
        );
        return {
            ...baseItem,
            productId: baseItem.productId || productos.find((producto) => normalizeCode(producto.codigoInterno) === articuloVenta)?.id || null,
            codigoInterno: articuloVenta,
            articulo: articuloFabrica,
            articuloFabrica,
            articuloVenta,
            descripcion: hasDescripcion
                ? normalizeText(baseItem.descripcion)
                : (normalizeText(linkedArticle?.descripcion) || articuloVenta || articuloFabrica),
            tipoTela: normalizeText(baseItem.tipoTela),
            color: normalizeText(baseItem.color),
            numeroCorte: hasNumeroCorte
                ? extractCorteNumber(baseItem.numeroCorte)
                : extractCorteNumber(linkedArticle?.numeroCorte),
            fechaIngreso: hasFechaIngreso
                ? normalizeText(baseItem.fechaIngreso)
                : normalizeText(linkedArticle?.fechaIngreso),
            taller: hasTaller
                ? normalizeText(baseItem.taller)
                : normalizeText(linkedArticle?.proveedor || ''),
            responsable: normalizeText(baseItem.responsable),
            cantidadOriginal: hasCantidadOriginal
                ? toNumber(baseItem.cantidadOriginal)
                : toNumber(linkedArticle?.stock),
            cantidadContada: toNumber(baseItem.cantidadContada),
            cantidadEllos: toNumber(baseItem.cantidadEllos),
            fallado: toNumber(baseItem.fallado),
            trajoMuestra: Boolean(baseItem.trajoMuestra),
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
                    extractCorteNumber(item.numeroCorte),
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
                extractCorteNumber(item.numeroCorte),
                normalizeText(item.fechaIngreso)
            ].join('|');
            const previous = existingMap.get(key);
            existingMap.set(key, previous ? { ...previous, ...item, id: previous.id } : item);
        });

        saveConteos(Array.from(existingMap.values()));
    };

    const syncArticleFields = (field, rawValue, currentForm = formData) => {
        const normalizedValue = normalizeCode(rawValue);
        const linkedArticle = findLinkedArticleByAnyCode(normalizedValue);
        const nextArticuloVenta = field === 'articuloVenta'
            ? normalizedValue
            : normalizeCode(currentForm.articuloVenta || linkedArticle?.articuloVenta || '');
        const nextArticuloFabrica = field === 'articuloFabrica'
            ? normalizedValue
            : normalizeCode(currentForm.articuloFabrica || linkedArticle?.articuloFabrica || '');

        return {
            ...currentForm,
            articuloVenta: linkedArticle?.articuloVenta || nextArticuloVenta || nextArticuloFabrica,
            articuloFabrica: linkedArticle?.articuloFabrica || nextArticuloFabrica || nextArticuloVenta,
            descripcion: currentForm.descripcion || linkedArticle?.descripcion || '',
            numeroCorte: currentForm.numeroCorte || linkedArticle?.numeroCorte || '',
            fechaIngreso: currentForm.fechaIngreso || linkedArticle?.fechaIngreso || '',
            taller: currentForm.taller || linkedArticle?.proveedor || '',
            cantidadOriginal: currentForm.cantidadOriginal || (linkedArticle ? String(linkedArticle.stock) : '')
        };
    };

    const handleAdd = () => {
        const articuloVenta = normalizeCode(formData.articuloVenta);
        const articuloFabrica = normalizeCode(formData.articuloFabrica);
        if (!articuloVenta && !articuloFabrica) {
            alert('Tenes que cargar el art de local o el art de fabrica.');
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

    // Add and keep article data — only clear color + quantities for fast multi-color entry
    const handleAddAndContinue = () => {
        const articuloVenta = normalizeCode(formData.articuloVenta);
        const articuloFabrica = normalizeCode(formData.articuloFabrica);
        if (!articuloVenta && !articuloFabrica) {
            alert('Tenes que cargar el art de local o el art de fabrica.');
            return;
        }
        if (!normalizeText(formData.color)) {
            alert('Poné el color para agregar.');
            return;
        }

        const newItem = buildConteoItem({
            id: generateId(),
            ...formData,
            responsable: formData.responsable || (normalizedEmail === 'juan@celavie.com' ? 'Juan' : normalizedEmail === 'naara@celavie.com' ? 'Naara' : ''),
            createdAt: new Date().toISOString()
        });

        saveConteos([newItem, ...conteos]);
        // Keep article fields, clear only color + quantities
        setFormData(prev => ({
            ...prev,
            color: '',
            cantidadOriginal: '',
            cantidadContada: '',
            cantidadEllos: '',
            fallado: '',
            trajoMuestra: false
        }));
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
                    numeroCorte: '',
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
                        : field === 'numeroCorte'
                        ? extractCorteNumber(value)
                        : field === 'trajoMuestra'
                        ? Boolean(value)
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
        const headers = ['Articulo fabrica', 'Articulo venta', 'Descripcion', 'Tipo tela', 'Color', 'Numero corte', 'Fecha ingreso', 'Taller', 'Responsable', 'Cantidad original', 'Cantidad contada', 'Cantidad ellos', 'Fallado', 'Trajo muestra', 'Chequeado', 'Comentario control', 'Diferencia'];
        const rows = conteos.map((item) => {
            const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
            return [
                item.articuloFabrica,
                item.articuloVenta,
                item.descripcion,
                item.tipoTela,
                item.color,
                item.numeroCorte,
                item.fechaIngreso,
                item.taller,
                item.responsable,
                item.cantidadOriginal,
                item.cantidadContada,
                item.cantidadEllos,
                item.fallado,
                item.trajoMuestra ? 'SI' : 'NO',
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
        <div className="view-container conteo-page" style={{ maxWidth: 1380, margin: '0 auto', padding: 20 }}>
            <div className="conteo-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Boxes /> Conteo de Mercaderia
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: 780 }}>
                        Ahora separamos articulo de fabrica y articulo de venta. Tambien guardamos numero de corte, taller y fecha de ingreso para que el dashboard pueda seguir la trazabilidad productiva.
                    </p>
                </div>
                <div className="conteo-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={!canEditInventoryRows}>
                        <Upload size={16} /> Importar Excel
                    </button>
                    <button className="btn btn-secondary" onClick={exportCsv}>
                        <Download size={16} /> Exportar CSV
                    </button>
                    {user?.role === 'admin' && (
                        <button
                            className="btn btn-danger"
                            onClick={handleApplyStockAjuste}
                            disabled={Boolean(state.config?.stockAjusteAplicado)}
                            title={state.config?.stockAjusteAplicado ? '[AJUSTE APLICADO]' : 'Aplicar deducción de unidades vendidas'}
                        >
                            <Boxes size={16} /> {state.config?.stockAjusteAplicado ? 'Ajuste aplicado' : 'Aplicar ajuste de ventas'}
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 20, marginBottom: 20 }}>
                <div className="conteo-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo fabrica</span><input className="form-input" list="conteo-articulos-fabrica" placeholder="Codigo de fabrica" value={formData.articuloFabrica} onChange={(e) => setFormData((prev) => syncArticleFields('articuloFabrica', e.target.value, prev))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo venta</span><input className="form-input" list="conteo-articulos-venta" placeholder="Codigo de venta" value={formData.articuloVenta} onChange={(e) => setFormData((prev) => syncArticleFields('articuloVenta', e.target.value, prev))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Descripcion</span><input className="form-input" value={formData.descripcion} onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tela</span><input className="form-input" list="conteo-telas" value={formData.tipoTela} onChange={(e) => setFormData((prev) => ({ ...prev, tipoTela: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Color</span><input className="form-input" value={formData.color} onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Numero de corte</span><input className="form-input" list="conteo-cortes" value={formData.numeroCorte} onChange={(e) => setFormData((prev) => ({ ...prev, numeroCorte: extractCorteNumber(e.target.value) }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fecha ingreso</span><input className="form-input" type="date" value={formData.fechaIngreso} onChange={(e) => setFormData((prev) => ({ ...prev, fechaIngreso: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Taller</span><input className="form-input" list="conteo-talleres" value={formData.taller} onChange={(e) => setFormData((prev) => ({ ...prev, taller: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Responsable</span><select className="form-input" value={formData.responsable} onChange={(e) => setFormData((prev) => ({ ...prev, responsable: e.target.value }))} disabled={!canEditInventoryRows}><option value="">Elegir responsable</option>{RESPONSABLES.map((responsable) => <option key={responsable} value={responsable}>{responsable}</option>)}</select></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cantidad original</span><input className="form-input" type="number" value={formData.cantidadOriginal} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadOriginal: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cantidad contada</span><input className="form-input" type="number" value={formData.cantidadContada} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadContada: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cantidad de ellos</span><input className="form-input" type="number" value={formData.cantidadEllos} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadEllos: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fallado</span><input className="form-input" type="number" value={formData.fallado} onChange={(e) => setFormData((prev) => ({ ...prev, fallado: e.target.value }))} disabled={!canEditInventoryRows} /></label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, paddingTop: 22 }}><input type="checkbox" checked={Boolean(formData.trajoMuestra)} onChange={(e) => setFormData((prev) => ({ ...prev, trajoMuestra: e.target.checked }))} disabled={!canEditInventoryRows} /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Taller trajo muestra</span></label>
                </div>

                <datalist id="conteo-articulos-venta">{articleOptions.filter((item) => item.articuloVenta).map((item) => <option key={`venta-${item.articuloVenta}`} value={item.articuloVenta}>{item.descripcion}</option>)}</datalist>
                <datalist id="conteo-articulos-fabrica">{articleOptions.filter((item) => item.articuloFabrica).map((item) => <option key={`fabrica-${item.articuloFabrica}`} value={item.articuloFabrica}>{item.descripcion}</option>)}</datalist>
                <datalist id="conteo-cortes">{cortes.map((corte) => { const numero = extractCorteNumber(corte?.nombre); return numero ? <option key={corte.id || numero} value={numero}>{corte.nombre}</option> : null; })}</datalist>
                <datalist id="conteo-telas">{telasActivas.map((tela) => <option key={tela} value={tela} />)}</datalist>
                <datalist id="conteo-talleres">{talleres.map((taller) => <option key={taller} value={taller} />)}</datalist>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={handleAdd} disabled={!canEditInventoryRows}><Plus size={16} /> Agregar conteo</button>
                    <button className="btn btn-secondary" onClick={handleAddAndContinue} disabled={!canEditInventoryRows} style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <Plus size={16} /> Agregar + otro color
                    </button>
                </div>
                {!canEditInventoryRows && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>Nadia solo controla: puede marcar chequeado y comentar, sin editar cantidades ni articulos.</div>}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
                <div className="glass-panel" style={{ padding: 18, display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontWeight: 'var(--fw-semibold)' }}>Buscador de articulos cargados</div>
                            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                                Busca un articulo para ver enseguida si Naara/Nadia lo confirmo, si esta chequeado y su detalle.
                            </div>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            {search ? `${filteredConteos.length} resultados para "${search}"` : `${conteos.length} conteos cargados`}
                        </div>
                    </div>
                    <div className="conteo-top-search" style={{ position: 'relative', width: '100%' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            className="form-input"
                            style={{ paddingLeft: 38, paddingRight: search ? 42 : 12 }}
                            placeholder="Buscar articulo para revisar si fue confirmado o chequeado..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Limpiar busqueda"
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer' }}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {filteredConteos.map((item) => {
                    const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
                    const checked = Boolean(item.chequeado);
                    return (
                        <section key={item.id} style={getFormCardStyle(checked)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                                <div className="conteo-chip-row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    {(() => {
                                        const thumb = getProductThumb(item.articuloVenta || item.articuloFabrica, productos);
                                        return thumb
                                            ? <img src={thumb} alt={item.descripcion || ''} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                                            : <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.05)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-muted)' }}>Sin foto</div>;
                                    })()}
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', fontSize: 12 }}><Factory size={14} /> Fab: {item.articuloFabrica || '-'}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', fontSize: 12 }}><ShoppingBag size={14} /> Venta: {item.articuloVenta || '-'}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: checked ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.16)', color: checked ? 'var(--success)' : '#ff7a7a', fontWeight: 700 }}>{checked ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}{checked ? 'Chequeado' : 'No chequeado'}</span>
                                </div>
                                <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(item.id)} disabled={!canEditInventoryRows}><Trash2 size={14} /></button>
                            </div>

                            <div className="conteo-item-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo fabrica</span><input className="form-input" list="conteo-articulos-fabrica" value={item.articuloFabrica || ''} onChange={(e) => handleCellChange(item.id, 'articuloFabrica', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Articulo venta</span><input className="form-input" list="conteo-articulos-venta" value={item.articuloVenta || ''} onChange={(e) => handleCellChange(item.id, 'articuloVenta', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6, gridColumn: 'span 2' }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Descripcion</span><input className="form-input" value={item.descripcion || ''} onChange={(e) => handleCellChange(item.id, 'descripcion', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tela</span><input className="form-input" list="conteo-telas" value={item.tipoTela || ''} onChange={(e) => handleCellChange(item.id, 'tipoTela', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Color</span><input className="form-input" value={item.color || ''} onChange={(e) => handleCellChange(item.id, 'color', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Numero de corte</span><input className="form-input" list="conteo-cortes" value={item.numeroCorte || ''} onChange={(e) => handleCellChange(item.id, 'numeroCorte', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fecha ingreso</span><input className="form-input" type="date" value={item.fechaIngreso || ''} onChange={(e) => handleCellChange(item.id, 'fechaIngreso', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Taller</span><input className="form-input" list="conteo-talleres" value={item.taller || ''} onChange={(e) => handleCellChange(item.id, 'taller', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Responsable</span><select className="form-input" value={item.responsable || ''} onChange={(e) => handleCellChange(item.id, 'responsable', e.target.value)} disabled={!canEditInventoryRows}><option value="">Responsable</option>{RESPONSABLES.map((responsable) => <option key={responsable} value={responsable}>{responsable}</option>)}</select></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Original</span><input className="form-input" type="number" value={item.cantidadOriginal || 0} onChange={(e) => handleCellChange(item.id, 'cantidadOriginal', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Contada</span><input className="form-input" type="number" value={item.cantidadContada || 0} onChange={(e) => handleCellChange(item.id, 'cantidadContada', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ellos</span><input className="form-input" type="number" value={item.cantidadEllos || 0} onChange={(e) => handleCellChange(item.id, 'cantidadEllos', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fallado</span><input className="form-input" type="number" value={item.fallado || 0} onChange={(e) => handleCellChange(item.id, 'fallado', e.target.value)} disabled={!canEditInventoryRows} /></label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, paddingTop: 22 }}><input type="checkbox" checked={Boolean(item.trajoMuestra)} onChange={(e) => handleCellChange(item.id, 'trajoMuestra', e.target.checked)} disabled={!canEditInventoryRows} /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Trajo muestra</span></label>
                                <div style={{ display: 'grid', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Diferencia</span><div className="form-input" style={{ display: 'flex', alignItems: 'center', fontWeight: 700, color: diferencia < 0 ? '#ff7a7a' : 'var(--success)' }}>{diferencia}</div></div>
                            </div>

                            <div className="conteo-control-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 12, marginTop: 14 }}>
                                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.05)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: checked ? 'var(--success)' : '#ff7a7a' }}>
                                        <input type="checkbox" checked={checked} onChange={(e) => handleControlChange(item.id, 'chequeado', e.target.checked)} disabled={!canMarkConteoChecked} />
                                        {checked ? 'Chequeado en verde' : 'No chequeado en rojo'}
                                    </label>
                                    {item.chequeadoPor && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Revisado por {item.chequeadoPor}</div>}
                                </div>
                                <label style={{ display: 'grid', gap: 6 }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Comentarios de control</span>
                                    <textarea className="form-input" rows={3} value={item.comentarioControl || ''} onChange={(e) => handleControlChange(item.id, 'comentarioControl', e.target.value)} disabled={!canMarkConteoChecked} style={{ resize: 'vertical', minHeight: 90 }} />
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
