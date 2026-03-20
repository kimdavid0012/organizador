import React, { useState } from 'react';
import { useData } from '../store/DataContext';
import { Plus, User, FileText, MapPin, Truck, History, Globe, RefreshCw } from 'lucide-react';
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

export default function ClientesPage() {
    const { state, addCliente, updateCliente, deleteCliente } = useData();
    const { clientes = [], posVentas = [] } = state.config;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCliente, setEditingCliente] = useState(null);
    const [viewingHistory, setViewingHistory] = useState(null);
    const [importingWoo, setImportingWoo] = useState(false);

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
            const wooCustomers = await wooService.fetchCustomers(state.config);
            let imported = 0;
            let updated = 0;
            wooCustomers.forEach(wc => {
                const nombre = `${wc.first_name || ''} ${wc.last_name || ''}`.trim() || wc.email || 'Sin nombre';
                const telefono = normalizeWooPhone(wc.billing?.phone || wc.shipping?.phone || '');
                const provincia = normalizeWooProvince(wc.billing, wc.shipping);
                const direccion = wc.billing?.address_1 || wc.shipping?.address_1 || '';
                // Check if already exists by email
                const exists = clientes.find(c => 
                    c.email === wc.email || 
                    c.nombre?.toLowerCase() === nombre.toLowerCase()
                );
                if (!exists && nombre !== 'Sin nombre') {
                    addCliente({
                        id: generateId(),
                        nombre,
                        email: wc.email || '',
                        telefono,
                        cuit: '',
                        provincia,
                        expreso: '',
                        descuento: 0,
                        direccion,
                        origen: 'WooCommerce',
                        wooId: wc.id,
                        totalCompras: parseFloat(wc.total_spent || 0),
                        cantidadPedidos: parseInt(wc.orders_count || 0)
                    });
                    imported++;
                } else if (exists) {
                    const changes = {};
                    if (!exists.telefono && telefono) changes.telefono = telefono;
                    if (!exists.provincia && provincia) changes.provincia = provincia;
                    if (!exists.direccion && direccion) changes.direccion = direccion;
                    if (!exists.wooId) changes.wooId = wc.id;
                    if (wc.total_spent && Number(exists.totalCompras || 0) !== Number(wc.total_spent || 0)) {
                        changes.totalCompras = parseFloat(wc.total_spent || 0);
                    }
                    if (wc.orders_count && Number(exists.cantidadPedidos || 0) !== Number(wc.orders_count || 0)) {
                        changes.cantidadPedidos = parseInt(wc.orders_count || 0, 10);
                    }
                    if (Object.keys(changes).length > 0) {
                        updateCliente(exists.id, changes);
                        updated++;
                    }
                }
            });
            alert(`✅ WooCommerce sincronizado: ${imported} clientes nuevos, ${updated} clientes completados/actualizados, ${wooCustomers.length} encontrados en total.`);
        } catch (err) {
            alert(`❌ Error al importar clientes: ${err.message}`);
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
                </div>
            </div>

            <div className="clientes-grid" style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* Lista de clientes */}
                <div className="clientes-lista" style={{ flex: '1', overflowY: 'auto', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    {clientes.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No hay clientes registrados aún. Clic en "Nuevo Cliente" para agregar uno.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 1, borderBottom: '1px solid var(--border-color)' }}>
                                <tr>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Nombre / Razón Social</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Teléfono</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Provincia</th>
                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Descuento</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientes.map(cliente => (
                                    <tr
                                        key={cliente.id}
                                        style={{
                                            borderBottom: '1px solid var(--border-color)',
                                            cursor: 'pointer',
                                            background: viewingHistory?.id === cliente.id ? 'var(--bg-hover)' : 'transparent'
                                        }}
                                        onClick={() => setViewingHistory(cliente)}
                                        className="table-row-hover"
                                    >
                                        <td style={{ padding: '12px', fontWeight: 'var(--fw-medium)' }}>{cliente.nombre}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{normalizeWooPhone(cliente.telefono) || '-'}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{cliente.provincia || '-'}</td>
                                        <td style={{ padding: '12px', color: 'var(--accent)' }}>{cliente.descuento ? `${cliente.descuento}%` : '-'}</td>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} className="text-muted" /> {viewingHistory.provincia || '-'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Truck size={14} className="text-muted" /> {viewingHistory.expreso || '-'}</div>
                            </div>
                            {viewingHistory.descuento && (
                                <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                                    Descuento Habitual: {viewingHistory.descuento}%
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
                            <h4 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><History size={16} /> Historial de Compras</h4>
                            {(() => {
                                const ventasCliente = posVentas.filter(v => v.clienteId === viewingHistory.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

                                if (ventasCliente.length === 0) {
                                    return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', textAlign: 'center', padding: '1rem 0' }}>No hay compras registradas en el Punto de Venta para este cliente.</div>;
                                }

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {ventasCliente.map(venta => (
                                            <div key={venta.id} style={{ background: 'var(--bg-input)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: 'var(--fs-sm)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 'bold' }}>{new Date(venta.fecha).toLocaleDateString()} {new Date(venta.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>${venta.totalFinal?.toFixed(2) || venta.total?.toFixed(2)}</span>
                                                </div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    {venta.items?.length || 0} artículos
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
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

            <style jsx>{`
                .table-row-hover:hover td {
                    background: var(--bg-hover);
                }
            `}</style>
        </div>
    );
}
