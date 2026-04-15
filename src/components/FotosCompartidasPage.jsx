import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Image as ImageIcon, Trash2, Download, X, Loader2 } from 'lucide-react';
import { ref, uploadBytes, listAll, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../store/firebase';
import { useAuth } from '../store/AuthContext';

export default function FotosCompartidasPage() {
    const { user } = useAuth();
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const fileRef = useRef(null);

    const loadPhotos = useCallback(async () => {
        if (!storage) return;
        setLoading(true);
        try {
            const listRef = ref(storage, 'fotos-compartidas');
            const result = await listAll(listRef);
            const items = await Promise.all(
                result.items.map(async (item) => {
                    const url = await getDownloadURL(item);
                    return { name: item.name, fullPath: item.fullPath, url };
                })
            );
            items.sort((a, b) => b.name.localeCompare(a.name));
            setPhotos(items);
        } catch (err) { console.error('Error loading photos:', err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadPhotos(); }, [loadPhotos]);

    const handleUpload = async (files) => {
        if (!storage || !files?.length) return;
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                if (!file.type.startsWith('image/')) continue;
                const ts = Date.now();
                const name = `${ts}_${user?.name || 'user'}_${file.name}`;
                const storageRef = ref(storage, `fotos-compartidas/${name}`);
                await uploadBytes(storageRef, file);
            }
            await loadPhotos();
        } catch (err) { alert('Error subiendo: ' + err.message); }
        finally { setUploading(false); }
    };

    const handleDelete = async (photo) => {
        if (!window.confirm('¿Eliminar ' + photo.name + '?')) return;
        try {
            await deleteObject(ref(storage, photo.fullPath));
            setPhotos(prev => prev.filter(p => p.fullPath !== photo.fullPath));
        } catch (err) { alert('Error: ' + err.message); }
    };

    const onDrop = useCallback((e) => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }, []);
    const onDragOver = useCallback((e) => { e.preventDefault(); setDragActive(true); }, []);
    const onDragLeave = useCallback(() => setDragActive(false), []);

    return (
        <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <ImageIcon size={22} /> Fotos Compartidas
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
                Subí fotos para que todo el equipo las pueda ver. Arrastrá o hacé click para subir.
            </p>

            {/* Upload area */}
            <div
                onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                onClick={() => fileRef.current?.click()}
                style={{
                    border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border-color)'}`,
                    borderRadius: 14, padding: 30, textAlign: 'center', cursor: 'pointer',
                    background: dragActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                    marginBottom: 20, transition: 'all 0.2s'
                }}
            >
                {uploading ? <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={28} style={{ opacity: 0.4 }} />}
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                    {uploading ? 'Subiendo...' : 'Arrastrá fotos acá o hacé click para seleccionar'}
                </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />

            {/* Photo grid */}
            {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Cargando fotos...</div> :
            photos.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No hay fotos todavía. Subí la primera!</div> :
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {photos.map(photo => (
                    <div key={photo.fullPath} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)', background: 'var(--bg-input)', position: 'relative' }}>
                        <div style={{ paddingBottom: '100%', position: 'relative', cursor: 'pointer' }} onClick={() => setLightbox(photo.url)}>
                            <img src={photo.url} alt={photo.name} loading="lazy" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
                            <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{photo.name.split('_').slice(2).join('_') || photo.name}</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <a href={photo.url} download={photo.name} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }} onClick={e => e.stopPropagation()}><Download size={14} /></a>
                                {user?.role === 'admin' && <button onClick={(e) => { e.stopPropagation(); handleDelete(photo); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}><Trash2 size={14} /></button>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>}

            {/* Lightbox */}
            {lightbox && <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'pointer' }}>
                <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12 }} />
                <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>}
        </div>
    );
}
