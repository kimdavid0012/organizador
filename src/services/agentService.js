/**
 * Agent Service — Central engine for AI Marketing Agents
 * Handles: prompt building, OpenAI calls, Firestore persistence, agent orchestration
 */

import { metaService } from '../utils/metaService';
import { wooService } from '../utils/wooService';

// ─── OpenAI helper ───────────────────────────────────────────
async function callOpenAI(apiKey, systemPrompt, userPrompt, options = {}) {
  const { model = 'gpt-4o-mini', temperature = 0.5, maxTokens = 4000 } = options;
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Error en llamada a OpenAI');
  return data.choices?.[0]?.message?.content || '';
}

// ─── Date helpers ────────────────────────────────────────────
function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function agentTimestamp() {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 1 — ANALISTA (Daily Business Intelligence)
// ═══════════════════════════════════════════════════════════════
const ANALYST_SYSTEM = `Sos un analista de business intelligence especializado en e-commerce de moda argentino.
Tu trabajo es consolidar datos de Meta Ads + WooCommerce + ventas del día y producir un brief ejecutivo.
Respondé siempre en español rioplatense, profesional pero directo. Usá emojis con moderación para marcar secciones.
Formato: secciones claras con headers, bullets concretos con números, y un score general del día (0-100).`;

export async function runAnalystAgent(config, state) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key en Configuración → Marketing');

  // Gather Meta Ads data
  let metaData = null;
  let campaignsData = [];
  try {
    const [insights, campaigns] = await Promise.all([
      metaService.fetchAdInsights(config),
      metaService.fetchCampaigns(config),
    ]);
    metaData = insights;
    campaignsData = campaigns.filter(c => c.status === 'ACTIVE');

    // Enrich with today/7d data for active campaigns
    const enriched = await Promise.all(
      campaignsData.slice(0, 5).map(async (c) => {
        try {
          const report = await metaService.fetchCampaignReportData(config, c.id);
          return { name: c.name, objective: c.objective, today: report.today, last7d: report.last7d };
        } catch { return { name: c.name, objective: c.objective, today: {}, last7d: {} }; }
      })
    );
    campaignsData = enriched;
  } catch (e) {
    console.warn('Analyst: Meta Ads data unavailable', e.message);
  }

  // Gather WooCommerce data
  let wooData = null;
  try {
    const [topProducts, orders] = await Promise.all([
      wooService.fetchTopProducts(config),
      wooService.fetchOrders(config),
    ]);
    const todayOrders = (orders || []).filter(o => {
      const d = new Date(o.date_created);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    wooData = {
      topProducts: (topProducts || []).slice(0, 10).map(p => ({
        name: p.extended_info?.name || p.name,
        itemsSold: p.items_sold,
        netRevenue: p.net_revenue,
      })),
      ordersToday: todayOrders.length,
      revenueToday: todayOrders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0),
      totalOrders30d: (orders || []).length,
    };
  } catch (e) {
    console.warn('Analyst: WooCommerce data unavailable', e.message);
  }

  // POS data from state
  const posVentas = (state.posVentas || []).filter(v => {
    const d = new Date(v.fecha || v.createdAt);
    return d.toDateString() === new Date().toDateString();
  });
  const posData = {
    ventasHoy: posVentas.length,
    totalHoy: posVentas.reduce((s, v) => s + (v.total || 0), 0),
  };

  const prompt = `Fecha: ${todayLabel()}

📊 DATOS META ADS (últimos 30 días account-level):
${metaData ? JSON.stringify(metaData, null, 2) : 'No disponible'}

📌 CAMPAÑAS ACTIVAS (top 5, con datos de hoy y 7 días):
${campaignsData.length > 0 ? JSON.stringify(campaignsData, null, 2) : 'No disponible'}

🛒 WOOCOMMERCE:
${wooData ? JSON.stringify(wooData, null, 2) : 'No disponible'}

🏪 PUNTO DE VENTA (POS) HOY:
${JSON.stringify(posData)}

───────────────────────
Generá un BRIEF EJECUTIVO DEL DÍA con:
1. SCORE DEL DÍA (0-100) con justificación en 1 línea
2. RESUMEN EJECUTIVO (3-4 líneas max)
3. VENTAS: consolidado web + POS, ticket promedio, comparación
4. META ADS: estado general, mejor y peor campaña, alertas
5. TOP PRODUCTOS: qué se vende y qué no
6. 🔴 ALERTAS URGENTES (si hay)
7. ✅ TOP 3 ACCIONES PARA HOY (concretas, con responsable sugerido)`;

  const result = await callOpenAI(apiKey, ANALYST_SYSTEM, prompt, { maxTokens: 3000 });
  return { type: 'analyst', content: result, timestamp: agentTimestamp(), data: { metaData, wooData, posData } };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 2 — TREND SCOUT (Fashion Intelligence)
// ═══════════════════════════════════════════════════════════════
const SCOUT_SYSTEM = `Sos un trend scout de moda internacional especializado en basics, modal, y ropa casual/urbana.
Conocés muy bien el mercado argentino mayorista y sabés traducir tendencias globales a oportunidades locales.
Respondé en español rioplatense. Sé concreto: nombra colores Pantone, tipos de tela, siluetas, referencias de marcas.`;

export async function runTrendScoutAgent(config, brands = []) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key');

  const defaultBrands = ['Zara', 'Skims', 'COS', 'Uniqlo', 'Aritzia'];
  const targetBrands = brands.length > 0 ? brands : defaultBrands;

  const prompt = `Fecha: ${todayLabel()}

MARCAS A ANALIZAR: ${targetBrands.join(', ')}

CONTEXTO: CELAVIE es una marca argentina mayorista de basics en modal y algodón. Vendemos remeras, musculosas, calzas, bodies, conjuntos. Nuestro público son revendedoras y tiendas multimarca.

───────────────────────
Basándote en tu conocimiento actualizado de estas marcas y del mercado de moda:

1. 🌍 TENDENCIAS GLOBALES EN BASICS
   - Colores de temporada (nombrar Pantone si es posible)
   - Siluetas que se repiten
   - Texturas y telas en tendencia
   - Estampados o técnicas (tie-dye, lavados, etc.)

2. 📌 POR MARCA ANALIZADA
   - Qué están lanzando ahora en basics/essentials
   - Qué podemos adaptar a nuestro catálogo

3. 💡 OPORTUNIDADES PARA CELAVIE
   - 3 productos específicos que podríamos agregar o modificar
   - Colores que deberíamos incorporar YA
   - Qué dejar de producir (si algo está out)

4. 📸 IDEAS DE CONTENIDO BASADAS EN TENDENCIAS
   - 3 conceptos de sesión de fotos
   - Estilo de comunicación que usan estas marcas

5. 🎯 PREDICCIÓN: Qué va a ser tendencia en los próximos 2-3 meses`;

  const result = await callOpenAI(apiKey, SCOUT_SYSTEM, prompt, { maxTokens: 3000, temperature: 0.7 });
  return { type: 'trendScout', content: result, timestamp: agentTimestamp(), brands: targetBrands };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 3 — CONTENT CREATOR (Instagram Content)
// ═══════════════════════════════════════════════════════════════
const CONTENT_SYSTEM = `Sos un content strategist y copywriter especializado en Instagram para marcas de moda mayorista argentina.
Creás contenido que combina tendencias con datos de ventas reales para maximizar engagement y conversiones.
Tono: moderno, cercano, profesional. Usás español rioplatense natural (no forzado).
Conocés las mejores prácticas de IG: Reels > carruseles > estáticos, hooks en los primeros 3 segundos, CTAs claros.`;

export async function runContentAgent(config, analystData, trendData) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key');

  const prompt = `Fecha: ${todayLabel()}

📊 DATOS DEL ANALISTA (qué se vende):
${analystData ? analystData.content?.substring(0, 2000) || 'No disponible' : 'No disponible — ejecutá primero el Agente Analista'}

🌍 TENDENCIAS DEL SCOUT:
${trendData ? trendData.content?.substring(0, 2000) || 'No disponible' : 'No disponible — ejecutá primero el Agente Trend Scout'}

───────────────────────
Generá un PLAN DE CONTENIDO SEMANAL para Instagram de CELAVIE:

PARA CADA DÍA (Lunes a Sábado), generá:
📅 DÍA
- Formato: [Reel / Carrusel / Story / Estático]
- Concepto: qué mostrar
- Hook: primera línea/segundo del contenido
- Caption: texto completo con emojis y hashtags (max 2200 chars)
- CTA: llamado a la acción específico
- Hashtags: 15-20 relevantes (mix de grandes y nicho)
- Mejor horario: hora sugerida para publicar

Además:
🎯 ESTRATEGIA DE LA SEMANA (2 líneas)
📌 PRODUCTO ESTRELLA A PUSHEAR (basado en datos de ventas)
🎨 PALETA DE COLORES SUGERIDA (basada en tendencias)
💡 1 IDEA DE REEL VIRAL adaptada a CELAVIE`;

  const result = await callOpenAI(apiKey, CONTENT_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.7 });
  return { type: 'contentCreator', content: result, timestamp: agentTimestamp() };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 4 — ESTRATEGA (The Brain)
// ═══════════════════════════════════════════════════════════════
const STRATEGIST_SYSTEM = `Sos un director de marketing y estrategia comercial con 15 años de experiencia en e-commerce de moda.
Tu trabajo es sintetizar TODOS los datos disponibles y dar recomendaciones estratégicas de alto nivel.
Pensás en ROI, en unit economics, en ciclos de producto. Sos directo y no tenés miedo de decir "pará todo y cambiá esto".
Español rioplatense, ejecutivo, con números concretos.`;

export async function runStrategistAgent(config, analystData, trendData, contentData) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key');

  const prompt = `Fecha: ${todayLabel()}

📊 REPORTE DEL ANALISTA:
${analystData?.content?.substring(0, 2500) || 'No disponible'}

🌍 REPORTE DEL TREND SCOUT:
${trendData?.content?.substring(0, 2000) || 'No disponible'}

📸 PLAN DE CONTENIDO:
${contentData?.content?.substring(0, 1500) || 'No disponible'}

CONTEXTO CELAVIE:
- Marca mayorista argentina, modal/algodón basics
- Producción mensual: ~18,750 prendas/mes, ~15 modelos
- Canal: mayoristas (70% revenue) + web (30% revenue)
- Meta Ads activas para captación web
- Equipo: dueño + marketing + operaciones

───────────────────────
Generá un REPORTE ESTRATÉGICO con:

1. 🏆 DIAGNÓSTICO GENERAL (score estratégico 0-100)
   - Estado del negocio en 3 líneas

2. 💰 ESTRATEGIA DE INVERSIÓN PUBLICITARIA
   - Budget óptimo semanal recomendado
   - Distribución por campaña (% del budget)
   - Campañas a ESCALAR (con % de aumento sugerido)
   - Campañas a PAUSAR (con justificación)
   - Nuevas campañas sugeridas

3. 📦 ESTRATEGIA DE PRODUCTO
   - Productos a pushear más (basado en ROAS + tendencia)
   - Productos a discontinuar o replantear
   - Nuevos productos a desarrollar (basado en trends)
   - Pricing: ¿hay espacio para ajustar precios?

4. 📈 CRECIMIENTO
   - Oportunidad #1 a capturar esta semana
   - Oportunidad #2 a mediano plazo (1-2 meses)
   - Riesgo principal a mitigar

5. 🎯 PLAN DE ACCIÓN SEMANAL
   Máximo 5 acciones, ordenadas por impacto:
   - Acción | Responsable | Deadline | Resultado esperado

6. 📊 PROYECCIÓN SEMANAL
   - Revenue proyectado web + POS
   - ROAS objetivo
   - Meta de conversiones`;

  const result = await callOpenAI(apiKey, STRATEGIST_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.4 });
  return { type: 'strategist', content: result, timestamp: agentTimestamp() };
}
