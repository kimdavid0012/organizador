import React, { useMemo, useRef, useState } from 'react';
import { Eye, Grid3X3, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import {
    deleteArticleLibraryImage,
    getArticleLibraryImageUrl,
    saveArticleLibraryImage
} from '../store/imageLibrary';

const GRID_SIZE = 9;

const buildDefaultSlots = () => Array.from({ length: GRID_SIZE }, (_, index) => ({
    slot: index + 1,
    imageId: '',
    thumbDataUrl: '',
    storageUrl: '',
    storagePath: '',
    uploadedAt: '',
    uploadedBy: '',
    note: ''
}));

export default function InstagramPlannerPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const fileInputRef = useRef(null);
    const [targetSlot, setTargetSlot] = useState(null);
    const [lightboxSrc, setLightboxSrc] = useState('');
    const [loadingImageId, setLoadingImageId] = useState('');

    const plannerSlots = useMemo(() => {
        const stored = Array.isArray(state.config.instagramPlanner) ? state.config.instagramPlanner : [];
        const bySlot = new Map(stored.map((item) => [Number(item.slot), item]));
        return buildDefaultSlots().map((slot) => ({ ...slot, ...(bySlot.get(slot.slot) || {}) }));
    }, [state.config.instagramPlanner]);

    const filledCount = plannerSlots.filter((slot) => slot.imageId || slot.storageUrl || slot.thumbDataUrl).length;

    const updateSlots = (nextSlots) => {
        updateConfig({
            instagramPlanner: nextSlots
                .map((slot) => ({
                    slot: slot.slot,
                    imageId: slot.imageId || '',
                    thumbDataUrl: slot.thumbDataUrl || '',
                    storageUrl: slot.storageUrl || '',
                    storagePath: slot.storagePath || '',
                    uploadedAt: slot.uploadedAt || '',
                    uploadedBy: slot.uploadedBy || '',
                    note: slot.note || ''
                }))
                .filter((slot) => slot.imageId || slot.thumbDataUrl || slot.storageUrl || slot.note)
        });
    };

    const openUploadForSlot = (slotNumber) => {
        setTargetSlot(slotNumber);
        fileInputRef.current?.click();
    };

    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !targetSlot) return;

        const currentSlot = plannerSlots.find((slot) => slot.slot === targetSlot);

        try {
            const { metadata, thumbDataUrl } = await saveArticleLibraryImage(file, {
                productId: `instagram-planner-slot-${targetSlot}`,
                productCode: `IG-${targetSlot}`,
                productName: `Instagram Slot ${targetSlot}`,
                uploadedBy: user?.email || ''
            });

            if (currentSlot?.imageId) {
                await deleteArticleLibraryImage(currentSlot.imageId, currentSlot.storagePath);
            }

            updateSlots(plannerSlots.map((slot) => (
                slot.slot === targetSlot
                    ? {
                        ...slot,
                        imageId: metadata.id,
                        thumbDataUrl,
                        storageUrl: metadata.storageUrl || metadata.sharedPreviewUrl || '',
                        storagePath: metadata.storagePath || '',
                        uploadedAt: metadata.uploadedAt || new Date().toISOString(),
                        uploadedBy: metadata.uploadedBy || user?.email || ''
                    }
                    : slot
            )));
        } catch (error) {
            alert(`No se pudo subir la foto: ${error.message}`);
        } finally {
            setTargetSlot(null);
        }
    };

    const handleDelete = async (slotNumber) => {
        const currentSlot = plannerSlots.find((slot) => slot.slot === slotNumber);
        if (!currentSlot?.imageId && !currentSlot?.note) return;
        if (!window.confirm('¿Borrar esta foto del planner de Instagram?')) return;

        try {
            if (currentSlot.imageId) {
                await deleteArticleLibraryImage(currentSlot.imageId, currentSlot.storagePath);
            }
            updateSlots(plannerSlots.map((slot) => (
                slot.slot === slotNumber
                    ? { ...buildDefaultSlots()[slotNumber - 1], note: '' }
                    : slot
            )));
        } catch (error) {
            alert(`No se pudo borrar la foto: ${error.message}`);
        }
    };

    const handlePreview = async (slot) => {
        if (!slot?.imageId && !slot?.storageUrl) return;
        setLoadingImageId(slot.imageId || `slot-${slot.slot}`);
        try {
            const localUrl = slot.imageId ? await getArticleLibraryImageUrl(slot.imageId) : '';
            const fallbackUrl = slot.storageUrl || '';
            if (localUrl || fallbackUrl) setLightboxSrc(localUrl || fallbackUrl);
        } catch (error) {
            if (slot.storageUrl) {
                setLightboxSrc(slot.storageUrl);
            } else {
                alert(`No se pudo abrir la imagen: ${error.message}`);
            }
        } finally {
            setLoadingImageId('');
        }
    };

    const updateNote = (slotNumber, value) => {
        updateSlots(plannerSlots.map((slot) => (
            slot.slot === slotNumber
                ? { ...slot, note: value }
                : slot
        )));
    };

    const closeLightbox = () => {
        if (lightboxSrc?.startsWith('blob:')) {
            URL.revokeObjectURL(lightboxSrc);
        }
        setLightboxSrc('');
    };

    return (
        <div className="instagram-planner-page">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleUpload}
            />

            <div className="glass-panel instagram-planner-hero">
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Grid3X3 size={22} /> Instagram Post Planner
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: 820 }}>
                        Armá el grid semanal de Instagram en bloques de 3 x 3. Las fotos quedan guardadas para que Rocío pueda seguir cómo se va a ver el feed antes de publicar.
                    </p>
                </div>
                <div className="instagram-planner-stats">
                    <div className="instagram-planner-stat-card">
                        <span>Posts cargados</span>
                        <strong>{filledCount}/9</strong>
                    </div>
                    <div className="instagram-planner-stat-card">
                        <span>Vista</span>
                        <strong>Feed semanal</strong>
                    </div>
                </div>
            </div>

            <div className="instagram-planner-layout">
                <div className="glass-panel instagram-planner-grid-wrap">
                    <div className="instagram-planner-grid">
                        {plannerSlots.map((slot) => {
                            const previewSrc = slot.thumbDataUrl || slot.storageUrl || '';
                            return (
                                <div key={slot.slot} className="instagram-slot-card">
                                    <div className="instagram-slot-header">
                                        <span>{`Post ${slot.slot}`}</span>
                                        {slot.uploadedAt ? (
                                            <small>{new Date(slot.uploadedAt).toLocaleDateString('es-AR')}</small>
                                        ) : (
                                            <small>Vacío</small>
                                        )}
                                    </div>
                                    <div className="instagram-slot-preview">
                                        {previewSrc ? (
                                            <img src={previewSrc} alt={`Instagram slot ${slot.slot}`} />
                                        ) : (
                                            <div className="instagram-slot-placeholder">
                                                <ImagePlus size={28} />
                                                <span>Subir foto</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="instagram-slot-actions">
                                        <button className="btn btn-sm btn-primary" onClick={() => openUploadForSlot(slot.slot)}>
                                            {previewSrc ? <RefreshCw size={14} /> : <ImagePlus size={14} />}
                                            {previewSrc ? 'Reemplazar' : 'Subir'}
                                        </button>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => handlePreview(slot)}
                                            disabled={!previewSrc}
                                        >
                                            <Eye size={14} />
                                            {loadingImageId === (slot.imageId || `slot-${slot.slot}`) ? 'Abriendo...' : 'Ver'}
                                        </button>
                                        <button
                                            className="btn btn-sm btn-ghost"
                                            onClick={() => handleDelete(slot.slot)}
                                            disabled={!previewSrc && !slot.note}
                                        >
                                            <Trash2 size={14} />
                                            Borrar
                                        </button>
                                    </div>
                                    <textarea
                                        className="form-textarea"
                                        rows={2}
                                        placeholder="Nota opcional para este post..."
                                        value={slot.note || ''}
                                        onChange={(event) => updateNote(slot.slot, event.target.value)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="glass-panel instagram-planner-sidebar">
                    <h3 style={{ marginTop: 0, marginBottom: 10 }}>Seguimiento visual</h3>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                        Esta vista queda fija para Rocío, así puede planificar el orden del contenido sin que desaparezcan las fotos subidas.
                    </p>
                    <div className="instagram-mini-feed">
                        {plannerSlots.map((slot) => {
                            const previewSrc = slot.thumbDataUrl || slot.storageUrl || '';
                            return (
                                <div key={`mini-${slot.slot}`} className="instagram-mini-slot">
                                    {previewSrc ? <img src={previewSrc} alt={`Mini slot ${slot.slot}`} /> : <span>{slot.slot}</span>}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 8 }}>
                        <div>Los cuadros quedan en blanco hasta que subas una foto.</div>
                        <div>La imagen grande se guarda fuera del dashboard para cuidar memoria.</div>
                        <div>Podés reemplazar una casilla sin tocar las demás.</div>
                    </div>
                </div>
            </div>

            {lightboxSrc && (
                <div
                    onClick={closeLightbox}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(2, 6, 23, 0.88)',
                        zIndex: 5000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24
                    }}
                >
                    <img
                        src={lightboxSrc}
                        alt="Vista ampliada"
                        style={{
                            maxWidth: 'min(92vw, 960px)',
                            maxHeight: '88vh',
                            borderRadius: 18,
                            objectFit: 'contain',
                            boxShadow: '0 24px 60px rgba(0,0,0,0.45)'
                        }}
                    />
                </div>
            )}
        </div>
    );
}
