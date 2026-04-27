import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, ExternalLink, RefreshCw, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { useData } from '../store/DataContext';
import { wooService } from '../utils/wooService';

const formatNum = (value) => Number(value || 0).toLocaleString('es-AR');
const formatMoney = (value) => `$${Math.round(Number(value || 0)).toLocaleString('es-AR')}`;
const formatPct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

const formatGaDate = (date) => {
    if (!date || date.length !== 8) return date || '';
    return `${date.slice(6, 8)}/${date.slice(4, 6)}`;
};

const parseAmount = (value) => Number(String(value || 0).replace(/[^\d.-]/g, '')) || 0;

const getOrderDate = (order) => order.fecha || order.date_created || order.createdAt || order.fechaCreacion || '';

const isWebOrder = (order) => {
    const origin = String(order.origen || '').toLowerCase();
    return Boolean(order.wooId || origin === 'web' || order.billing || order.line_items);
};

const StatCard = ({ label, value, hint, icon: Icon, color = '#22c55e' }) => (
    <div style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
            {Icon && <Icon size={18} color={color} />}
        </div>
        <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800 }}>{value}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{hint}</div>}
    </div>
);

export default function GoogleAnalyticsPage() {
    const { state } = useData();
    const config = state.config || {};
    const marketing = config.marketing || {};
    const gaId = marketing.googleAnalyticsId || '';
    const gaPropertyId = marketing.googleAnalyticsPropertyId || '';
    const gaUrl = gaId
        ? `https://analytics.google.com/analytics/web/#/p${gaPropertyId || ''}/reports/dashboard`
        : 'https://analytics.google.com/analytics/web/';

    const [gaData, setGaData] = useState(null);
    const [wooData, setWooData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const dashboardData = useMemo(() => {
        const pedidos = config.pedidosOnline || [];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const webOrders = pedidos.filter(isWebOrder);
        const recentWebOrders = webOrders.filter((order) => {
            const dateValue = getOrderDate(order);
            if (!dateValue) return true;
            const parsed = new Date(dateValue);
            return Number.isNaN(parsed.getTime()) || parsed >= cutoff;
        });
        const sourceCounts = pedidos.reduce((acc, order) => {
            const source = order.origen || (order.wooId ? 'Web' : 'Otro');
            acc[source] = (acc[source] || 0) + 1;
            return acc;
        }, {});
        const revenue = recentWebOrders.reduce((sum, order) => sum + parseAmount(order.total ?? order.monto ?? order.totalPedido), 0);
        const items = recentWebOrders.reduce((sum, order) => (
            sum + (order.items || order.line_items || []).reduce((itemSum, item) => itemSum + Number(item.cantidad || item.quantity || 1), 0)
        ), 0);

        return {
            totalOrders: pedidos.length,
            webOrders: webOrders.length,
            recentWebOrders: recentWebOrders.length,
            revenue,
            items,
            sourceCounts,
            recentOrders: recentWebOrders.slice(0, 8)
        };
    }, [config.pedidosOnline]);

    const maxDailySessions = useMemo(() => (
        Math.max(...(gaData?.daily || []).map((row) => row.sessions || 0), 1)
    ), [gaData]);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const query = gaPropertyId ? `?propertyId=${encodeURIComponent(gaPropertyId)}` : '';
            const gaResponse = await fetch(`/.netlify/functions/ga4-report${query}`);
            const nextGaData = await gaResponse.json();
            setGaData(nextGaData);

            try {
                const [revenueStats, topProducts, recentOrders] = await Promise.all([
                    wooService.fetchRevenueStats(config),
                    wooService.fetchTopProducts(config),
                    wooService.fetchRecentOrders(config, 100)
                ]);
                const totals = revenueStats?.totals || {};
                setWooData({
                    revenue: Number(totals.total_sales || totals.net_revenue || totals.gross_sales || 0),
                    orders: Number(totals.orders_count || recentOrders.length || 0),
                    itemsSold: Number(totals.items_sold || 0),
                    topProducts: topProducts || [],
                    recentOrders: recentOrders || []
                });
            } catch (wooError) {
                setWooData(null);
            }
        } catch (loadError) {
            setError(loadError.message || 'No se pudieron cargar datos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [gaPropertyId]);

    const gaReady = gaData?.configured && !gaData?.error;
    const needsGaCredentials = gaData && gaData.configured === false;

    return (
        <div style={{ padding: 20, maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <TrendingUp size={22} /> Google Analytics
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}>
                        Trafico, comportamiento y conversiones de celavie.com.ar.
                        {gaId && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}> · Measurement ID: {gaId}</span>}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        {loading ? 'Cargando...' : 'Actualizar datos'}
                    </button>
                    <a className="btn btn-primary" href={gaUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <BarChart3 size={16} />
                        Abrir GA4
                        <ExternalLink size={15} />
                    </a>
                </div>
            </div>

            {(error || gaData?.error || needsGaCredentials) && (
                <div style={{ padding: 16, borderRadius: 16, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                            {needsGaCredentials ? 'GA4 conectado para medir, pero no para leer reportes' : 'No se pudo leer Google Analytics'}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {needsGaCredentials
                                ? 'El Measurement ID solo instala el tracking. Para ver datos dentro del dashboard falta configurar en Netlify: GA4_PROPERTY_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY, y darle acceso Viewer a ese service account en GA4.'
                                : (gaData?.error || error)}
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ padding: 18 }}>
                <h3 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart3 size={18} /> Datos del dashboard
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                    Estos datos salen de los pedidos guardados en el dashboard y se muestran aunque GA4 todavia no tenga permiso de lectura.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                    <StatCard label="Pedidos web" value={formatNum(dashboardData.webOrders)} hint="Total importado/registrado" icon={ShoppingBag} color="#60a5fa" />
                    <StatCard label="Pedidos web recientes" value={formatNum(dashboardData.recentWebOrders)} hint="Ultimos 30 dias" icon={TrendingUp} color="#34d399" />
                    <StatCard label="Venta web registrada" value={formatMoney(dashboardData.revenue)} hint="Segun pedidos del dashboard" icon={ShoppingBag} color="#22c55e" />
                    <StatCard label="Items web" value={formatNum(dashboardData.items)} hint="Unidades en pedidos" icon={BarChart3} color="#f59e0b" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.8fr)', gap: 14, marginTop: 14 }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Origen de pedidos</div>
                        {Object.entries(dashboardData.sourceCounts).map(([source, count]) => (
                            <div key={source} style={{ display: 'grid', gap: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span>{source}</span>
                                    <strong>{formatNum(count)}</strong>
                                </div>
                                <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(100, (count / Math.max(dashboardData.totalOrders, 1)) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #14b8a6, #34d399)' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Ultimos pedidos web</div>
                        {dashboardData.recentOrders.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No hay pedidos web cargados todavia.</div>
                        ) : dashboardData.recentOrders.map((order) => (
                            <div key={order.id || order.wooId || order.numeroPedido} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.035)', fontSize: 12 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.numeroPedido || order.wooId || order.cliente || 'Pedido'}</span>
                                <strong>{formatMoney(order.total ?? order.monto ?? 0)}</strong>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {gaReady && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                        <StatCard label="Usuarios activos" value={formatNum(gaData.summary.activeUsers)} hint="Ultimos 30 dias" icon={Users} color="#60a5fa" />
                        <StatCard label="Sesiones" value={formatNum(gaData.summary.sessions)} hint="Visitas iniciadas" icon={TrendingUp} color="#34d399" />
                        <StatCard label="Vistas de pagina" value={formatNum(gaData.summary.pageViews)} hint="Page views GA4" icon={BarChart3} color="#f59e0b" />
                        <StatCard label="Compras" value={formatNum(gaData.summary.purchases)} hint="Eventos ecommerce_purchase" icon={ShoppingBag} color="#ec4899" />
                        <StatCard label="Revenue GA4" value={formatMoney(gaData.summary.revenue)} hint="Segun GA4" icon={ShoppingBag} color="#22c55e" />
                        <StatCard label="Engagement" value={formatPct(gaData.summary.engagementRate)} hint="Tasa de engagement" icon={Users} color="#a78bfa" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: 16 }}>
                        <div className="glass-panel" style={{ padding: 18 }}>
                            <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Sesiones por dia</h3>
                            <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 170 }}>
                                {(gaData.daily || []).map((row) => (
                                    <div key={row.date} title={`${formatGaDate(row.date)} · ${row.sessions} sesiones`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}>
                                        <div style={{ minHeight: 3, height: `${Math.max(3, (row.sessions / maxDailySessions) * 140)}px`, borderRadius: '8px 8px 2px 2px', background: 'linear-gradient(180deg, #22c55e, #14b8a6)' }} />
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', transform: 'rotate(-45deg)', transformOrigin: 'top left', height: 28 }}>{formatGaDate(row.date)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ padding: 18 }}>
                            <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Paginas mas vistas</h3>
                            <div style={{ display: 'grid', gap: 10 }}>
                                {(gaData.pages || []).map((page) => (
                                    <div key={`${page.path}-${page.title}`} style={{ display: 'grid', gap: 3 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title}</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.path}</span>
                                            <strong>{formatNum(page.pageViews)} vistas</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {wooData && (
                <div className="glass-panel" style={{ padding: 18 }}>
                    <h3 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShoppingBag size={18} /> Datos de WooCommerce disponibles
                    </h3>
                    <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                        Estos datos vienen de WooCommerce y se muestran aunque GA4 todavia no tenga permisos de lectura en el dashboard.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
                        <StatCard label="Ventas web" value={formatMoney(wooData.revenue)} hint="Ultimos 30 dias aprox." icon={ShoppingBag} color="#22c55e" />
                        <StatCard label="Pedidos web" value={formatNum(wooData.orders)} hint="WooCommerce" icon={BarChart3} color="#60a5fa" />
                        <StatCard label="Items vendidos" value={formatNum(wooData.itemsSold)} hint="Woo Analytics" icon={TrendingUp} color="#f59e0b" />
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {(wooData.topProducts || []).slice(0, 5).map((product) => (
                            <div key={product.product_id || product.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.035)' }}>
                                <span style={{ fontWeight: 700 }}>{product.extended_info?.name || product.name || 'Producto'}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{formatNum(product.items_sold)} vendidos</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
