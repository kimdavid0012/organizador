import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Circle, Eye, ImagePlus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { useData } from '../store/DataContext';
import { getProductThumb } from '../utils/helpers';
import { useAuth } from '../store/AuthContext';
import { wooService } from '../utils/wooService';
import {
    deleteArticleLibraryImage,
    getArticleLibraryImageUrl,
    getArticleLibraryThumb,
    saveArticleLibraryImage
} from '../store/imageLibrary';

const FOTO_TASKS = [
    { id: 'foto_web', group: 'Web', label: 'Foto principal', aliases: ['web_single', 'web_model'] },
    { id: 'foto_perchero_web', group: 'Web', label: 'Perchero', aliases: ['web_rack'] },
    { id: 'foto_colores_web', group: 'Web', label: 'Colores', aliases: ['web_variants'] },
    { id: 'foto_instagram', group: 'Instagram', label: 'Foto principal', aliases: ['ig_model'] },
    { id: 'foto_flat_lay_instagram', group: 'Instagram', label: 'Flat lay', aliases: ['ig_flatlay'] },
    { id: 'foto_perchero_instagram', group: 'Instagram', label: 'Perchero', aliases: ['ig_rack'] }
];

const FOTO_TASK_GROUPS = ['Web', 'Instagram'];

const formatSizeLabel = (bytes) => {
    const amount = Number(bytes || 0);
    if (amount >= 1024 * 1024) return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
    if (amount >= 1024) return `${Math.round(amount / 1024)} KB`;
    return `${amount} B`;
};

const getWooImageUrl = (product) => {
    if (product.image) return product.image;
    if (product.storageUrl) return product.storageUrl;
    const images = product.images || product.imagenes || [];
    return images.map((image) => (
        typeof image === 'string' ? image : image?.src || image?.url || ''
    )).find(Boolean) || '';
};

const mapWooProductForFotos = (product) => ({
    id: `woo:${product.id || product.productId || product.sku}`,
    source: 'woo',
    wooId: product.id || product.productId,
    codigoInterno: product.sku || product.codigoInterno || '',
    detalleCorto: product.name || product.productName || product.detalleCorto || 'Articulo sin nombre',
    storageUrl: getWooImageUrl(product),
    imagenes: (product.images || product.imagenes || [])
        .map((image) => (typeof image === 'string' ? image : image?.src || image?.url || ''))
        .filter(Boolean),
    activo: product.status ? product.status !== 'trash' : product.activo !== false
});

const mapFotosProductToCache = (product) => ({
    id: product.wooId || product.id,
    productId: product.wooId || product.id,
    productName: product.detalleCorto,
    sku: product.codigoInterno,
    image: product.storageUrl || getWooImageUrl(product)
});

export default function FotosPage() {
    const { state, updateConfig, updatePosProduct } = useData();
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [thumbs, setThumbs] = useState({});
    const [uploadingProductId, setUploadingProductId] = useState('');
    const [lightboxSrc, setLightboxSrc] = useState('');
    const [loadingImageId, setLoadingImageId] = useState('');
    const [loadingWooProducts, setLoadingWooProducts] = useState(false);
    const [wooError, setWooError] = useState('');
    const fileInputRef = useRef(null);
    const searchInputRef = useRef(null);

    const posProducts = state.config.posProductos || [];
    const paginaWebCache = state.config.paginaWebCache || {};
    const cachedWooProducts = paginaWebCache.fotoProducts || paginaWebCache.allProducts || [];
    const fotoTasks = state.config.fotoTasks || [];
    const imageLibrary = state.config.imageLibrary || [];

    const allProducts = useMemo(() => {
        const byKey = new Map();
        const addProduct = (product) => {
            if (!product?.id) return;
            const key = product.codigoInterno || product.id;
            if (!byKey.has(key)) byKey.set(key, product);
        };

        cachedWooProducts.map(mapWooProductForFotos).forEach(addProduct);
        posProducts
            .filter((product) => product.activo !== false)
            .map((product) => ({ ...product, source: product.source || 'pos' }))
            .forEach(addProduct);

        return Array.from(byKey.values());
    }, [cachedWooProducts, posProducts]);

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
            .slice(0, 500);
    }, [allProducts, search]);

    useEffect(() => {
        const savedSearch = window.localStorage.getItem('fotos-page-search') || '';
        if (savedSearch) setSearch(savedSearch);
    }, []);

    useEffect(() => {
        try { window.localStorage.setItem('fotos-page-search', search); } catch { /* ignore quota */ }
    }, [search]);

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

    const isTaskDone = (record, task) => {
        const states = record.states || {};
        return Boolean(states[task.id] || task.aliases?.some((alias) => states[alias]));
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

    const loadWooProducts = async ({ silent = false } = {}) => {
        if (loadingWooProducts) return;
        setLoadingWooProducts(true);
        setWooError('');
        try {
            const rawProducts = await wooService.fetchProducts(state.config);
            const mapped = rawProducts
                .map(mapWooProductForFotos)
                .filter((product) => product.id && product.activo !== false);
            updateConfig({
                paginaWebCache: {
                    ...paginaWebCache,
                    fotoProducts: mapped.map(mapFotosProductToCache),
                    fotoProductsLoadedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            const message = `No se pudieron cargar articulos de WooCommerce: ${error.message}`;
            setWooError(message);
            if (!silent) alert(message);
        } finally {
            setLoadingWooProducts(false);
        }
    };

    useEffect(() => {
        if (allProducts.length || loadingWooProducts || wooError) return;
        void loadWooProducts({ silent: true });
    }, [allProducts.length, loadingWooProducts, wooError]);

    const openFilePickerForProduct = (productId) => {
        setUploadingProductId(productId);
        fileInputRef.current?.click();
    };

    const setProductCover = (product, imageMeta, thumbDataUrl) => {
        if (product.source === 'woo') return;
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
                if (product.source !== 'woo' && isCover && uploaded[0].metadata.storageUrl) {
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

            if (product.source !== 'woo' && product.imagenBibliotecaId === imageMeta.id) {
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
        const completedProducts = allProducts.filter((product) => {
            const record = getTaskRecord(product.id);
            return FOTO_TASKS.every((task) => isTaskDone(record, task));
        }).length;
        return { totalImages, totalSize, attachedProducts, completedProducts };
    }, [allProducts, fotoTasks, imageLibrary]);

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
                            Articulos de la web con su foto de WooCommerce para marcar que foto falta por tarea.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => loadWooProducts()} disabled={loadingWooProducts}>
                            <RefreshCw size={16} />
                            {loadingWooProducts ? 'Cargando...' : 'Actualizar Woo'}
                        </button>
                        <div className="form-group" style={{ margin: 0, minWidth: 260 }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                                <input
                                    ref={searchInputRef}
                                    className="form-input"
                                    style={{ paddingLeft: 34 }}
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    onFocus={(event) => event.stopPropagation()}
                                    placeholder="Buscar por codigo o articulo"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Articulos web</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{allProducts.length}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Articulos completos</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{imageStats.completedProducts}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fotos subidas al dashboard</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{imageStats.totalImages}</div>
                    </div>
                </div>
                {wooError && (
                    <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 13 }}>
                        {wooError}
                    </div>
                )}
            </div>

            {visibleProducts.length === 0 && (
                <div className="glass-panel" style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {loadingWooProducts ? 'Cargando articulos de WooCommerce...' : 'No hay articulos cargados. Usa Actualizar Woo para traerlos de la web.'}
                </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
                {visibleProducts.map((product) => {
                    const record = getTaskRecord(product.id);
                    const completed = FOTO_TASKS.filter((task) => isTaskDone(record, task)).length;
                    const productImages = (libraryByProductId.get(product.id) || []).sort((left, right) => (right.uploadedAt || '').localeCompare(left.uploadedAt || ''));
                    const coverThumb = product.imagenBibliotecaThumb || thumbs[product.imagenBibliotecaId] || getProductThumb(product.codigoInterno, allProducts) || '';

                    return (
                        <div
                            key={product.id}
                            className="glass-panel"
                            style={{ padding: 'var(--sp-4)', border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div style={{ width: 120, flex: '0 0 120px' }}>
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

                                <div style={{ minWidth: 280, flex: '1 1 520px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-md)', overflowWrap: 'anywhere' }}>{product.detalleCorto}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{product.codigoInterno || 'Sin codigo'}</div>
                                        </div>
                                        <div style={{ color: completed === FOTO_TASKS.length ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 'var(--fw-semibold)' }}>
                                            {completed}/{FOTO_TASKS.length} completas
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                                        {FOTO_TASK_GROUPS.map((group) => (
                                            <div key={group} style={{ padding: 10, borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', minWidth: 0 }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{group}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
                                                    {FOTO_TASKS.filter((task) => task.group === group).map((task) => {
                                                        const done = isTaskDone(record, task);
                                                        return (
                                                            <button
                                                                key={task.id}
                                                                className="btn btn-secondary"
                                                                onClick={() => toggleTask(product.id, task.id)}
                                                                style={{
                                                                    flex: '1 1 110px',
                                                                    minWidth: 0,
                                                                    minHeight: 38,
                                                                    justifyContent: 'space-between',
                                                                    gap: 8,
                                                                    padding: '8px 10px',
                                                                    borderColor: done ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.25)',
                                                                    background: done ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.08)',
                                                                    color: done ? 'var(--success)' : '#fca5a5'
                                                                }}
                                                            >
                                                                <span style={{ minWidth: 0, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.2 }}>{task.label}</span>
                                                                <span style={{ flex: '0 0 auto', display: 'flex' }}>{done ? <CheckCircle2 size={16} /> : <Circle size={16} />}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
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
