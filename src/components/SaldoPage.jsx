import React, { useMemo, useState } from 'react';
import { Camera, PlusCircle, Receipt, Search, Trash2, Wallet } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import ImageUploader from './ImageUploader';
import ImageGallery from './ImageGallery';
import { generateId } from '../utils/helpers';

const MOVEMENT_TYPES = [
    { value: 'deuda', label: 'Deuda / Ticket' },
    { value: 'pago', label: 'Pago recibido' }
];

const normalizeText = (value) => (value || '').toString().trim();
const normalizeComparable = (value) => normalizeText(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
const normalizePhone = (value) => normalizeText(value).replace(/\D/g, '');
const toNumber = (value) => Number.parseFloat(value || 0) || 0;
const formatMoney = (value) => `$${Math.round(Number(value || 0)).toLocaleString('es-AR')}`;
const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const getDateLabel = (value) => {
    if (!value) return 'Sin fecha';
    const safeValue = String(value).slice(0, 10);
    const [year, month, day] = safeValue.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
};

export default function SaldoPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [selectedClientId, setSelectedClientId] = useState('');
    const [debtSearchTerm, setDebtSearchTerm] = useState('');
    const [movementType, setMovementType] = useState(MOVEMENT_TYPES[0].value);
    const [useDate, setUseDate] = useState(true);
    const [fecha, setFecha] = useState(getTodayLocalDate());
    const [ticket, setTicket] = useState('');
    const [detalle, setDetalle] = useState('');
    const [monto, setMonto] = useState('');

    if (user.role !== 'admin') {
        return <div style={{ padding: 'var(--sp-4)' }}>Solo visible para administrador.</div>;
    }

    const clientes = state.config?.clientes || [];
    const saldoMovimientos = state.config?.saldoMovimientos || [];
    const saldoClienteFotos = state.config?.saldoClienteFotos || {};
    const currentSales = state.config?.posVentas || [];
    const archivedSales = (state.config?.posCerradoZ || []).flatMap((close) => close.detalleVentas || []);
    const allSales = [...currentSales, ...archivedSales];

    const groupedClients = useMemo(() => {
        const map = new Map();

        saldoMovimientos.forEach((movement) => {
            const clientId = normalizeText(movement.clienteId);
            const clientName = normalizeText(movement.clienteNombre) || 'Cliente sin nombre';
            const signedAmount = movement.tipo === 'pago'
                ? -Math.abs(toNumber(movement.monto))
                : Math.abs(toNumber(movement.monto));
            const key = clientId || clientName;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    clienteId: clientId,
                    clienteNombre: clientName,
                    cuit: normalizeText(movement.cuit),
                    telefono: normalizeText(movement.telefono),
                    email: normalizeText(movement.email),
                    movimientos: [],
                    saldo: 0,
                    totalDeuda: 0,
                    totalPagado: 0,
                    ultimaFecha: ''
                });
            }

            const current = map.get(key);
            current.movimientos.push(movement);
            current.saldo += signedAmount;
            current.totalDeuda += movement.tipo === 'deuda' ? Math.abs(toNumber(movement.monto)) : 0;
            current.totalPagado += movement.tipo === 'pago' ? Math.abs(toNumber(movement.monto)) : 0;
            if ((movement.fecha || '') > current.ultimaFecha) current.ultimaFecha = movement.fecha || '';
        });

        return Array.from(map.values())
            .map((group) => {
                const linkedClient = clientes.find((cliente) => String(cliente.id) === String(group.clienteId));
                return {
                    ...group,
                    clienteId: linkedClient?.id || group.clienteId,
                    clienteNombre: linkedClient?.nombre || group.clienteNombre,
                    cuit: linkedClient?.cuit || group.cuit,
                    telefono: linkedClient?.telefono || group.telefono,
                    email: linkedClient?.email || group.email,
                    wooId: linkedClient?.wooId || '',
                    provincia: linkedClient?.provincia || '',
                    ciudad: linkedClient?.ciudad || '',
                    direccion: linkedClient?.direccion || '',
                    movimientos: [...group.movimientos].sort((left, right) => (right.fecha || '').localeCompare(left.fecha || ''))
                };
            })
            .sort((left, right) => {
                if (right.saldo !== left.saldo) return right.saldo - left.saldo;
                return left.clienteNombre.localeCompare(right.clienteNombre);
            });
    }, [saldoMovimientos, clientes]);

    const selectedClient = useMemo(() => {
        if (selectedClientId) {
            return clientes.find((cliente) => String(cliente.id) === String(selectedClientId)) || null;
        }
        return null;
    }, [clientes, selectedClientId]);

    const selectedGroup = useMemo(() => {
        if (selectedClientId) {
            const fromGroups = groupedClients.find((group) => String(group.clienteId || group.key) === String(selectedClientId));
            if (fromGroups) return fromGroups;
            if (selectedClient) {
                return {
                    key: String(selectedClient.id),
                    clienteId: selectedClient.id,
                    clienteNombre: selectedClient.nombre,
                    cuit: selectedClient.cuit || '',
                    telefono: selectedClient.telefono || '',
                    email: selectedClient.email || '',
                    wooId: selectedClient.wooId || '',
                    provincia: selectedClient.provincia || '',
                    ciudad: selectedClient.ciudad || '',
                    direccion: selectedClient.direccion || '',
                    movimientos: [],
                    saldo: 0,
                    totalDeuda: 0,
                    totalPagado: 0,
                    ultimaFecha: ''
                };
            }
        }
        return groupedClients.find((group) => group.saldo > 0) || groupedClients[0] || null;
    }, [groupedClients, selectedClient, selectedClientId]);

    const debtClients = useMemo(() => {
        const query = normalizeComparable(debtSearchTerm);
        return groupedClients
            .filter((item) => item.saldo > 0)
            .filter((item) => {
                if (!query) return true;
                return [
                    item.clienteNombre,
                    item.cuit,
                    item.telefono,
                    item.email
                ].some((value) => normalizeComparable(value).includes(query));
            });
    }, [groupedClients, debtSearchTerm]);

    const selectedClientSales = useMemo(() => {
        if (!selectedGroup) return [];

        const clientId = String(selectedGroup.clienteId || '').trim();
        const clientWooId = String(selectedGroup.wooId || '').trim();
        const clientName = normalizeComparable(selectedGroup.clienteNombre);
        const clientPhone = normalizePhone(selectedGroup.telefono);

        return allSales
            .filter((sale) => {
                const saleClientId = String(sale.clienteId || '').trim();
                const saleWooId = String(sale.wooCustomerId || sale.clienteWooId || sale.cliente?.wooId || '').trim();
                const saleClientName = normalizeComparable(
                    sale.clienteNombre ||
                    sale.nombreCliente ||
                    sale.cliente?.nombre ||
                    sale.cliente
                );
                const salePhone = normalizePhone(
                    sale.telefonoCliente ||
                    sale.clienteTelefono ||
                    sale.cliente?.telefono ||
                    ''
                );

                return (
                    (clientId && saleClientId && clientId === saleClientId) ||
                    (clientWooId && saleWooId && clientWooId === saleWooId) ||
                    (clientName && saleClientName && clientName === saleClientName) ||
                    (clientPhone && salePhone && clientPhone === salePhone)
                );
            })
            .sort((left, right) => new Date(right.fecha || 0) - new Date(left.fecha || 0));
    }, [allSales, selectedGroup]);

    const salesSummary = useMemo(() => {
        const lastSale = selectedClientSales[0] || null;
        const totalPurchased = selectedClientSales.reduce((acc, sale) => acc + toNumber(sale.totalFinal || sale.total), 0);
        return {
            lastSale,
            totalPurchased,
            purchaseCount: selectedClientSales.length
        };
    }, [selectedClientSales]);

    const selectedClientPhotos = selectedGroup
        ? (saldoClienteFotos[String(selectedGroup.clienteId || selectedGroup.key)] || [])
        : [];

    const totalSaldo = groupedClients.reduce((acc, item) => acc + item.saldo, 0);
    const totalDebt = groupedClients.reduce((acc, item) => acc + item.totalDeuda, 0);
    const totalPaid = groupedClients.reduce((acc, item) => acc + item.totalPagado, 0);
    const clientsWithDebt = groupedClients.filter((item) => item.saldo > 0).length;

    const addMovement = () => {
        const client = clientes.find((item) => String(item.id) === String(selectedClientId));
        if (!client || !monto) return;

        updateConfig({
            saldoMovimientos: [
                {
                    id: `${Date.now()}`,
                    clienteId: client.id,
                    clienteNombre: client.nombre,
                    cuit: client.cuit || '',
                    telefono: client.telefono || '',
                    email: client.email || '',
                    tipo: movementType,
                    fecha: useDate ? fecha : '',
                    ticket: normalizeText(ticket),
                    detalle: normalizeText(detalle),
                    monto: Math.abs(toNumber(monto)),
                    createdBy: user.email,
                    createdAt: new Date().toISOString()
                },
                ...saldoMovimientos
            ]
        });

        setTicket('');
        setDetalle('');
        setMonto('');
    };

    const deleteMovement = (movementId) => {
        updateConfig({
            saldoMovimientos: saldoMovimientos.filter((movement) => movement.id !== movementId)
        });
    };

    const addTicketPhoto = (image) => {
        if (!selectedGroup) return;
        const key = String(selectedGroup.clienteId || selectedGroup.key);
        updateConfig({
            saldoClienteFotos: {
                ...saldoClienteFotos,
                [key]: [
                    {
                        id: generateId(),
                        ...image,
                        tipo: 'Ticket',
                        createdAt: new Date().toISOString(),
                        createdBy: user.email
                    },
                    ...(saldoClienteFotos[key] || [])
                ]
            }
        });
    };

    const removeTicketPhoto = (imageId) => {
        if (!selectedGroup) return;
        const key = String(selectedGroup.clienteId || selectedGroup.key);
        updateConfig({
            saldoClienteFotos: {
                ...saldoClienteFotos,
                [key]: (saldoClienteFotos[key] || []).filter((image) => image.id !== imageId)
            }
        });
    };

    return (
        <div className="saldo-page" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Wallet size={22} /> Saldo de Clientes
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Registrá deuda por ticket o pagos parciales y seguí cada cuenta con historial, fotos y datos reales del cliente.
                </p>
            </div>

            <div className="saldo-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Saldo total a favor</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>{formatMoney(totalSaldo)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Deuda cargada</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>{formatMoney(totalDebt)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Pagos descontados</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: '#93c5fd' }}>{formatMoney(totalPaid)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Clientes con deuda</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>{clientsWithDebt}</div>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1.4fr) repeat(4, minmax(140px, 1fr)) auto', gap: 12, alignItems: 'end' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Cliente</label>
                        <select className="form-select" value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)}>
                            <option value="">Seleccionar cliente...</option>
                            {clientes
                                .slice()
                                .sort((left, right) => (left.nombre || '').localeCompare(right.nombre || ''))
                                .map((cliente) => (
                                    <option key={cliente.id} value={cliente.id}>
                                        {cliente.nombre} {cliente.cuit ? `· ${cliente.cuit}` : ''}
                                    </option>
                                ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Tipo</label>
                        <select className="form-select" value={movementType} onChange={(event) => setMovementType(event.target.value)}>
                            {MOVEMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Ticket</label>
                        <input className="form-input" value={ticket} onChange={(event) => setTicket(event.target.value)} placeholder="Ej: T-2048" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Detalle</label>
                        <input className="form-input" value={detalle} onChange={(event) => setDetalle(event.target.value)} placeholder="Observación opcional" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Monto</label>
                        <input type="number" className="form-input" value={monto} onChange={(event) => setMonto(event.target.value)} />
                    </div>
                    <button className="btn btn-primary" onClick={addMovement} disabled={!selectedClientId || !monto}>
                        <PlusCircle size={16} /> Agregar
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <input type="checkbox" checked={useDate} onChange={(event) => setUseDate(event.target.checked)} />
                        Usar fecha
                    </label>
                    <input
                        type="date"
                        className="form-input"
                        value={useDate ? fecha : ''}
                        onChange={(event) => setFecha(event.target.value)}
                        disabled={!useDate}
                        style={{ width: 220 }}
                    />
                </div>
            </div>

            <div className="saldo-layout" style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 12, alignContent: 'start' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Clientes con deuda</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                className="form-input"
                                value={debtSearchTerm}
                                onChange={(event) => setDebtSearchTerm(event.target.value)}
                                placeholder="Buscar entre los que deben..."
                                style={{ paddingLeft: 38 }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: 10, maxHeight: '65vh', overflowY: 'auto' }}>
                        {debtClients.length === 0 ? (
                            <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', fontSize: 13 }}>
                                No hay clientes con deuda para mostrar.
                            </div>
                        ) : debtClients.map((cliente) => (
                            <button
                                key={cliente.key}
                                type="button"
                                className="saldo-client-card"
                                onClick={() => setSelectedClientId(String(cliente.clienteId))}
                                style={{
                                    textAlign: 'left',
                                    padding: 14,
                                    borderRadius: 14,
                                    border: String(selectedGroup?.clienteId || selectedGroup?.key) === String(cliente.clienteId || cliente.key) ? '1px solid rgba(20,184,166,0.45)' : '1px solid rgba(255,255,255,0.06)',
                                    background: String(selectedGroup?.clienteId || selectedGroup?.key) === String(cliente.clienteId || cliente.key) ? 'rgba(20,184,166,0.08)' : 'rgba(255,255,255,0.03)',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                    <div>
                                        <div style={{ fontWeight: 'var(--fw-semibold)' }}>{cliente.clienteNombre}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                                            {cliente.cuit || 'Sin CUIT'} {cliente.telefono ? `· ${cliente.telefono}` : ''}
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>
                                        {formatMoney(cliente.saldo)}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 14 }}>
                    {!selectedGroup ? (
                        <div style={{ color: 'var(--text-muted)' }}>Seleccioná un cliente para ver su saldo, compras y tickets.</div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>{selectedGroup.clienteNombre}</h3>
                                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                                        {selectedGroup.cuit || 'Sin CUIT'}
                                        {selectedGroup.telefono ? ` · ${selectedGroup.telefono}` : ''}
                                        {selectedGroup.email ? ` · ${selectedGroup.email}` : ''}
                                    </div>
                                    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                                        {[selectedGroup.provincia, selectedGroup.ciudad, selectedGroup.direccion].filter(Boolean).join(' · ') || 'Sin dirección cargada'}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saldo actual</div>
                                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: selectedGroup.saldo > 0 ? 'var(--success)' : 'var(--text-primary)' }}>
                                        {formatMoney(selectedGroup.saldo)}
                                    </div>
                                </div>
                            </div>

                            <div className="saldo-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total deuda</div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{formatMoney(selectedGroup.totalDeuda)}</div>
                                </div>
                                <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total pagado</div>
                                    <div style={{ fontWeight: 'var(--fw-bold)', color: '#93c5fd' }}>{formatMoney(selectedGroup.totalPagado)}</div>
                                </div>
                                <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Último movimiento</div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{getDateLabel(selectedGroup.ultimaFecha)}</div>
                                </div>
                                <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Última compra</div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>
                                        {salesSummary.lastSale ? getDateLabel(String(salesSummary.lastSale.fecha).slice(0, 10)) : '-'}
                                    </div>
                                </div>
                                <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Veces que compró</div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{salesSummary.purchaseCount}</div>
                                </div>
                                <div style={{ padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total comprado</div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{formatMoney(salesSummary.totalPurchased)}</div>
                                </div>
                            </div>

                            <div className="saldo-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: 16 }}>
                                <div className="glass-panel" style={{ padding: 'var(--sp-4)', background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 'var(--fw-semibold)' }}>
                                        <Camera size={16} /> Tickets y fotos adjuntas
                                    </div>
                                    <ImageGallery imagenes={selectedClientPhotos} onRemove={removeTicketPhoto} />
                                    <ImageUploader onUpload={addTicketPhoto} />
                                </div>

                                <div className="glass-panel" style={{ padding: 'var(--sp-4)', background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontWeight: 'var(--fw-semibold)' }}>
                                        <Receipt size={16} /> Datos del dashboard
                                    </div>
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Cantidad de movimientos de saldo</div>
                                            <strong>{selectedGroup.movimientos.length}</strong>
                                        </div>
                                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Tickets/fotos cargadas</div>
                                            <strong>{selectedClientPhotos.length}</strong>
                                        </div>
                                        <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Último total de compra</div>
                                            <strong>{salesSummary.lastSale ? formatMoney(salesSummary.lastSale.totalFinal || salesSummary.lastSale.total) : '-'}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: 10 }}>
                                {selectedGroup.movimientos.length === 0 ? (
                                    <div style={{ color: 'var(--text-muted)' }}>Todavía no hay movimientos para este cliente.</div>
                                ) : selectedGroup.movimientos.map((movement) => (
                                    <div key={movement.id} style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 10 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                <div style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 12,
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    background: movement.tipo === 'pago' ? 'rgba(59,130,246,0.18)' : 'rgba(20,184,166,0.18)',
                                                    color: movement.tipo === 'pago' ? '#93c5fd' : 'var(--success)'
                                                }}>
                                                    <Receipt size={18} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 'var(--fw-semibold)' }}>
                                                        {movement.tipo === 'pago' ? 'Pago registrado' : 'Deuda cargada'}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                        {getDateLabel(movement.fecha)} {movement.ticket ? `· Ticket ${movement.ticket}` : '· Sin ticket'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <strong style={{ color: movement.tipo === 'pago' ? '#93c5fd' : '#fcd34d' }}>
                                                    {movement.tipo === 'pago' ? '-' : '+'}{formatMoney(movement.monto)}
                                                </strong>
                                                <button className="btn btn-secondary" onClick={() => deleteMovement(movement.id)} style={{ padding: '8px 10px' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        {movement.detalle && (
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                {movement.detalle}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
