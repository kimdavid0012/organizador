import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { useAuth } from '../../store/AuthContext';
import { generateId } from '../../utils/helpers';

export default function PosGastos() {
    const { state, addPosExpense } = useData();
    const { user } = useAuth();
    const gastosDia = state.config.posGastos || [];
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

    const [concepto, setConcepto] = useState('');
    const [monto, setMonto] = useState('');
    const [tipo, setTipo] = useState('RETIRO');

    const gastosFiltrados = gastosDia.filter((gasto) => (gasto.fecha || '').slice(0, 10) === selectedDate);

    const handleAñadirGasto = () => {
        if (!concepto || !monto) {
            alert('Completá todos los campos.');
            return;
        }

        addPosExpense({
            id: generateId(),
            fecha: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}`,
            concepto,
            monto: Number(monto),
            tipo,
            responsable: user.name
        });

        setConcepto('');
        setMonto('');
    };

    const totalGastos = gastosFiltrados.reduce((acc, g) => acc + g.monto, 0);

    return (
        <div style={{ padding: 'var(--sp-4)', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <h2>Gastos y Retiros de Caja Diarios</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-4)' }}>
                Esta sección es para ingresar salidas de dinero de la caja física durante el día (pago a proveedores, retiros de dueños, viáticos).
                Se reinicia automáticamente con el Cierre Z.
            </p>

            <div style={{ background: 'var(--bg-card)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', marginBottom: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ minWidth: '170px' }}>
                        <label>Fecha</label>
                        <input type="date" className="form-input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                        <label>Tipo</label>
                        <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
                            <option value="RETIRO">Retiro de Dinero</option>
                            <option value="PROVEEDOR">Pago a Proveedor</option>
                            <option value="VIATICO">Viáticos / Varios</option>
                            <option value="PEDIDO">Pedido</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ flex: 2, minWidth: '200px' }}>
                        <label>Concepto / Detalle</label>
                        <input className="form-input" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Pago de luz, Retiro Juan..." />
                    </div>
                    <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                        <label>Monto $</label>
                        <input type="number" className="form-input" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
                    </div>
                    <button className="btn btn-primary" onClick={handleAñadirGasto} style={{ marginBottom: '4px' }}>
                        <Plus size={18} /> Cargar Gasto
                    </button>
                </div>
            </div>

            <div className="pos-table-container">
                <table className="pos-table">
                    <thead>
                        <tr>
                            <th>Hora</th>
                            <th>Tipo</th>
                            <th>Concepto</th>
                            <th>Responsable</th>
                            <th style={{ textAlign: 'right' }}>Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gastosFiltrados.map(g => (
                            <tr key={g.id} className="pos-table-row">
                                <td>{new Date(g.fecha).toLocaleTimeString()}</td>
                                <td>
                                    <span className={`status-badge ${g.tipo === 'RETIRO' ? 'status-inactive' : 'status-active'}`}>{g.tipo}</span>
                                </td>
                                <td>{g.concepto}</td>
                                <td>{g.responsable}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                                    -${g.monto.toFixed(2)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {gastosFiltrados.length > 0 && (
                        <tfoot>
                            <tr>
                                <td colSpan="4" style={{ textAlign: 'right', fontWeight: 'bold', padding: 'var(--sp-3)' }}>Total Gastos Hoy:</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: 'var(--sp-3)', color: 'var(--danger)', fontSize: '18px' }}>
                                    -${totalGastos.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                {gastosFiltrados.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No hay gastos registrados para la fecha seleccionada.
                    </div>
                )}
            </div>
        </div>
    );
}
