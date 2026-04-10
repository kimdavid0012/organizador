import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, FileText, RefreshCw, TrendingUp } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { useI18n } from '../store/I18nContext';

const REPORT_LANGUAGE_INSTRUCTIONS = {
    es: 'Respondé siempre en español rioplatense profesional.',
    ru: 'Respond in professional Russian.',
    ko: '한국어로 전문적이고 명확하게 답변하세요.'
};

const PAGE_TEXT = {
    es: {
        adminOnly: 'Solo visible para administrador.',
        pageTitle: 'Informes',
        pageSubtitle: 'Informe ejecutivo del local con IA: rentabilidad, ventas, gastos, stock, producción y recomendaciones de recorte.',
        pageNote: 'La base financiera de informes toma Mesan directo. POS solo se usa como apoyo desde {date} para no arrastrar ventas de prueba anteriores.',
        statMesanTotal: 'Venta Mesan acumulada',
        statMesan30d: 'Venta Mesan últimos 30 días',
        statMesanExpense: 'Gasto Mesan acumulado',
        statTotalIncome: 'Ingresos Banco + MP + Mesan',
        statTextileDebt: 'Deuda total textileras (USD)',
        restockTitle: 'Conviene volver a cortar',
        restockEmpty: 'No hay artículos marcados todavía con urgencia clara de recorte.',
        restockLine: '{code} · Vendió {units} un. en 30 días · Stock actual {stock}',
        noCode: 'Sin código',
        topExpenses: 'Top gastos',
        quickAlerts: 'Alertas rápidas',
        lowStock: 'Productos con stock bajo',
        workshopPending: 'Artículos pendientes en taller',
        recurringClients: 'Clientes con recompra',
        activeProducts: 'Productos activos',
        aiTitle: 'Informe ejecutivo IA',
        aiSubtitle: 'Evalúa rentabilidad, ventas, caja, inventario, producción y oportunidades de recorte.',
        generatedAt: 'Última generación: {date}',
        generate: 'Generar informe',
        generating: 'Generando...',
        needKey: 'Necesitás cargar la OpenAI API Key en Configuración para usar esta sección.',
        emptyReport: 'Todavía no hay informe generado. Cuando lo generes, la IA va a analizar si el local es rentable, qué corregir y si conviene volver a cortar artículos.',
        overstockTitle: 'Stock alto sin salida reciente',
        overstockLine: '{code} · Stock {stock} · Vendido últimos 30 días: {units}',
        alertNeedKey: 'Necesitás cargar la OpenAI API Key en Configuración para generar Informes.',
        alertGenerateError: 'No pude generar el informe: {message}'
    },
    ru: {
        adminOnly: 'Доступно только администратору.',
        pageTitle: 'Отчеты',
        pageSubtitle: 'Исполнительный отчет магазина с ИИ: рентабельность, продажи, расходы, склад, производство и рекомендации по перекрою.',
        pageNote: 'Финансовая база отчетов берется напрямую из Mesan. POS используется только как вспомогательный источник с {date}, чтобы не тянуть старые тестовые продажи.',
        statMesanTotal: 'Выручка Mesan накопительно',
        statMesan30d: 'Выручка Mesan за 30 дней',
        statMesanExpense: 'Расход Mesan накопительно',
        statTotalIncome: 'Доходы Банк + MP + Mesan',
        statTextileDebt: 'Общий долг текстильщикам (USD)',
        restockTitle: 'Стоит кроить снова',
        restockEmpty: 'Пока нет товаров с явной срочностью на повторный крой.',
        restockLine: '{code} · Продано {units} шт. за 30 дней · Остаток {stock}',
        noCode: 'Без кода',
        topExpenses: 'Топ расходов',
        quickAlerts: 'Быстрые предупреждения',
        lowStock: 'Товаров с низким остатком',
        workshopPending: 'Артикулов в ожидании у цеха',
        recurringClients: 'Клиенты с повторными покупками',
        activeProducts: 'Активные товары',
        aiTitle: 'Исполнительный отчет ИИ',
        aiSubtitle: 'Оценивает рентабельность, продажи, кассу, склад, производство и возможности для перекроя.',
        generatedAt: 'Последняя генерация: {date}',
        generate: 'Сформировать отчет',
        generating: 'Формирование...',
        needKey: 'Нужно указать OpenAI API Key в настройках, чтобы использовать этот раздел.',
        emptyReport: 'Отчет еще не сформирован. После генерации ИИ оценит рентабельность магазина, что нужно исправить и какие артикулы стоит кроить снова.',
        overstockTitle: 'Высокий остаток без недавних продаж',
        overstockLine: '{code} · Остаток {stock} · Продано за 30 дней: {units}',
        alertNeedKey: 'Нужно указать OpenAI API Key в настройках, чтобы сформировать отчет.',
        alertGenerateError: 'Не удалось сформировать отчет: {message}'
    },
    ko: {
        adminOnly: '관리자만 볼 수 있습니다.',
        pageTitle: '보고서',
        pageSubtitle: 'AI 기반 매장 보고서: 수익성, 판매, 지출, 재고, 생산, 재단 추천.',
        pageNote: '보고서의 재무 기준은 Mesan을 직접 사용합니다. POS는 이전 테스트 판매를 끌고 오지 않도록 {date}부터 보조 데이터로만 사용됩니다.',
        statMesanTotal: 'Mesan 누적 매출',
        statMesan30d: '최근 30일 Mesan 매출',
        statMesanExpense: 'Mesan 누적 지출',
        statTotalIncome: '은행 + MP + Mesan 총수입',
        statTextileDebt: '원단 업체 총부채 (USD)',
        restockTitle: '재단 재진행 추천',
        restockEmpty: '아직 즉시 다시 재단할 필요가 뚜렷한 상품이 없습니다.',
        restockLine: '{code} · 최근 30일 {units}개 판매 · 현재 재고 {stock}',
        noCode: '코드 없음',
        topExpenses: '주요 지출',
        quickAlerts: '빠른 경고',
        lowStock: '재고 부족 상품',
        workshopPending: '작업실 대기 품목',
        recurringClients: '재구매 고객',
        activeProducts: '활성 상품',
        aiTitle: 'AI 경영 보고서',
        aiSubtitle: '수익성, 매출, 현금흐름, 재고, 생산, 재단 기회를 평가합니다.',
        generatedAt: '마지막 생성: {date}',
        generate: '보고서 생성',
        generating: '생성 중...',
        needKey: '이 섹션을 사용하려면 설정에 OpenAI API Key를 입력해야 합니다.',
        emptyReport: '아직 생성된 보고서가 없습니다. 생성하면 AI가 매장의 수익성, 수정 포인트, 다시 재단할 품목을 분석합니다.',
        overstockTitle: '최근 판매 없는 과다 재고',
        overstockLine: '{code} · 재고 {stock} · 최근 30일 판매 {units}',
        alertNeedKey: '보고서를 생성하려면 설정에 OpenAI API Key를 입력해야 합니다.',
        alertGenerateError: '보고서를 생성하지 못했습니다: {message}'
    }
};

const REPORT_PROMPT = `Sos un consultor senior de operaciones, finanzas comerciales e inventario para un local de indumentaria en Argentina.

Tu tarea es elaborar un INFORME EJECUTIVO PROFESIONAL y PROFUNDO con base en los datos reales del sistema.

OBJETIVO DEL INFORME:
- Decir si el local es rentable o no con los datos disponibles.
- Explicar por qué.
- Detectar fugas de dinero, problemas operativos y oportunidades.
- Analizar ventas, stock, rotación, clientes, ingresos totales, gastos, deuda con proveedores y producción.
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
- {{language_rule}}
- No inventes datos ausentes.
- Si algo no alcanza para concluir, decilo.
- El ingreso total del local se calcula con Mesan (efectivo/POS local) + Banco + Mercado Pago.
- No tomes solo Mesan como ingreso total.
- Considerá la deuda total en dólares con textileras como un pasivo relevante del negocio.
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
const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function InformesPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const { lang } = useI18n();
    const [loading, setLoading] = useState(false);
    const reportsCache = state.config?.reportsCache || {};
    const [reportText, setReportText] = useState(reportsCache.businessReport || '');
    const [generatedAt, setGeneratedAt] = useState(reportsCache.businessReportGeneratedAt || '');
    const pageText = PAGE_TEXT[lang] || PAGE_TEXT.es;

    const isAdmin = user.role === 'admin';
    const canViewInformes = isAdmin || user.role === 'encargada';

    const posReportsStartDate = state.config?.reportsPosStartDate || getTodayLocalDate();

    useEffect(() => {
        if (state.config?.reportsPosStartDate) return;
        updateConfig({ reportsPosStartDate: getTodayLocalDate() });
    }, [state.config?.reportsPosStartDate, updateConfig]);

    const allSales = useMemo(() => {
        const currentSales = state.config?.posVentas || [];
        const archivedSales = (state.config?.posCerradoZ || []).flatMap((close) => close.detalleVentas || []);
        return dedupeSales([...currentSales, ...archivedSales]).filter((sale) => {
            const saleDate = normalizeText(sale?.fecha).slice(0, 10);
            return saleDate && saleDate >= posReportsStartDate;
        });
    }, [state.config?.posVentas, state.config?.posCerradoZ, posReportsStartDate]);

    const reportData = useMemo(() => {
        const products = state.config?.posProductos || [];
        const bankPayments = state.config?.bankPayments || [];
        const mesanMovements = state.config?.mesanMovimientos || [];
        const mesanSales = state.config?.mesanVentasDiarias || [];
        const clientes = state.config?.clientes || [];
        const cortes = state.config?.cortes || [];
        const conteos = state.config?.mercaderiaConteos || [];
        const telas = state.telas || [];
        const fabricPayments = state.config?.fabricPayments || [];
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

        const mesanSales30d = mesanSales.reduce((acc, item) => {
            const saleDate = item?.fecha ? new Date(`${item.fecha}T00:00:00`) : null;
            if (!saleDate || Number.isNaN(saleDate.getTime()) || saleDate < last30Days) return acc;
            return acc + toNumber(item.monto || item.efectivo || 0);
        }, 0);
        const mesanSalesDays = mesanSales.filter((item) => toNumber(item.monto || item.efectivo || 0) > 0).length;
        const mesanSalesDays30d = mesanSales.filter((item) => {
            const saleDate = item?.fecha ? new Date(`${item.fecha}T00:00:00`) : null;
            return saleDate && !Number.isNaN(saleDate.getTime()) && saleDate >= last30Days && toNumber(item.monto || item.efectivo || 0) > 0;
        }).length;

        totalRevenue = mesanSales.reduce((acc, item) => acc + toNumber(item.monto || item.efectivo || 0), 0);
        revenue30d = mesanSales30d;
        totalTickets = mesanSalesDays;
        tickets30d = mesanSalesDays30d;

        const mesanExpensesARS = mesanMovements.reduce((acc, item) => {
            const amount = toNumber(item.monto || 0);
            return (item.moneda || 'ARS') === 'ARS' && amount < 0 ? acc + Math.abs(amount) : acc;
        }, 0);
        const mesanSalesARS = mesanSales.reduce((acc, item) => acc + toNumber(item.monto || item.efectivo || 0), 0);
        const totalIncomeWithMesan = digitalIncome + mesanSalesARS;

        const supplierDebtMap = {};
        telas.forEach((tela) => {
            const proveedor = normalizeText(tela.proveedor || 'Sin proveedor') || 'Sin proveedor';
            const totalValueUSD = toNumber(tela.precioPorUnidad || 0) * toNumber(tela.cantidadTotal || 0);
            supplierDebtMap[proveedor] = supplierDebtMap[proveedor] || {
                proveedor,
                totalValueUSD: 0,
                paidUSD: 0,
                debtUSD: 0
            };
            supplierDebtMap[proveedor].totalValueUSD += totalValueUSD;
        });

        fabricPayments.forEach((payment) => {
            const proveedor = normalizeText(payment.proveedor || 'Sin proveedor') || 'Sin proveedor';
            supplierDebtMap[proveedor] = supplierDebtMap[proveedor] || {
                proveedor,
                totalValueUSD: 0,
                paidUSD: 0,
                debtUSD: 0
            };
            supplierDebtMap[proveedor].paidUSD += toNumber(payment.montoUSD || 0);
        });

        const textileDebtByProvider = Object.values(supplierDebtMap)
            .map((provider) => ({
                ...provider,
                debtUSD: Math.max(0, provider.totalValueUSD - provider.paidUSD)
            }))
            .sort((a, b) => b.debtUSD - a.debtUSD);

        const totalTextileDebtUSD = textileDebtByProvider.reduce((acc, provider) => acc + provider.debtUSD, 0);

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
                mesanCashIncomeTotalARS: totalRevenue,
                mesanCashIncomeLast30DaysARS: revenue30d,
                totalMesanDays: totalTickets,
                mesanDaysLast30Days: tickets30d,
                digitalIncomeTotalARS: digitalIncome,
                totalOperationalIncomeARS: totalIncomeWithMesan,
                bancoIncome,
                mercadoPagoIncome,
                mesanExpensesARS,
                mesanSalesARS,
                totalTextileDebtUSD
            },
            suppliers: {
                totalTextileDebtUSD,
                textileDebtByProvider
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
    }, [allSales, state.config, state.config?.clientes, state.telas]);

    const generateBusinessReport = async () => {
        const provider = state.config?.marketing?.llmProvider || 'openai';
        const openaiKey = state.config?.marketing?.openaiKey;
        const claudeKey = state.config?.marketing?.claudeKey;

        if (provider === 'claude' && !claudeKey) {
            alert('Falta Claude API Key en Configuración → Asistente IA');
            return;
        }
        if (provider !== 'claude' && !openaiKey) {
            alert(pageText.alertNeedKey);
            return;
        }

        setLoading(true);
        try {
            const prompt = REPORT_PROMPT
                .replace('{{business_data}}', JSON.stringify(reportData, null, 2))
                .replace('{{language_rule}}', REPORT_LANGUAGE_INSTRUCTIONS[lang] || REPORT_LANGUAGE_INSTRUCTIONS.es);

            const systemMsg = 'Respondé en español rioplatense profesional, con criterio financiero, comercial y operativo. Priorizá utilidad real para dueña de local.';
            let report;

            if (provider === 'claude') {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': claudeKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-20250514',
                        max_tokens: 2000,
                        temperature: 0.4,
                        system: systemMsg,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || 'Error Claude');
                }
                const data = await response.json();
                report = data.content?.[0]?.text || 'No pude generar el informe.';
            } else {
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
                            { role: 'system', content: systemMsg },
                            { role: 'user', content: prompt }
                        ]
                    })
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error?.message || 'Error generando informe');
                }
                const data = await response.json();
                report = data.choices?.[0]?.message?.content || 'No pude generar el informe.';
            }
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
            alert(pageText.alertGenerateError.replace('{message}', error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="informes-page" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 16 }}>
            <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <FileText size={22} /> {pageText.pageTitle}
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    {pageText.pageSubtitle}
                </p>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    {pageText.pageNote.replace('{date}', posReportsStartDate.split('-').reverse().join('/'))}
                </div>
            </div>

            {!canViewInformes && <div style={{ padding: 'var(--sp-4)' }}>{pageText.adminOnly}</div>}

            {canViewInformes && isAdmin && <div className="informes-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{pageText.statMesanTotal}</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>{formatMoney(reportData.profitabilitySnapshot.mesanCashIncomeTotalARS)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{pageText.statMesan30d}</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)' }}>{formatMoney(reportData.profitabilitySnapshot.mesanCashIncomeLast30DaysARS)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{pageText.statMesanExpense}</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: '#fca5a5' }}>{formatMoney(reportData.profitabilitySnapshot.mesanExpensesARS)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{pageText.statTotalIncome}</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>{formatMoney(reportData.profitabilitySnapshot.totalOperationalIncomeARS)}</div>
                </div>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{pageText.statTextileDebt}</div>
                    <div style={{ fontSize: 28, fontWeight: 'var(--fw-bold)', color: '#fbbf24' }}>
                        US$ {Math.round(reportData.profitabilitySnapshot.totalTextileDebtUSD).toLocaleString('es-AR')}
                    </div>
                </div>
            </div>}

            {canViewInformes && <div className="informes-secondary-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16 }}>
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <TrendingUp size={18} /> {pageText.restockTitle}
                    </h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {reportData.inventory.restockCandidates.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)' }}>{pageText.restockEmpty}</div>
                        ) : reportData.inventory.restockCandidates.map((item) => (
                            <div key={`${item.codigoInterno}-${item.detalleCorto}`} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.detalleCorto}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {pageText.restockLine
                                        .replace('{code}', item.codigoInterno || pageText.noCode)
                                        .replace('{units}', item.unidades30d)
                                        .replace('{stock}', item.stockActual)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {isAdmin && <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ marginBottom: 12 }}>{pageText.topExpenses}</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {reportData.topExpenseCategories.map((item) => (
                            <div key={item.categoria} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                                <span>{item.categoria}</span>
                                <strong>{formatMoney(item.total)}</strong>
                            </div>
                        ))}
                    </div>
                </div>}

                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ marginBottom: 12 }}>{pageText.quickAlerts}</h3>
                    <div style={{ display: 'grid', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>{pageText.lowStock}</span>
                            <strong>{reportData.inventory.lowStockCount}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>{pageText.workshopPending}</span>
                            <strong>{reportData.operations.pendingWorkshopArticles}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>{pageText.recurringClients}</span>
                            <strong>{reportData.clients.recurringClients}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                            <span>{pageText.activeProducts}</span>
                            <strong>{reportData.inventory.activeProducts}</strong>
                        </div>
                    </div>
                </div>
            </div>}

            {canViewInformes && <div className="glass-panel" style={{ padding: 'var(--sp-4)', display: 'grid', gap: 14 }}>
                <div className="informes-report-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <BarChart3 size={18} /> {pageText.aiTitle}
                        </h3>
                        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                            {pageText.aiSubtitle}
                        </p>
                        {generatedAt && (
                            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                                {pageText.generatedAt.replace('{date}', new Date(generatedAt).toLocaleString('es-AR'))}
                            </div>
                        )}
                    </div>
                    {isAdmin && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                            value={state.config?.marketing?.llmProvider || 'openai'}
                            onChange={(e) => updateConfig({ marketing: { ...(state.config.marketing || {}), llmProvider: e.target.value } })}
                            style={{ fontSize: 11, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        >
                            <option value="openai">⚡ GPT-4o-mini</option>
                            <option value="claude">🧠 Claude Sonnet</option>
                        </select>
                        <button className="btn btn-primary informes-report-button" onClick={generateBusinessReport} disabled={loading}>
                            {loading ? <RefreshCw size={16} className="spin" /> : <FileText size={16} />}
                            {loading ? pageText.generating : pageText.generate}
                        </button>
                    </div>}
                </div>

                {!state.config?.marketing?.openaiKey && !state.config?.marketing?.claudeKey && (
                    <div style={{ padding: 14, borderRadius: 12, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', color: 'var(--text-secondary)', fontSize: 13 }}>
                        {pageText.needKey}
                    </div>
                )}

                {!reportText ? (
                    <div style={{ padding: 16, borderRadius: 12, border: '1px dashed rgba(255,255,255,0.12)', color: 'var(--text-muted)', fontSize: 13 }}>
                        {pageText.emptyReport}
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
            </div>}

            {canViewInformes && reportData.inventory.overstockCandidates.length > 0 && (
                <div className="glass-panel" style={{ padding: 'var(--sp-4)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <AlertTriangle size={18} /> {pageText.overstockTitle}
                    </h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {reportData.inventory.overstockCandidates.map((item) => (
                            <div key={`${item.codigoInterno}-${item.detalleCorto}`} style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.detalleCorto}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {pageText.overstockLine
                                        .replace('{code}', item.codigoInterno || pageText.noCode)
                                        .replace('{stock}', item.stockActual)
                                        .replace('{units}', item.unidades30d)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
