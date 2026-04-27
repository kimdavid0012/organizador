import React, { useState, useRef } from 'react';
import { Camera, Download, Trash2, Plus, Image } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { generateId } from '../utils/helpers';

export default function FotosPrendasPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const canUpload = isAdmin || user?.role === 'contenido_instagram';
    const fileInputRef = useRef(null);
    const contentFileInputRef = useRef(null);

    const fotos = state.config.fotosPrendas || [];
    const contentFotos = state.config.fotosContenido || [];
    const [selectedFoto, setSelectedFoto] = useState(null);
    const [activeTab, setActiveTab] = useState('prendas');

    const handleUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const newFotos = await Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: generateId(),
                nombre: file.name,
                dataUrl: reader.result,
                uploadedAt: new Date().toISOString(),
                uploadedBy: user.name || user.email,
                nota: ''
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        })));

        updateConfig({ fotosPrendas: [...newFotos, ...fotos] });
        event.target.value = '';
    };

    const handleContentUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const newFotos = await Promise.all(files.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: generateId(),
                nombre: file.name,
                dataUrl: reader.result,
                uploadedAt: new Date().toISOString(),
                uploadedBy: user.name || user.email,
                nota: '',
                type: 'contenido'
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        })));

        updateConfig({ fotosContenido: [...newFotos, ...contentFotos] });
        event.target.value = '';
    };

    const deleteFoto = (id, type = 'prendas') => {
        if (!window.confirm('¿Eliminar esta foto?')) return;
        if (type === 'contenido') {
            updateConfig({ fotosContenido: contentFotos.filter(f => f.id !== id) });
        } else {
            updateConfig({ fotosPrendas: fotos.filter(f => f.id !== id) });
        }
    };

    const updateNota = (id, nota, type = 'prendas') => {
        if (type === 'contenido') {
            updateConfig({ fotosContenido: contentFotos.map(f => f.id === id ? { ...f, nota } : f) });
        } else {
            updateConfig({ fotosPrendas: fotos.map(f => f.id === id ? { ...f, nota } : f) });
        }
    };

    const activeFotos = activeTab === 'contenido' ? contentFotos : fotos;
    const activeType = activeTab === 'contenido' ? 'contenido' : 'prendas';

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Camera size={22} /> Fotos de Prendas
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    David sube fotos de prendas desde el local. Erika las descarga y sube contenido terminado.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className={`btn ${activeTab === 'prendas' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('prendas')}>
                        Prendas ({fotos.length})
                    </button>
                    <button className={`btn ${activeTab === 'contenido' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('contenido')}>
                        Contenido ({contentFotos.length})
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {isAdmin && activeTab === 'prendas' && (
                        <>
                            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
                            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                                <Plus size={16} /> Subir Fotos Prendas
                            </button>
                        </>
                    )}
                    {canUpload && activeTab === 'contenido' && (
                        <>
                            <input ref={contentFileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleContentUpload} />
                            <button className="btn btn-primary" onClick={() => contentFileInputRef.current?.click()}>
                                <Plus size={16} /> Subir Contenido
                            </button>
                        </>
                    )}
                </div>
            </div>

            {activeFotos.length === 0 ? (
                <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Image size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <div>No hay fotos de {activeTab === 'contenido' ? 'contenido' : 'prendas'} todavia.</div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    {activeFotos.map(foto => (
                        <div key={foto.id} className="glass-panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
                            <div
                                style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', background: 'rgba(255,255,255,0.03)' }}
                                onClick={() => setSelectedFoto(foto)}
                            >
                                <img src={foto.dataUrl} alt={foto.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {new Date(foto.uploadedAt).toLocaleDateString('es-AR')} · {foto.uploadedBy}
                                </div>
                                {foto.nota && <div style={{ fontSize: 13 }}>{foto.nota}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <a href={foto.dataUrl} download={foto.nombre} className="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>
                                        <Download size={14} /> Descargar
                                    </a>
                                    {(isAdmin || (canUpload && activeType === 'contenido')) && (
                                        <button className="btn btn-ghost btn-danger btn-sm" onClick={() => deleteFoto(foto.id, activeType)}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Full-size preview modal */}
            {selectedFoto && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'grid', placeItems: 'center', padding: 20 }}
                    onClick={() => setSelectedFoto(null)}
                >
                    <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
                        <img src={selectedFoto.dataUrl} alt={selectedFoto.nombre} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} />
                        <div style={{ marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center' }}>
                            <a href={selectedFoto.dataUrl} download={selectedFoto.nombre} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                                <Download size={16} /> Descargar
                            </a>
                            <button className="btn btn-secondary" onClick={() => setSelectedFoto(null)}>Cerrar</button>
                        </div>
                        {isAdmin && (
                            <div style={{ marginTop: 8 }}>
                                <input
                                    className="form-input"
                                    placeholder="Agregar nota..."
                                    value={selectedFoto.nota || ''}
                                    onChange={(e) => {
                                        updateNota(selectedFoto.id, e.target.value);
                                        setSelectedFoto({ ...selectedFoto, nota: e.target.value });
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ marginTop: 8 }}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

