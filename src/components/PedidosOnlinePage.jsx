import React, { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId, formatDate } from '../utils/helpers';
import { Plus, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Save, RefreshCw } from 'lucide-react';
import './PedidosOnlinePage.css';

export default function PedidosOnlinePage() {
    const { state, addPedidoOnline, updatePedidoOnlineStatus, updatePedidoItem, fetchWooOrders } = useData();
    const { user } = useAuth();
    const pedidos = state.config?.pedidosOnline || [];
    const posProductos = state.config?.posProductos || [];

    const [loadingWoo, setLoadingWoo] = useState(false);
    const [nuevoCliente, setNuevoCliente] = useState('');
    const [nuevoNumero, setNuevoNumero] = useState('');
    const [nuevoMonto, setNuevoMonto] = useState('');
    const [nuevaFormaPago, setNuevaFormaPago] = useState('');
    const [nuevaFormaEnvio, setNuevaFormaEnvio] = useState('');
    const [nuevoOrigen, setNuevoOrigen] = useState('Modatex');

    // For expanding orders
    const [expandedPedidoId, setExpandedPedidoId] = useState(null);

    // For new items inside an order
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemProductId, setNewItemProductId] = useState('');
    const [newItemCantidad, setNewItemCantidad] = useState(1);
    const [newItemStatus, setNewItemStatus] = useState('falta'); // 'falta' | 'reemplazo' | 'ok'
    const [newItemComment, setNewItemComment] = useState('');
    const [imageErrors, setImageErrors] = useState({});

    const canCreateOrder = user.role === 'encargada' || user.role === 'admin';
    const canProcessOrder = user.role === 'pedidos' || user.role === 'marketing' || user.role === 'admin';
    const canApproveOrder = user.role === 'encargada' || user.role === 'admin';

    const normalizeText = (value) => (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+-\s+/g, ' ')
        .replace(/,\s+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const getImageFromSource = (source) => {
        if (!source) return '';
        if (typeof source === 'string') return source;

        return source.url
            || source.src
            || source.data
            || source.thumbnail
            || source.secure_url
            || '';
    };

    const getProductImage = (product) => {
        if (!product) return '';

        const galleryImage = Array.isArray(product.imagenes)
            ? product.imagenes.map(getImageFromSource).find(Boolean)
            : '';

        return galleryImage
            || getImageFromSource(product.imagen)
            || getImageFromSource(product.image)
            || getImageFromSource(product.thumbnail)
            || getImageFromSource(product.foto)
            || getImageFromSource(product.photo)
            || getImageFromSource(product.imagenBase64)
            || getImageFromSource(product.imageBase64)
            || '';
    };

    const productsById = useMemo(() => new Map(
        posProductos
            .filter((product) => product?.id)
            .map((product) => [String(product.id), product])
    ), [posProductos]);

    const handleCreatePedido = (e) => {
        e.preventDefault();
        if (!nuevoCliente.trim() || !nuevoNumero.trim()) return;

        addPedidoOnline({
            cliente: nuevoCliente,
            numeroPedido: nuevoNumero,
            monto: nuevoMonto,
            formaPago: nuevaFormaPago,
            formaEnvio: nuevaFormaEnvio,
            origen: nuevoOrigen
        });

        setNuevoCliente('');
        setNuevoNumero('');
        setNuevoMonto('');
        setNuevaFormaPago('');
        setNuevaFormaEnvio('');
        setNuevoOrigen('Modatex');
    };

    const handleAddItem = (pedidoId) => {
        if (!newItemDesc.trim() && !newItemProductId) return;

        const selectedProduct = posProductos.find((product) => product.id === newItemProductId);
        const selectedImage = getProductImage(selectedProduct);

        addPedidoItem(pedidoId, {
            descripcion: newItemDesc,
            productId: newItemProductId,
            cantidad: Number(newItemCantidad),
            estado: newItemStatus,
            comentario: newItemComment,
            imagen: selectedImage
        });

        // Reset form
        setNewItemDesc('');
        setNewItemProductId('');
        setNewItemCantidad(1);
        setNewItemStatus('falta');
        setNewItemComment('');
    };

    const handleFetchWooOrders = async () => {
        setLoadingWoo(true);
        try {
            const count = await fetchWooOrders();
            alert(`✅ Se importaron ${count} pedidos nuevos de la web.`);
        } catch (err) {
            alert(`❌ Error al conectar con WooCommerce: ${err.message}`);
        } finally {
            setLoadingWoo(false);
        }
    };

    const resolveItemImage = (item) => {
        const directImage = getImageFromSource(item?.imagen)
            || getImageFromSource(item?.image)
            || getImageFromSource(item?.thumbnail)
            || getImageFromSource(item?.foto);
        if (directImage) return directImage;

        const byProductId = productsById.get(String(item?.productId || ''))
            || posProductos.find((product) => String(product?.wooId || '') === String(item?.productId || ''));
        const targetName = normalizeText(item?.descripcion || item?.detalle);
        const compactTargetName = targetName.split(' ').slice(0, 2).join(' ');
        const byName = posProductos.find((product) => {
            const names = [
                product?.detalleCorto,
                product?.nombre,
                product?.descripcion,
                product?.detalle
            ].map(normalizeText).filter(Boolean);
            return targetName && (
                names.includes(targetName)
                || names.some((name) => name.startsWith(targetName) || targetName.startsWith(name))
                || (compactTargetName && names.some((name) => name.includes(compactTargetName)))
            );
        });
        const product = byProductId || byName;

        return getProductImage(product);
    };

    return (
        <div className="pedidos-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 className="pedidos-page-title" style={{ margin: 0 }}>Pedidos Online</h2>
                <button
                    className="btn btn-secondary"
                    onClick={handleFetchWooOrders}
                    disabled={loadingWoo}
                    style={{ gap: 8 }}
                >
                    <RefreshCw size={16} className={loadingWoo ? 'spin' : ''} />
                    {loadingWoo ? 'Sincronizando...' : '🔄 Traer de la Web'}
                </button>
            </div>

            {canCreateOrder && (
                <form className="pedidos-form card" onSubmit={handleCreatePedido}>
                    <h3>Nuevo Pedido Online</h3>
                    <div className="pedidos-form-row">
                        <div className="form-group">
                            <label>Nombre del Cliente</label>
                            <input
                                type="text"
                                className="form-control"
                                value={nuevoCliente}
                                onChange={(e) => setNuevoCliente(e.target.value)}
                                placeholder="Ej. Maria Lopez"
                            />
                        </div>
                        <div className="form-group">
                            <label>Número de Pedido</label>
                            <input
                                type="text"
                                className="form-control"
                                value={nuevoNumero}
                                onChange={(e) => setNuevoNumero(e.target.value)}
                                placeholder="Ej. #1024"
                            />
                        </div>
                        <div className="form-group">
                            <label>Monto</label>
                            <input
                                type="number"
                                className="form-control"
                                value={nuevoMonto}
                                onChange={(e) => setNuevoMonto(e.target.value)}
                                placeholder="Ej. 15000"
                            />
                        </div>
                        <div className="form-group">
                            <label>Forma de Pago</label>
                            <input
                                type="text"
                                className="form-control"
                                value={nuevaFormaPago}
                                onChange={(e) => setNuevaFormaPago(e.target.value)}
                                placeholder="Ej. Transferencia"
                            />
                        </div>
                        <div className="form-group">
                            <label>Forma de Envío</label>
                            <input
                                type="text"
                                className="form-control"
                                value={nuevaFormaEnvio}
                                onChange={(e) => setNuevaFormaEnvio(e.target.value)}
                                placeholder="Ej. Correo Argentino"
                            />
                        </div>
                        <div className="form-group">
                            <label>Origen</label>
                            <select
                                className="form-control"
                                value={nuevoOrigen}
                                onChange={(e) => setNuevoOrigen(e.target.value)}
                            >
                                <option value="Modatex">Modatex</option>
                                <option value="Web">Web</option>
                                <option value="Distrito">Distrito</option>
                                <option value="Local">Local</option>
                            </select>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ height: '42px' }}>
                            <Plus size={18} /> Agregar
                        </button>
                    </div>
                </form>
            )}

            <div className="pedidos-list">
                {pedidos.length === 0 && (
                    <div className="empty-state">No hay pedidos registrados.</div>
                )}
                {pedidos.map(pedido => (
                    <div key={pedido.id} className={`pedido-card card estado-${pedido.estado}`}>
                        <div className="pedido-header" onClick={() => setExpandedPedidoId(expandedPedidoId === pedido.id ? null : pedido.id)}>
                            <div className="pedido-info">
                                <span className="pedido-numero">{pedido.numeroPedido}</span>
                                <span className="pedido-cliente">{pedido.cliente}</span>
                                {pedido.origen && (
                                    <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)', marginLeft: 8 }}>
                                        {pedido.origen}
                                    </span>
                                )}
                                <span className="pedido-fecha" style={{ marginLeft: 'auto', marginRight: 16 }}>{formatDate(pedido.fecha)}</span>
                            </div>
                            <div className="pedido-actions">
                                {pedido.estado === 'pendiente' && <span className="badge badge-warning">Pendiente</span>}
                                {pedido.estado === 'listo-juan' && <span className="badge" style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--warning)' }}><CheckCircle size={14} /> Listo Juan</span>}
                                {pedido.estado === 'listo' && <span className="badge badge-success"><CheckCircle size={14} /> Listo Nadia</span>}
                                {pedido.estado === 'incompleto' && <span className="badge badge-error"><AlertCircle size={14} /> Incompleto</span>}
                                {expandedPedidoId === pedido.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </div>
                        </div>

                        {expandedPedidoId === pedido.id && (
                            <div className="pedido-body">

                                {/* Detalles del pedido (solo para Admin/Encargada) */}
                                {canCreateOrder && (
                                    <div className="pedido-details-grid">
                                        <div className="detail-item">
                                            <span className="detail-label">Monto</span>
                                            <span className="detail-value">
                                                {pedido.monto ? `$${Number(pedido.monto).toLocaleString()}` : '-'}
                                            </span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Forma de Pago</span>
                                            <span className="detail-value">{pedido.formaPago || '-'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Forma de Envío</span>
                                            <span className="detail-value">{pedido.formaEnvio || '-'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Origen</span>
                                            <span className="detail-value">{pedido.origen || '-'}</span>
                                        </div>
                                    </div>
                                )}

                                {canProcessOrder && (
                                    <div className="pedido-status-controls">
                                        <label>Preparacion del pedido:</label>
                                        <div className="status-buttons">
                                            <button
                                                className={`btn ${pedido.estado === 'listo-juan' ? 'btn-success' : 'btn-outline'}`}
                                                onClick={() => updatePedidoOnlineStatus(pedido.id, 'listo-juan')}
                                            >
                                                <CheckCircle size={16} /> Listo Juan
                                            </button>
                                            <button
                                                className={`btn ${pedido.estado === 'incompleto' ? 'btn-error' : 'btn-outline'}`}
                                                onClick={() => updatePedidoOnlineStatus(pedido.id, 'incompleto')}
                                            >
                                                <AlertCircle size={16} /> Falta Algo
                                            </button>
                                            <button
                                                className={`btn ${pedido.estado === 'pendiente' ? 'btn-warning' : 'btn-outline'}`}
                                                onClick={() => updatePedidoOnlineStatus(pedido.id, 'pendiente')}
                                            >
                                                Restaurar a Pendiente
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {canApproveOrder && (
                                    <div className="pedido-status-controls">
                                        <label>Chequeo de Nadia:</label>
                                        <div className="status-buttons">
                                            <button
                                                className={`btn ${pedido.estado === 'listo' ? 'btn-success' : 'btn-outline'}`}
                                                onClick={() => updatePedidoOnlineStatus(pedido.id, 'listo')}
                                                disabled={pedido.estado !== 'listo-juan'}
                                            >
                                                <CheckCircle size={16} /> Listo Nadia
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="pedido-items-section">
                                    <h4>Anotaciones / Faltantes</h4>

                                    {(pedido.items || []).length === 0 ? (
                                        <p className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>No hay anotaciones en este pedido.</p>
                                    ) : (
                                        <div className="pedido-items-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {pedido.items.map(item => {
                                                const imageKey = `${pedido.id}-${item.id}`;
                                                const itemImage = imageErrors[imageKey] ? '' : resolveItemImage(item);

                                                return (
                                                <div
                                                    key={item.id}
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: '56px 1fr auto',
                                                        gap: 12,
                                                        alignItems: 'center',
                                                        background: 'rgba(255,255,255,0.02)',
                                                        padding: '8px 12px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        borderLeft: `3px solid ${item.estado === 'falta' ? 'var(--danger)' : (item.estado === 'reemplazo' ? 'var(--warning)' : 'var(--success)')}`
                                                    }}
                                                >
                                                    <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                                                        {itemImage ? (
                                                            <img
                                                                src={itemImage}
                                                                alt={item.descripcion || item.detalle}
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                onError={() => setImageErrors((prev) => ({ ...prev, [imageKey]: true }))}
                                                            />
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: 'var(--text-muted)',
                                                                    fontSize: '10px',
                                                                    textAlign: 'center',
                                                                    padding: 6,
                                                                    lineHeight: 1.2
                                                                }}
                                                            >
                                                                Sin foto
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 'var(--fw-medium)', fontSize: '13px' }}>
                                                            {item.descripcion || item.detalle}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            Cant: {item.cantidad} {item.precio ? `· $${item.precio}` : ''}
                                                        </div>
                                                        {(user.role === 'pedidos' || user.role === 'admin') ? (
                                                            <input
                                                                type="text"
                                                                className="form-control form-control-sm"
                                                                placeholder="Comentario de Juan"
                                                                value={item.comentario || ''}
                                                                onChange={e => updatePedidoItem(pedido.id, item.id, { comentario: e.target.value })}
                                                                style={{ marginTop: 6 }}
                                                            />
                                                        ) : (
                                                            item.comentario && <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: 6 }}>Juan: {item.comentario}</div>
                                                        )}
                                                    </div>
                                                    {item.estado && <span className={`badge badge-${item.estado === 'falta' ? 'error' : (item.estado === 'reemplazo' ? 'warning' : 'success')}`} style={{ fontSize: '10px' }}>
                                                        {item.estado}
                                                    </span>}
                                                </div>
                                            )})}
                                            {pedido.monto > 0 && (
                                                <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 'bold', fontSize: '14px', color: 'var(--accent)' }}>
                                                    Total: ${Number(pedido.monto).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {canProcessOrder && (
                                        <div className="add-item-form">
                                            <h5>Agregar Artículo al Pedido</h5>
                                            <div className="add-item-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 80px 1fr 1fr auto', gap: 8 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <select
                                                        className="form-select form-select-sm"
                                                        value={newItemProductId}
                                                        onChange={e => {
                                                            setNewItemProductId(e.target.value);
                                                            const p = state.config.posProductos?.find(px => px.id === e.target.value);
                                                            if (p) setNewItemDesc(p.detalleCorto);
                                                        }}
                                                    >
                                                        <option value="">-- Seleccionar Producto --</option>
                                                        {(state.config.posProductos || []).map(p => (
                                                            <option key={p.id} value={p.id}>{p.detalleCorto} (Stock: {p.stock})</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-sm"
                                                        placeholder="O escribir descripción..."
                                                        value={newItemDesc}
                                                        onChange={e => setNewItemDesc(e.target.value)}
                                                    />
                                                </div>
                                                <input
                                                    type="number"
                                                    className="form-control form-control-sm"
                                                    placeholder="Cant."
                                                    value={newItemCantidad}
                                                    onChange={e => setNewItemCantidad(e.target.value)}
                                                    min="1"
                                                />
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={newItemStatus}
                                                    onChange={e => setNewItemStatus(e.target.value)}
                                                >
                                                    <option value="ok">Disponible / Picked</option>
                                                    <option value="falta">No hay stock (Faltante)</option>
                                                    <option value="reemplazo">Cambio de color/talle</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    className="form-control form-control-sm"
                                                    placeholder="Comentario / Nota"
                                                    value={newItemComment}
                                                    onChange={e => setNewItemComment(e.target.value)}
                                                />
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => handleAddItem(pedido.id)}
                                                    disabled={!newItemDesc.trim() && !newItemProductId}
                                                >
                                                    <Save size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
