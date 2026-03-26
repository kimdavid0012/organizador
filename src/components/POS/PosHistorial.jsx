import React, { useState, useRef } from 'react';
import { Search, Printer } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { printThermalTicket } from './thermalPrint';
import { buildPosTicketHistory } from '../../utils/posTicketHistory';

export default function PosHistorial() {
    const { state } = useData();
    const ventas = buildPosTicketHistory(state.config);
    const [search, setSearch] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const printFrameRef = useRef(null);

    const filteredVentas = ventas.filter(v => {
        const matchesSearch =
            (v.nroComprobante || '').toString().includes(search) ||
            (v.fecha || '').includes(search) ||
            (v.vendedor || '').toLowerCase().includes(search.toLowerCase()) ||
            (v.cliente || '').toLowerCase().includes(search.toLowerCase()) ||
            (v.canalVenta || '').toLowerCase().includes(search.toLowerCase());
        const matchesDate = !selectedDate || (v.fecha || '').slice(0, 10) === selectedDate;
        return matchesSearch && matchesDate;
    }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const handlePrint = (ticket) => {
        printThermalTicket(ticket, printFrameRef);
    };

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
                <h2>Historial de Comprobantes</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div className="pos-search" style={{ margin: 0 }}>
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Buscar comprobante..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <input type="date" className="form-input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ width: 160 }} />
                </div>
            </div>

            <div className="pos-table-container">
                <table className="pos-table">
                    <thead>
                        <tr>
                            <th>Nº Ticket</th>
                            <th>Fecha</th>
                            <th>Vendedor/Caja</th>
                            <th>Cliente</th>
                            <th>Modo</th>
                            <th>Total Final</th>
                            <th>Artículos</th>
                            <th style={{ textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredVentas.map(v => (
                            <tr key={v.id} className="pos-table-row">
                                <td style={{ fontWeight: 'bold' }}>{v.nroComprobante}</td>
                                <td style={{ fontSize: '12px' }}>{new Date(v.fecha).toLocaleString()}</td>
                                <td>{v.vendedor}</td>
                                <td>
                                    {v.cliente}
                                    {v.notas && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Nota: {v.notas}</div>}
                                </td>
                                <td>{v.canalVenta || 'LOCAL'}</td>
                                <td style={{ fontWeight: 'bold' }}>${v.total.toFixed(2)}</td>
                                <td>{v.items.reduce((acc, i) => acc + i.cantidad, 0)}</td>
                                <td style={{ textAlign: 'right' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handlePrint(v)} title="Imprimir Copia">
                                        <Printer size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredVentas.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No hay ventas registradas aún.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
