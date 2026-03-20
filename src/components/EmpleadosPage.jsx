import React, { useState, useMemo } from 'react';
import { Users, UserPlus, Clock, Calendar, Check, X, AlertTriangle, Trash2 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { generateId } from '../utils/helpers';
import { useAuth } from '../store/AuthContext';

export default function EmpleadosPage() {
    const { state, updateConfig } = useData();
    const { t } = useI18n();
    const { user } = useAuth();

    // Ensure arrays exist in config
    const empleados = state.config.empleados || [];
    const asistencia = state.config.asistencia || [];

    const [newEmpName, setNewEmpName] = useState('');
    const [newEmpPuesto, setNewEmpPuesto] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [showReport, setShowReport] = useState(false);
    const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

    // Format date nicely
    const dateFormatted = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Get today's record if it exists
    const todayRecord = useMemo(() => {
        return asistencia.find(a => a.fecha === selectedDate) || {
            id: generateId(),
            fecha: selectedDate,
            registros: []
        };
    }, [asistencia, selectedDate]);

    // Handle adding new employee
    const addEmpleado = () => {
        if (!newEmpName.trim()) return;
        const newEmp = {
            id: generateId(),
            nombre: newEmpName.trim(),
            puesto: newEmpPuesto.trim() || 'General',
            creadoEl: new Date().toISOString()
        };
        updateConfig({ empleados: [...empleados, newEmp] });
        setNewEmpName('');
        setNewEmpPuesto('');
    };

    const removeEmpleado = (id) => {
        if (!window.confirm('¿Seguro que deseas eliminar este empleado?')) return;
        updateConfig({ empleados: empleados.filter(e => e.id !== id) });
    };

    // Update attendance record for an employee today
    const updateAsistencia = (empId, estado, horaLlegada = '', notas = '') => {
        let currentRecord = todayRecord;
        let isNewDay = !asistencia.find(a => a.fecha === selectedDate);

        let regs = [...currentRecord.registros];
        const existIdx = regs.findIndex(r => r.empleadoId === empId);

        if (existIdx >= 0) {
            regs[existIdx] = { ...regs[existIdx], estado, horaLlegada, notas };
        } else {
            regs.push({ empleadoId: empId, estado, horaLlegada, notas });
        }

        const newRecord = { ...currentRecord, registros: regs };

        if (isNewDay) {
            updateConfig({ asistencia: [...asistencia, newRecord] });
        } else {
            updateConfig({
                asistencia: asistencia.map(a => a.fecha === selectedDate ? newRecord : a)
            });
        }
    };

    const getEstadoInfo = (estado) => {
        switch (estado) {
            case 'presente': return { color: 'var(--success)', icon: Check, label: 'Presente' };
            case 'ausente': return { color: 'var(--danger)', icon: X, label: 'Faltó' };
            case 'tarde': return { color: 'var(--warning)', icon: AlertTriangle, label: 'Llegó Tarde' };
            default: return { color: 'var(--text-muted)', icon: Clock, label: 'Sin marcar' };
        }
    };

    const monthlyReport = useMemo(() => {
        const stats = {};
        empleados.forEach(e => stats[e.id] = { presente: 0, tarde: 0, ausente: 0, total: 0 });

        asistencia.forEach(record => {
            if (record.fecha.startsWith(reportMonth)) {
                record.registros.forEach(reg => {
                    if (stats[reg.empleadoId]) {
                        stats[reg.empleadoId][reg.estado]++;
                        stats[reg.empleadoId].total++;
                    }
                });
            }
        });
        return stats;
    }, [asistencia, reportMonth, empleados]);

    return (
        <div className="settings" style={{ maxWidth: 1000, margin: '0 auto' }}>
            <h2><Users style={{ display: 'inline', marginRight: 8 }} /> Asistencia de Empleados</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-5)' }}>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                    Gestioná el presentismo y horario de llegada de tu equipo.
                </p>
                <button className={`btn ${showReport ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowReport(!showReport)}>
                    <Calendar size={16} /> {showReport ? 'Ver Registro Diario' : 'Ver Reporte Mensual'}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 'var(--sp-5)' }}>
                {/* Left: Attendance list */}
                <div>
                    <div className="settings-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                            <Calendar style={{ color: 'var(--accent)' }} />
                            <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{dateFormatted}</h3>
                        </div>
                        <input
                            type="date"
                            className="form-input"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]} // Cant select future dates
                            style={{ width: '150px' }}
                        />
                    </div>

                    <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                        {showReport ? (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
                                    <h3 style={{ margin: 0 }}>Reporte Mensual: {reportMonth}</h3>
                                    <input
                                        type="month"
                                        className="form-input"
                                        value={reportMonth}
                                        onChange={e => setReportMonth(e.target.value)}
                                        style={{ width: '160px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                                    {empleados.map(emp => {
                                        const stats = monthlyReport[emp.id] || { presente: 0, tarde: 0, ausente: 0, total: 0 };
                                        return (
                                            <div key={emp.id} style={{
                                                display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                                                gap: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                                                borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)'
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{emp.nombre}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{emp.puesto}</div>
                                                </div>
                                                <div style={{ color: 'var(--success)', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>Pres.</div>
                                                    <div style={{ fontWeight: 'bold' }}>{stats.presente}</div>
                                                </div>
                                                <div style={{ color: 'var(--warning)', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>Tarde</div>
                                                    <div style={{ fontWeight: 'bold' }}>{stats.tarde}</div>
                                                </div>
                                                <div style={{ color: 'var(--danger)', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>Aus.</div>
                                                    <div style={{ fontWeight: 'bold' }}>{stats.ausente}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <>
                                {empleados.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--text-muted)' }}>
                                        No hay empleados registrados. Agregalos en el panel lateral.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                                        {empleados.map(emp => {
                                            const reg = todayRecord.registros.find(r => r.empleadoId === emp.id) || {};
                                            const info = getEstadoInfo(reg.estado);

                                            return (
                                                <div key={emp.id} style={{
                                                    display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 120px',
                                                    gap: 16, alignItems: 'center',
                                                    padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                                                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)'
                                                }}>
                                                    {/* Name */}
                                                    <div>
                                                        <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-md)' }}>{emp.nombre}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{emp.puesto}</div>
                                                    </div>

                                                    {/* Status Buttons */}
                                                    <div style={{ display: 'flex', gap: 8 }}>
                                                        <button
                                                            className={`btn btn-sm ${reg.estado === 'presente' ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => updateAsistencia(emp.id, 'presente', reg.horaLlegada || '08:00', reg.notas)}
                                                            style={{ padding: '6px' }}
                                                            title="Presente"
                                                        >
                                                            <Check size={16} />
                                                        </button>
                                                        <button
                                                            className={`btn btn-sm ${reg.estado === 'tarde' ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => updateAsistencia(emp.id, 'tarde', reg.horaLlegada || '09:00', reg.notas)}
                                                            style={{ padding: '6px', background: reg.estado === 'tarde' ? 'var(--warning)' : undefined }}
                                                            title="Llegó Tarde"
                                                        >
                                                            <AlertTriangle size={16} />
                                                        </button>
                                                        <button
                                                            className={`btn btn-sm ${reg.estado === 'ausente' ? 'btn-primary' : 'btn-ghost'}`}
                                                            onClick={() => updateAsistencia(emp.id, 'ausente', '', reg.notas)}
                                                            style={{ padding: '6px', background: reg.estado === 'ausente' ? 'var(--danger)' : undefined }}
                                                            title="Ausente"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>

                                                    {/* Time input */}
                                                    <div style={{ visibility: ['presente', 'tarde'].includes(reg.estado) ? 'visible' : 'hidden' }}>
                                                        <input
                                                            type="time"
                                                            className="form-input"
                                                            value={reg.horaLlegada || ''}
                                                            onChange={(e) => updateAsistencia(emp.id, reg.estado, e.target.value, reg.notas)}
                                                            style={{ padding: '6px', fontSize: '13px', width: '100px' }}
                                                        />
                                                    </div>

                                                    {/* Current Status Label */}
                                                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, color: info.color, fontSize: '13px', fontWeight: 'var(--fw-semibold)' }}>
                                                        <info.icon size={14} />
                                                        {info.label}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Employee management (Admin/Encargada only) */}
                {(user?.role === 'admin' || user?.role === 'encargada') && (
                    <div className="settings-section">
                        <h4 style={{ marginBottom: 'var(--sp-3)', fontSize: 'var(--fs-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <UserPlus size={16} /> Nuevo Empleado
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-4)' }}>
                            <input
                                className="form-input"
                                placeholder="Nombre del empleado"
                                value={newEmpName}
                                onChange={e => setNewEmpName(e.target.value)}
                            />
                            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                                <input
                                    className="form-input"
                                    placeholder="Puesto (ej. Costurero)"
                                    value={newEmpPuesto}
                                    onChange={e => setNewEmpPuesto(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn-primary" onClick={addEmpleado}>Add</button>
                            </div>
                        </div>

                        <h4 style={{ margin: 'var(--sp-5) 0 var(--sp-3)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                            Directorio ({empleados.length})
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '400px', overflowY: 'auto', paddingRight: 4 }}>
                            {empleados.map(emp => (
                                <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--glass-bg)', borderRadius: 'var(--radius-sm)' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 'var(--fw-medium)' }}>{emp.nombre}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{emp.puesto}</div>
                                    </div>
                                    <button className="btn-icon" onClick={() => removeEmpleado(emp.id)} style={{ padding: 4, color: 'var(--text-muted)' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
