import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, FileText, RefreshCw, TrendingUp } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

const REPORT_PROMPT = `Sos un consultor senior de operaciones, finanzas comerciales e inventario para un local de indumentaria en Argentina.

Tu tarea es elaborar un INFORME EJECUTIVO PROFESIONAL y PROFUNDO con base en los datos reales del sistema.

OBJETIVO DEL INFORME:
- Decir si el local es rentable o no con los datos disponibles.
- Explicar por qué.
- Detectar fugas de dinero, problemas operativos y oportunidades.
- Analizar ventas, stock, rotación, clientes, ingresos digitales, gastos y producción.
- Indicar si conviene volver a cortar algún artículo, cuáles, y por qué.
- Priorizar acciones concretas para mejorar rentabilidad.

DATOS INYECTADOS AUTOMÁTICAMENTE:
{{business_data}}

ESTRUCTURA OBLIGATORIA:

1. RESUMEN EJECUTIVO
- 5 a 8 líneas, directas, entendibles por dueña de local.

2. RENTABILIDAD GENERAL
- Decí claramente: rentable, débilmente rentable, o no rentable.
- Explicá con números concretos.
- Mencioná límites del análisis si faltan datos.

3. ANÁLISIS DE VENTAS
- Evolución general.
- Canales que mejor rinden.
- Productos más vendidos.
- Artículos con buena rotación.
- Artículos con mala salida o stock inmovilizado.

4. ANÁLISIS DE GASTOS Y CAJA
- Qué categorías están pesando más.
- Si el nivel de gasto parece sano o preocupante.
- Qué gastos revisar primero.

5. ANÁLISIS DE INVENTARIO Y PRODUCCIÓN
- Qué artículos conviene volver a cortar.
- Qué artículos no conviene reponer todavía.
- Riesgos de quiebre de stock.
- Riesgos de sobrestock.

6. CLIENTES Y RECOMPRA
- Si hay recurrencia o no.
- Qué perfil de cliente aparece más valioso.

7. ALERTAS IMPORTANTES
- Lista corta de alertas críticas.

8. PLAN DE ACCIÓN
- 5 a 10 acciones concretas, priorizadas por impacto.
- No seas genérico.
- Cada acción debe decir qué hacer y por qué.

REGLAS:
- Respondé siempre en español rioplatense profesional.
- No inventes datos ausentes.
- Si algo no alcanza para concluir, decilo.
- Si ves artículos con ventas fuertes y stock bajo, marcá si conviene volver a cortar.
- Si ves stock alto y ventas bajas, marcá que no conviene reponer.
- Priorizá claridad ejecutiva y sentido comercial real, no teoría.
`;

const normalizeText = (value) => (value || '').toString().trim();
const normalizeComparable = (value) => normalizeText(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
const toNumber = (value) => Number.parseFloat(value || 0) || 0;

const dedupeSales = (sales = []) => {
    const map = new Map();
    sales.forEach((sale) => {
        if (!sale?.id) return;
        map.set(sale.id, sale);
    });
    return Array.from(map.values());
};

const formatMoney = (value) => `$${Math.round(Number(value || 0)).toLocaleString('es-AR')}`;

export default function InformesPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const reportsCache = state.config?.reportsCache || {};
    const [reportText, setReportText] = useState(reportsCache.businessReport || '');
    const [generatedAt, setGeneratedAt] = useState(reportsCache.businessReportGeneratedAt || '');

    if (user.role !== 'admin') {
        return <div style={{ padding: 'var(--sp-4)' }}>Solo visible para administrador.</div>;
    }

    const allSales = useMemo(() => {
        const currentSales = state.config?.posVentas || [];
        const archivedSales = (state.config?.posCerradoZ || []).flatMap((close) => close.detalleVentas || []);
        return dedupeSales([...currentSales, ...archivedSales]);
    }, [state.config?.posVentas, state.config?.posCerradoZ]);

    const reportData = useMemo(() => {
        const products = state.config?.posProductos || [];
        const bankPayments = state.config?.bankPayments || [];
        const mesanMovements = state.config?.mesanMovimientos || [];
        const mesanSales = state.config?.mesanVentasDiarias || [];
        const clientes = state.config?.clientes || [];
        const cortes = state.config?.cortes || [];
        const conteos = state.config?.mercaderiaConteos || [];
        const now = new Date();
        const last30Days = new Date(now);
        last30Days.setDate(last30Days.getDate() - 30);

        const productMap = new Map(products.map((product) => {
            const key = normalizeComparable(product.codigoInterno || product.detalleCorto);
            return [key, product];
        }));

        const salesByProduct = new Map();
        const salesByChannel = new Map();
        const salesByClient = new Map();

        let totalRevenue = 0;
        let totalTickets = 0;
        let revenue30d = 0;
        let tickets30d = 0;

        allSales.forEach((sale) => {
            const saleDate = sale.fecha ? new Date(sale.fecha) : null;
            const total = toNumber(sale.totalFinal || sale.total);
            const channel = normalizeText(sale.canalVenta || 'LOCAL') || 'LOCAL';
            const clientName = normalizeText(sale.cliente || sale.clienteNombre || 'Consumidor final');

            totalRevenue += total;
            totalTickets += 1;
            salesByChannel.set(channel, (salesByChannel.get(channel) || 0) + total);

            if (saleDate && !Number.isNaN(saleDate.getTime()) && saleDate >= last30Days) {
                revenue30d += total;
                tickets30d += 1;
            }

            const currentClient = salesByClient.get(clientName) || {
                nombre: clientName,
                compras: 0,
                totalGastado: 0,
                ultimaCompra: ''
            };
            currentClient.compras += 1;
            currentClient.totalGastado += total;
            currentClient.ultimaCompra = currentClient.ultimaCompra && currentClient.ultimaCompra > (sale.fecha || '')
                ? currentClient.ultimaCompra
                : (sale.fecha || '');
            salesByClient.set(clientName, currentClient);

            (sale.items || []).forEach((item) => {
                const key = normalizeComparable(item.codigoInterno || item.detalleCorto || item.id);
                if (!key) return;
                const current = salesByProduct.get(key) || {
                    codigoInterno: normalizeText(item.codigoInterno),
                    detalleCorto: normalizeText(item.detalleCorto) || 'Sin nombre',
                    unidadesVendidas: 0,
                    facturacion: 0,
                    unidades30d: 0,
                    ultimaVenta: ''
                };
                const itemRevenue = toNumber(item.importe || (item.precioUnitario || item.precioOriginal || 0) * toNumber(item.cantidad || 0));
                current.unidadesVendidas += toNumber(item.cantidad || 0);
                current.facturacion += itemRevenue;
                if (saleDate && !Number.isNaN(saleDate.getTime()) && saleDate >= last30Days) {
                    current.unidades30d += toNumber(item.cantidad || 0);
                }
                current.ultimaVenta = current.ultimaVenta && current.ultimaVenta > (sale.fecha || '')
                    ? current.ultimaVenta
                    : (sale.fecha || '');
                salesByProduct.set(key, current);
            });
        });

        const productPerformance = Array.from(salesByProduct.entries()).map(([key, data]) => {
            const product = productMap.get(key);
            const stock = toNumber(product?.stock || 0);
            const active = Boolean(product?.activo);
            const salesVelocity30d = data.unidades30d / 30;
            const recommendedCut = data.unidades30d >= 3 && stock <= Math.max(5, data.unidades30d);

            return {
                ...data,
                stockActual: stock,
                activo: active,
                precioLista1: toNumber(product?.precioVentaL1 || 0),
                alertaStockMinimo: toNumber(product?.alertaStockMinimo || 0),
                salesVelocity30d: Number(salesVelocity30d.toFixed(2)),
                convieneRecortar: recommendedCut
            };
        }).sort((a, b) => b.facturacion - a.facturacion);

        const topProducts = productPerformance.slice(0, 10);
        const restockCandidates = productPerformance
            .filter((item) => item.convieneRecortar)
            .sort((a, b) => (b.unidades30d - a.unidades30d) || (a.stockActual - b.stockActual))
            .slice(0, 8);
        const overstockCandidates = products
            .map((product) => {
                const perf = productPerformance.find((item) => normalizeComparable(item.codigoInterno || item.detalleCorto) === normalizeComparable(product.codigoInterno || product.detalleCorto));
                return {
                    codigoInterno: product.codigoInterno,
                    detalleCorto: product.detalleCorto,
                    stockActual: toNumber(product.stock || 0),
                    unidades30d: perf?.unidades30d || 0
                };
            })
            .filter((item) => item.stockActual >= 20 && item.unidades30d === 0)
            .slice(0, 8);

        const lowStockCount = products.filter((product) => toNumber(product.stock || 0) <= toNumber(product.alertaStockMinimo || 0)).length;
        const activeProducts = products.filter((product) => product.activo).length;
        const totalStockUnits = products.reduce((acc, product) => acc + toNumber(product.stock || 0), 0);

        const digitalIncome = bankPayments.reduce((acc, entry) => acc + toNumber(entry.monto || 0), 0);
        const bancoIncome = bankPayments.filter((entry) => entry.metodo === 'Banco').reduce((acc, entry) => acc + toNumber(entry.monto || 0), 0);
        const mercadoPagoIncome = bankPayments.filter((entry) => entry.metodo === 'Mercado Pago').reduce((acc, entry) => acc + toNumber(entry.monto || 0), 0);

        const mesanExpensesARS = mesanMovements.reduce((acc, item) => {
            const amount = toNumber(item.monto || 0);
            return (item.moneda || 'ARS') === 'ARS' && amount < 0 ? acc + Math.abs(amount) : acc;
        }, 0);
        const mesanIncomeARS = mesanMovements.reduce((acc, item) => {
            const amount = toNumber(item.monto || 0);
            return (item.moneda || 'ARS') === 'ARS' && amount > 0 ? acc + amount : acc;
        }, 0);
        const mesanSalesARS = mesanSales.reduce((acc, item) => acc + toNumber(item.monto || item.efectivo || 0), 0);

        const topExpenseCategories = Object.entries(
            mesanMovements.reduce((acc, item) => {
                const amount = toNumber(item.monto || 0);
                if ((item.moneda || 'ARS') !== 'ARS' || amount >= 0) return acc;
                const key = normalizeText(item.categoria || 'Sin categoria') || 'Sin categoria';
                acc[key] = (acc[key] || 0) + Math.abs(amount);
                return acc;
            }, {})
        )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([categoria, total]) => ({ categoria, total }));

        const clientRecurrence = Array.from(salesByClient.values()).sort((a, b) => b.totalGastado - a.totalGastado);
        const recurringClients = clientRecurrence.filter((client) => client.compras >= 2).length;

        const pendingWorkshopArticles = cortes.reduce((acc, corte) => {
            return acc + (corte.moldesData || []).filter((item) => normalizeText(item.tallerAsignado || item.taller) && !normalizeText(item.estadoTaller || '').toLowerCase().includes('ingres')).length;
        }, 0);

        return {
            generatedAt: new Date().toISOString(),
            profitabilitySnapshot: {
                totalPosRevenue: totalRevenue,
                revenueLast30Days: revenue30d,
                totalTickets,
                ticketsLast30Days: tickets30d,
                digitalIncome,
                bancoIncome,
                mercadoPagoIncome,
                mesanExpensesARS,
                mesanIncomeARS,
                mesanSalesARS
            },
            inventory: {
                totalProducts: products.length,
                activeProducts,
                totalStockUnits,
                lowStockCount,
                topProducts,
                restockCandidates,
                overstockCandidates
            },
            channels: Array.from(salesByChannel.entries())
                .map(([canal, total]) => ({ canal, total }))
                .sort((a, b) => b.total - a.total),
            clients: {
                totalClientes: clientes.length,
                recurringClients,
                topClients: clientRecurrence.slice(0, 10)
            },
            operations: {
                totalCortes: cortes.length,
                pendingWorkshopArticles,
                totalConteosMercaderia: conteos.length
            },
            topExpenseCategories
        };
    }, [allSales, state.config, state.config?.clientes]);

    const generateBusinessReport = async () => {
        const openaiKey = state.config?.marketing?.openaiKey;
        if (!openaiKey) {
            alert('Necesitás cargar la OpenAI API Key en Configuración para generar Informes.');
            return;
        }

        setLoading(true);
        try {
            const prompt = REPORT_PROMPT.replace('{{business_data}}', JSON.stringify(reportData, null, 2));

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${openaiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    temperature: 0.4,
                    max_tokens: 1800,
                    messages: [
                        {
                            role: 'system',
                            content: 'Respondé en español rioplatense profesional, con criterio financiero, comercial y operativo. Priorizá utilidad real para dueña de local.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'Error generando informe');
            }

            const data = await response.json();
            const report = data.choices?.[0]?.message?.content || 'No pude generar el informe.';
            setReportText(report);
            setGeneratedAt(new Date().toISOString());
            updateConfig({
                reportsCache: {
                    ...(reportsCache || {}),
                    businessReport: report,
                    businessReportGeneratedAt: new Date().toISOString(),
                    businessSnapshot: reportData
                }
            });
        } catch (error) {
            console.error('Error generating business report:', error);
            alert(`No pude generar el informe: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="informes-page" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <FileText size={22} /> Informes
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Informe ejecutivo del local con IA: rentabilidad, ventas, gastos, stock, producción y recomendaciones de recorte.
                </p>
            </div>

            <div className="informes-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Facturación POS total</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>{formatMoney(reportData.profitabilitySnapshot.totalPosRevenue)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Facturación últimos 30 días</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>{formatMoney(reportData.profitabilitySnapshot.revenueLast30Days)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Gasto Mesan acumulado</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: '#fca5a5' }}>{formatMoney(reportData.profitabilitySnapshot.mesanExpensesARS)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Ingresos Banco + MP</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>{formatMoney(reportData.profitabilitySnapshot.digitalIncome)}</div>
                </div>
            </div>

            <div className="informes-secondary-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <TrendingUp size={18} /> Conviene volver a cortar
                    </h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {reportData.inventory.restockCandidates.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)' }}>No hay artículos marcados todavía con urgencia clara de recorte.</div>
                        ) : reportData.inventory.restockCandidates.map((item) => (
                            <div key={`${item.codigoInterno}-${item.detalleCorto}`} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.detalleCorto}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {item.codigoInterno || 'Sin código'} · Vendió {item.unidades30d} un. en 30 días · Stock actual {item.stockActual}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ marginBottom: 12 }}>Top gastos</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {reportData.topExpenseCategories.map((item) => (
                            <div key={item.categoria} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                                <span>{item.categoria}</span>
                                <strong>{formatMoney(item.total)}</strong>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ marginBottom: 12 }}>Alertas rápidas</h3>
                    <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>Productos con stock bajo</span>
                            <strong>{reportData.inventory.lowStockCount}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>Artículos pendientes en taller</span>
                            <strong>{reportData.operations.pendingWorkshopArticles}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>Clientes con recompra</span>
                            <strong>{reportData.clients.recurringClients}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>Productos activos</span>
                            <strong>{reportData.inventory.activeProducts}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 14 }}>
                <div className="informes-report-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BarChart3 size={18} /> Informe ejecutivo IA
                        </h3>
                        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                            Evalúa rentabilidad, ventas, caja, inventario, producción y oportunidades de recorte.
                        </p>
                        {generatedAt && (
                            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                                Última generación: {new Date(generatedAt).toLocaleString('es-AR')}
                            </div>
                        )}
                    </div>
                    <button className="btn btn-primary informes-report-button" onClick={generateBusinessReport} disabled={loading}>
                        {loading ? <RefreshCw size={16} className="spin" /> : <FileText size={16} />}
                        {loading ? 'Generando...' : 'Generar informe'}
                    </button>
                </div>

                {!state.config?.marketing?.openaiKey && (
                    <div style={{ padding: 14, borderRadius: 12, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--text-secondary)', fontSize: 13 }}>
                        Necesitás cargar la OpenAI API Key en Configuración para usar esta sección.
                    </div>
                )}

                {!reportText ? (
                    <div style={{ padding: 16, borderRadius: 12, border: '1px dashed rgba(255,255,255,0.12)', color: 'var(--text-muted)', fontSize: 13 }}>
                        Todavía no hay informe generado. Cuando lo generes, la IA va a analizar si el local es rentable, qué corregir y si conviene volver a cortar artículos.
                    </div>
                ) : (
                    <pre className="informes-report-output" style={{
                        whiteSpace: 'pre-wrap',
                        margin: 0,
                        padding: 18,
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--text-primary)',
                        fontFamily: 'inherit',
                        fontSize: 13,
                        lineHeight: 1.65
                    }}>
                        {reportText}
                    </pre>
                )}
            </div>

            {reportData.inventory.overstockCandidates.length > 0 && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <AlertTriangle size={18} /> Stock alto sin salida reciente
                    </h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {reportData.inventory.overstockCandidates.map((item) => (
                            <div key={`${item.codigoInterno}-${item.detalleCorto}`} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.detalleCorto}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {item.codigoInterno || 'Sin código'} · Stock {item.stockActual} · Vendido últimos 30 días: {item.unidades30d}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
