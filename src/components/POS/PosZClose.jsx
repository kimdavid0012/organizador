import React from 'react';
import { Calculator, AlertTriangle, Archive } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { useAuth } from '../../store/AuthContext';
import { generateId } from '../../utils/helpers';

export default function PosZClose() {
    const { state, performZClose } = useData();
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = React.useState('');

    const ventas = state.config.posVentas || [];
    const gastos = state.config.posGastos || [];
    const cierresHistory = state.config.posCerradoZ || [];
    const filteredHistory = cierresHistory.filter((entry) => !selectedDate || (entry.fecha || '').slice(0, 10) === selectedDate);

    // Calculations
    const totalVentas = ventas.reduce((acc, v) => acc + v.total, 0);
    const cantVentas = ventas.length;

    const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);
    const cantGastos = gastos.length;

    const cajaNeta = totalVentas - totalGastos;

    const handleCierreZ = () => {
        if (ventas.length === 0 && gastos.length === 0) {
            alert('No hay movimientos hoy para hacer un Cierre Z.');
            return;
        }

        if (window.confirm(`¿Confirmás el Cierre Z por un Neto en Caja de $${cajaNeta.toFixed(2)}?\n\nEsta acción archivará las ventas y gastos de hoy y la caja volverá a cero.`)) {
            const zCloseData = {
                id: generateId(),
                fecha: new Date().toISOString(),
                responsable: user.name,
                totalVentas,
                cantVentas,
                totalGastos,
                cantGastos,
                cajaNeta,
                detalleVentas: ventas, // backup exact state at close
                detalleGastos: gastos
            };

            performZClose(zCloseData);
            alert('✅ Cierre Z completado exitosamente.');
        }
    };

    return (
        <div style={{ padding: 'var(--sp-4)', maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

            <div style={{ background: 'var(--bg-card)', padding: 'var(--sp-6)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <Calculator size={48} color="var(--accent)" style={{ marginBottom: 16 }} />
                <h2 style={{ fontSize: '24px', marginBottom: 8 }}>Cierre Automático Z</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
                    Resumen de caja actual. Al ejecutar el cierre, los totales pasarán al historial y la caja quedará en $0.00.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'left', marginBottom: 24 }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', padding: 16, borderRadius: 8 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>Ingresos por Ventas ({cantVentas})</div>
                        <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: 'bold' }}>+ ${totalVentas.toFixed(2)}</div>
                    </div>

                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 8 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>Egresos y Gastos ({cantGastos})</div>
                        <div style={{ color: '#ef4444', fontSize: '28px', fontWeight: 'bold' }}>- ${totalGastos.toFixed(2)}</div>
                    </div>
                </div>

                <div style={{ background: 'var(--bg-body)', padding: 24, borderRadius: 8, border: '2px solid var(--border-color)', marginBottom: 24 }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '18px', marginBottom: 8 }}>Total Neto en Caja</div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '42px', fontWeight: '800' }}>
                        ${cajaNeta.toFixed(2)}
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    style={{ padding: '16px 32px', fontSize: '18px', width: '100%', display: 'flex', justifyContent: 'center' }}
                    onClick={handleCierreZ}
                    disabled={ventas.length === 0 && gastos.length === 0}
                >
                    <Archive size={20} /> Ejecutar Cierre Z Definitivo
                </button>
            </div>

            {/* Historial Corto de Cierres Z */}
            {cierresHistory.length > 0 && (
                <div style={{ background: 'var(--bg-card)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={18} /> Últimos Cierres Z</h3>
                        <input type="date" className="form-input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ width: 160 }} />
                    </div>
                    <div className="pos-table-container">
                        <table className="pos-table" style={{ fontSize: '13px' }}>
                            <thead>
                                <tr>
                                    <th>Fecha y Hora</th>
                                    <th>Responsable</th>
                                    <th>Resumen</th>
                                    <th style={{ textAlign: 'right' }}>Ventas</th>
                                    <th style={{ textAlign: 'right' }}>Gastos</th>
                                    <th style={{ textAlign: 'right' }}>Neto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredHistory.slice(0, 10).map(c => (
                                    <tr key={c.id} className="pos-table-row">
                                        <td>{new Date(c.fecha).toLocaleString()}</td>
                                        <td>{c.responsable}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>
                                            {c.cantVentas} Tkt. {c.cantGastos} Op.
                                        </td>
                                        <td style={{ textAlign: 'right', color: '#22c55e' }}>+${c.totalVentas.toFixed(2)}</td>
                                        <td style={{ textAlign: 'right', color: '#ef4444' }}>-${c.totalGastos.toFixed(2)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${c.cajaNeta.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
}
