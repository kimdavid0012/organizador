import React, { useMemo, useState, useRef } from 'react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId, formatDate } from '../utils/helpers';
import { Plus, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Save, RefreshCw, Camera, X, Check } from 'lucide-react';
import './PedidosOnlinePage.css';

export default function PedidosOnlinePage() {
    const { state, updateConfig, addPedidoOnline, addPedidoItem, updatePedidoOnlineStatus, updatePedidoItem, fetchWooOrders, resyncOrderSources } = useData();
    const { user } = useAuth();
    const pedidos = state.config?.pedidosOnline || [];

    // CHANGE 14 — Order Source Filter
    const [filtroOrigen, setFiltroOrigen] = useState('Todos');
    const [filtroEstado, setFiltroEstado] = useState('Todos');
    const origenOptions = ['Todos', 'Instagram', 'WhatsApp', 'Directo', 'Modatex', 'Web', 'Otro'];
    const estadoOptions = ['Todos', 'pendiente', 'listo', 'cancelado', 'abandonado'];

    const origenColors = {
        Instagram: { bg: '#fce4ec', color: '#c2185b' },
        WhatsApp: { bg: '#e8f5e9', color: '#2e7d32' },
        Directo: { bg: '#e3f2fd', color: '#1565c0' },
        Modatex: { bg: '#fff3e0', color: '#e65100' },
        Web: { bg: '#ede7f6', color: '#4527a0' },
        Otro: { bg: '#f5f5f5', color: '#616161' },
    };

    // Ensure all orders have an origen field (retroactive fix for pre-existing orders)
    const pedidosConOrigen = useMemo(() => {
        return pedidos.map(p => {
            if (p.origen && p.origen !== 'Otro') return p;
            // Infer from available data for orders missing origen
            if (p.wooId && !p.origen) return { ...p, origen: 'Web' };
            if (!p.origen) return { ...p, origen: 'Otro' };
            return p;
        });
    }, [pedidos]);

    const pedidosFiltrados = useMemo(() => {
        let list = pedidosConOrigen;
        if (filtroOrigen !== 'Todos') list = list.filter(p => p.origen === filtroOrigen);
        if (filtroEstado !== 'Todos') list = list.filter(p => p.estado === filtroEstado);
        return list;
    }, [pedidosConOrigen, filtroOrigen, filtroEstado]);

    // CHANGE 15 — Payment Verification
    const [comprobanteModalImg, setComprobanteModalImg] = useState(null);
    const fileInputRefs = useRef({});

    const pendingPaymentCount = useMemo(() =>
        pedidos.filter(p => p.paymentStatus === 'comprobante_subido').length
    , [pedidos]);

    const updatePedidoPayment = (pedidoId, changes) => {
        const updated = pedidos.map(p => p.id === pedidoId ? { ...p, ...changes } : p);
        updateConfig({ pedidosOnline: updated });
    };

    const paymentStatusConfig = {
        pendiente: { label: 'Pago Pendiente', bg: 'rgba(251,191,36,0.15)', color: 'var(--warning)' },
        comprobante_subido: { label: 'Comprobante Subido', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
        aprobado: { label: 'Pago Aprobado', bg: 'rgba(34,197,94,0.15)', color: 'var(--success)' },
        rechazado: { label: 'Pago Rechazado', bg: 'rgba(239,68,68,0.15)', color: 'var(--error)' },
    };

    const handleComprobanteUpload = async (pedidoId, event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            updatePedidoPayment(pedidoId, {
                paymentStatus: 'comprobante_subido',
                comprobanteFoto: reader.result,
                comprobanteUploadedAt: new Date().toISOString(),
            });
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const handleApprovePayment = (e, pedidoId) => {
        e.preventDefault();
        e.stopPropagation();
        updatePedidoPayment(pedidoId, {
            paymentStatus: 'aprobado',
            paymentApprovedAt: new Date().toISOString(),
            paymentApprovedBy: user.name || user.email || user.role,
        });
        updatePedidoOnlineStatus(pedidoId, 'listo');
    };

    const handleRejectPayment = (e, pedidoId) => {
        e.preventDefault();
        e.stopPropagation();
        updatePedidoPayment(pedidoId, {
            paymentStatus: 'rechazado',
        });
    };

    const canUploadComprobante = user.role === 'encargada' || user.role === 'admin';
    const posProductos = state.config?.posProductos || [];

    const [loadingWoo, setLoadingWoo] = useState(false);
    const [nuevoCliente, setNuevoCliente] = useState('');
    const [nuevoNumero, setNuevoNumero] = useState('');
    const [nuevoMonto, setNuevoMonto] = useState('');
    const [nuevaFormaPago, setNuevaFormaPago] = useState('');
    const [nuevaFormaEnvio, setNuevaFormaEnvio] = useState('');
    const [nuevoOrigen, setNuevoOrigen] = useState('Modatex');
    const [nuevoPedidoFotos, setNuevoPedidoFotos] = useState([]);

    // For expanding orders
    const [expandedPedidoId, setExpandedPedidoId] = useState(null);

    // For new items inside an order
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemProductId, setNewItemProductId] = useState('');
    const [newItemCantidad, setNewItemCantidad] = useState(1);
    const [newItemStatus, setNewItemStatus] = useState('falta'); // 'falta' | 'reemplazo' | 'ok'
    const [newItemComment, setNewItemComment] = useState('');
    const [newItemImage, setNewItemImage] = useState('');
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
            || getImageFromSource(product.imagenBibliotecaThumb)
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

    const readFilesAsDataUrls = async (files) => Promise.all(
        Array.from(files || []).map((file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: generateId(),
                nombre: file.name,
                tipo: file.type,
                dataUrl: reader.result
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        }))
    );

    const handlePedidoPhotosChange = async (event) => {
        const files = event.target.files;
        if (!files?.length) return;
        const uploaded = await readFilesAsDataUrls(files);
        setNuevoPedidoFotos((prev) => [...prev, ...uploaded]);
        event.target.value = '';
    };

    const handleNewItemPhotoChange = async (event) => {
        const files = event.target.files;
        if (!files?.length) return;
        const [uploaded] = await readFilesAsDataUrls(files);
        setNewItemImage(uploaded?.dataUrl || '');
        event.target.value = '';
    };

    const handleCreatePedido = (e) => {
        e.preventDefault();
        if (!nuevoCliente.trim() || !nuevoNumero.trim()) return;

        addPedidoOnline({
            cliente: nuevoCliente,
            numeroPedido: nuevoNumero,
            monto: nuevoMonto,
            formaPago: nuevaFormaPago,
            formaEnvio: nuevaFormaEnvio,
            origen: nuevoOrigen,
            fotosAdjuntas: nuevoPedidoFotos
        });

        setNuevoCliente('');
        setNuevoNumero('');
        setNuevoMonto('');
        setNuevaFormaPago('');
        setNuevaFormaEnvio('');
        setNuevoOrigen('Modatex');
        setNuevoPedidoFotos([]);
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
            imagen: newItemImage || selectedImage
        });

        // Reset form
        setNewItemDesc('');
        setNewItemProductId('');
        setNewItemCantidad(1);
        setNewItemStatus('falta');
        setNewItemComment('');
        setNewItemImage('');
    };

    const handleFetchWooOrders = async () => {
        setLoadingWoo(true);
        try {
            const count = await fetchWooOrders();
            // Also backfill email/phone/billing for existing orders that are missing them
            try {
                const resyncCount = await resyncOrderSources();
                if (resyncCount > 0) {
                    alert(`✅ ${count} pedidos nuevos importados + ${resyncCount} pedidos existentes actualizados con email/teléfono.`);
                } else {
                    alert(`✅ Se importaron ${count} pedidos nuevos de la web.`);
                }
            } catch {
                alert(`✅ Se importaron ${count} pedidos nuevos de la web.`);
            }
        } catch (err) {
            alert(`❌ Error al conectar con WooCommerce: ${err.message}`);
        } finally {
            setLoadingWoo(false);
        }
    };

    const handlePedidoStatusChange = (event, pedidoId, newEstado) => {
        event.preventDefault();
        event.stopPropagation();
        updatePedidoOnlineStatus(pedidoId, newEstado);
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h2 className="pedidos-page-title" style={{ margin: 0 }}>Pedidos Online</h2>
                    {pendingPaymentCount > 0 && (
                        <span className="payment-pending-count-badge">
                            {pendingPaymentCount} comprobante{pendingPaymentCount > 1 ? 's' : ''} por aprobar
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className="btn btn-secondary"
                        onClick={handleFetchWooOrders}
                        disabled={loadingWoo}
                        style={{ gap: 8 }}
                    >
                        <RefreshCw size={16} className={loadingWoo ? 'spin' : ''} />
                        {loadingWoo ? 'Sincronizando...' : '🔄 Traer de la Web'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={async () => {
                            try {
                                setLoadingWoo(true);
                                const abandoned = await wooService.fetchAbandonedOrders(state.config);
                                const mapped = abandoned.map(o => ({
                                    id: 'aband-' + o.id,
                                    wooId: o.id,
                                    customer_id: o.customer_id || '',
                                    cliente: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim() || 'Guest',
                                    clienteNombre: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim(),
                                    email: o.billing?.email || '',
                                    telefono: o.billing?.phone || '',
                                    billing: o.billing || {},
                                    total: parseFloat(o.total || 0),
                                    monto: parseFloat(o.total || 0),
                                    metodoPago: o.payment_method_title || 'N/A',
                                    estado: o.status === 'cancelled' ? 'cancelado' : (o.status === 'failed' ? 'cancelado' : 'abandonado'),
                                    fecha: o.date_created,
                                    origen: 'Web',
                                    items: (o.line_items || []).map(li => ({
                                        detalle: li.name, cantidad: li.quantity, precio: parseFloat(li.price || 0),
                                    }))
                                }));
                                const existing = state.config?.pedidosOnline || [];
                                const newOnes = mapped.filter(m => !existing.some(e => e.wooId === m.wooId));
                                if (newOnes.length > 0) {
                                    updateConfig({ pedidosOnline: [...newOnes, ...existing] });
                                    alert(`✅ ${newOnes.length} pedidos cancelados/abandonados importados.`);
                                } else {
                                    alert('No hay pedidos abandonados nuevos.');
                                }
                            } catch (err) {
                                alert(`❌ Error: ${err.message}`);
                            } finally {
                                setLoadingWoo(false);
                            }
                        }}
                        disabled={loadingWoo}
                        style={{ gap: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                    >
                        🛒 Carritos Abandonados
                    </button>
                    {user.role === 'admin' && (
                        <button
                            className="btn btn-secondary"
                            onClick={async () => {
                                try {
                                    const count = await resyncOrderSources();
                                    alert(count > 0 ? `✅ Se actualizaron las fuentes de ${count} pedidos.` : 'Las fuentes ya estaban actualizadas.');
                                } catch (err) {
                                    alert(`❌ Error: ${err.message}`);
                                }
                            }}
                            style={{ gap: 8, fontSize: 12 }}
                            title="Re-obtener fuentes de tráfico de WooCommerce para pedidos existentes"
                        >
                            🔄 Actualizar Fuentes
                        </button>
                    )}
                </div>
            </div>

            {/* CHANGE 14 — Filtro por Origen */}
            <div className="origen-filter-bar">
                {origenOptions.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        className={`origen-filter-btn ${filtroOrigen === opt ? 'active' : ''}`}
                        onClick={() => setFiltroOrigen(opt)}
                    >
                        {opt}
                        {opt !== 'Todos' && (
                            <span className="origen-filter-count">
                                {pedidosConOrigen.filter(p => p.origen === opt).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Filtro por Estado */}
            <div className="origen-filter-bar" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>Estado:</span>
                {estadoOptions.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        className={`origen-filter-btn ${filtroEstado === opt ? 'active' : ''}`}
                        onClick={() => setFiltroEstado(opt)}
                        style={opt === 'cancelado' || opt === 'abandonado' ? { borderColor: 'rgba(239,68,68,0.3)', color: filtroEstado === opt ? '#fff' : '#ef4444', background: filtroEstado === opt ? '#ef4444' : 'transparent' } : {}}
                    >
                        {opt === 'pendiente' ? '⏳ Pendiente' : opt === 'listo' ? '✅ Listo' : opt === 'cancelado' ? '❌ Cancelado' : opt === 'abandonado' ? '🛒 Abandonado' : opt}
                        {opt !== 'Todos' && (
                            <span className="origen-filter-count">
                                {pedidosConOrigen.filter(p => p.estado === opt).length}
                            </span>
                        )}
                    </button>
                ))}
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
                                <option value="Instagram">Instagram</option>
                                <option value="WhatsApp">WhatsApp</option>
                                <option value="Directo">Directo</option>
                                <option value="Modatex">Modatex</option>
                                <option value="Web">Web</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Foto / Nota escrita</label>
                            <input
                                type="file"
                                className="form-control"
                                accept="image/*"
                                multiple
                                onChange={handlePedidoPhotosChange}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ height: '42px' }}>
                            <Plus size={18} /> Agregar
                        </button>
                    </div>
                    {nuevoPedidoFotos.length > 0 && (
                        <div className="pedido-upload-preview">
                            {nuevoPedidoFotos.map((foto) => (
                                <div key={foto.id} className="pedido-upload-thumb">
                                    <img src={foto.dataUrl} alt={foto.nombre || 'Adjunto'} />
                                </div>
                            ))}
                        </div>
                    )}
                </form>
            )}

            <div className="pedidos-list">
                {pedidosFiltrados.length === 0 && (
                    <div className="empty-state">No hay pedidos registrados.</div>
                )}
                {pedidosFiltrados.map(pedido => {
                    const origenStyle = origenColors[pedido.origen] || origenColors.Otro;
                    const pStatus = pedido.paymentStatus || 'pendiente';
                    const pConfig = paymentStatusConfig[pStatus] || paymentStatusConfig.pendiente;

                    return (
                    <div key={pedido.id} className={`pedido-card card estado-${pedido.estado}`}>
                        <div className="pedido-header" onClick={() => setExpandedPedidoId(expandedPedidoId === pedido.id ? null : pedido.id)}>
                            <div className="pedido-info">
                                <span className="pedido-numero">{pedido.numeroPedido}</span>
                                <span className="pedido-cliente">{pedido.cliente}</span>
                                <span className="badge origen-badge" style={{ background: origenStyle.bg, color: origenStyle.color, marginLeft: 8 }}>
                                    {pedido.origen || 'Sin origen'}
                                </span>
                                <span className="badge payment-status-badge" style={{ background: pConfig.bg, color: pConfig.color, marginLeft: 4 }}>
                                    {pConfig.label}
                                </span>
                                <span className="pedido-fecha" style={{ marginLeft: 'auto', marginRight: 16 }}>{formatDate(pedido.fecha)}</span>
                            </div>
                            <div className="pedido-actions">
                                {pedido.estado === 'pendiente' && <span className="badge badge-warning">Pendiente</span>}
                                {pedido.estado === 'listo-juan' && <span className="badge" style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--warning)' }}><CheckCircle size={14} /> Listo Juan</span>}
                                {pedido.estado === 'listo' && <span className="badge badge-success"><CheckCircle size={14} /> Listo Nadia</span>}
                                {pedido.estado === 'incompleto' && <span className="badge badge-error"><AlertCircle size={14} /> Incompleto</span>}

                                {/* Upload comprobante button (encargada + admin) */}
                                {canUploadComprobante && pStatus !== 'aprobado' && (
                                    <label
                                        className="btn-comprobante-upload"
                                        title="Subir comprobante de pago"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <Camera size={16} />
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            ref={el => { fileInputRefs.current[pedido.id] = el; }}
                                            onChange={e => handleComprobanteUpload(pedido.id, e)}
                                        />
                                    </label>
                                )}

                                {/* Comprobante thumbnail + approve/reject (admin only) */}
                                {user.role === 'admin' && pStatus === 'comprobante_subido' && pedido.comprobanteFoto && (
                                    <div className="comprobante-review-inline" onClick={e => e.stopPropagation()}>
                                        <img
                                            src={pedido.comprobanteFoto}
                                            alt="Comprobante"
                                            className="comprobante-thumb"
                                            onClick={() => setComprobanteModalImg(pedido.comprobanteFoto)}
                                        />
                                        <button className="btn-approve-payment" title="Aprobar pago" onClick={e => handleApprovePayment(e, pedido.id)}>
                                            <Check size={14} />
                                        </button>
                                        <button className="btn-reject-payment" title="Rechazar pago" onClick={e => handleRejectPayment(e, pedido.id)}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}

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
                                            <span className="detail-value">{pedido.origen || 'Sin origen'}</span>
                                        </div>
                                    </div>
                                )}

                                {canProcessOrder && (
                                    <div className="pedido-status-controls">
                                        <label>Preparacion del pedido:</label>
                                        <div className="status-buttons">
                                            <button
                                                type="button"
                                                className={`btn ${pedido.estado === 'listo-juan' ? 'btn-success' : 'btn-outline'}`}
                                                onClick={(event) => handlePedidoStatusChange(event, pedido.id, 'listo-juan')}
                                            >
                                                <CheckCircle size={16} /> Listo Juan
                                            </button>
                                            <button
                                                type="button"
                                                className={`btn ${pedido.estado === 'incompleto' ? 'btn-error' : 'btn-outline'}`}
                                                onClick={(event) => handlePedidoStatusChange(event, pedido.id, 'incompleto')}
                                            >
                                                <AlertCircle size={16} /> Falta Algo
                                            </button>
                                            <button
                                                type="button"
                                                className={`btn ${pedido.estado === 'pendiente' ? 'btn-warning' : 'btn-outline'}`}
                                                onClick={(event) => handlePedidoStatusChange(event, pedido.id, 'pendiente')}
                                            >
                                                Restaurar a Pendiente
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {Array.isArray(pedido.fotosAdjuntas) && pedido.fotosAdjuntas.length > 0 && (
                                    <div className="pedido-photo-block">
                                        <div className="pedido-photo-block__title">Referencia visual para Juan</div>
                                        <div className="pedido-photo-grid">
                                            {pedido.fotosAdjuntas.map((foto) => {
                                                const imageSrc = foto?.dataUrl || foto?.url || foto?.src || '';
                                                if (!imageSrc) return null;
                                                return (
                                                    <a
                                                        key={foto.id || imageSrc}
                                                        href={imageSrc}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="pedido-photo-card"
                                                    >
                                                        <img src={imageSrc} alt={foto.nombre || 'Adjunto del pedido'} />
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {canApproveOrder && (
                                    <div className="pedido-status-controls">
                                        <label>Chequeo de Nadia:</label>
                                        <div className="status-buttons">
                                            <button
                                                type="button"
                                                className={`btn ${pedido.estado === 'listo' ? 'btn-success' : 'btn-outline'}`}
                                                onClick={(event) => handlePedidoStatusChange(event, pedido.id, 'listo')}
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
                                            <div className="add-item-row pedido-add-item-grid">
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
                                                <label className="pedido-inline-upload">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleNewItemPhotoChange}
                                                    />
                                                    {newItemImage ? 'Foto cargada' : 'Subir foto'}
                                                </label>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => handleAddItem(pedido.id)}
                                                    disabled={!newItemDesc.trim() && !newItemProductId}
                                                >
                                                    <Save size={14} />
                                                </button>
                                            </div>
                                            {newItemImage && (
                                                <div className="pedido-item-upload-preview">
                                                    <img src={newItemImage} alt="Foto manual del item" />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            </div>
                        )}
                    </div>
                );})}
            </div>

            {/* Comprobante full-size modal */}
            {comprobanteModalImg && (
                <div className="comprobante-modal-overlay" onClick={() => setComprobanteModalImg(null)}>
                    <div className="comprobante-modal-content" onClick={e => e.stopPropagation()}>
                        <button className="comprobante-modal-close" onClick={() => setComprobanteModalImg(null)}>
                            <X size={24} />
                        </button>
                        <img src={comprobanteModalImg} alt="Comprobante de pago" />
                    </div>
                </div>
            )}
        </div>
    );
}
