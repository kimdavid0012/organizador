import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Circle, Eye, ImagePlus, Search, Star, Trash2 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import {
    deleteArticleLibraryImage,
    getArticleLibraryImageUrl,
    getArticleLibraryThumb,
    saveArticleLibraryImage
} from '../store/imageLibrary';

const FOTO_TASKS = [
    { id: 'web_single', label: '1 prenda web' },
    { id: 'web_variants', label: 'Perchero colores web' },
    { id: 'web_model', label: 'Modelo web' },
    { id: 'ig_flatlay', label: 'Flat lay IG' },
    { id: 'ig_rack', label: 'Perchero IG' },
    { id: 'ig_model', label: 'Modelo IG' }
];

const formatSizeLabel = (bytes) => {
    const amount = Number(bytes || 0);
    if (amount >= 1024 * 1024) return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
    if (amount >= 1024) return `${Math.round(amount / 1024)} KB`;
    return `${amount} B`;
};

export default function FotosPage() {
    const { state, updateConfig, updatePosProduct } = useData();
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [thumbs, setThumbs] = useState({});
    const [uploadingProductId, setUploadingProductId] = useState('');
    const [lightboxSrc, setLightboxSrc] = useState('');
    const [loadingImageId, setLoadingImageId] = useState('');
    const fileInputRef = useRef(null);

    const allProducts = state.config.posProductos || [];
    const fotoTasks = state.config.fotoTasks || [];
    const imageLibrary = state.config.imageLibrary || [];

    const libraryByProductId = useMemo(() => {
        return imageLibrary.reduce((map, item) => {
            const key = item.productId || '';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(item);
            return map;
        }, new Map());
    }, [imageLibrary]);

    const visibleProducts = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        return allProducts
            .filter((product) => product.activo !== false)
            .filter((product) => {
                if (!normalized) return true;
                return (
                    (product.codigoInterno || '').toLowerCase().includes(normalized) ||
                    (product.detalleCorto || '').toLowerCase().includes(normalized)
                );
            })
            .slice(0, 120);
    }, [allProducts, search]);

    useEffect(() => {
        let cancelled = false;
        const visibleIds = Array.from(
            new Set(
                visibleProducts.flatMap((product) => {
                    const ids = (libraryByProductId.get(product.id) || []).map((item) => item.id);
                    if (product.imagenBibliotecaId) ids.push(product.imagenBibliotecaId);
                    return ids;
                }).filter(Boolean)
            )
        );

        Promise.all(
            visibleIds.map(async (id) => {
                try {
                    const thumb = await getArticleLibraryThumb(id);
                    return [id, thumb];
                } catch {
                    return [id, ''];
                }
            })
        ).then((entries) => {
            if (cancelled) return;
            setThumbs((prev) => ({ ...prev, ...Object.fromEntries(entries.filter(([, thumb]) => thumb)) }));
        });

        return () => {
            cancelled = true;
        };
    }, [visibleProducts, libraryByProductId]);

    const getTaskRecord = (productId) =>
        fotoTasks.find((entry) => entry.productId === productId) || {
            productId,
            states: {},
            updatedAt: null
        };

    const toggleTask = (productId, taskId) => {
        const current = getTaskRecord(productId);
        const nextTasks = fotoTasks.filter((entry) => entry.productId !== productId);
        const nextRecord = {
            ...current,
            updatedAt: new Date().toISOString(),
            updatedBy: user.email,
            states: {
                ...(current.states || {}),
                [taskId]: !current.states?.[taskId]
            }
        };
        updateConfig({ fotoTasks: [...nextTasks, nextRecord] });
    };

    const openFilePickerForProduct = (productId) => {
        setUploadingProductId(productId);
        fileInputRef.current?.click();
    };

    const setProductCover = (product, imageMeta, thumbDataUrl) => {
        updatePosProduct(product.id, {
            imagenBibliotecaId: imageMeta.id,
            imagenBibliotecaThumb: thumbDataUrl || thumbs[imageMeta.id] || product.imagenBibliotecaThumb || '',
            storageUrl: imageMeta.storageUrl || imageMeta.sharedPreviewUrl || ''
        });
    };

    const handleUploadImages = async (event) => {
        const productId = uploadingProductId;
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!productId || !files.length) return;

        const product = allProducts.find((item) => item.id === productId);
        if (!product) return;

        try {
            const uploaded = [];
            for (const file of files) {
                const { metadata, thumbDataUrl } = await saveArticleLibraryImage(file, {
                    productId: product.id,
                    productCode: product.codigoInterno,
                    productName: product.detalleCorto,
                    uploadedBy: user.email
                });
                uploaded.push({ metadata, thumbDataUrl });
            }

            const nextLibrary = [
                ...imageLibrary,
                ...uploaded.map(({ metadata }) => metadata)
            ].sort((left, right) => (right.uploadedAt || '').localeCompare(left.uploadedAt || ''));

            setThumbs((prev) => ({
                ...prev,
                ...Object.fromEntries(uploaded.map(({ metadata, thumbDataUrl }) => [metadata.id, thumbDataUrl]))
            }));
            updateConfig({ imageLibrary: nextLibrary });

            const currentImages = libraryByProductId.get(product.id) || [];
            if (!product.imagenBibliotecaId || currentImages.length === 0) {
                setProductCover(product, uploaded[0].metadata, uploaded[0].thumbDataUrl);
            } else {
                // Update storageUrl if this is the current cover (re-upload or first-time storage)
                const isCover = product.imagenBibliotecaId === uploaded[0].metadata.id;
                if (isCover && uploaded[0].metadata.storageUrl) {
                    updatePosProduct(product.id, { storageUrl: uploaded[0].metadata.storageUrl });
                }
            }
        } catch (error) {
            alert(`No se pudo subir la imagen: ${error.message}`);
        } finally {
            setUploadingProductId('');
        }
    };

    const handleDeleteImage = async (product, imageMeta) => {
        if (!window.confirm('¿Borrar esta foto de la biblioteca del artículo?')) return;

        try {
            await deleteArticleLibraryImage(imageMeta.id, imageMeta.storagePath);
            const nextLibrary = imageLibrary.filter((item) => item.id !== imageMeta.id);
            updateConfig({ imageLibrary: nextLibrary });
            setThumbs((prev) => {
                const next = { ...prev };
                delete next[imageMeta.id];
                return next;
            });

            if (product.imagenBibliotecaId === imageMeta.id) {
                const nextCover = nextLibrary.find((item) => item.productId === product.id);
                updatePosProduct(product.id, {
                    imagenBibliotecaId: nextCover?.id || '',
                    imagenBibliotecaThumb: nextCover ? thumbs[nextCover.id] || '' : ''
                });
            }
        } catch (error) {
            alert(`No se pudo borrar la imagen: ${error.message}`);
        }
    };

    const handlePreviewImage = async (imageId) => {
        setLoadingImageId(imageId);
        try {
            const url = await getArticleLibraryImageUrl(imageId);
            const fallbackUrl = imageLibrary.find((item) => item.id === imageId)?.sharedPreviewUrl || '';
            if (url || fallbackUrl) setLightboxSrc(url || fallbackUrl);
        } catch (error) {
            const fallbackUrl = imageLibrary.find((item) => item.id === imageId)?.sharedPreviewUrl || '';
            if (fallbackUrl) {
                setLightboxSrc(fallbackUrl);
            } else {
                alert(`No se pudo abrir la imagen: ${error.message}`);
            }
        } finally {
            setLoadingImageId('');
        }
    };

    const closeLightbox = () => {
        if (lightboxSrc?.startsWith('blob:')) {
            URL.revokeObjectURL(lightboxSrc);
        }
        setLightboxSrc('');
    };

    const imageStats = useMemo(() => {
        const totalImages = imageLibrary.length;
        const totalSize = imageLibrary.reduce((acc, item) => acc + (Number(item.sizeBytes || 0) || 0), 0);
        const attachedProducts = new Set(imageLibrary.map((item) => item.productId).filter(Boolean)).size;
        return { totalImages, totalSize, attachedProducts };
    }, [imageLibrary]);

    return (
        <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleUploadImages}
            />

            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <Camera size={22} /> Biblioteca de Fotos por Artículo
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: 760 }}>
                            Las fotos grandes quedan guardadas aparte en la memoria local del navegador, y el dashboard solo conserva una referencia liviana para no inflar el sistema.
                        </p>
                    </div>
                    <div className="form-group" style={{ margin: 0, minWidth: 260 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 34 }}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar por codigo o articulo"
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fotos guardadas</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{imageStats.totalImages}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Artículos con foto</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{imageStats.attachedProducts}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Peso estimado imágenes</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{formatSizeLabel(imageStats.totalSize)}</div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
                {visibleProducts.map((product) => {
                    const record = getTaskRecord(product.id);
                    const completed = FOTO_TASKS.filter((task) => record.states?.[task.id]).length;
                    const productImages = (libraryByProductId.get(product.id) || []).sort((left, right) => (right.uploadedAt || '').localeCompare(left.uploadedAt || ''));
                    const coverThumb = product.imagenBibliotecaThumb || thumbs[product.imagenBibliotecaId] || '';

                    return (
                        <div
                            key={product.id}
                            className="glass-panel"
                            style={{ padding: 'var(--sp-4)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                                <div>
                                    <div style={{
                                        width: 120,
                                        aspectRatio: '1 / 1',
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {coverThumb ? (
                                            <img src={coverThumb} alt={product.detalleCorto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>
                                                Sin foto de artículo
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                                        onClick={() => openFilePickerForProduct(product.id)}
                                    >
                                        <ImagePlus size={16} />
                                        {uploadingProductId === product.id ? 'Subiendo...' : 'Subir foto'}
                                    </button>
                                </div>

                                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-md)' }}>{product.detalleCorto}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{product.codigoInterno || 'Sin codigo'}</div>
                                        </div>
                                        <div style={{ color: completed === FOTO_TASKS.length ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 'var(--fw-semibold)' }}>
                                            {completed}/{FOTO_TASKS.length} completas
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                                        {FOTO_TASKS.map((task) => {
                                            const done = Boolean(record.states?.[task.id]);
                                            return (
                                                <button
                                                    key={task.id}
                                                    className="btn btn-secondary"
                                                    onClick={() => toggleTask(product.id, task.id)}
                                                    style={{
                                                        justifyContent: 'space-between',
                                                        borderColor: done ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.25)',
                                                        background: done ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.08)',
                                                        color: done ? 'var(--success)' : '#fca5a5'
                                                    }}
                                                >
                                                    <span>{task.label}</span>
                                                    {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                            Biblioteca del artículo ({productImages.length})
                                        </div>
                                        {productImages.length === 0 ? (
                                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                                Todavía no hay fotos cargadas para este artículo.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                                                {productImages.map((imageMeta) => {
                                                    const thumb = thumbs[imageMeta.id] || (product.imagenBibliotecaId === imageMeta.id ? product.imagenBibliotecaThumb : '');
                                                    const isCover = product.imagenBibliotecaId === imageMeta.id;
                                                    return (
                                                        <div
                                                            key={imageMeta.id}
                                                            style={{
                                                                borderRadius: 12,
                                                                border: isCover ? '1px solid rgba(20,184,166,0.45)' : '1px solid rgba(255,255,255,0.08)',
                                                                overflow: 'hidden',
                                                                background: 'rgba(255,255,255,0.03)'
                                                            }}
                                                        >
                                                            <div style={{ width: '100%', aspectRatio: '1 / 1', background: 'rgba(255,255,255,0.04)' }}>
                                                                {thumb ? (
                                                                    <img src={thumb} alt={imageMeta.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : null}
                                                            </div>
                                                            <div style={{ padding: 8, display: 'grid', gap: 6 }}>
                                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                                    {formatSizeLabel(imageMeta.sizeBytes)}
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                                                    <button className="btn btn-secondary" style={{ minHeight: 34, justifyContent: 'center', padding: 0 }} onClick={() => handlePreviewImage(imageMeta.id)}>
                                                                        <Eye size={14} />
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-secondary"
                                                                        style={{
                                                                            minHeight: 34,
                                                                            justifyContent: 'center',
                                                                            padding: 0,
                                                                            borderColor: isCover ? 'rgba(20,184,166,0.45)' : undefined,
                                                                            color: isCover ? 'var(--accent)' : undefined
                                                                        }}
                                                                        onClick={() => setProductCover(product, imageMeta, thumb)}
                                                                    >
                                                                        <Star size={14} />
                                                                    </button>
                                                                    <button className="btn btn-secondary" style={{ minHeight: 34, justifyContent: 'center', padding: 0, color: '#fca5a5' }} onClick={() => handleDeleteImage(product, imageMeta)}>
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {lightboxSrc && (
                <div
                    onClick={closeLightbox}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.86)',
                        zIndex: 1100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24
                    }}
                >
                    <img
                        src={lightboxSrc}
                        alt="Vista ampliada"
                        style={{ maxWidth: '95vw', maxHeight: '92vh', borderRadius: 16, objectFit: 'contain' }}
                    />
                </div>
            )}

            {loadingImageId && (
                <div style={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.72)',
                    color: '#fff',
                    zIndex: 1200
                }}>
                    Abriendo imagen...
                </div>
            )}
        </div>
    );
}
