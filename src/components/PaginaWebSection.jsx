import React, { useState, useEffect, useRef } from 'react';
import { Globe, RefreshCw, ArrowLeft, TrendingUp, ShoppingCart, Package, ChevronRight, Search, ArrowUpDown, Filter } from 'lucide-react';
import { useData } from '../store/DataContext';
import { wooService } from '../utils/wooService';

export default function PaginaWebSection() {
    const { state, setPaginaWebCache } = useData();
    const { config } = state;
    const marketing = config.marketing || {};
    const paginaWebCache = config.paginaWebCache || {};

    const [loading, setLoading] = useState(false);
    const [allProducts, setAllProducts] = useState(paginaWebCache.allProducts?.length ? paginaWebCache.allProducts : null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('itemsSold'); // itemsSold, netRevenue, productName, ordersCount
    const [sortDir, setSortDir] = useState('desc');

    // Detail view state
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [productStats, setProductStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    const canvasRef = useRef(null);

    useEffect(() => {
        setAllProducts(paginaWebCache.allProducts?.length ? paginaWebCache.allProducts : null);
    }, [paginaWebCache.allProducts]);

    const persistPaginaWebCache = (overrides = {}) => {
        setPaginaWebCache({
            allProducts: allProducts || [],
            productStatsById: paginaWebCache.productStatsById || {},
            lastLoadedAt: paginaWebCache.lastLoadedAt || new Date().toISOString(),
            ...overrides
        });
    };

    const handleLoadAll = async () => {
        setLoading(true);
        try {
            const raw = await wooService.fetchAllProductsAnalytics(config);
            const mapped = raw.map(tp => ({
                productId: tp.product_id,
                productName: tp.extended_info?.name || 'Sin Nombre',
                sku: tp.extended_info?.sku || 'N/A',
                image: tp.extended_info?.image || '',
                itemsSold: tp.items_sold || 0,
                netRevenue: tp.net_revenue || 0,
                ordersCount: tp.orders_count || 0,
                category: tp.extended_info?.categories?.[0]?.name || '',
                stockStatus: tp.extended_info?.stock_status || '',
                variations: tp.extended_info?.variations || []
            }));
            setAllProducts(mapped);
            persistPaginaWebCache({
                allProducts: mapped,
                lastLoadedAt: new Date().toISOString()
            });
        } catch (err) {
            alert(`❌ Error al cargar productos: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProduct = async (product) => {
        setSelectedProduct(product);
        const cachedStats = paginaWebCache.productStatsById?.[product.productId];
        if (cachedStats) {
            setProductStats(cachedStats);
            return;
        }
        setLoadingStats(true);
        setProductStats(null);
        try {
            const stats = await wooService.fetchProductStats(config, product.productId);
            setProductStats(stats);
            persistPaginaWebCache({
                productStatsById: {
                    ...(paginaWebCache.productStatsById || {}),
                    [product.productId]: stats
                }
            });
        } catch (err) {
            console.error('Error loading product stats:', err);
            const emptyStats = { intervals: [], totals: {} };
            setProductStats(emptyStats);
            persistPaginaWebCache({
                productStatsById: {
                    ...(paginaWebCache.productStatsById || {}),
                    [product.productId]: emptyStats
                }
            });
        } finally {
            setLoadingStats(false);
        }
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(column);
            setSortDir('desc');
        }
    };

    const sortIndicator = (column) => {
        if (sortBy !== column) return '';
        return sortDir === 'desc' ? ' ▼' : ' ▲';
    };

    // Draw chart when stats are loaded
    useEffect(() => {
        if (!productStats || !canvasRef.current) return;
        const intervals = productStats.intervals || [];
        if (intervals.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, w, h);

        const dataPoints = intervals.map(i => i.subtotals?.items_sold || 0);
        const labels = intervals.map(i => {
            const d = new Date(i.interval);
            return `${d.getDate()}/${d.getMonth() + 1}`;
        });

        const maxVal = Math.max(...dataPoints, 1);
        const padTop = 20, padBot = 30, padLeft = 40, padRight = 20;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBot;

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padTop + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(w - padRight, y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padLeft - 6, y + 4);
        }

        // Line
        if (dataPoints.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            dataPoints.forEach((val, idx) => {
                const x = padLeft + (idx / (dataPoints.length - 1)) * chartW;
                const y = padTop + chartH - (val / maxVal) * chartH;
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Gradient fill
            const grad = ctx.createLinearGradient(0, padTop, 0, h - padBot);
            grad.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
            grad.addColorStop(1, 'rgba(139, 92, 246, 0)');
            ctx.lineTo(padLeft + chartW, padTop + chartH);
            ctx.lineTo(padLeft, padTop + chartH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Dots
            dataPoints.forEach((val, idx) => {
                const x = padLeft + (idx / (dataPoints.length - 1)) * chartW;
                const y = padTop + chartH - (val / maxVal) * chartH;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#8b5cf6';
                ctx.fill();
            });
        }

        // X labels
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(labels.length / 7));
        labels.forEach((lbl, idx) => {
            if (idx % step === 0) {
                const x = padLeft + (idx / (labels.length - 1)) * chartW;
                ctx.fillText(lbl, x, h - 8);
            }
        });
    }, [productStats]);

    // Filter and sort
    const filteredProducts = (allProducts || [])
        .filter(p => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
        })
        .sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'productName') {
                cmp = a.productName.localeCompare(b.productName);
            } else {
                cmp = (a[sortBy] || 0) - (b[sortBy] || 0);
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });

    const totalItemsSold = allProducts?.reduce((a, p) => a + p.itemsSold, 0) || 0;
    const totalRevenue = allProducts?.reduce((a, p) => a + p.netRevenue, 0) || 0;

    // Helper to render product image safely
    const ProductImage = ({ src, alt }) => {
        const [imgError, setImgError] = useState(false);
        if (!src || imgError) {
            return (
                <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Package size={16} color="#8b5cf6" />
                </div>
            );
        }
        return (
            <img
                src={src}
                alt={alt}
                onError={() => setImgError(true)}
                style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--glass-border)' }}
            />
        );
    };

    // ========== DETAIL VIEW ==========
    if (selectedProduct) {
        const intervals = productStats?.intervals || [];

        return (
            <div className="view-container" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
                <button
                    className="btn btn-ghost"
                    onClick={() => { setSelectedProduct(null); setProductStats(null); }}
                    style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <ArrowLeft size={16} /> Volver al Listado
                </button>

                <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                        <ProductImage src={selectedProduct.image} alt={selectedProduct.productName} />
                        <div>
                            <h2 style={{ margin: 0 }}>{selectedProduct.productName}</h2>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>SKU: {selectedProduct.sku} · {selectedProduct.category}</p>
                        </div>
                    </div>

                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div style={{ padding: 20, background: 'rgba(139, 92, 246, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Artículos Vendidos</div>
                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8b5cf6' }}>{selectedProduct.itemsSold}</div>
                        </div>
                        <div style={{ padding: 20, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Ventas Netas</div>
                            <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--success)' }}>
                                ${parseFloat(selectedProduct.netRevenue || 0).toLocaleString('es-AR')}
                            </div>
                        </div>
                        <div style={{ padding: 20, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Pedidos</div>
                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#3b82f6' }}>{selectedProduct.ordersCount}</div>
                        </div>
                    </div>
                </div>

                {/* Chart */}
                <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrendingUp size={18} color="#8b5cf6" /> Artículos Vendidos (últimos 30 días)
                    </h3>
                    {loadingStats ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <RefreshCw size={20} className="spin" style={{ marginBottom: 8 }} /><br />Cargando gráfico...
                        </div>
                    ) : intervals.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            No hay datos de ventas en los últimos 30 días para este producto.
                        </div>
                    ) : (
                        <canvas
                            ref={canvasRef}
                            style={{ width: '100%', height: 220, display: 'block' }}
                        />
                    )}
                </div>

                {/* Variations */}
                {selectedProduct.variations && selectedProduct.variations.length > 0 && (
                    <div className="glass-panel" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 16px 0' }}>Variaciones ({selectedProduct.variations.length})</h3>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>ID Variación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedProduct.variations.map((v, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                        <td style={{ padding: '10px 0' }}>Variación #{v}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    // ========== LIST VIEW ==========
    return (
        <div className="view-container" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        <Globe className="text-accent" /> Página Web
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Analíticas completas de ventas de tu tienda WooCommerce.
                    </p>
                </div>
                {marketing.wooUrl && (
                    <button
                        className="btn btn-primary"
                        onClick={handleLoadAll}
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        {loading ? 'Cargando...' : allProducts ? '🔄 Actualizar' : '📊 Cargar Analíticas'}
                    </button>
                )}
            </div>

            {!marketing.wooUrl ? (
                <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
                    <Globe size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        WooCommerce no está conectado. <br />
                        Andá a <strong>Configuración</strong> para conectar tu tienda.
                    </p>
                </div>
            ) : !allProducts ? (
                <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
                    <ShoppingCart size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        Presioná <strong>"Cargar Analíticas"</strong> para ver las ventas de todos tus artículos de la web.
                    </p>
                </div>
            ) : (
                <>
                    {/* Summary KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                        <div className="glass-panel" style={{ padding: 20, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Artículos</div>
                            <div style={{ fontSize: 24, fontWeight: 'bold' }}>{allProducts.length}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 20, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Vendidos</div>
                            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#8b5cf6' }}>{totalItemsSold}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 20, textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Ingresos Netos</div>
                            <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--success)' }}>
                                ${totalRevenue.toLocaleString('es-AR')}
                            </div>
                        </div>
                    </div>

                    {/* Search */}
                    <div style={{ marginBottom: 16, position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o SKU..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%', padding: '10px 12px 10px 36px',
                                background: 'var(--bg-input)', border: '1px solid var(--glass-border)',
                                borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Product Table */}
                    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    <th
                                        onClick={() => handleSort('productName')}
                                        style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Producto{sortIndicator('productName')}
                                    </th>
                                    <th style={{ textAlign: 'center', padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>SKU</th>
                                    <th
                                        onClick={() => handleSort('itemsSold')}
                                        style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Vendidos{sortIndicator('itemsSold')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('netRevenue')}
                                        style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Ventas Netas{sortIndicator('netRevenue')}
                                    </th>
                                    <th
                                        onClick={() => handleSort('ordersCount')}
                                        style={{ textAlign: 'right', padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Pedidos{sortIndicator('ordersCount')}
                                    </th>
                                    <th style={{ width: 30, padding: '12px 16px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map((item, i) => (
                                    <tr
                                        key={i}
                                        onClick={() => handleSelectProduct(item)}
                                        style={{
                                            borderBottom: '1px solid var(--glass-border)',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <td style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <ProductImage src={item.image} alt={item.productName} />
                                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{item.productName}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{item.sku}</td>
                                        <td style={{ padding: '14px 8px', textAlign: 'right', fontWeight: 'bold' }}>{item.itemsSold}</td>
                                        <td style={{ padding: '14px 8px', textAlign: 'right', color: 'var(--success)' }}>
                                            ${parseFloat(item.netRevenue || 0).toLocaleString('es-AR')}
                                        </td>
                                        <td style={{ padding: '14px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.ordersCount}</td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                            <ChevronRight size={16} color="var(--text-muted)" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredProducts.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                                No se encontraron productos con esa búsqueda.
                            </div>
                        )}
                    </div>

                    <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Mostrando {filteredProducts.length} de {allProducts.length} artículos · Tienda: {marketing.wooUrl}
                    </div>
                </>
            )}
        </div>
    );
}
