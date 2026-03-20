import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

export default function ClienteModal({ cliente, onClose, onSave }) {
    const [formData, setFormData] = useState({
        nombre: '',
        cuit: '',
        telefono: '',
        provincia: '',
        expreso: '',
        descuento: ''
    });

    useEffect(() => {
        if (cliente) {
            setFormData({
                ...cliente,
                descuento: cliente.descuento || ''
            });
        }
    }, [cliente]);

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validation
        if (!formData.nombre.trim()) {
            alert('El nombre del cliente es obligatorio');
            return;
        }

        // Clean up data before save
        const cleanData = {
            ...formData,
            descuento: formData.descuento ? Number(formData.descuento) : 0
        };

        onSave(cleanData);
        onClose();
    };

    return (
        <div className="pos-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div className="pos-modal" style={{ maxWidth: '520px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="pos-modal-header">
                    <h3>{cliente ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                    <button className="btn btn-ghost" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Nombre o Razón Social *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={formData.nombre}
                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                            placeholder="Ej. Juan Pérez / Empresa S.A."
                            required
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>CUIT / DNI</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.cuit}
                                onChange={(e) => setFormData({ ...formData, cuit: e.target.value })}
                                placeholder="Sin guiones"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Teléfono</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.telefono}
                                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                                placeholder="Ej. 11 1234 5678"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Provincia / Ciudad</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.provincia}
                                onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                                placeholder="Ej. Córdoba"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Expreso / Transporte</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formData.expreso}
                                onChange={(e) => setFormData({ ...formData, expreso: e.target.value })}
                                placeholder="Ej. Vía Cargo"
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                            Descuento Automático en POS (%)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                className="form-input"
                                value={formData.descuento}
                                onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
                                placeholder="0"
                                style={{ maxWidth: '100px' }}
                            />
                            <span>% automático al seleccionarlo en la venta.</span>
                        </div>
                    </div>

                    <div className="pos-modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Save size={18} /> Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
