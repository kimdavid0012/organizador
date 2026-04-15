import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, TrendingUp, AlertCircle, RefreshCw, DollarSign, Eye, MousePointer, Users, Target, BarChart3, ChevronDown, ChevronRight, Zap, ArrowLeft } from 'lucide-react';
import { useData } from '../store/DataContext';
import { metaService } from '../utils/metaService';

const MARKETING_REPORT_PROMPT = `Sos un analista senior de performance en Meta Ads especializado en e-commerce de moda. Analizás campañas de una tienda de ropa online que vende a través de Instagram y Facebook Ads.

Tu tarea es generar un REPORTE DIARIO PROFESIONAL por campaña activa, útil tanto para el dueño del negocio como para el equipo de marketing.

---

📊 DATOS DE CAMPAÑAS (inyectados automáticamente):
{{campaign_data}}

Estructura de datos disponibles por campaña:
- nombre, estado, objetivo
- spend_hoy, spend_total, budget_diario, budget_total
- impresiones, alcance, frecuencia
- clicks, CTR
- CPC, CPM
- conversiones, revenue, ROAS
- datos_historicos_7d: { spend, conversiones, ROAS, CTR, CPC }
- datos_historicos_30d: { spend, conversiones, ROAS, CTR, CPC }

---

BENCHMARKS DE REFERENCIA (ropa online, Argentina):
- CTR: bueno >2%, excelente >4%
- CPC: bueno <$800 ARS, crítico >$2000 ARS
- CPM: saludable <$3000 ARS/1000
- Frecuencia: óptimo 1.5–3.0 | fatiga >4.0
- ROAS mínimo viable: 2.0x | saludable: >3.5x | excelente: >6x
- Tasa de conversión: buena >1.5% | crítica <0.5%

---

🔍 ESTRUCTURA DEL REPORTE:

════════════════════════════════
📋 RESUMEN EJECUTIVO DEL DÍA
════════════════════════════════
- Estado general del account en 2-3 líneas
- Métrica más preocupante del día
- Métrica más positiva del día
- Comparación vs semana anterior (usar datos_historicos_7d)

════════════════════════════════
📌 ANÁLISIS POR CAMPAÑA
════════════════════════════════
Repetir para cada campaña activa:

[NOMBRE DE CAMPAÑA]
──────────────────────────────
PUNTAJE: [0-100] | LETRA: [A/B/C/D/F]
  A = 85-100 | B = 70-84 | C = 55-69 | D = 40-54 | F = <40

MÉTRICAS CLAVE HOY:
  💰 Gasto: $X | Budget restante: $X (X% ejecutado)
  👁 Impresiones: X | Alcance: X | Frecuencia: X
  🖱 Clicks: X | CTR: X% | CPC: $X
  📦 Conversiones: X | Revenue: $X | ROAS: Xx
  📈 CPM: $X/1000

TENDENCIA (vs 7 días anteriores):
  - ROAS: X hoy vs X promedio 7d → [mejorando/empeorando/estable]
  - CPC: X hoy vs X promedio 7d → [mejorando/empeorando/estable]
  - CTR: X hoy vs X promedio 7d → [mejorando/empeorando/estable]
  - Conversiones: X hoy vs X promedio 7d

DIAGNÓSTICO:
  ✅ Qué está funcionando bien (ser específico con números)
  ❌ Problema principal identificado
  🎯 Origen del problema: [audiencia / creativo / oferta / funnel / presupuesto / saturación]

ALERTAS (ordenadas por urgencia):
  🔴 CRÍTICO (acción hoy): ...
  🟡 ATENCIÓN (esta semana): ...
  🟢 POSITIVO: ...

ACCIONES CONCRETAS (máximo 3, ordenadas por impacto):
  1. [Acción específica con número concreto]
     → Quién: dueño / equipo marketing
     → Cuándo: hoy / esta semana
     → Resultado esperado: ...
  2. ...
  3. ...

════════════════════════════════
⚡ COMPARACIÓN ENTRE CAMPAÑAS
════════════════════════════════
- Mejor ROAS: [campaña X] con Xx vs [campaña Y] con Xx
- Mejor eficiencia de costo (CPC más bajo): ...
- Mayor riesgo de saturación (frecuencia más alta): ...
- ¿Hay posible canibalización de audiencia? [sí/no + explicación]
- Campaña para ESCALAR esta semana: [nombre + por qué]
- Campaña para PAUSAR o revisar urgente: [nombre + por qué]
- Redistribución de presupuesto sugerida: X% a [campaña] / X% a [campaña]

════════════════════════════════
📈 PROYECCIÓN PRÓXIMOS 7 DÍAS
════════════════════════════════
(Basada en tendencia actual sin cambios)

Por campaña:
- Gasto proyectado: $X
- Conversiones proyectadas: X
- ROAS proyectado: Xx
- Riesgo principal: [saturación / budget agotado / caída de CTR / etc.]

Global del account:
- Inversión total proyectada 7 días: $X
- Revenue proyectado: $X
- ROAS general esperado: Xx
- Alerta de tendencia: [qué puede salir mal si no se actúa]

════════════════════════════════
✅ TOP 5 PRIORIDADES DE LA SEMANA
════════════════════════════════
Ordenadas por impacto en ROAS y conversiones:

1. [Tarea concreta] → [dueño / marketing] → impacto: [alto/medio]
2. ...
3. ...
4. ...
5. ...

---

REGLAS DE ANÁLISIS:
- Nunca des recomendaciones genéricas. Siempre incluí el número concreto y comparalo con el benchmark.
- Si un dato no está disponible, indicalo explícitamente.
- Si la frecuencia supera 3.5, marcalo siempre como alerta crítica.
- Si el ROAS está por debajo de 2x, marcalo siempre como crítico.
- Si el CTR bajó más de 20% vs el promedio de 7 días, alertar.
- Respondé siempre en español, tono profesional pero directo.`;

export default function MarketingSection() {
    const { state, setMarketingCache, updateConfig } = useData();
    const { config } = state;
    const marketing = config.marketing || {};
    const marketingCache = config.marketingCache || {};

    const [loading, setLoading] = useState(false);
    const [datePreset, setDatePreset] = useState('last_30d');
    const [customSince, setCustomSince] = useState('');
    const [customUntil, setCustomUntil] = useState('');
    const getDateRange = () => {
        if (datePreset === 'custom' && customSince && customUntil) return { since: customSince, until: customUntil };
        return { preset: datePreset };
    };
    const dateLabel = datePreset === 'custom' ? `${customSince} → ${customUntil}` : { last_7d: '7 días', last_14d: '14 días', last_30d: '30 días', last_90d: '90 días', this_month: 'Este mes', last_month: 'Mes pasado' }[datePreset] || '30 días';
    const [accountInsights, setAccountInsights] = useState(marketingCache.accountInsights || null);
    const [campaigns, setCampaigns] = useState(marketingCache.campaigns?.length ? marketingCache.campaigns : null);
    const [expandedCampaign, setExpandedCampaign] = useState(null);
    const [adSets, setAdSets] = useState(marketingCache.adSets || {});
    const [loadingAdSets, setLoadingAdSets] = useState(null);
    const [aiReport, setAiReport] = useState(marketingCache.aiReport || '');
    const [loadingAiReport, setLoadingAiReport] = useState(false);

    // Campaign detail view
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [dailyInsights, setDailyInsights] = useState(null);
    const [loadingDaily, setLoadingDaily] = useState(false);
    const [showPausedCampaigns, setShowPausedCampaigns] = useState(false);
    const canvasRef = useRef(null);
    const prevDatePresetRef = useRef(datePreset);
    const [regionInsights, setRegionInsights] = useState(marketingCache.regionInsights || []);

    useEffect(() => {
        setAccountInsights(marketingCache.accountInsights || null);
        setCampaigns(marketingCache.campaigns?.length ? marketingCache.campaigns : null);
        setAdSets(marketingCache.adSets || {});
        setAiReport(marketingCache.aiReport || '');
        setRegionInsights(marketingCache.regionInsights || []);
    }, [marketingCache.accountInsights, marketingCache.campaigns, marketingCache.adSets, marketingCache.aiReport, marketingCache.regionInsights]);

    // Auto re-fetch when period changes (only if we already have data)
    useEffect(() => {
        if (prevDatePresetRef.current !== datePreset && (campaigns || accountInsights)) {
            prevDatePresetRef.current = datePreset;
            if (datePreset !== 'custom') {
                handleSync();
            }
        }
    }, [datePreset]);

    const persistMarketingCache = (overrides = {}) => {
        setMarketingCache({
            accountInsights,
            campaigns: campaigns || [],
            adSets,
            aiReport,
            lastSyncedAt: marketingCache.lastSyncedAt || new Date().toISOString(),
            ...overrides
        });
    };

    // ============ SCORING & RECOMMENDATIONS ENGINE ============
    const scoreCampaign = (campaign) => {
        const insights = campaign?.insights?.data?.[0] || {};
        const ctr = parseFloat(insights.ctr || 0);
        const cpc = parseFloat(insights.cpc || 0);
        const spend = parseFloat(insights.spend || 0);
        const reach = parseInt(insights.reach || 0);
        const impressions = parseInt(insights.impressions || 0);
        const frequency = impressions && reach ? impressions / reach : 0;
        const clicks = parseInt(insights.clicks || 0);

        if (!spend || spend === 0) return { score: 0, grade: '—', color: '#6b7280', recommendations: ['Sin datos de inversión.'] };

        let score = 50; // base
        const recs = [];

        // CTR scoring (industry avg ~1%)
        if (ctr >= 3) { score += 20; }
        else if (ctr >= 2) { score += 15; }
        else if (ctr >= 1) { score += 5; }
        else if (ctr >= 0.5) { score -= 5; recs.push('⚠️ CTR bajo (<1%). Revisá las creatividades y copy — probá imágenes más llamativas o un CTA más directo.'); }
        else { score -= 15; recs.push('🔴 CTR muy bajo (<0.5%). Las creatividades no están generando interés. Cambialas urgente.'); }

        // CPC scoring (depends on industry, fashion ~$0.5-2)
        if (cpc > 0 && cpc < 0.3) { score += 15; }
        else if (cpc < 0.8) { score += 10; }
        else if (cpc < 1.5) { score += 0; }
        else if (cpc < 3) { score -= 10; recs.push('⚠️ CPC alto ($' + cpc.toFixed(2) + '). Segmentación demasiado amplia o poco relevante.'); }
        else { score -= 20; recs.push('🔴 CPC muy alto ($' + cpc.toFixed(2) + '). Revisá la audiencia y probá Lookalike o retargeting.'); }

        // Frequency scoring (ideal 1.5-3)
        if (frequency >= 1 && frequency <= 2) { score += 10; }
        else if (frequency <= 3) { score += 5; }
        else if (frequency <= 5) { score -= 5; recs.push('⚠️ Frecuencia alta (' + frequency.toFixed(1) + '). Tu audiencia ya vio el anuncio muchas veces — rotá creatividades.'); }
        else { score -= 15; recs.push('🔴 Frecuencia excesiva (' + frequency.toFixed(1) + '). Fatiga de anuncio. Ampliá la audiencia o pausá y cambiá creativas.'); }

        // Reach efficiency
        const costPerReach = reach > 0 ? spend / reach * 1000 : 0; // CPM
        if (costPerReach > 0 && costPerReach < 5) { score += 10; recs.push('✅ CPM excelente ($' + costPerReach.toFixed(2) + '/1000). Buen alcance por el precio.'); }
        else if (costPerReach < 15) { score += 5; }
        else if (costPerReach > 25) { score -= 10; recs.push('⚠️ CPM alto ($' + costPerReach.toFixed(2) + '/1000). Probá audiencias más amplias.'); }

        // Actions/conversions
        const actions = insights.actions || [];
        const purchases = actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
        const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead');
        const linkClicks = actions.find(a => a.action_type === 'link_click');

        if (purchases) {
            const roas = parseFloat(purchases.value) / spend;
            if (roas > 3) { score += 15; recs.push('🎯 ROAS excelente (' + roas.toFixed(1) + 'x). ¡Escalá esta campaña!'); }
            else if (roas > 1.5) { score += 5; }
            else { recs.push('⚠️ ROAS bajo. Optimizá la landing page o el funnel de conversión.'); }
        }

        if (!purchases && !leads && clicks > 20) {
            recs.push('💡 Muchos clicks pero sin conversiones. Revisá la landing page y el pixel de Facebook.');
        }

        // Positive recommendations
        if (recs.filter(r => r.startsWith('✅') || r.startsWith('🎯')).length === 0) {
            if (ctr >= 1.5 && cpc < 1) recs.push('✅ Buena relación CTR/CPC. Mantenla activa.');
            if (score >= 70) recs.push('✅ Campaña saludable en general. Considerá aumentar presupuesto gradualmente.');
        }

        if (recs.length === 0) recs.push('📊 Métricas dentro de lo normal. Seguí monitoreando.');

        score = Math.max(0, Math.min(100, score));
        const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
        const color = score >= 80 ? '#22c55e' : score >= 65 ? '#84cc16' : score >= 50 ? '#f59e0b' : score >= 35 ? '#f97316' : '#ef4444';

        return { score, grade, color, recommendations: recs, metrics: { ctr, cpc, frequency, costPerReach } };
    };

    const handleSync = async () => {
        setLoading(true);
        try {
            const [insights, camps, regions] = await Promise.all([
                metaService.fetchAdInsights(config, getDateRange()),
                metaService.fetchCampaigns(config, getDateRange()),
                metaService.fetchInsightsByRegion(config, getDateRange()).catch(() => []),
            ]);
            setAccountInsights(insights);
            setCampaigns(camps);
            setRegionInsights(regions);
            persistMarketingCache({
                accountInsights: insights,
                campaigns: camps,
                regionInsights: regions,
                adSets,
                aiReport,
                lastSyncedAt: new Date().toISOString()
            });
        } catch (err) {
            alert(`❌ Error al conectar con Meta: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleExpandCampaign = async (campaignId) => {
        if (expandedCampaign === campaignId) {
            setExpandedCampaign(null);
            return;
        }
        setExpandedCampaign(campaignId);
        if (!adSets[campaignId]) {
            setLoadingAdSets(campaignId);
            try {
                const sets = await metaService.fetchAdSets(config, campaignId);
                const nextAdSets = { ...adSets, [campaignId]: sets };
                setAdSets(nextAdSets);
                persistMarketingCache({ adSets: nextAdSets });
            } catch (err) {
                console.error('Error loading ad sets:', err);
                const nextAdSets = { ...adSets, [campaignId]: [] };
                setAdSets(nextAdSets);
                persistMarketingCache({ adSets: nextAdSets });
            } finally {
                setLoadingAdSets(null);
            }
        }
    };

    const handleViewCampaignDetail = async (campaign) => {
        setSelectedCampaign(campaign);
        setLoadingDaily(true);
        try {
            const daily = await metaService.fetchCampaignDailyInsights(config, campaign.id);
            setDailyInsights(daily);
        } catch (err) {
            console.error('Error loading daily insights:', err);
            setDailyInsights([]);
        } finally {
            setLoadingDaily(false);
        }
    };

    // Draw chart
    useEffect(() => {
        if (!dailyInsights || !canvasRef.current || dailyInsights.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const spendData = dailyInsights.map(d => parseFloat(d.spend || 0));
        const labels = dailyInsights.map(d => {
            const date = new Date(d.date_start);
            return `${date.getDate()}/${date.getMonth() + 1}`;
        });

        const maxVal = Math.max(...spendData, 1);
        const padTop = 20, padBot = 30, padLeft = 50, padRight = 20;
        const chartW = w - padLeft - padRight;
        const chartH = h - padTop - padBot;

        // Grid
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
            const val = maxVal - (maxVal / 4) * i;
            ctx.fillText('$' + Math.round(val).toLocaleString(), padLeft - 6, y + 4);
        }

        // Bars
        if (spendData.length > 0) {
            const barWidth = Math.max(4, (chartW / spendData.length) - 3);
            spendData.forEach((val, idx) => {
                const x = padLeft + (idx / spendData.length) * chartW + 2;
                const barH = (val / maxVal) * chartH;
                const y = padTop + chartH - barH;

                const grad = ctx.createLinearGradient(x, y, x, padTop + chartH);
                grad.addColorStop(0, 'rgba(24, 119, 242, 0.8)');
                grad.addColorStop(1, 'rgba(24, 119, 242, 0.2)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, barH, [3, 3, 0, 0]);
                ctx.fill();
            });
        }

        // X labels
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(labels.length / 8));
        labels.forEach((lbl, idx) => {
            if (idx % step === 0) {
                const x = padLeft + (idx / labels.length) * chartW + 4;
                ctx.fillText(lbl, x, h - 8);
            }
        });
    }, [dailyInsights]);

    // Helpers
    const formatMoney = (v) => '$' + parseFloat(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 });
    const formatNum = (v) => parseInt(v || 0).toLocaleString('es-AR');
    const formatPct = (v) => parseFloat(v || 0).toFixed(2) + '%';
    const toNumber = (v) => Number.parseFloat(v || 0) || 0;

    const getActionValue = (insight, actionTypes) => {
        const actions = insight?.actions || [];
        const match = actions.find(action => actionTypes.includes(action.action_type));
        return Number.parseFloat(match?.value || 0) || 0;
    };

    const getRevenueValue = (insight) => {
        const actionValues = insight?.action_values || [];
        const match = actionValues.find(action =>
            ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'].includes(action.action_type)
        );
        return Number.parseFloat(match?.value || 0) || 0;
    };

    const getRoasValue = (insight) => {
        const spend = toNumber(insight?.spend);
        const revenue = getRevenueValue(insight);
        if (revenue > 0 && spend > 0) return revenue / spend;

        const purchaseRoas = insight?.purchase_roas?.[0]?.value;
        return Number.parseFloat(purchaseRoas || 0) || 0;
    };

    const buildCampaignReportPayload = (campaign, reportData) => {
        const today = reportData?.today || {};
        const last7d = reportData?.last7d || {};
        const last30d = reportData?.last30d || {};

        return {
            nombre: campaign.name,
            estado: campaign.status,
            objetivo: campaign.objective,
            spend_hoy: toNumber(today.spend),
            spend_total: toNumber(last30d.spend),
            budget_diario: toNumber(campaign.daily_budget) / 100,
            budget_total: toNumber(campaign.lifetime_budget) / 100,
            impresiones: Number.parseInt(today.impressions || 0, 10) || 0,
            alcance: Number.parseInt(today.reach || 0, 10) || 0,
            frecuencia: toNumber(today.frequency),
            clicks: Number.parseInt(today.clicks || 0, 10) || 0,
            CTR: toNumber(today.ctr),
            CPC: toNumber(today.cpc),
            CPM: toNumber(today.cpm),
            conversiones: getActionValue(today, ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase']),
            revenue: getRevenueValue(today),
            ROAS: getRoasValue(today),
            datos_historicos_7d: {
                spend: toNumber(last7d.spend),
                conversiones: getActionValue(last7d, ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase']),
                ROAS: getRoasValue(last7d),
                CTR: toNumber(last7d.ctr),
                CPC: toNumber(last7d.cpc),
            },
            datos_historicos_30d: {
                spend: toNumber(last30d.spend),
                conversiones: getActionValue(last30d, ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase']),
                ROAS: getRoasValue(last30d),
                CTR: toNumber(last30d.ctr),
                CPC: toNumber(last30d.cpc),
            }
        };
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'ACTIVE': return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: '🟢 Activa' };
            case 'PAUSED': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '⏸️ Pausada' };
            default: return { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: status };
        }
    };

    const getObjectiveLabel = (obj) => {
        const map = {
            'OUTCOME_TRAFFIC': '🔗 Tráfico',
            'OUTCOME_ENGAGEMENT': '💬 Interacciones',
            'OUTCOME_AWARENESS': '👁️ Reconocimiento',
            'OUTCOME_LEADS': '📋 Leads',
            'OUTCOME_SALES': '🛒 Ventas',
            'OUTCOME_APP_PROMOTION': '📱 App',
            'LINK_CLICKS': '🔗 Clicks en Link',
            'CONVERSIONS': '🎯 Conversiones',
            'REACH': '📣 Alcance',
            'BRAND_AWARENESS': '👁️ Brand Awareness',
            'POST_ENGAGEMENT': '💬 Engagement',
            'VIDEO_VIEWS': '▶️ Vistas de Video',
        };
        return map[obj] || obj;
    };

    const getInsight = (campaign) => {
        return campaign.insights?.data?.[0] || {};
    };

    const generateAiMarketingReport = async () => {
        if (!marketing.openaiKey) {
            alert('Necesitás cargar la OpenAI API Key en Configuración para generar el reporte IA.');
            return;
        }
        if (!campaigns || campaigns.length === 0) {
            alert('Primero sincronizá las campañas de Meta.');
            return;
        }

        const activeCampaignsForReport = campaigns.filter(campaign => campaign.status === 'ACTIVE');
        if (activeCampaignsForReport.length === 0) {
            alert('No hay campañas activas para analizar.');
            return;
        }

        setLoadingAiReport(true);
        try {
            const reportData = await Promise.all(
                activeCampaignsForReport.map(async (campaign) => ({
                    campaign,
                    metrics: await metaService.fetchCampaignReportData(config, campaign.id)
                }))
            );

            const campaignPayload = reportData.map(({ campaign, metrics }) =>
                buildCampaignReportPayload(campaign, metrics)
            );

            const prompt = MARKETING_REPORT_PROMPT.replace('{{campaign_data}}', JSON.stringify(campaignPayload, null, 2));

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${marketing.openaiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    temperature: 0.4,
                    messages: [
                        {
                            role: 'system',
                            content: 'Respondé siempre en español rioplatense profesional, con foco en performance marketing, claridad ejecutiva y acciones concretas.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error?.message || 'No se pudo generar el reporte IA.');
            }

            const reportText = result.choices?.[0]?.message?.content || 'No se recibió contenido del modelo.';
            setAiReport(reportText);
            persistMarketingCache({ aiReport: reportText });
        } catch (err) {
            console.error('Error generating AI marketing report:', err);
            alert(`Error generando reporte IA: ${err.message}`);
        } finally {
            setLoadingAiReport(false);
        }
    };

    // Extract actions (conversions) from insights
    const getConversions = (insight) => {
        const actions = insight.actions || [];
        const purchase = actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
        const leads = actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead');
        const atc = actions.find(a => a.action_type === 'offsite_conversion.fb_pixel_add_to_cart');
        const link = actions.find(a => a.action_type === 'link_click');
        return { purchase, leads, atc, link };
    };

    // ========== CAMPAIGN DETAIL VIEW ==========
    if (selectedCampaign) {
        const insight = getInsight(selectedCampaign);
        const status = getStatusColor(selectedCampaign.status);
        const conversions = getConversions(insight);

        return (
            <div className="view-container" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
                <button
                    className="btn btn-ghost"
                    onClick={() => { setSelectedCampaign(null); setDailyInsights(null); }}
                    style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <ArrowLeft size={16} /> Volver al Dashboard
                </button>

                <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                        <div>
                            <h2 style={{ margin: '0 0 8px 0' }}>{selectedCampaign.name}</h2>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
                                <span style={{ padding: '3px 10px', borderRadius: 6, background: status.bg, color: status.color, fontWeight: 600, fontSize: 12 }}>
                                    {status.label}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>{getObjectiveLabel(selectedCampaign.objective)}</span>
                            </div>
                        </div>
                    </div>

                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                        <div style={{ padding: 16, background: 'rgba(24, 119, 242, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <DollarSign size={18} color="#1877F2" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inversión</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatMoney(insight.spend)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'rgba(139, 92, 246, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <Eye size={18} color="#8b5cf6" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Impresiones</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatNum(insight.impressions)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <MousePointer size={18} color="#22c55e" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Clicks</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatNum(insight.clicks)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <Users size={18} color="#f59e0b" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Alcance</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatNum(insight.reach)}</div>
                        </div>
                        <div style={{ padding: 16, background: 'rgba(236, 72, 153, 0.1)', borderRadius: 12, textAlign: 'center' }}>
                            <Target size={18} color="#ec4899" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CTR</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatPct(insight.ctr)}</div>
                        </div>
                    </div>

                    {/* Extra metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
                        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CPC</div>
                            <div style={{ fontSize: 16, fontWeight: 'bold' }}>{formatMoney(insight.cpc)}</div>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Link Clicks</div>
                            <div style={{ fontSize: 16, fontWeight: 'bold' }}>{conversions.link?.value || '—'}</div>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Compras</div>
                            <div style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--success)' }}>{conversions.purchase?.value || '—'}</div>
                        </div>
                        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center', border: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Leads</div>
                            <div style={{ fontSize: 16, fontWeight: 'bold' }}>{conversions.leads?.value || '—'}</div>
                        </div>
                    </div>
                </div>

                {/* Daily Spend Chart */}
                <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={18} color="#1877F2" /> Inversión Diaria (últimos 30 días)
                    </h3>
                    {loadingDaily ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <RefreshCw size={20} className="spin" /><br />Cargando gráfico...
                        </div>
                    ) : !dailyInsights || dailyInsights.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            No hay datos diarios disponibles.
                        </div>
                    ) : (
                        <canvas ref={canvasRef} style={{ width: '100%', height: 220, display: 'block' }} />
                    )}
                </div>

                {/* Ad Sets */}
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px 0' }}>Conjuntos de Anuncios</h3>
                    {adSets[selectedCampaign.id] ? (
                        adSets[selectedCampaign.id].length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No hay conjuntos de anuncios.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {adSets[selectedCampaign.id].map(as => {
                                    const asInsight = as.insights?.data?.[0] || {};
                                    const asStatus = getStatusColor(as.status);
                                    return (
                                        <div key={as.id} style={{ padding: 16, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{as.name}</div>
                                                    <span style={{ padding: '2px 8px', borderRadius: 4, background: asStatus.bg, color: asStatus.color, fontSize: 11 }}>{asStatus.label}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Inversión</div>
                                                        <div style={{ fontWeight: 'bold' }}>{formatMoney(asInsight.spend)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Clicks</div>
                                                        <div style={{ fontWeight: 'bold' }}>{formatNum(asInsight.clicks)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Alcance</div>
                                                        <div style={{ fontWeight: 'bold' }}>{formatNum(asInsight.reach)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                            <RefreshCw size={16} className="spin" /> Cargando...
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ========== MAIN DASHBOARD VIEW ==========
    const accountData = accountInsights?.[0] || {};
    const activeCampaigns = campaigns?.filter(c => c.status === 'ACTIVE') || [];
    const pausedCampaigns = campaigns?.filter(c => c.status === 'PAUSED') || [];
    const totalCampaigns = campaigns?.length || 0;

    return (
        <div className="view-container" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        <Megaphone className="text-accent" /> Marketing
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Analíticas de publicidad en Meta (Facebook / Instagram).
                    </p>
                </div>
                {marketing.metaToken && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={generateAiMarketingReport} disabled={loadingAiReport || loading || !campaigns}>
                            <Zap size={16} className={loadingAiReport ? 'spin' : ''} />
                            {loadingAiReport ? 'Generando reporte...' : 'Reporte IA'}
                        </button>
                        <button className="btn btn-primary" onClick={handleSync} disabled={loading}>
                            <RefreshCw size={16} className={loading ? 'spin' : ''} />
                            {loading ? 'Sincronizando...' : '📊 Sincronizar Ads'}
                        </button>
                    </div>
                )}
            </div>

            {/* Date Range Filter */}
            {marketing.metaToken && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>📅 Período:</span>
                    {['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'custom'].map(p => (
                        <button key={p} onClick={() => setDatePreset(p)}
                            style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: datePreset === p ? '1px solid var(--accent)' : '1px solid var(--border-color)', background: datePreset === p ? 'rgba(99,102,241,0.15)' : 'transparent', color: datePreset === p ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: datePreset === p ? 600 : 400 }}>
                            {{ last_7d: '7d', last_14d: '14d', last_30d: '30d', last_90d: '90d', this_month: 'Este mes', last_month: 'Mes pasado', custom: 'Personalizado' }[p]}
                        </button>
                    ))}
                    {datePreset === 'custom' && (
                        <>
                            <input type="date" value={customSince} onChange={e => setCustomSince(e.target.value)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                            <input type="date" value={customUntil} onChange={e => setCustomUntil(e.target.value)} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                        </>
                    )}
                </div>
            )}

            {!marketing.metaToken ? (
                <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
                    <AlertCircle size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        Meta Ads no configurado. <br />
                        Conectá tu cuenta en <strong>Configuración</strong>.
                    </p>
                </div>
            ) : !campaigns ? (
                <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
                    <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        Presioná <strong>"Sincronizar Ads"</strong> para cargar todas las campañas y métricas.
                    </p>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                        Cuenta: {marketing.metaAdAccountId}
                    </div>
                </div>
            ) : (
                <>
                    {marketing.openaiKey && (
                        <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Zap size={18} color="#22c55e" /> Reporte Diario IA
                                    </h3>
                                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                                        Usa tu prompt profesional para analizar campañas activas con foco en ROAS, saturación y acciones concretas.
                                    </p>
                                </div>
                                <button className="btn btn-secondary" onClick={generateAiMarketingReport} disabled={loadingAiReport}>
                                    <Zap size={16} className={loadingAiReport ? 'spin' : ''} />
                                    {loadingAiReport ? 'Actualizando...' : 'Generar ahora'}
                                </button>
                            </div>

                            {!aiReport ? (
                                <div style={{
                                    padding: 16,
                                    borderRadius: 12,
                                    border: '1px dashed var(--glass-border)',
                                    color: 'var(--text-muted)',
                                    fontSize: 13
                                }}>
                                    Sin reporte generado todavía. Primero sincronizá Meta Ads y luego tocá <strong>Reporte IA</strong>.
                                </div>
                            ) : (
                                <pre style={{
                                    whiteSpace: 'pre-wrap',
                                    margin: 0,
                                    padding: 18,
                                    borderRadius: 14,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'inherit',
                                    fontSize: 13,
                                    lineHeight: 1.65
                                }}>
                                    {aiReport}
                                </pre>
                            )}
                        </div>
                    )}

                    {/* Account-Level KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
                            <DollarSign size={20} color="#1877F2" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inversión Total</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatMoney(accountData.spend)}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
                            <Eye size={20} color="#8b5cf6" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Impresiones</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatNum(accountData.impressions)}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
                            <MousePointer size={20} color="#22c55e" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Clicks</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatNum(accountData.clicks)}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
                            <Users size={20} color="#f59e0b" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Alcance</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatNum(accountData.reach)}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center' }}>
                            <Target size={20} color="#ec4899" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CPC Promedio</div>
                            <div style={{ fontSize: 22, fontWeight: 'bold' }}>{formatMoney(accountData.cpc)}</div>
                        </div>
                    </div>

                    {/* Campaign Stats Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center', borderLeft: '3px solid #22c55e' }}>
                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#22c55e' }}>{activeCampaigns.length}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Campañas Activas</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center', borderLeft: '3px solid #f59e0b' }}>
                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#f59e0b' }}>{pausedCampaigns.length}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Campañas Pausadas</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 16, textAlign: 'center', borderLeft: '3px solid #6366f1' }}>
                            <div style={{ fontSize: 28, fontWeight: 'bold' }}>{totalCampaigns}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Campañas</div>
                        </div>
                    </div>

                    {/* ===== DAILY REPORT / SCORECARD ===== */}
                    <div className="glass-panel" style={{ padding: 24, marginBottom: 16 }}>
                        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Target size={18} color="#8b5cf6" /> Reporte Diario — Puntaje por Campaña Activa
                        </h3>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                            Análisis automático de cada campaña activa con puntaje de 0-100 y recomendaciones para mejorar.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {campaigns.filter(c => c.status === 'ACTIVE').length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                                    No hay campañas activas para analizar.
                                </div>
                            ) : campaigns.filter(c => c.status === 'ACTIVE').map(camp => {
                                const report = scoreCampaign(camp);
                                return (
                                    <div key={`report-${camp.id}`} style={{
                                        padding: 16, borderRadius: 12,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${report.color}33`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{camp.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                    CTR: {report.metrics.ctr.toFixed(2)}% · CPC: ${report.metrics.cpc.toFixed(2)} · Freq: {report.metrics.frequency.toFixed(1)} · CPM: ${report.metrics.costPerReach.toFixed(2)}
                                                </div>
                                            </div>
                                            <div style={{
                                                width: 64, height: 64, borderRadius: '50%',
                                                border: `3px solid ${report.color}`,
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                <span style={{ fontSize: 20, fontWeight: 'bold', color: report.color, lineHeight: 1 }}>
                                                    {report.grade}
                                                </span>
                                                <span style={{ fontSize: 10, color: report.color }}>
                                                    {report.score}/100
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {report.recommendations.map((rec, ri) => (
                                                <div key={ri} style={{
                                                    fontSize: 12, padding: '6px 10px',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    borderRadius: 6, color: 'var(--text-secondary)'
                                                }}>
                                                    {rec}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Campaigns List */}
                    <div className="glass-panel" style={{ padding: 24 }}>
                        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Zap size={18} color="#f59e0b" /> Campañas (últimos 30 días)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {campaigns.filter(c => c.status === 'ACTIVE').map(camp => {
                                const campInsight = getInsight(camp);
                                const campStatus = getStatusColor(camp.status);
                                const isExpanded = expandedCampaign === camp.id;

                                return (
                                    <div key={camp.id}>
                                        <div
                                            style={{
                                                padding: 16,
                                                background: isExpanded ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                                                borderRadius: 12,
                                                border: '1px solid var(--glass-border)',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
                                            onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }} onClick={() => handleExpandCampaign(camp.id)}>
                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{camp.name}</div>
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <span style={{ padding: '2px 8px', borderRadius: 4, background: campStatus.bg, color: campStatus.color, fontSize: 11, fontWeight: 600 }}>
                                                                {campStatus.label}
                                                            </span>
                                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{getObjectiveLabel(camp.objective)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 13 }}>
                                                    <div style={{ textAlign: 'right', minWidth: 80 }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Inversión</div>
                                                        <div style={{ fontWeight: 'bold', color: '#1877F2' }}>{formatMoney(campInsight.spend)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Clicks</div>
                                                        <div style={{ fontWeight: 'bold' }}>{formatNum(campInsight.clicks)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Alcance</div>
                                                        <div style={{ fontWeight: 'bold' }}>{formatNum(campInsight.reach)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', minWidth: 50 }}>
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CTR</div>
                                                        <div style={{ fontWeight: 'bold' }}>{formatPct(campInsight.ctr)}</div>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={(e) => { e.stopPropagation(); handleViewCampaignDetail(camp); handleExpandCampaign(camp.id); }}
                                                        style={{ fontSize: 11 }}
                                                    >
                                                        <BarChart3 size={14} /> Detalle
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded: Ad Sets */}
                                        {isExpanded && (
                                            <div style={{ marginLeft: 32, marginTop: 8, marginBottom: 8 }}>
                                                {loadingAdSets === camp.id ? (
                                                    <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>
                                                        <RefreshCw size={14} className="spin" /> Cargando conjuntos de anuncios...
                                                    </div>
                                                ) : adSets[camp.id]?.length === 0 ? (
                                                    <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>Sin conjuntos de anuncios disponibles.</div>
                                                ) : (
                                                    (adSets[camp.id] || []).map(as => {
                                                        const asInsight = as.insights?.data?.[0] || {};
                                                        const asStatus = getStatusColor(as.status);
                                                        return (
                                                            <div key={as.id} style={{ padding: 12, marginBottom: 4, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                                                                <div>
                                                                    <span style={{ fontWeight: 600 }}>{as.name}</span>
                                                                    <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: asStatus.bg, color: asStatus.color, fontSize: 10 }}>{asStatus.label}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 16 }}>
                                                                    <span>{formatMoney(asInsight.spend)}</span>
                                                                    <span>{formatNum(asInsight.clicks)} clicks</span>
                                                                    <span>{formatNum(asInsight.reach)} alcance</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Paused Campaigns - Collapsible */}
                            {campaigns.filter(c => c.status === 'PAUSED').length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <button onClick={() => setShowPausedCampaigns(!showPausedCampaigns)} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>⏸️ Pausadas ({campaigns.filter(c => c.status === 'PAUSED').length})</span>
                                        <span>{showPausedCampaigns ? '▼' : '▶'}</span>
                                    </button>
                                    {showPausedCampaigns && campaigns.filter(c => c.status === 'PAUSED').map(camp => {
                                        const ci = getInsight(camp);
                                        const cs = getStatusColor(camp.status);
                                        return (<div key={camp.id} style={{ padding: 10, background: 'rgba(245,158,11,0.03)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.1)', marginTop: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontWeight: 600, fontSize: 13, opacity: 0.7 }}>{camp.name}</div>
                                                <span style={{ padding: '2px 8px', borderRadius: 4, background: cs.bg, color: cs.color, fontSize: 11 }}>{cs.label}</span>
                                            </div>
                                        </div>);
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Cuenta: {marketing.metaAdAccountId} · Datos de los últimos 30 días
                    </div>
                </>
            )}

            {/* CHANGE 1: Targeting por Provincia y Origen de Pedidos */}
            {(() => {
                const PROVINCIAS = ['Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza', 'Tucumán', 'Entre Ríos', 'Salta', 'Misiones', 'Chaco', 'Corrientes', 'Santiago del Estero', 'San Juan', 'Jujuy', 'Río Negro', 'Neuquén', 'Formosa', 'Chubut', 'San Luis', 'Catamarca', 'La Pampa', 'La Rioja', 'Santa Cruz', 'Tierra del Fuego', 'CABA'];
                const SOURCES = ['Instagram', 'WhatsApp', 'Directo', 'Modatex', 'Web', 'Otro'];
                const selectedProvinces = state.config?.marketingProvincias || [];
                const pedidosOnline = state.config?.pedidosOnline || [];

                const origenCount = {};
                SOURCES.forEach(s => { origenCount[s] = 0; });
                pedidosOnline.forEach(p => {
                    // If no origin set but has wooId, it's a web order
                    const src = p.origen || (p.wooId ? 'Web' : 'Otro');
                    origenCount[src] = (origenCount[src] || 0) + 1;
                });
                const maxCount = Math.max(...Object.values(origenCount), 1);

                // Process region insights from Meta
                const regionData = {};
                (regionInsights || []).forEach(r => {
                    const region = r.region || 'Desconocido';
                    regionData[region] = {
                        spend: parseFloat(r.spend || 0),
                        impressions: parseInt(r.impressions || 0),
                        clicks: parseInt(r.clicks || 0),
                        reach: parseInt(r.reach || 0),
                    };
                });
                const regionsSorted = Object.entries(regionData).sort((a, b) => b[1].spend - a[1].spend);
                const targetedRegions = regionsSorted.map(([r]) => r);
                const untargetedProvinces = PROVINCIAS.filter(p => !targetedRegions.some(r => r.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(r.toLowerCase())));

                return (
                    <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
                        <div style={{ padding: 'var(--sp-4)', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <h3 style={{ margin: '0 0 12px' }}>Targeting por Provincia y Origen de Pedidos</h3>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                <div>
                                    <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>📍 Rendimiento por Región (Meta Ads)</h4>
                                    {regionsSorted.length > 0 ? (
                                        <div style={{ display: 'grid', gap: 4 }}>
                                            {regionsSorted.slice(0, 12).map(([region, data]) => {
                                                const maxSpend = regionsSorted[0]?.[1]?.spend || 1;
                                                const ctr = data.impressions > 0 ? ((data.clicks / data.impressions) * 100).toFixed(2) : '0';
                                                return (
                                                    <div key={region} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                                            <span style={{ fontWeight: 600 }}>{region}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>${Math.round(data.spend)} · {data.clicks} clicks · CTR {ctr}%</span>
                                                        </div>
                                                        <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }}>
                                                            <div style={{ height: '100%', borderRadius: 999, width: `${(data.spend / maxSpend) * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', transition: 'width 0.3s' }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {untargetedProvinces.length > 0 && (
                                                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: '#f59e0b' }}>
                                                    ⚠️ <strong>Sin publicidad:</strong> {untargetedProvinces.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>
                                            Sincronizá Meta Ads para ver rendimiento por región
                                        </div>
                                    )}

                                    <h4 style={{ margin: '16px 0 10px', fontSize: 14 }}>Provincias con publicidad activa (manual)</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                                        {PROVINCIAS.map(prov => {
                                            const active = selectedProvinces.includes(prov);
                                            return (
                                                <label
                                                    key={prov}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        padding: '6px 10px',
                                                        borderRadius: 8,
                                                        background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                                                        border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                                        cursor: 'pointer',
                                                        fontSize: 13,
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={() => {
                                                            const next = active
                                                                ? selectedProvinces.filter(p => p !== prov)
                                                                : [...selectedProvinces, prov];
                                                            updateConfig({ marketingProvincias: next });
                                                        }}
                                                        style={{ margin: 0 }}
                                                    />
                                                    {prov}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                        {selectedProvinces.length} provincia{selectedProvinces.length !== 1 ? 's' : ''} con publicidad activa
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Origen de pedidos online</h4>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        {SOURCES.map(src => {
                                            const count = origenCount[src] || 0;
                                            return (
                                                <div key={src}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                                                        <span>{src}</span>
                                                        <strong>{count} pedido{count !== 1 ? 's' : ''}</strong>
                                                    </div>
                                                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }}>
                                                        <div style={{ height: '100%', borderRadius: 999, width: `${(count / maxCount) * 100}%`, background: 'linear-gradient(90deg, var(--accent), #34d399)', transition: 'width 0.3s' }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                                        Total: {pedidosOnline.length} pedidos online registrados
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
