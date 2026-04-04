import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Eye, Grid3X3, ImagePlus, RefreshCw, Trash2, TrendingUp, Heart, MessageCircle, Clock, Users, BarChart3, Loader2 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { instagramService } from '../utils/instagramService';
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
    const [igMetrics, setIgMetrics] = useState(null);
    const [igLoading, setIgLoading] = useState(false);
    const [igError, setIgError] = useState('');

    const loadIgMetrics = useCallback(async () => {
        if (!state.config.marketing?.metaToken) { setIgError('Falta Meta Token en Configuración'); return; }
        setIgLoading(true);
        setIgError('');
        try {
            const analytics = await instagramService.fetchAnalytics(state.config);
            setIgMetrics(analytics);
        } catch (err) {
            setIgError(err.message);
        } finally {
            setIgLoading(false);
        }
    }, [state.config]);

    useEffect(() => {
        if (state.config.marketing?.metaToken) loadIgMetrics();
    }, []);

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
                <div style={{ flex: 1 }}>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Grid3X3 size={22} /> Instagram @celavieindumentaria
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: 820, fontSize: 13 }}>
                        Dashboard de Instagram con métricas en vivo, top posts, mejores horarios, y planificador de grid.
                    </p>
                </div>
                <button onClick={loadIgMetrics} disabled={igLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
                    {igLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                    Actualizar métricas
                </button>
            </div>

            {/* IG Live Metrics */}
            {igMetrics && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <div className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                        <Users size={18} style={{ color: '#8b5cf6', marginBottom: 4 }} />
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{(igMetrics.followers || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Seguidores</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                        <TrendingUp size={18} style={{ color: '#10b981', marginBottom: 4 }} />
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{igMetrics.engagementRate}%</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Engagement Rate</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                        <Heart size={18} style={{ color: '#ef4444', marginBottom: 4 }} />
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{(igMetrics.avgLikes || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Likes promedio</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                        <MessageCircle size={18} style={{ color: '#3b82f6', marginBottom: 4 }} />
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{igMetrics.avgComments || 0}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Comments promedio</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                        <BarChart3 size={18} style={{ color: '#f59e0b', marginBottom: 4 }} />
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{igMetrics.mediaCount?.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Posts totales</div>
                    </div>
                    <div className="glass-panel" style={{ padding: 14, textAlign: 'center' }}>
                        <Grid3X3 size={18} style={{ color: '#ec4899', marginBottom: 4 }} />
                        <div style={{ fontSize: 22, fontWeight: 700 }}>{filledCount}/9</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Grid cargado</div>
                    </div>
                </div>
            )}

            {igError && (
                <div className="glass-panel" style={{ padding: 12, marginBottom: 16, color: '#ef4444', fontSize: 12 }}>
                    ⚠️ {igError}
                </div>
            )}

            {/* Top Posts + Best Times */}
            {igMetrics && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div className="glass-panel" style={{ padding: 16 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Heart size={16} color="#ef4444" /> Top 5 Posts (por engagement)
                        </h3>
                        {(igMetrics.topPosts || []).map((post, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: 12 }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                                    {post.type === 'VIDEO' ? '🎬' : post.type === 'CAROUSEL_ALBUM' ? '🎠' : '📸'} {post.caption || 'Sin caption'}
                                </span>
                                <span style={{ display: 'flex', gap: 8, flexShrink: 0, color: 'var(--text-muted)' }}>
                                    <span>❤️ {post.likes}</span>
                                    <span>💬 {post.comments}</span>
                                    <span style={{ opacity: 0.5 }}>{post.date}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="glass-panel" style={{ padding: 16 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={16} color="#f59e0b" /> Mejores horarios para publicar
                        </h3>
                        <div style={{ marginBottom: 12 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mejores horas:</span>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                {(igMetrics.bestPostingHours || []).map((h, i) => (
                                    <span key={i} style={{ padding: '4px 10px', borderRadius: 8, background: i === 0 ? '#10b98120' : 'var(--bg-input)', border: `1px solid ${i === 0 ? '#10b981' : 'var(--border-color)'}`, fontSize: 13, fontWeight: i === 0 ? 700 : 400 }}>
                                        🕐 {h}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mejores días:</span>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                {(igMetrics.bestPostingDays || []).map((d, i) => (
                                    <span key={i} style={{ padding: '4px 10px', borderRadius: 8, background: i === 0 ? '#3b82f620' : 'var(--bg-input)', border: `1px solid ${i === 0 ? '#3b82f6' : 'var(--border-color)'}`, fontSize: 13, fontWeight: i === 0 ? 700 : 400 }}>
                                        📅 {d}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Performance por tipo:</span>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                {Object.entries(igMetrics.contentTypePerformance || {}).map(([type, data]) => (
                                    <div key={type} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border-color)', fontSize: 11 }}>
                                        <div style={{ fontWeight: 600 }}>{type === 'VIDEO' ? '🎬 Reels' : type === 'CAROUSEL_ALBUM' ? '🎠 Carruseles' : '📸 Fotos'}</div>
                                        <div style={{ color: 'var(--text-muted)' }}>{data.count} posts · ⌀ {data.avgEngagement} eng.</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Section title for Grid Planner */}
            <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Grid3X3 size={18} /> Grid Planner — Próximos 9 posts
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Rocío puede cargar y ordenar las fotos para ver cómo queda el feed
                </span>
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
