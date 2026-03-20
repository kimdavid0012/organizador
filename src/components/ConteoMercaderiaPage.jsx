import React, { useMemo, useState } from 'react';
import { Boxes, Plus, Trash2, Download } from 'lucide-react';
import { useData } from '../store/DataContext';
import { generateId } from '../utils/helpers';

const EMPTY_FORM = {
    articulo: '',
    descripcion: '',
    tipoTela: '',
    color: '',
    fechaIngreso: '',
    taller: '',
    cantidadOriginal: '',
    cantidadContada: '',
    cantidadEllos: '',
    fallado: ''
};

const toNumber = (value) => Number.parseInt(value || 0, 10) || 0;
const normalizeCode = (value) => (value || '').toString().trim().toUpperCase();

export default function ConteoMercaderiaPage() {
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
            cantidadOriginal: toNumber(formData.cantidadOriginal || linkedArticle?.stock),
            cantidadContada: toNumber(formData.cantidadContada),
            cantidadEllos: toNumber(formData.cantidadEllos),
            fallado: toNumber(formData.fallado),
            createdAt: new Date().toISOString()
        };

        saveConteos([newItem, ...conteos]);
        setFormData(EMPTY_FORM);
    };

    const handleDelete = (id) => {
        if (!window.confirm('Eliminar este conteo?')) return;
        saveConteos(conteos.filter((item) => item.id !== id));
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

    const exportCsv = () => {
        const headers = ['Articulo', 'Descripcion', 'Tipo tela', 'Color', 'Fecha ingreso', 'Taller', 'Cantidad original', 'Cantidad contada', 'Cantidad ellos', 'Fallado', 'Diferencia'];
        const rows = conteos.map((item) => {
            const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
            return [
                item.articulo,
                item.descripcion,
                item.tipoTela,
                item.color,
                item.fechaIngreso,
                item.taller,
                item.cantidadOriginal,
                item.cantidadContada,
                item.cantidadEllos,
                item.fallado,
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
                        Registro de stock contado por articulo, tela, color y taller. El stock se consolida automaticamente en Articulos.
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={exportCsv}>
                    <Download size={16} /> Exportar CSV
                </button>
            </div>

            <div className="glass-panel" style={{ padding: 18, marginBottom: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <input
                        className="form-input"
                        list="conteo-articulos"
                        placeholder="Articulo / codigo"
                        value={formData.articulo}
                        onChange={(e) => setFormData((prev) => autofillArticle(e.target.value, prev))}
                    />
                    <input className="form-input" placeholder="Descripcion" value={formData.descripcion} onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))} />
                    <input className="form-input" list="conteo-telas" placeholder="Tipo de tela" value={formData.tipoTela} onChange={(e) => setFormData((prev) => ({ ...prev, tipoTela: e.target.value }))} />
                    <input className="form-input" placeholder="Color / modelo" value={formData.color} onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))} />
                    <input className="form-input" type="date" value={formData.fechaIngreso} onChange={(e) => setFormData((prev) => ({ ...prev, fechaIngreso: e.target.value }))} />
                    <input className="form-input" list="conteo-talleres" placeholder="Taller" value={formData.taller} onChange={(e) => setFormData((prev) => ({ ...prev, taller: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Cantidad original" value={formData.cantidadOriginal} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadOriginal: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Cantidad contada" value={formData.cantidadContada} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadContada: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Cantidad de ellos" value={formData.cantidadEllos} onChange={(e) => setFormData((prev) => ({ ...prev, cantidadEllos: e.target.value }))} />
                    <input className="form-input" type="number" placeholder="Fallado" value={formData.fallado} onChange={(e) => setFormData((prev) => ({ ...prev, fallado: e.target.value }))} />
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
                    <button className="btn btn-primary" onClick={handleAdd}>
                        <Plus size={16} /> Agregar conteo
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                {['Articulo', 'Descripcion', 'Tela', 'Color', 'Fecha ingreso', 'Taller', 'Original', 'Contada', 'Ellos', 'Fallado', 'Diferencia', 'Accion'].map((label) => (
                                    <th key={label} style={{ padding: '12px 10px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>{label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredConteos.map((item) => {
                                const diferencia = toNumber(item.cantidadContada) - toNumber(item.cantidadOriginal);
                                return (
                                    <tr key={item.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                        <td style={{ padding: 10 }}><input className="form-input" list="conteo-articulos" value={item.articulo || ''} onChange={(e) => handleCellChange(item.id, 'articulo', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.descripcion || ''} onChange={(e) => handleCellChange(item.id, 'descripcion', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" list="conteo-telas" value={item.tipoTela || ''} onChange={(e) => handleCellChange(item.id, 'tipoTela', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" value={item.color || ''} onChange={(e) => handleCellChange(item.id, 'color', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="date" value={item.fechaIngreso || ''} onChange={(e) => handleCellChange(item.id, 'fechaIngreso', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" list="conteo-talleres" value={item.taller || ''} onChange={(e) => handleCellChange(item.id, 'taller', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadOriginal || 0} onChange={(e) => handleCellChange(item.id, 'cantidadOriginal', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadContada || 0} onChange={(e) => handleCellChange(item.id, 'cantidadContada', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.cantidadEllos || 0} onChange={(e) => handleCellChange(item.id, 'cantidadEllos', e.target.value)} /></td>
                                        <td style={{ padding: 10 }}><input className="form-input" type="number" value={item.fallado || 0} onChange={(e) => handleCellChange(item.id, 'fallado', e.target.value)} /></td>
                                        <td style={{ padding: 10, fontWeight: 700, color: diferencia < 0 ? 'var(--danger)' : 'var(--success)' }}>
                                            {diferencia}
                                        </td>
                                        <td style={{ padding: 10 }}>
                                            <button className="btn btn-ghost btn-danger" onClick={() => handleDelete(item.id)}>
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
