import React, { useState, useRef, useEffect } from 'react';
import { Plus, Edit2, Trash2, Upload, Search, FileSpreadsheet, CheckSquare, Square } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { useAuth } from '../../store/AuthContext';
import { generateId, getProductThumb } from '../../utils/helpers';
import * as XLSX from 'xlsx';
import './PosProductos.css';

const DEFAULT_PRODUCT = {
    articuloVenta: '',
    articuloFabrica: '',
    codigoInterno: '',
    codigoBarras: '',
    detalleCorto: '',
    detalleLargo: '',
    moneda: 'PESOS',
    proveedor: 'Genérico',
    precioCosto: 0,
    alertaStockMinimo: 0,
    precioVentaL1: 0,
    precioVentaL2: 0,
    precioVentaL3: 0,
    precioVentaL4: 0,
    precioVentaL5: 0,
    precioVentaWeb: 0,
    activo: true,
    stock: 0
};

export default function PosProductos() {
    const { state, addPosProduct, updatePosProduct, deletePosProduct, bulkDeletePosProducts, importPosProducts, fetchWooProducts } = useData();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const canEdit = isAdmin || user?.role === 'encargada';
    const productos = state.config.posProductos || [];

    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState(DEFAULT_PRODUCT);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);

    const fileInputRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);
    const [importingWoo, setImportingWoo] = useState(false);
    const [editingStockId, setEditingStockId] = useState(null);
    const [editingStockValue, setEditingStockValue] = useState('');
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const formatCurrency = (value) => {
        const amount = Number(value || 0);
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const extractNumericCode = (value) => {
        const match = (value || '').match(/(\d+)/);
        return match ? match[1] : '';
    };

    const filteredProducts = productos.filter(p => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        const artVenta = (p.articuloVenta || p.codigoInterno || '').toLowerCase();
        const numericPart = extractNumericCode(p.articuloVenta || p.codigoInterno);
        return artVenta.includes(q) ||
            numericPart.includes(q) ||
            (p.detalleCorto || '').toLowerCase().includes(q) ||
            (p.articuloFabrica || '').toLowerCase().includes(q) ||
            extractNumericCode(p.articuloFabrica).includes(q) ||
            (p.codigoBarras || '').toLowerCase().includes(q);
    }).sort((a, b) => {
        const numA = parseInt(extractNumericCode(a.articuloVenta || a.codigoInterno), 10) || Infinity;
        const numB = parseInt(extractNumericCode(b.articuloVenta || b.codigoInterno), 10) || Infinity;
        return numA - numB;
    });

    // --- Inline Stock Edit ---
    const startEditingStock = (product) => {
        setEditingStockId(product.id);
        setEditingStockValue(String(product.stock || 0));
    };
    const saveEditingStock = () => {
        if (editingStockId) {
            const newStock = Math.max(0, parseInt(editingStockValue, 10) || 0);
            updatePosProduct(editingStockId, { stock: newStock });
            setEditingStockId(null);
            setEditingStockValue('');
        }
    };
    const handleStockKeyDown = (e) => {
        if (e.key === 'Enter') saveEditingStock();
        if (e.key === 'Escape') { setEditingStockId(null); setEditingStockValue(''); }
    };

    // --- Product Modal ---
    const handleOpenModal = (product = null) => {
        if (product) {
            setEditingProduct(product.id);
            setFormData({
                ...DEFAULT_PRODUCT,
                ...product,
                articuloVenta: product.articuloVenta || product.codigoInterno || '',
                articuloFabrica: product.articuloFabrica || ''
            });
        } else {
            setEditingProduct(null);
            const localCode = generateId().slice(0, 6).toUpperCase();
            setFormData({ ...DEFAULT_PRODUCT, codigoInterno: localCode, articuloVenta: localCode });
        }
        setIsModalOpen(true);
    };

    const handleSaveProduct = () => {
        if (!formData.detalleCorto.trim()) {
            alert("El detalle corto es obligatorio.");
            return;
        }

        const productPayload = {
            ...formData,
            codigoInterno: (formData.articuloVenta || formData.codigoInterno || '').toString().trim().toUpperCase(),
            articuloVenta: (formData.articuloVenta || formData.codigoInterno || '').toString().trim().toUpperCase(),
            articuloFabrica: (formData.articuloFabrica || '').toString().trim().toUpperCase()
        };

        if (editingProduct) {
            updatePosProduct(editingProduct, productPayload);
        } else {
            addPosProduct({ ...productPayload, id: generateId() });
        }
        setIsModalOpen(false);
    };

    const handleDelete = (id) => {
        if (window.confirm("¿Estás seguro de eliminar este producto?")) {
            deletePosProduct(id);
        }
    };

    // --- Multi-select / Bulk delete ---
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredProducts.map(p => p.id)));
        }
    };
    const handleBulkDeleteConfirm = () => {
        bulkDeletePosProducts(Array.from(selectedIds));
        setSelectedIds(new Set());
        setShowBulkConfirm(false);
    };

    const handleActivateAll = () => {
        const inactivos = productos.filter(p => !p.activo);
        if (inactivos.length === 0) {
            alert('Todos los artículos ya están activos.');
            return;
        }
        if (window.confirm(`¿Activar ${inactivos.length} artículos inactivos?`)) {
            inactivos.forEach(p => updatePosProduct(p.id, { activo: true }));
            alert(`✅ Se activaron ${inactivos.length} artículos.`);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
        }));
    };

    // --- Excel Import ---
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processExcel(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            processExcel(e.target.files[0]);
        }
    };

    const processExcel = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    alert("El archivo Excel está vacío.");
                    return;
                }

                // Parser flexible para precio (maneja "$", puntos y comas)
                const parsePrecio = (val) => {
                    if (!val && val !== 0) return 0;
                    const str = val.toString().replace(/\$\s*/g, '').replace(/\./g, '').replace(/,/g, '.');
                    const parsed = parseFloat(str);
                    return isNaN(parsed) ? 0 : parsed;
                };

                const newProducts = json.map(row => {
                    // Buscar el artículo (número) y descripción en distintos nombres de columna
                    const artNum = (row['ART'] || row['Articulo'] || row['Art'] || row['Código Interno'] || row['Codigo'] || '').toString();
                    const localCode = artNum || generateId().slice(0, 6).toUpperCase();
                    const descripcion = (row['DESCRIPCION'] || row['Descripcion'] || row['Detalle'] || row['Nombre'] || 'Sin nombre').toString().trim();
                    const taller = (row['TALLER'] || row['Taller'] || '').toString();
                    const tela = (row['TELA'] || row['Tela'] || row['Proveedor'] || '').toString();
                    const precio = parsePrecio(row['PRECIO'] || row['Precio'] || row['L1'] || row['Precio L1'] || 0);

                    return {
                        id: generateId(),
                        codigoInterno: localCode,
                        articuloVenta: localCode,
                        articuloFabrica: (row['Art Fabrica'] || row['Artículo Fábrica'] || row['Art. Fabrica'] || '').toString().trim().toUpperCase(),
                        codigoBarras: (row['Código Barras'] || row['CodBarras'] || '').toString(),
                        detalleCorto: descripcion || 'Sin nombre',
                        detalleLargo: tela ? `Tela: ${tela}` : '',
                        moneda: 'PESOS',
                        proveedor: taller || 'Genérico',
                        precioCosto: 0,
                        alertaStockMinimo: 0,
                        precioVentaL1: precio,
                        precioVentaL2: Number(row['L2'] || row['Precio L2'] || 0),
                        precioVentaL3: Number(row['L3'] || row['Precio L3'] || 0),
                        precioVentaL4: Number(row['L4'] || row['Precio L4'] || 0),
                        precioVentaL5: Number(row['L5'] || row['Precio L5'] || 0),
                        precioVentaWeb: Number(row['Web'] || row['Precio Web'] || 0),
                        activo: row['Activo'] !== 'NO' && row['Activo'] !== false,
                        stock: Number(row['Stock'] || row['Cantidad'] || 0)
                    };
                });

                importPosProducts(newProducts);
                alert(`✅ Se importaron ${newProducts.length} productos correctamente.`);
                setIsExcelModalOpen(false);
            } catch (error) {
                console.error(error);
                alert("Hubo un error al leer el archivo Excel. Asegúrate de que sea un archivo .xlsx válido.");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleImportFromWeb = async () => {
        setImportingWoo(true);
        try {
            const stats = await fetchWooProducts();
            alert(`✅ Sync completado: ${stats.newCount} productos nuevos agregados, ${stats.preservedCount} existentes preservados (stock y precios no se sobreescriben).`);
        } catch (error) {
            console.error(error);
            alert(`❌ Error al importar artículos desde la web: ${error.message}`);
        } finally {
            setImportingWoo(false);
        }
    };

    return (
        <div className="pos-productos">
            <div className="pos-header-actions">
                <div className="pos-search">
                    <Search className="pos-search-icon" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por código o detalle..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="pos-btn-group">
                    <button className="btn btn-secondary" onClick={handleActivateAll}>
                        ✅ Activar Todos
                    </button>
                    {state.config.marketing?.wooUrl && (
                        <button className="btn btn-secondary" onClick={handleImportFromWeb} disabled={importingWoo}>
                            <Upload size={16} /> {importingWoo ? 'Importando Web...' : 'Importar de la Web'}
                        </button>
                    )}
                    <button className="btn btn-secondary" onClick={() => setIsExcelModalOpen(true)}>
                        <FileSpreadsheet size={16} /> Importar Excel
                    </button>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={16} /> Nuevo Producto
                    </button>
                </div>
            </div>

            {!isMobile && (
            <div className="pos-table-container">
                <table className="pos-table">
                    <thead>
                        <tr>
                            {canEdit && (
                                <th style={{ width: 40, paddingRight: 0 }}>
                                    <input
                                        type="checkbox"
                                        className="bulk-checkbox"
                                        checked={isAllSelected}
                                        onChange={toggleSelectAll}
                                        title="Seleccionar todos"
                                    />
                                </th>
                            )}
                            <th>Art. Local</th>
                            <th>Art. Fabrica</th>
                            <th>Barras</th>
                            <th>Detalle</th>
                            <th>Stock</th>
                            <th>Pr. Costo</th>
                            <th>Lista 1</th>
                            <th>Lista 2</th>
                            <th>Lista 3</th>
                            <th>Estado</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map(p => (
                            <tr key={p.id} className={`pos-table-row${selectedIds.has(p.id) ? ' row-selected' : ''}`}>
                                {canEdit && (
                                    <td style={{ paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="bulk-checkbox"
                                            checked={selectedIds.has(p.id)}
                                            onChange={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                                        />
                                    </td>
                                )}
                                <td style={{ fontWeight: 'bold' }}>{p.articuloVenta || p.codigoInterno}</td>
                                <td>{p.articuloFabrica || '-'}</td>
                                <td>{p.codigoBarras || '-'}</td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 10,
                                            overflow: 'hidden',
                                            background: 'rgba(255,255,255,0.05)',
                                            flexShrink: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {(() => { const t = getProductThumb(p.codigoInterno, productos); return t ? <img src={t} alt={p.detalleCorto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sin foto</span>; })()}
                                        </div>
                                        <span>{p.detalleCorto}</span>
                                    </div>
                                </td>
                                <td>
                                    {editingStockId === p.id ? (
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={editingStockValue}
                                            onChange={(e) => setEditingStockValue(e.target.value)}
                                            onBlur={saveEditingStock}
                                            onKeyDown={handleStockKeyDown}
                                            autoFocus
                                            style={{ width: 80, padding: '4px 8px', fontSize: 13, textAlign: 'center' }}
                                        />
                                    ) : (
                                        <span
                                            onClick={() => startEditingStock(p)}
                                            title="Click para editar stock"
                                            style={{ color: p.stock <= p.alertaStockMinimo ? 'var(--danger)' : 'inherit', fontWeight: p.stock <= p.alertaStockMinimo ? 'bold' : 'normal', cursor: 'pointer', borderBottom: '1px dashed var(--text-muted)' }}
                                        >
                                            {p.stock}
                                        </span>
                                    )}
                                </td>
                                <td>${p.precioCosto}</td>
                                <td style={{ color: 'var(--accent)', fontWeight: 'bold' }}>${p.precioVentaL1}</td>
                                <td>${p.precioVentaL2}</td>
                                <td>${p.precioVentaL3}</td>
                                <td>
                                    <span className={`status-badge ${p.activo ? 'status-active' : 'status-inactive'}`}>
                                        {p.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleOpenModal(p)}>
                                        <Edit2 size={16} />
                                    </button>
                                    {canEdit && (
                                        <button className="btn btn-ghost btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredProducts.length === 0 && (
                            <tr>
                                <td colSpan={canEdit ? 12 : 11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No se encontraron productos. Añade uno nuevo o importa desde Excel.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            )}

            {isMobile && (
            <div className="pos-product-cards">
                {filteredProducts.map(p => (
                    <article key={`card-${p.id}`} className={`pos-product-card${selectedIds.has(p.id) ? ' card-selected' : ''}`}>
                        <div className="pos-product-card-top">
                            {canEdit && (
                                <input
                                    type="checkbox"
                                    className="bulk-checkbox card-checkbox"
                                    checked={selectedIds.has(p.id)}
                                    onChange={() => toggleSelect(p.id)}
                                />
                            )}
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                                <div style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 14,
                                    overflow: 'hidden',
                                    background: 'rgba(255,255,255,0.05)',
                                    flexShrink: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {p.imagenBibliotecaThumb ? (
                                        <img src={p.imagenBibliotecaThumb} alt={p.detalleCorto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin foto</span>
                                    )}
                                </div>
                                <div>
                                    <div className="pos-product-card-code">Local: {p.articuloVenta || p.codigoInterno || 'Sin codigo'}</div>
                                    <div className="pos-product-card-code" style={{ opacity: 0.8 }}>Fabrica: {p.articuloFabrica || '-'}</div>
                                    <h3>{p.detalleCorto}</h3>
                                </div>
                            </div>
                            <span className={`status-badge ${p.activo ? 'status-active' : 'status-inactive'}`}>
                                {p.activo ? 'Activo' : 'Inactivo'}
                            </span>
                        </div>

                        <div className="pos-product-card-grid">
                            <div>
                                <span className="pos-product-card-label">Stock</span>
                                {editingStockId === p.id ? (
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={editingStockValue}
                                        onChange={(e) => setEditingStockValue(e.target.value)}
                                        onBlur={saveEditingStock}
                                        onKeyDown={handleStockKeyDown}
                                        autoFocus
                                        style={{ width: 70, padding: '4px 8px', fontSize: 13, textAlign: 'center' }}
                                    />
                                ) : (
                                    <strong
                                        onClick={() => startEditingStock(p)}
                                        title="Click para editar stock"
                                        style={{ color: p.stock <= p.alertaStockMinimo ? 'var(--danger)' : 'var(--text-primary)', cursor: 'pointer', borderBottom: '1px dashed var(--text-muted)' }}
                                    >
                                        {p.stock}
                                    </strong>
                                )}
                            </div>
                            <div>
                                <span className="pos-product-card-label">Costo</span>
                                <strong>{formatCurrency(p.precioCosto)}</strong>
                            </div>
                            <div>
                                <span className="pos-product-card-label">Lista 1 / Local</span>
                                <strong className="pos-product-card-price">{formatCurrency(p.precioVentaL1)}</strong>
                            </div>
                            <div>
                                <span className="pos-product-card-label">Lista 2 / Minorista</span>
                                <strong>{formatCurrency(p.precioVentaL2)}</strong>
                            </div>
                            <div>
                                <span className="pos-product-card-label">Lista 3 / Chloe</span>
                                <strong>{formatCurrency(p.precioVentaL3)}</strong>
                            </div>
                            <div>
                                <span className="pos-product-card-label">Lista 4 / Luis</span>
                                <strong>{formatCurrency(p.precioVentaL4)}</strong>
                            </div>
                        </div>

                        <div className="pos-product-card-actions">
                            <button className="btn btn-secondary" onClick={() => handleOpenModal(p)}>
                                <Edit2 size={16} /> Editar
                            </button>
                            {canEdit && (
                                <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(p.id)}>
                                    <Trash2 size={16} /> Eliminar
                                </button>
                            )}
                        </div>
                    </article>
                ))}

                {filteredProducts.length === 0 && (
                    <div className="pos-product-empty">
                        No se encontraron productos. Anade uno nuevo o importa desde Excel.
                    </div>
                )}
            </div>
            )}

            {/* Floating bulk action bar */}
            {canEdit && selectedIds.size > 0 && (
                <div className="bulk-action-bar">
                    <span className="bulk-count">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
                        Deseleccionar todo
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setShowBulkConfirm(true)}>
                        <Trash2 size={15} /> Eliminar seleccionados
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => {
                        const selected = productos.filter(p => selectedIds.has(p.id));
                        if (selected.length === 0) return;
                        // Generate catalog HTML
                        // Generate professional catalog
                        const fetchWooImages = async () => {
                            const wooUrl = state.config?.marketing?.wooUrl || 'https://celavie.com.ar';
                            const wooKey = state.config?.marketing?.wooKey;
                            const wooSecret = state.config?.marketing?.wooSecret;
                            if (!wooKey || !wooSecret) return {};
                            const imageMap = {};
                            try {
                                for (const p of selected.slice(0, 30)) {
                                    const code = (p.codigoInterno || '').replace(/^(ART|Art|art)\s*/i, '');
                                    if (!code) continue;
                                    try {
                                        const res = await fetch(wooUrl + '/wp-json/wc/v3/products?sku=' + encodeURIComponent(code) + '&consumer_key=' + wooKey + '&consumer_secret=' + wooSecret);
                                        const prods = await res.json();
                                        if (prods?.[0]?.images?.[0]?.src) imageMap[p.id] = prods[0].images[0].src;
                                    } catch {}
                                }
                            } catch {}
                            return imageMap;
                        };
                        const buildCatalog = (wooImages) => {
                            const cards = selected.map(p => {
                                const existingWooImg = Array.isArray(p.imagenes) && p.imagenes.length > 0 ? (p.imagenes[0].url || p.imagenes[0].src || '') : '';
                                const img = existingWooImg || wooImages[p.id] || p.imagenBibliotecaThumb || p.storageUrl || p.imagenBase64 || '';
                                const l1 = p.precioVentaL1 ? '$' + Number(p.precioVentaL1).toLocaleString('es-AR') : '-';
                                const l2 = p.precioVentaL2 ? '$' + Number(p.precioVentaL2).toLocaleString('es-AR') : '';
                                const l5 = p.precioVentaL5 ? '$' + Number(p.precioVentaL5).toLocaleString('es-AR') : '';
                                const stockLabel = p.stock > 0 ? '✅ Stock: ' + p.stock : '⚠️ Sin stock';
                                return '<div style="break-inside:avoid;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff">' +
                                    (img ? '<img src="' + img + '" style="width:100%;height:200px;object-fit:cover" onerror="this.style.display=\'none\'" />' : '<div style="width:100%;height:200px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:40px">📷</div>') +
                                    '<div style="padding:12px"><div style="font-weight:700;font-size:14px;margin-bottom:4px">' + (p.detalleCorto || 'Sin nombre') + '</div>' +
                                    '<div style="font-size:11px;color:#6b7280;margin-bottom:8px">Cod: ' + (p.codigoInterno || '-') + '</div>' +
                                    '<div style="font-size:20px;font-weight:800;color:#1a1a2e">' + l1 + '</div>' +
                                    (l2 ? '<div style="font-size:12px;color:#6b7280">Minorista: ' + l2 + '</div>' : '') +
                                    (l5 ? '<div style="font-size:12px;color:#6b7280">Lista 5: ' + l5 + '</div>' : '') +
                                    '<div style="font-size:11px;margin-top:6px;color:' + (p.stock > 0 ? '#16a34a' : '#dc2626') + '">' + stockLabel + '</div>' +
                                    '</div></div>';
                            }).join('');
                            return '<html><head><style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#1a1a2e}' +
                                '.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0}@media print{.grid{grid-template-columns:repeat(3,1fr)}}</style></head>' +
                                '<body><div style="text-align:center;margin-bottom:20px;border-bottom:3px solid #1a1a2e;padding-bottom:15px">' +
                                '<h1 style="margin:0;font-size:28px">CELAVIE</h1><p style="margin:4px 0;color:#6b7280;font-size:13px">Indumentaria Mayorista · Catálogo ' + new Date().toLocaleDateString('es-AR') + '</p>' +
                                '<p style="margin:2px 0;font-size:12px;color:#9ca3af">' + selected.length + ' artículos · celavie.com.ar · @celavieindumentaria</p></div>' +
                                '<div class="grid">' + cards + '</div>' +
                                '<div style="text-align:center;margin-top:30px;padding-top:15px;border-top:2px solid #e5e7eb;font-size:11px;color:#9ca3af">' +
                                'CELAVIE Indumentaria Mayorista | Flores, Buenos Aires<br>📱 WhatsApp · 🌐 celavie.com.ar · 📸 @celavieindumentaria<br>Precios mayoristas sujetos a cambios sin previo aviso</div></body></html>';
                        };
                        // Try to fetch WooCommerce images first, fallback to local
                        const loadBtn = event.target;
                        loadBtn.textContent = '⏳ Cargando fotos...';
                        loadBtn.disabled = true;
                        fetchWooImages().then(wooImages => {
                            const html = buildCatalog(wooImages);
                            const w = window.open('', '_blank');
                            w.document.write(html);
                            w.document.close();
                            setTimeout(() => { w.print(); }, 800);
                        }).finally(() => { loadBtn.textContent = '📋 Catálogo (' + selectedIds.size + ')'; loadBtn.disabled = false; });
                    }}>
                        📋 Catálogo ({selectedIds.size})
                    </button>
                </div>
            )}

            {/* Bulk delete confirmation dialog */}
            {showBulkConfirm && (
                <div className="pos-modal-overlay">
                    <div className="pos-modal" style={{ maxWidth: 420 }}>
                        <div className="pos-modal-header">
                            <h3>Confirmar eliminación</h3>
                            <button className="btn btn-ghost" onClick={() => setShowBulkConfirm(false)}>✕</button>
                        </div>
                        <div className="pos-modal-body" style={{ display: 'block', padding: '1.25rem 1.5rem' }}>
                            <p style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
                                ¿Estás seguro de eliminar <strong>{selectedIds.size} artículo{selectedIds.size !== 1 ? 's' : ''}</strong>?<br />
                                <span style={{ color: 'var(--danger)', fontSize: 'var(--fs-sm)' }}>Esta acción no se puede deshacer.</span>
                            </p>
                        </div>
                        <div className="pos-modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)}>Cancelar</button>
                            <button className="btn btn-danger" onClick={handleBulkDeleteConfirm}>
                                <Trash2 size={15} /> Eliminar {selectedIds.size} artículo{selectedIds.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Edit/Create Modal */}
            {isModalOpen && (
                <div className="pos-modal-overlay">
                    <div className="pos-modal">
                        <div className="pos-modal-header">
                            <h3>{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</h3>
                            <button className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>✕</button>
                        </div>
                        <div className="pos-modal-body">
                            <div className="form-group full-width">
                                <label>Foto principal</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                        width: 88,
                                        height: 88,
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        background: 'rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {(() => { const t = getProductThumb(formData.codigoInterno, productos); return t ? <img src={t} alt={formData.detalleCorto || 'Producto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Sin foto</span>; })()}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        Las fotos del artículo se administran desde la sección <strong>Fotos</strong>.
                                    </div>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Artículo Local</label>
                                <input className="form-input" name="articuloVenta" value={formData.articuloVenta} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Artículo Fábrica</label>
                                <input className="form-input" name="articuloFabrica" value={formData.articuloFabrica} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Código de Barras</label>
                                <input className="form-input" name="codigoBarras" value={formData.codigoBarras} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Artículo Local</label>
                                <input className="form-input" name="articuloVenta" value={formData.articuloVenta} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Artículo Fábrica</label>
                                <input className="form-input" name="articuloFabrica" value={formData.articuloFabrica} onChange={handleChange} />
                            </div>
                            <div className="form-group full-width">
                                <label>Detalle Corto *</label>
                                <input className="form-input" name="detalleCorto" value={formData.detalleCorto} onChange={handleChange} />
                            </div>
                            <div className="form-group full-width">
                                <label>Detalle Largo (Opcional)</label>
                                <input className="form-input" name="detalleLargo" value={formData.detalleLargo} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Marca / Proveedor</label>
                                <input className="form-input" name="proveedor" value={formData.proveedor} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Stock Actual</label>
                                <input type="number" className="form-input" name="stock" value={formData.stock} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Precio Costo</label>
                                <input type="number" className="form-input" name="precioCosto" value={formData.precioCosto} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Alerta Stock Mín.</label>
                                <input type="number" className="form-input" name="alertaStockMinimo" value={formData.alertaStockMinimo} onChange={handleChange} />
                            </div>

                            <hr className="full-width" style={{ borderColor: 'var(--border-color)', margin: '10px 0' }} />
                            <div className="full-width"><h4 style={{ margin: 0 }}>Listas de Precios</h4></div>

                            <div className="form-group">
                                <label>Lista 1 (Local / WhatsApp)</label>
                                <input type="number" className="form-input" name="precioVentaL1" value={formData.precioVentaL1} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Lista 2 (Minorista)</label>
                                <input type="number" className="form-input" name="precioVentaL2" value={formData.precioVentaL2} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Lista 3 (Chloe)</label>
                                <input type="number" className="form-input" name="precioVentaL3" value={formData.precioVentaL3} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Lista 4 (Luis)</label>
                                <input type="number" className="form-input" name="precioVentaL4" value={formData.precioVentaL4} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Precio Web</label>
                                <input type="number" className="form-input" name="precioVentaWeb" value={formData.precioVentaWeb} onChange={handleChange} />
                            </div>

                            <div className="form-group full-width" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" name="activo" checked={formData.activo} onChange={handleChange} style={{ transform: 'scale(1.2)' }} />
                                <label style={{ margin: 0, cursor: 'pointer' }} onClick={() => setFormData(p => ({ ...p, activo: !p.activo }))}>
                                    Producto Activo (Visible en Búsquedas de Caja)
                                </label>
                            </div>
                        </div>
                        <div className="pos-modal-footer">
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleSaveProduct}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Excel Import Modal */}
            {isExcelModalOpen && (
                <div className="pos-modal-overlay">
                    <div className="pos-modal" style={{ maxWidth: 500 }}>
                        <div className="pos-modal-header">
                            <h3>Importar Productos (Excel)</h3>
                            <button className="btn btn-ghost" onClick={() => setIsExcelModalOpen(false)}>✕</button>
                        </div>
                        <div className="pos-modal-body" style={{ display: 'block' }}>
                            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>
                                Sube un archivo <strong>.xlsx</strong>. Columnas detectadas:
                                <em> Art Local, Art Fabrica, Detalle, Costo, L1 Local, L2 Minorista, L3 Chloe, L4 Luis, Web, Stock</em>.
                            </p>
                            <div
                                className={`excel-drop-zone ${dragActive ? 'active' : ''}`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload size={48} style={{ marginBottom: 12, opacity: 0.5 }} />
                                <p>Arrastra tu archivo Excel aquí<br />o haz click para seleccionarlo.</p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx, .xls"
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
