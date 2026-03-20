import React, { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import './MoldModal.css'; // Reusing Modal base styles

export default function TaskModal({ tarea, onClose }) {
    const { state, updateTarea, deleteTarea } = useData();
    const { t } = useI18n();
    const { config } = state;
    const [formData, setFormData] = useState({ ...tarea });

    useEffect(() => {
        setFormData({ ...tarea });
    }, [tarea]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!formData.nombre?.trim()) {
            alert(t('nombreObligatorio'));
            return;
        }
        updateTarea(tarea.id, formData);
        onClose();
    };

    const handleDelete = () => {
        if (window.confirm('¿Seguro que deseas eliminar esta tarea?')) {
            deleteTarea(tarea.id);
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content mold-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>✏️ Editar Tarea</h2>
                    <div className="modal-header-actions">
                        <button className="btn btn-outline" onClick={onClose}>
                            {t('cerrarAutoguardado')}
                        </button>
                        <button className="btn-icon" onClick={onClose} title="Cerrar">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <div className="form-group">
                        <label className="form-label">{t('nombreMolde').replace('Molde', 'Tarea')}</label>
                        <input
                            type="text"
                            className="form-control form-control-lg"
                            value={formData.nombre || ''}
                            onChange={(e) => handleChange('nombre', e.target.value)}
                            placeholder="Ej: Comprar hilos"
                        />
                    </div>

                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label">{t('estado')}</label>
                            <select
                                className="form-select"
                                value={formData.estado || ''}
                                onChange={(e) => handleChange('estado', e.target.value)}
                            >
                                {config.columnas.map(col => (
                                    <option key={col.id} value={col.id}>{col.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">{t('fechaObjetivo')}</label>
                            <input
                                type="date"
                                className="form-control"
                                value={formData.fechaObjetivo || ''}
                                onChange={(e) => handleChange('fechaObjetivo', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ marginTop: 24 }}>
                        <label className="form-label">{t('observaciones')}</label>
                        <textarea
                            className="form-control"
                            rows={4}
                            value={formData.descripcion || ''}
                            onChange={(e) => handleChange('descripcion', e.target.value)}
                            placeholder={t('placeholderNotas')}
                        />
                    </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button className="btn btn-error btn-outline" onClick={handleDelete}>
                        <Trash2 size={16} /> {t('eliminar')}
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        <Save size={16} /> {t('guardar')}
                    </button>
                </div>
            </div>
        </div>
    );
}
