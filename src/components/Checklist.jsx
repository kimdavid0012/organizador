import React, { useState } from 'react';
import { Plus, Trash2, GripVertical, Check, Square, CheckSquare } from 'lucide-react';
import { generateId } from '../utils/helpers';
import { useI18n } from '../store/I18nContext';
import './Checklist.css';

export default function Checklist({ items, onChange }) {
    const [newText, setNewText] = useState('');
    const { t } = useI18n();

    const DEFAULT_STEPS = [
        'Digitalizar',
        'Márgenes',
        'Graduación',
        'Prueba',
        'Aprobado'
    ];

    const addItem = (text) => {
        if (!text.trim()) return;
        const newItem = { id: generateId(), texto: text.trim(), completado: false };
        onChange([...items, newItem]);
        setNewText('');
    };

    const toggleItem = (id) => {
        onChange(items.map(i => i.id === id ? { ...i, completado: !i.completado } : i));
    };

    const removeItem = (id) => {
        onChange(items.filter(i => i.id !== id));
    };

    const updateText = (id, texto) => {
        onChange(items.map(i => i.id === id ? { ...i, texto } : i));
    };

    const addDefaults = () => {
        const existing = items.map(i => i.texto.toLowerCase());
        const newItems = DEFAULT_STEPS
            .filter(s => !existing.includes(s.toLowerCase()))
            .map(s => ({ id: generateId(), texto: s, completado: false }));
        onChange([...items, ...newItems]);
    };

    const total = items.length;
    const done = items.filter(i => i.completado).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
        <div className="checklist">
            <div className="checklist-header">
                <span className="form-label">{t('checklist')}</span>
                {total > 0 && (
                    <span className="checklist-progress-text">{done}/{total} ({percent}%)</span>
                )}
            </div>

            {total > 0 && (
                <div className="checklist-progress-bar">
                    <div className="checklist-progress-fill" style={{ width: `${percent}%` }} />
                </div>
            )}

            <div className="checklist-items">
                {items.map(item => (
                    <div key={item.id} className={`checklist-item ${item.completado ? 'done' : ''}`}>
                        <button
                            className="checklist-check"
                            onClick={() => toggleItem(item.id)}
                            type="button"
                        >
                            {item.completado ? <CheckSquare /> : <Square />}
                        </button>
                        <input
                            className="checklist-text"
                            value={item.texto}
                            onChange={(e) => updateText(item.id, e.target.value)}
                            placeholder="Paso..."
                        />
                        <button
                            className="checklist-remove"
                            onClick={() => removeItem(item.id)}
                            type="button"
                        >
                            <Trash2 />
                        </button>
                    </div>
                ))}
            </div>

            <div className="checklist-add">
                <input
                    className="form-input"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder={t('agregarPaso')}
                    onKeyDown={(e) => e.key === 'Enter' && addItem(newText)}
                />
                <button className="btn btn-sm btn-secondary" onClick={() => addItem(newText)} type="button">
                    <Plus /> {t('agregar')}
                </button>
            </div>

            {items.length === 0 && (
                <button className="btn btn-sm btn-ghost" onClick={addDefaults} type="button">
                    {t('usarPasosPredefinidos')}
                </button>
            )}
        </div>
    );
}
