import React, { useMemo, useState } from 'react';
import { useData } from '../store/DataContext';
import { Plus, User, FileText, MapPin, Truck, History, Globe, RefreshCw, Mail, X } from 'lucide-react';
import ClienteModal from './ClienteModal';
import { wooService } from '../utils/wooService';
import { generateId } from '../utils/helpers';

const ARGENTINA_PROVINCES = {
    B: 'Buenos Aires',
    C: 'Ciudad Autonoma de Buenos Aires',
    K: 'Catamarca',
    H: 'Chaco',
    U: 'Chubut',
    X: 'Cordoba',
    W: 'Corrientes',
    E: 'Entre Rios',
    P: 'Formosa',
    Y: 'Jujuy',
    L: 'La Pampa',
    F: 'La Rioja',
    M: 'Mendoza',
    N: 'Misiones',
    Q: 'Neuquen',
    R: 'Rio Negro',
    A: 'Salta',
    J: 'San Juan',
    D: 'San Luis',
    Z: 'Santa Cruz',
    S: 'Santa Fe',
    G: 'Santiago del Estero',
    V: 'Tierra del Fuego',
    T: 'Tucuman'
};

const normalizeWooPhone = (phone) => {
    if (!phone) return '';
    return phone.toString().replace(/\s+/g, ' ').replace(/[^\d+\-() ]/g, '').trim();
};

const normalizeClientMatch = (value) => (
    (value || '')
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
);

const normalizeWooProvince = (billing = {}, shipping = {}) => {
    const rawState = (billing.state || shipping.state || '').trim();
    const stateCode = rawState.toUpperCase();
    const province = ARGENTINA_PROVINCES[stateCode] || rawState || '';
    const city = (billing.city || shipping.city || '').trim();

    if (province && city && city.toLowerCase() !== province.toLowerCase()) {
        return `${province} - ${city}`;
    }
    return province || city || '';
};

const parseWooAmount = (value) => Number(String(value || 0).replace(/[^\d.-]/g, '')) || 0;

const normalizeWooCustomerName = (billing = {}, shipping = {}, fallback = '') => (
    `${billing.first_name || shipping.first_name || ''} ${billing.last_name || shipping.last_name || ''}`.trim() ||
    fallback ||
    'Sin nombre'
);

const getClientMatchKeys = ({ wooId, email, telefono, nombre }) => [
    wooId && String(wooId) !== '0' ? `woo:${String(wooId).trim()}` : '',
    email ? `email:${String(email).toLowerCase().trim()}` : '',
    telefono ? `phone:${normalizeWooPhone(telefono)}` : '',
    nombre && nombre !== 'Sin nombre' ? `name:${normalizeClientMatch(nombre)}` : ''
].filter(Boolean);

const findClientIndex = (clientes, keys) => clientes.findIndex((cliente) => {
    const clientKeys = getClientMatchKeys(cliente);
    return keys.some((key) => clientKeys.includes(key));
});

const buildWooOrderStats = (orders = []) => {
    const byKey = new Map();
    const records = [];
    const excludedStatuses = new Set(['cancelled', 'failed', 'refunded', 'trash']);

    orders.forEach((order) => {
        if (excludedStatuses.has(String(order.status || '').toLowerCase())) return;
        const billing = order.billing || {};
        const shipping = order.shipping || {};
        const record = {
            wooId: order.customer_id || order.wooCustomerId || '',
            nombre: normalizeWooCustomerName(billing, shipping, billing.email || order.email),
            email: billing.email || order.email || '',
            telefono: normalizeWooPhone(billing.phone || shipping.phone || order.telefono || ''),
            provincia: normalizeWooProvince(billing, shipping),
            direccion: billing.address_1 || shipping.address_1 || '',
            totalCompras: 0,
            cantidadPedidos: 0,
            ultimaCompra: ''
        };
        const keys = getClientMatchKeys(record);
        if (!keys.length) return;

        let existing = keys.map((key) => byKey.get(key)).find(Boolean);
        if (!existing) {
            existing = record;
            records.push(existing);
        }
        keys.forEach((key) => byKey.set(key, existing));

        const amount = parseWooAmount(order.total || order.totalAmount || order.monto);
        const date = order.date_created || order.fecha || order.createdAt || '';
        existing.totalCompras += amount;
        existing.cantidadPedidos += 1;
        if (date && (!existing.ultimaCompra || new Date(date) > new Date(existing.ultimaCompra))) {
            existing.ultimaCompra = date;
        }
        if (!existing.email && record.email) existing.email = record.email;
        if (!existing.telefono && record.telefono) existing.telefono = record.telefono;
        if (!existing.provincia && record.provincia) existing.provincia = record.provincia;
        if (!existing.direccion && record.direccion) existing.direccion = record.direccion;
        if ((!existing.nombre || existing.nombre === 'Sin nombre') && record.nombre) existing.nombre = record.nombre;
    });

    return records;
};

export default function ClientesPage() {
    const { state, addCliente, updateCliente, deleteCliente, updateConfig } = useData();
    const { clientes = [], posVentas = [], pedidosOnline = [] } = state.config;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCliente, setEditingCliente] = useState(null);
    const [viewingHistory, setViewingHistory] = useState(null);
    const [importingWoo, setImportingWoo] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [topFilter, setTopFilter] = useState(null);
    const [rankMonth, setRankMonth] = useState('');  // YYYY-MM format or '' for all time

    const normalizeSearchValue = (value) => (value || '').toString().toLowerCase().trim();

    // Calculate total spend per client for Top N filtering
    const clientesConTotal = useMemo(() => {
        const matchDate = (dateStr) => {
            if (!rankMonth) return true;
            return (dateStr || '').substring(0, 7) === rankMonth;
        };

        return clientes.map(cliente => {
            const nombre = normalizeClientMatch(cliente.nombre);
            const telefono = normalizeWooPhone(cliente.telefono);
            const wooId = String(cliente.wooId || '').trim();
            const cEmail = (cliente.email || '').toLowerCase().trim();

            let total = 0;
            let orderCount = 0;
            let sources = new Set();
            let products = [];

            // Sum from online orders (pedidosOnline) — REAL source of truth for online sales
            (pedidosOnline || []).forEach(pedido => {
                // Build all possible name/email/phone from the pedido (handles both old and new import formats)
                const pNombre = normalizeClientMatch(
                    pedido.clienteNombre || pedido.cliente ||
                    ((pedido.billing?.first_name || pedido.billing?.last_name) ? `${pedido.billing?.first_name || ''} ${pedido.billing?.last_name || ''}`.trim() : '') ||
                    pedido.email || ''
                );
                const pWooId = String(pedido.customer_id || pedido.wooCustomerId || '').trim();
                const pEmail = (pedido.email || pedido.billing?.email || '').toLowerCase().trim();
                const pPhone = normalizeWooPhone(pedido.telefono || pedido.billing?.phone || '');

                const matches = (
                    (wooId && pWooId && pWooId !== '0' && wooId === pWooId) ||
                    (cEmail && pEmail && cEmail === pEmail) ||
                    (nombre && pNombre && nombre === pNombre) ||
                    (telefono && pPhone && telefono === pPhone)
                );
                if (!matches) return;

                if (matchDate(pedido.date_created || pedido.fecha)) {
                    total += Number(pedido.total || pedido.monto || pedido.totalAmount || 0);
                    orderCount++;
                    const src = (pedido.origen || (pedido.wooId ? 'Web' : '')).toLowerCase();
                    if (src.includes('instagram')) sources.add('Instagram');
                    else if (src.includes('facebook') || src.includes('meta')) sources.add('Meta Ads');
                    else if (src.includes('google') || src === 'organic') sources.add('Organico');
                    else if (src.includes('whatsapp')) sources.add('WhatsApp');
                    else sources.add('Web');
                }
            });

            // Sum from POS ventas (local sales)
            (posVentas || []).forEach(venta => {
                const vNombre = normalizeClientMatch(venta.clienteNombre || venta.nombreCliente || venta.cliente?.nombre || venta.cliente || '');
                const vTel = normalizeWooPhone(venta.clienteTelefono || venta.telefonoCliente || venta.cliente?.telefono || '');
                const vId = String(venta.clienteId || '').trim();
                if (
                    (vId && vId === String(cliente.id)) ||
                    (nombre && vNombre && nombre === vNombre) ||
                    (telefono && vTel && telefono === vTel)
                ) {
                    if (matchDate(venta.fecha)) {
                        total += Number(venta.total || venta.totalFinal || 0);
                        orderCount++;
                        sources.add('Local');
                        (venta.items || []).forEach(it => { if (it.nombre) products.push(it.nombre); });
                    }
                }
            });

            // WooCommerce totals are the strongest fallback when the local order list is incomplete.
            const savedWooTotal = Number(cliente.totalCompras || 0);
            const savedWooOrders = Number(cliente.cantidadPedidos || 0);
            if (!rankMonth && (savedWooTotal > total || savedWooOrders > orderCount)) {
                total = Math.max(total, savedWooTotal);
                orderCount = Math.max(orderCount, savedWooOrders || (savedWooTotal > 0 ? 1 : 0));
                sources.add('WooCommerce');
            }

            return { ...cliente, _totalSpend: total, _orderCount: orderCount, _sources: [...sources].join(', ') || cliente.origen || '-', _topProducts: [...new Set(products)].slice(0, 3).join(', ') };
        });
    }, [clientes, posVentas, pedidosOnline, rankMonth]);

    const filteredClientes = useMemo(() => {
        // Always sort by total spend descending (ranking by accumulated amount)
        let list = [...clientesConTotal].sort((a, b) => b._totalSpend - a._totalSpend);

        // Apply top N filter
        if (topFilter) {
            list = list.slice(0, topFilter);
        }

        const query = normalizeSearchValue(searchTerm);
        if (!query) return list;

        return list.filter((cliente) => (
            [
                cliente.nombre,
                cliente.cuit,
                cliente.telefono,
                cliente.provincia,
                cliente.email
            ].some((value) => normalizeSearchValue(value).includes(query))
        ));
    }, [clientesConTotal, searchTerm, topFilter]);

    const ventasClienteSeleccionado = useMemo(() => {
        if (!viewingHistory) return [];

        const clienteNombre = normalizeClientMatch(viewingHistory.nombre);
        const clienteTelefono = normalizeWooPhone(viewingHistory.telefono);
        const clienteWooId = String(viewingHistory.wooId || '').trim();

        return (posVentas || [])
            .filter((venta) => {
                const ventaClienteId = String(venta.clienteId || '').trim();
                const ventaClienteNombre = normalizeClientMatch(
                    venta.clienteNombre ||
                    venta.nombreCliente ||
                    venta.cliente?.nombre ||
                    venta.cliente
                );
                const ventaClienteTelefono = normalizeWooPhone(
                    venta.clienteTelefono ||
                    venta.telefonoCliente ||
                    venta.cliente?.telefono ||
                    ''
                );
                const ventaWooId = String(
                    venta.wooCustomerId ||
                    venta.clienteWooId ||
                    venta.cliente?.wooId ||
                    ''
                ).trim();

                return (
                    (ventaClienteId && ventaClienteId === String(viewingHistory.id)) ||
                    (clienteWooId && ventaWooId && clienteWooId === ventaWooId) ||
                    (clienteNombre && ventaClienteNombre && clienteNombre === ventaClienteNombre) ||
                    (clienteTelefono && ventaClienteTelefono && clienteTelefono === ventaClienteTelefono)
                );
            })
            .map((venta) => ({
                ...venta,
                origen: venta.origen || 'POS',
                total: Number(venta.total || 0)
            }))
            .concat(
                (pedidosOnline || [])
                    .filter((pedido) => {
                        const pedidoNombre = normalizeClientMatch(
                            pedido.clienteNombre ||
                            ((pedido.billing?.first_name || pedido.billing?.last_name)
                                ? `${pedido.billing?.first_name || ''} ${pedido.billing?.last_name || ''}`
                                : pedido.billing?.first_name ||
                                  pedido.shipping?.first_name ||
                                  pedido.email)
                        );
                        const pedidoTelefono = normalizeWooPhone(
                            pedido.telefono ||
                            pedido.billing?.phone ||
                            pedido.shipping?.phone ||
                            ''
                        );
                        const pedidoWooId = String(pedido.customer_id || pedido.wooCustomerId || '').trim();

                        return (
                            (clienteWooId && pedidoWooId && clienteWooId === pedidoWooId) ||
                            (clienteNombre && pedidoNombre && clienteNombre === pedidoNombre) ||
                            (clienteTelefono && pedidoTelefono && clienteTelefono === pedidoTelefono)
                        );
                    })
                    .map((pedido) => ({
                        id: pedido.id,
                        fecha: pedido.fecha || pedido.date_created || pedido.createdAt || '',
                        total: Number(pedido.total || pedido.totalAmount || 0),
                        items: pedido.items || pedido.line_items || [],
                        origen: 'WooCommerce',
                        nroComprobante: pedido.numero || pedido.number || pedido.id
                    }))
            )
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    }, [posVentas, pedidosOnline, viewingHistory]);

    const ultimaCompraCliente = ventasClienteSeleccionado[0] || null;

    const handleSaveCliente = (clienteData) => {
        if (clienteData.id) {
            updateCliente(clienteData.id, clienteData);
        } else {
            addCliente(clienteData);
        }
    };

    const handleImportFromWoo = async () => {
        setImportingWoo(true);
        try {
            const [wooCustomers, wooOrders] = await Promise.all([
                wooService.fetchCustomers(state.config, { maxPages: 200 }),
                wooService.fetchOrders(state.config, { maxPages: 200, status: 'any' })
            ]);
            const orderStats = buildWooOrderStats(wooOrders);
            const nextClientes = [...clientes];
            let imported = 0;
            let updated = 0;

            const upsertWooClient = (clientData) => {
                const keys = getClientMatchKeys(clientData);
                const existingIndex = findClientIndex(nextClientes, keys);

                if (existingIndex === -1 && clientData.nombre !== 'Sin nombre') {
                    nextClientes.unshift({
                        id: generateId(),
                        createdAt: new Date().toISOString(),
                        cuit: '',
                        expreso: '',
                        descuento: 0,
                        origen: 'WooCommerce',
                        ...clientData
                    });
                    imported++;
                    return;
                }

                if (existingIndex >= 0) {
                    const exists = nextClientes[existingIndex];
                    const changes = {};
                    if (!exists.telefono && clientData.telefono) changes.telefono = clientData.telefono;
                    if (!exists.email && clientData.email) changes.email = clientData.email;
                    if (!exists.provincia && clientData.provincia) changes.provincia = clientData.provincia;
                    if (!exists.direccion && clientData.direccion) changes.direccion = clientData.direccion;
                    if (!exists.wooId && clientData.wooId) changes.wooId = clientData.wooId;
                    if (!exists.origen) changes.origen = 'WooCommerce';

                    const newTotal = Math.max(Number(exists.totalCompras || 0), Number(clientData.totalCompras || 0));
                    const newOrders = Math.max(Number(exists.cantidadPedidos || 0), Number(clientData.cantidadPedidos || 0));
                    if (newTotal !== Number(exists.totalCompras || 0)) changes.totalCompras = newTotal;
                    if (newOrders !== Number(exists.cantidadPedidos || 0)) changes.cantidadPedidos = newOrders;
                    if (clientData.ultimaCompra && clientData.ultimaCompra !== exists.ultimaCompra) changes.ultimaCompra = clientData.ultimaCompra;

                    if (Object.keys(changes).length > 0) {
                        nextClientes[existingIndex] = { ...exists, ...changes };
                        updated++;
                    }
                }
            };

            wooCustomers.forEach(wc => {
                const nombre = `${wc.first_name || ''} ${wc.last_name || ''}`.trim() || wc.email || 'Sin nombre';
                const telefono = normalizeWooPhone(wc.billing?.phone || wc.shipping?.phone || '');
                const provincia = normalizeWooProvince(wc.billing, wc.shipping);
                const direccion = wc.billing?.address_1 || wc.shipping?.address_1 || '';
                const stats = orderStats.find((record) => (
                    (wc.id && record.wooId && String(wc.id) === String(record.wooId)) ||
                    (wc.email && record.email && wc.email.toLowerCase() === record.email.toLowerCase()) ||
                    (telefono && record.telefono && telefono === record.telefono)
                ));

                upsertWooClient({
                    nombre,
                    email: wc.email || stats?.email || '',
                    telefono: telefono || stats?.telefono || '',
                    provincia: provincia || stats?.provincia || '',
                    direccion: direccion || stats?.direccion || '',
                    wooId: wc.id,
                    totalCompras: Math.max(parseWooAmount(wc.total_spent), Number(stats?.totalCompras || 0)),
                    cantidadPedidos: Math.max(parseInt(wc.orders_count || 0, 10), Number(stats?.cantidadPedidos || 0)),
                    ultimaCompra: stats?.ultimaCompra || ''
                });
            });

            orderStats.forEach((stats) => upsertWooClient(stats));
            updateConfig({ clientes: nextClientes });
            alert(`WooCommerce sincronizado: ${imported} clientes nuevos, ${updated} clientes actualizados, ${wooCustomers.length} clientes y ${wooOrders.length} pedidos revisados.`);
        } catch (err) {
            alert(`Error al importar clientes: ${err.message}`);
        } finally {
            setImportingWoo(false);
        }
    };

    const handleDeleteCliente = (id) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar a este cliente?')) {
            deleteCliente(id);
            if (viewingHistory && viewingHistory.id === id) setViewingHistory(null);
        }
    };

    const handleOpenEdit = (cliente) => {
        setEditingCliente(cliente);
        setIsModalOpen(true);
    };

    const handleOpenNew = () => {
        setEditingCliente(null);
        setIsModalOpen(true);
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const visibleIds = filteredClientes.map(c => c.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
        if (allSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                visibleIds.forEach(id => next.delete(id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                visibleIds.forEach(id => next.add(id));
                return next;
            });
        }
    };

    const selectedClientes = clientes.filter(c => selectedIds.has(c.id));
    const selectedWithEmail = selectedClientes.filter(c => c.email);
    const selectedWithoutEmail = selectedClientes.filter(c => !c.email);

    const CELAVIE_EMAIL = 'celavieindumentaria@gmail.com';

    const handleSendEmail = (method = 'gmail') => {
        const emails = selectedWithEmail.map(c => c.email);
        if (emails.length === 0) {
            alert('Ninguno de los clientes seleccionados tiene email.');
            return;
        }

        if (method === 'gmail') {
            // Open Gmail compose directly with celavieindumentaria@gmail.com
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${emails.join(',')}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}&from=${encodeURIComponent(CELAVIE_EMAIL)}`;
            window.open(gmailUrl, '_blank');
        } else {
            // Fallback mailto
            const mailtoUrl = `mailto:?bcc=${emails.join(',')}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            window.open(mailtoUrl);
        }

        setEmailModalOpen(false);
        setEmailSubject('');
        setEmailBody('');
        setSelectedIds(new Set());
    };

    const allVisibleSelected = filteredClientes.length > 0 && filteredClientes.every(c => selectedIds.has(c.id));

    return (
        <div className="clientes-page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User /> Gestión de Clientes
                </h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {state.config.marketing?.wooUrl && (
                        <button className="btn btn-secondary" onClick={handleImportFromWoo} disabled={importingWoo} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {importingWoo ? <RefreshCw size={16} className="spin" /> : <Globe size={16} />}
                            {importingWoo ? 'Importando...' : 'Importar de la Web'}
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={handleOpenNew} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Plus size={18} /> Nuevo Cliente
                    </button>
                    <button className="btn btn-secondary" onClick={() => {
                        const emails = filteredClientes.filter(c => c.email).map(c => c.email).join(', ');
                        if (!emails) { alert('No hay emails en los clientes filtrados'); return; }
                        navigator.clipboard.writeText(emails);
                        alert('✅ ' + filteredClientes.filter(c => c.email).length + ' emails copiados al portapapeles!\n\nPodés pegarlos en Gmail, Brevo, o cualquier herramienta de email marketing.');
                    }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📋 Copiar Emails ({filteredClientes.filter(c => c.email).length})
                    </button>
                </div>
            </div>

            <div className="clientes-grid" style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* Lista de clientes */}
                <div className="clientes-lista" style={{ flex: '1', overflowY: 'auto', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2 }}>
                        <input
                            type="text"
                            className="form-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por cliente, CUIT, teléfono o provincia..."
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Top:</span>
                            {[10, 20, 30, 50, 100].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setTopFilter(topFilter === n ? null : n)}
                                    style={{
                                        padding: '4px 12px', borderRadius: 16, border: '1px solid',
                                        borderColor: topFilter === n ? 'var(--accent)' : 'var(--border-color)',
                                        background: topFilter === n ? 'var(--accent)' : 'transparent',
                                        color: topFilter === n ? '#fff' : 'var(--text-secondary)',
                                        fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    Top {n}
                                </button>
                            ))}
                            <button
                                onClick={() => setTopFilter(null)}
                                style={{
                                    padding: '4px 12px', borderRadius: 16, border: '1px solid',
                                    borderColor: !topFilter ? 'var(--accent)' : 'var(--border-color)',
                                    background: !topFilter ? 'var(--accent)' : 'transparent',
                                    color: !topFilter ? '#fff' : 'var(--text-secondary)',
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                Todos ({clientes.length})
                            </button>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8, marginRight: 2 }}>Mes:</span>
                            <input type="month" value={rankMonth} onChange={e => setRankMonth(e.target.value)}
                                style={{ padding: '3px 8px', fontSize: 11, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                            {rankMonth && <button onClick={() => setRankMonth('')} style={{ padding: '3px 8px', fontSize: 11, borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>}
                        </div>
                    </div>
                    {clientes.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No hay clientes registrados aún. Clic en "Nuevo Cliente" para agregar uno.
                        </div>
                    ) : filteredClientes.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No encontré clientes para "{searchTerm}".
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: '73px', background: 'var(--bg-panel)', zIndex: 1, borderBottom: '1px solid var(--border-color)' }}>
                                <tr>
                                    <th style={{ padding: '12px', textAlign: 'center', width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            title="Seleccionar todos"
                                        />
                                    </th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Nombre / Razón Social</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>CUIT</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Email</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Teléfono</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Provincia</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total $</th>
                                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Pedidos</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Fuente</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Descuento</th>
                                    <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total Compras</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClientes.map(cliente => (
                                    <tr
                                        key={cliente.id}
                                        style={{
                                            borderBottom: '1px solid var(--border-color)',
                                            cursor: 'pointer',
                                            background: selectedIds.has(cliente.id)
                                                ? 'rgba(99,102,241,0.1)'
                                                : viewingHistory?.id === cliente.id ? 'var(--bg-hover)' : 'transparent'
                                        }}
                                        onClick={() => setViewingHistory(cliente)}
                                        className="table-row-hover"
                                    >
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(cliente.id)}
                                                onChange={(e) => { e.stopPropagation(); toggleSelect(cliente.id); }}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                        </td>
                                        <td style={{ padding: '12px', fontWeight: 'var(--fw-medium)' }}>{cliente.nombre}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{cliente.cuit || '-'}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>{cliente.email || '-'}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{normalizeWooPhone(cliente.telefono) || '-'}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{cliente.provincia || '-'}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: cliente._totalSpend > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{cliente._totalSpend > 0 ? '$' + Math.round(cliente._totalSpend).toLocaleString('es-AR') : '-'}</td>
                                        <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{cliente._orderCount || (cliente.cantidadPedidos > 0 ? cliente.cantidadPedidos : '-')}</td>
                                        <td style={{ padding: '12px', fontSize: 11, color: 'var(--text-muted)' }}>{cliente._sources}</td>
                                        <td style={{ padding: '12px', color: 'var(--accent)' }}>{cliente.descuento ? `${cliente.descuento}%` : '-'}</td>
                                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: cliente._totalSpend > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                                            {cliente._totalSpend > 0 ? `$${Math.round(cliente._totalSpend).toLocaleString('es-AR')}` : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Historial y Perfil del Cliente Seleccionado */}
                {viewingHistory && (
                    <div className="cliente-perfil" style={{ width: '380px', flexShrink: 0, background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} /> Perfil del Cliente
                            </h3>
                            <div>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(viewingHistory)}>Editar</button>
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteCliente(viewingHistory.id)}>Eliminar</button>
                            </div>
                        </div>

                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '8px' }}>{viewingHistory.nombre}</div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: 'var(--fs-sm)' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>CUIT:</span> <br />{viewingHistory.cuit || '-'}</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Teléfono:</span> <br />{normalizeWooPhone(viewingHistory.telefono) || '-'}</div>
                                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)' }}>Email:</span> <br />{viewingHistory.email || '-'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} className="text-muted" /> {viewingHistory.provincia || '-'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Truck size={14} className="text-muted" /> {viewingHistory.expreso || '-'}</div>
                            </div>
                            {/* Quick contact buttons */}
                            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                                {viewingHistory.email && (
                                    <a href={'mailto:' + viewingHistory.email + '?subject=CELAVIE%20-%20Nuevos%20Ingresos&body=Hola%20' + encodeURIComponent(viewingHistory.nombre?.split(' ')[0] || '') + ',%0A%0ATe%20escribimos%20de%20CELAVIE%20para%20contarte%20sobre%20nuestros%20nuevos%20ingresos.%0A%0AVisitá%20nuestra%20web:%20celavie.com.ar%0A%0ASaludos!'}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', textAlign: 'center', textDecoration: 'none', fontSize: 12, fontWeight: 'bold' }}>
                                        ✉️ Email
                                    </a>
                                )}
                                {viewingHistory.telefono && (
                                    <a href={'https://wa.me/549' + String(viewingHistory.telefono).replace(/\D/g, '').replace(/^0/, '').replace(/^54/, '') + '?text=' + encodeURIComponent('Hola ' + (viewingHistory.nombre?.split(' ')[0] || '') + '! Te escribimos de CELAVIE. Tenemos nuevos ingresos que te van a encantar! 🛍️ Mirá todo en celavie.com.ar')}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', color: '#22c55e', textAlign: 'center', textDecoration: 'none', fontSize: 12, fontWeight: 'bold' }}>
                                        💬 WhatsApp
                                    </a>
                                )}
                            </div>
                            {viewingHistory.descuento && (
                                <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                                    Descuento Habitual: {viewingHistory.descuento}%
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
                            <h4 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><History size={16} /> Historial de Compras</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Ultima compra</div>
                                    <div style={{ fontWeight: 'bold' }}>
                                        {ultimaCompraCliente
                                            ? `${new Date(ultimaCompraCliente.fecha).toLocaleDateString()} ${new Date(ultimaCompraCliente.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                            : '-'}
                                    </div>
                                </div>
                                <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Veces que compro</div>
                                    <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{ventasClienteSeleccionado.length}</div>
                                </div>
                            </div>

                            {ventasClienteSeleccionado.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', textAlign: 'center', padding: '1rem 0' }}>No hay compras registradas en el Punto de Venta para este cliente.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {ventasClienteSeleccionado.map(venta => (
                                        <div key={venta.id} style={{ background: 'var(--bg-input)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-sm)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 'bold' }}>{new Date(venta.fecha).toLocaleDateString()} {new Date(venta.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>${venta.totalFinal?.toFixed(2) || venta.total?.toFixed(2) || '0.00'}</span>
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {venta.items?.length || 0} artículos
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <ClienteModal
                    cliente={editingCliente}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSaveCliente}
                />
            )}

            {/* Floating action bar when clients are selected */}
            {selectedIds.size > 0 && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    zIndex: 100,
                    backdropFilter: 'blur(12px)'
                }}>
                    <span style={{ fontWeight: 'bold' }}>{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button
                        className="btn btn-primary"
                        onClick={() => setEmailModalOpen(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Mail size={16} /> Enviar Email
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            const selected = clientes.filter(c => selectedIds.has(c.id) && c.telefono);
                            if (selected.length === 0) { alert('Ninguno de los seleccionados tiene teléfono'); return; }
                            const msg = prompt('Mensaje para WhatsApp (usá {nombre} para personalizar):', 'Hola {nombre}! Te escribimos de CELAVIE. Tenemos nuevos ingresos que te van a encantar! 🛍️ Mirá todo en celavie.com.ar');
                            if (!msg) return;
                            const phones = selected.map(c => {
                                const tel = String(c.telefono).replace(/\D/g, '').replace(/^0/, '').replace(/^54/, '');
                                const nombre = (c.nombre || '').split(' ')[0] || 'Cliente';
                                return { tel: '549' + tel, msg: msg.replace(/\{nombre\}/g, nombre), nombre: c.nombre };
                            });
                            // Open first WhatsApp, then open the rest with 1-second delays
                            if (phones.length === 1) {
                                window.open('https://wa.me/' + phones[0].tel + '?text=' + encodeURIComponent(phones[0].msg), '_blank');
                            } else {
                                window.open('https://wa.me/' + phones[0].tel + '?text=' + encodeURIComponent(phones[0].msg), '_blank');
                                phones.slice(1).forEach((p, idx) => {
                                    setTimeout(() => {
                                        window.open('https://wa.me/' + p.tel + '?text=' + encodeURIComponent(p.msg), '_blank');
                                    }, (idx + 1) * 1200);
                                });
                                const list = phones.map(p => p.nombre + ': wa.me/' + p.tel).join('\n');
                                navigator.clipboard.writeText(list);
                                alert('✅ Abriendo ' + phones.length + ' WhatsApps (1 por segundo).\n\nTambién se copiaron los links al portapapeles.');
                            }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                        💬 WhatsApp ({clientes.filter(c => selectedIds.has(c.id) && c.telefono).length})
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={() => setSelectedIds(new Set())}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <X size={16} /> Limpiar
                    </button>
                </div>
            )}

            {/* Email compose modal */}
            {emailModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 200,
                    backdropFilter: 'blur(4px)'
                }} onClick={() => setEmailModalOpen(false)}>
                    <div style={{
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '24px',
                        width: '100%',
                        maxWidth: '560px',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                    }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Mail size={20} /> Enviar Email Masivo
                            </h3>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEmailModalOpen(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        {selectedWithoutEmail.length > 0 && (
                            <div style={{
                                background: 'rgba(234,179,8,0.15)',
                                border: '1px solid rgba(234,179,8,0.3)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '10px 12px',
                                marginBottom: '16px',
                                fontSize: 'var(--fs-sm)',
                                color: '#eab308'
                            }}>
                                {selectedWithoutEmail.length} cliente{selectedWithoutEmail.length !== 1 ? 's' : ''} sin email: {selectedWithoutEmail.map(c => c.nombre).join(', ')}
                            </div>
                        )}

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Desde:</label>
                            <div style={{
                                background: 'rgba(20, 184, 166, 0.08)',
                                border: '1px solid rgba(20, 184, 166, 0.2)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '10px',
                                fontSize: 'var(--fs-sm)',
                                color: 'var(--accent)',
                                fontWeight: 600
                            }}>
                                {CELAVIE_EMAIL}
                            </div>
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Para (BCC):</label>
                            <div style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '10px',
                                fontSize: 'var(--fs-sm)',
                                color: 'var(--text-muted)',
                                maxHeight: '80px',
                                overflowY: 'auto'
                            }}>
                                {selectedWithEmail.length} destinatario{selectedWithEmail.length !== 1 ? 's' : ''} con email
                            </div>
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Asunto:</label>
                            <input
                                type="text"
                                className="form-input"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                placeholder="Asunto del email..."
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Mensaje:</label>
                            <textarea
                                className="form-input"
                                value={emailBody}
                                onChange={(e) => setEmailBody(e.target.value)}
                                placeholder="Escribi el cuerpo del email..."
                                rows={6}
                                style={{ width: '100%', resize: 'vertical' }}
                            />
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)' }}>
                            Se abrira Gmail con los destinatarios en BCC. Asegurate de estar logueado en celavieindumentaria@gmail.com en el navegador.
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-secondary" onClick={() => setEmailModalOpen(false)}>Cancelar</button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => handleSendEmail('mailto')}
                                disabled={selectedWithEmail.length === 0}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 12 }}
                            >
                                <Mail size={14} /> Email App
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleSendEmail('gmail')}
                                disabled={selectedWithEmail.length === 0}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Mail size={16} /> Abrir en Gmail ({selectedWithEmail.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .table-row-hover:hover td {
                    background: var(--bg-hover);
                }
            `}</style>
        </div>
    );
}
