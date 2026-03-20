import React, { useMemo, useState } from 'react';
import { Calendar, Check, Clock3, AlertTriangle, Users, Plus, X } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId } from '../utils/helpers';

const DEFAULT_EMPLOYEES = [
    { id: 'emp-nadia', nombre: 'Nadia', puesto: 'Encargada' },
    { id: 'emp-juan', nombre: 'Juan', puesto: 'Pedidos Online' },
    { id: 'emp-naara', nombre: 'Naara', puesto: 'Deposito' },
    { id: 'emp-rocio', nombre: 'Rocio', puesto: 'Fotos y Atencion' }
];

const BONUS_PRESENTISMO = 20000;
const BONUS_SIN_FALTAS = 30000;
const ADMIN_EMAIL = 'kimdavid0012@gmail.com';

const toDateInput = (date) => date.toISOString().slice(0, 10);
const getWeekStart = (value) => {
    const date = new Date(`${value}T12:00:00`);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
};

const getWeekDates = (value) => {
    const start = getWeekStart(value);
    return Array.from({ length: 6 }, (_, index) => {
        const next = new Date(start);
        next.setDate(start.getDate() + index);
        return toDateInput(next);
    });
};

export default function EmpleadosPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [selectedDate, setSelectedDate] = useState(toDateInput(new Date()));
    const [newEmpName, setNewEmpName] = useState('');
    const [newEmpPuesto, setNewEmpPuesto] = useState('');

    const baseEmployees = (state.config.empleados || []).length ? state.config.empleados : DEFAULT_EMPLOYEES;
    const asistencia = state.config.asistencia || [];
    const isAdminOwner = user?.email === ADMIN_EMAIL;

    const todayRecord = useMemo(() => {
        return asistencia.find((entry) => entry.fecha === selectedDate) || {
            id: generateId(),
            fecha: selectedDate,
            registros: []
        };
    }, [asistencia, selectedDate]);

    const saveDayRecord = (record) => {
        const exists = asistencia.some((entry) => entry.fecha === selectedDate);
        updateConfig({
            empleados: baseEmployees,
            asistencia: exists
                ? asistencia.map((entry) => (entry.fecha === selectedDate ? record : entry))
                : [...asistencia, record]
        });
    };

    const updateAsistencia = (empleadoId, changes) => {
        const current = todayRecord.registros.find((item) => item.empleadoId === empleadoId) || {
            empleadoId,
            estado: 'presente',
            horaLlegada: '08:00',
            retiroTemprano: false,
            pagoDiario: 0
        };

        const nextItem = { ...current, ...changes };
        const nextRegistros = todayRecord.registros.some((item) => item.empleadoId === empleadoId)
            ? todayRecord.registros.map((item) => (item.empleadoId === empleadoId ? nextItem : item))
            : [...todayRecord.registros, nextItem];

        saveDayRecord({ ...todayRecord, registros: nextRegistros });
    };

    const addEmpleado = () => {
        if (!newEmpName.trim()) return;
        updateConfig({
            empleados: [
                ...baseEmployees,
                {
                    id: generateId(),
                    nombre: newEmpName.trim(),
                    puesto: newEmpPuesto.trim() || 'General'
                }
            ]
        });
        setNewEmpName('');
        setNewEmpPuesto('');
    };

    const weekDates = getWeekDates(selectedDate);

    const weeklyPayroll = useMemo(() => {
        return baseEmployees.map((empleado) => {
            const weeklyRecords = weekDates.map((date) => {
                const day = asistencia.find((entry) => entry.fecha === date);
                return day?.registros?.find((item) => item.empleadoId === empleado.id) || null;
            });

            const presentes = weeklyRecords.filter((item) => item && item.estado !== 'ausente');
            const diasTrabajados = presentes.length;
            const totalBase = presentes.reduce((acc, item) => acc + Number(item?.pagoDiario || 0), 0);
            const llegoATiempoTodos = weeklyRecords.every((item) => item && item.estado === 'presente' && (item.horaLlegada || '23:59') <= '08:00' && !item.retiroTemprano);
            const sinFaltas = weeklyRecords.every((item) => item && item.estado !== 'ausente');

            return {
                empleadoId: empleado.id,
                diasTrabajados,
                totalBase,
                bonusPuntualidad: llegoATiempoTodos ? BONUS_PRESENTISMO : 0,
                bonusSinFaltas: sinFaltas ? BONUS_SIN_FALTAS : 0,
                totalFinal: totalBase + (llegoATiempoTodos ? BONUS_PRESENTISMO : 0) + (sinFaltas ? BONUS_SIN_FALTAS : 0)
            };
        });
    }, [asistencia, baseEmployees, weekDates]);

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Users size={22} /> Empleados
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                            Lista fija de empleados, asistencia diaria, horario de llegada y retiros tempranos.
                        </p>
                    </div>
                    <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
                        <label className="form-label">Fecha</label>
                        <input type="date" className="form-input" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                {baseEmployees.map((empleado) => {
                    const registro = todayRecord.registros.find((item) => item.empleadoId === empleado.id) || {
                        estado: 'pendiente',
                        horaLlegada: '08:00',
                        retiroTemprano: false,
                        pagoDiario: 0
                    };

                    return (
                        <div key={empleado.id} className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(4, minmax(110px, 1fr))', gap: 12, alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 'var(--fw-bold)' }}>{empleado.nombre}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{empleado.puesto}</div>
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className={`btn ${registro.estado === 'presente' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => updateAsistencia(empleado.id, { estado: 'presente', horaLlegada: registro.horaLlegada || '08:00' })}>
                                        <Check size={14} /> Presente
                                    </button>
                                    <button className={`btn ${registro.estado === 'tarde' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => updateAsistencia(empleado.id, { estado: 'tarde', horaLlegada: registro.horaLlegada || '08:30' })}>
                                        <AlertTriangle size={14} /> Tarde
                                    </button>
                                    <button className={`btn ${registro.estado === 'ausente' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => updateAsistencia(empleado.id, { estado: 'ausente', horaLlegada: '', retiroTemprano: false })}>
                                        <X size={14} /> Falto
                                    </button>
                                </div>

                                <div>
                                    <label className="form-label">Hora llegada</label>
                                    <input
                                        type="time"
                                        className="form-input"
                                        value={registro.horaLlegada || ''}
                                        disabled={registro.estado === 'ausente'}
                                        onChange={(event) => updateAsistencia(empleado.id, { horaLlegada: event.target.value })}
                                    />
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(registro.retiroTemprano)}
                                        disabled={registro.estado === 'ausente'}
                                        onChange={(event) => updateAsistencia(empleado.id, { retiroTemprano: event.target.checked })}
                                    />
                                    Se retiro temprano
                                </label>

                                {isAdminOwner ? (
                                    <div>
                                        <label className="form-label">Pago diario</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={registro.pagoDiario || ''}
                                            onChange={(event) => updateAsistencia(empleado.id, { pagoDiario: Number(event.target.value || 0) })}
                                            placeholder="0"
                                        />
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                        {registro.estado === 'ausente' ? 'Ausente' : registro.retiroTemprano ? 'Retiro temprano' : 'Jornada normal'}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {(user?.role === 'admin' || user?.role === 'encargada') && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ marginBottom: 12 }}>Agregar empleado fijo</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12 }}>
                        <input className="form-input" value={newEmpName} onChange={(event) => setNewEmpName(event.target.value)} placeholder="Nombre" />
                        <input className="form-input" value={newEmpPuesto} onChange={(event) => setNewEmpPuesto(event.target.value)} placeholder="Puesto" />
                        <button className="btn btn-primary" onClick={addEmpleado}><Plus size={14} /> Guardar</button>
                    </div>
                </div>
            )}

            {isAdminOwner && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Calendar size={18} /> Pago semanal (lunes a sabado)
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                        Bonus puntualidad: ${BONUS_PRESENTISMO.toLocaleString('es-AR')} · Bonus sin faltas: ${BONUS_SIN_FALTAS.toLocaleString('es-AR')}
                    </p>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {weeklyPayroll.map((item) => {
                            const empleado = baseEmployees.find((entry) => entry.id === item.empleadoId);
                            return (
                                <div key={item.empleadoId} style={{ display: 'grid', gridTemplateColumns: '1.1fr repeat(4, 1fr)', gap: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                    <div>
                                        <div style={{ fontWeight: 'var(--fw-bold)' }}>{empleado?.nombre}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.diasTrabajados} dias trabajados</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Base</div>
                                        <div>${item.totalBase.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Puntualidad</div>
                                        <div>${item.bonusPuntualidad.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin faltas</div>
                                        <div>${item.bonusSinFaltas.toLocaleString('es-AR')}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total a pagar</div>
                                        <div style={{ fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>${item.totalFinal.toLocaleString('es-AR')}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
