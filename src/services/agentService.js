/**
 * Agent Service — Central engine for AI Marketing Agents
 * Handles: prompt building, OpenAI calls, retry logic, agent orchestration
 */

import { metaService } from '../utils/metaService';
import { wooService } from '../utils/wooService';

// ─── OpenAI helper with retry + timeout ──────────────────────
async function callOpenAI(apiKey, systemPrompt, userPrompt, options = {}) {
  const { model = 'gpt-4o-mini', temperature = 0.5, maxTokens = 4000, retries = 2 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model, temperature, max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }
        throw new Error(data.error?.message || `OpenAI error ${response.status}`);
      }
      const usage = data.usage || {};
      return {
        text: data.choices?.[0]?.message?.content || '',
        tokens: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0, total: usage.total_tokens || 0 },
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('OpenAI timeout — la respuesta tardó más de 60s');
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────
function todayLabel() {
  return new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function agentTimestamp() { return new Date().toISOString(); }

function safeTruncate(obj, maxChars = 2500) {
  if (!obj) return 'No disponible';
  try {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    if (str.length <= maxChars) return str;
    return str.substring(0, maxChars) + '\n... [datos truncados]';
  } catch { return 'Error al serializar datos'; }
}

function safeContentTruncate(result, maxChars = 2000) {
  if (!result?.content) return 'No disponible — ejecutá primero el agente correspondiente';
  return result.content.length > maxChars
    ? result.content.substring(0, maxChars) + '\n... [truncado]'
    : result.content;
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 1 — ANALISTA (Daily Business Intelligence)
// ═══════════════════════════════════════════════════════════════
const ANALYST_SYSTEM = `Sos un analista de business intelligence especializado en e-commerce de moda argentino.
Tu trabajo es consolidar datos de Meta Ads + WooCommerce + ventas del día y producir un brief ejecutivo.
Respondé siempre en español rioplatense, profesional pero directo. Usá emojis con moderación para marcar secciones.
Formato: markdown con headers ##, bullets concretos con números, y un score general del día (0-100).
Si algún dato no está disponible, indicalo claramente y no inventes números.`;

export async function runAnalystAgent(config, state, onProgress) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key en Configuración → Marketing');

  onProgress?.('Recopilando datos de Meta Ads...');

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

  onProgress?.('Obteniendo datos de WooCommerce...');

  // Gather WooCommerce data
  let wooData = null;
  try {
    const [topProducts, orders] = await Promise.all([
      wooService.fetchTopProducts(config),
      wooService.fetchOrders(config),
    ]);
    const todayOrders = (orders || []).filter(o => {
      const d = new Date(o.date_created);
      return d.toDateString() === new Date().toDateString();
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

  onProgress?.('Generando análisis con IA...');

  const prompt = `Fecha: ${todayLabel()}

📊 DATOS META ADS (últimos 30 días account-level):
${safeTruncate(metaData)}

📌 CAMPAÑAS ACTIVAS (top 5, con datos de hoy y 7 días):
${safeTruncate(campaignsData)}

🛒 WOOCOMMERCE:
${safeTruncate(wooData)}

🏪 PUNTO DE VENTA (POS) HOY:
${JSON.stringify(posData)}

───────────────────────
Generá un BRIEF EJECUTIVO DEL DÍA con:
1. **SCORE DEL DÍA (0-100)** con justificación en 1 línea
2. **RESUMEN EJECUTIVO** (3-4 líneas max)
3. **VENTAS**: consolidado web + POS, ticket promedio, comparación
4. **META ADS**: estado general, mejor y peor campaña, alertas
5. **TOP PRODUCTOS**: qué se vende y qué no
6. **🔴 ALERTAS URGENTES** (si hay)
7. **✅ TOP 3 ACCIONES PARA HOY** (concretas, con responsable sugerido)`;

  const { text, tokens } = await callOpenAI(apiKey, ANALYST_SYSTEM, prompt, { maxTokens: 3000 });
  return { type: 'analyst', content: text, timestamp: agentTimestamp(), tokens, data: { metaData, wooData, posData } };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 2 — TREND SCOUT (Fashion Intelligence)
// ═══════════════════════════════════════════════════════════════
const SCOUT_SYSTEM = `Sos un trend scout de moda internacional especializado en basics, modal, y ropa casual/urbana.
Conocés muy bien el mercado argentino mayorista y sabés traducir tendencias globales a oportunidades locales.
Respondé en español rioplatense. Sé concreto: nombra colores Pantone, tipos de tela, siluetas, referencias de marcas.
Formato: markdown con headers ##, bullets con datos específicos. No divagues.`;

export async function runTrendScoutAgent(config, brands = [], onProgress) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key');

  const targetBrands = brands.length > 0 ? brands : ['Zara', 'Skims', 'COS', 'Uniqlo', 'Aritzia'];

  onProgress?.(`Investigando tendencias de ${targetBrands.slice(0, 3).join(', ')}...`);

  const prompt = `Fecha: ${todayLabel()}

MARCAS A ANALIZAR: ${targetBrands.join(', ')}

CONTEXTO: CELAVIE es una marca argentina mayorista de basics en modal y algodón. Vendemos remeras, musculosas, calzas, bodies, conjuntos. Nuestro público son revendedoras y tiendas multimarca.

───────────────────────
Basándote en tu conocimiento actualizado de estas marcas y del mercado de moda:

1. 🌍 **TENDENCIAS GLOBALES EN BASICS** — Colores Pantone, siluetas, texturas, estampados
2. 📌 **POR MARCA ANALIZADA** — Qué están lanzando ahora en basics/essentials, qué podemos adaptar
3. 💡 **OPORTUNIDADES PARA CELAVIE** — 3 productos específicos a agregar/modificar, colores a incorporar, qué dejar de producir
4. 📸 **IDEAS DE CONTENIDO** — 3 conceptos de sesión de fotos, estilo de comunicación
5. 🎯 **PREDICCIÓN** — Qué va a ser tendencia en los próximos 2-3 meses`;

  const { text, tokens } = await callOpenAI(apiKey, SCOUT_SYSTEM, prompt, { maxTokens: 3000, temperature: 0.7 });
  return { type: 'trendScout', content: text, timestamp: agentTimestamp(), tokens, brands: targetBrands };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 3 — CONTENT CREATOR (Instagram Content)
// ═══════════════════════════════════════════════════════════════
const CONTENT_SYSTEM = `Sos un content strategist y copywriter especializado en Instagram para marcas de moda mayorista argentina.
Creás contenido que combina tendencias con datos de ventas reales para maximizar engagement y conversiones.
Tono: moderno, cercano, profesional. Usás español rioplatense natural (no forzado).
Conocés las mejores prácticas de IG: Reels > carruseles > estáticos, hooks en los primeros 3 segundos, CTAs claros.
Formato: markdown con headers ## para cada día, bullets para detalles.`;

export async function runContentAgent(config, analystData, trendData, onProgress) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key');

  onProgress?.('Generando plan de contenido semanal...');

  const prompt = `Fecha: ${todayLabel()}

📊 DATOS DEL ANALISTA (qué se vende):
${safeContentTruncate(analystData)}

🌍 TENDENCIAS DEL SCOUT:
${safeContentTruncate(trendData)}

───────────────────────
Generá un **PLAN DE CONTENIDO SEMANAL** para Instagram de CELAVIE:

PARA CADA DÍA (Lunes a Sábado):
## 📅 [DÍA]
- **Formato**: Reel / Carrusel / Story / Estático
- **Concepto**: qué mostrar
- **Hook**: primera línea/segundo del contenido
- **Caption**: texto completo con emojis y hashtags (max 2200 chars)
- **CTA**: llamado a la acción específico
- **Hashtags**: 15-20 relevantes
- **Horario**: hora sugerida

Además incluí:
- 🎯 **ESTRATEGIA DE LA SEMANA** (2 líneas)
- 📌 **PRODUCTO ESTRELLA** (basado en datos)
- 🎨 **PALETA DE COLORES** (basada en tendencias)
- 💡 **IDEA DE REEL VIRAL** adaptada a CELAVIE`;

  const { text, tokens } = await callOpenAI(apiKey, CONTENT_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.7 });
  return { type: 'contentCreator', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 4 — ESTRATEGA (The Brain)
// ═══════════════════════════════════════════════════════════════
const STRATEGIST_SYSTEM = `Sos un director de marketing y estrategia comercial con 15 años de experiencia en e-commerce de moda.
Tu trabajo es sintetizar TODOS los datos disponibles y dar recomendaciones estratégicas de alto nivel.
Pensás en ROI, en unit economics, en ciclos de producto. Sos directo y no tenés miedo de decir "pará todo y cambiá esto".
Español rioplatense, ejecutivo, con números concretos. Formato: markdown con headers ## y bullets.`;

export async function runStrategistAgent(config, analystData, trendData, contentData, onProgress) {
  const apiKey = config.marketing?.openaiKey;
  if (!apiKey) throw new Error('Falta OpenAI API Key');

  onProgress?.('Analizando toda la información...');

  const prompt = `Fecha: ${todayLabel()}

📊 REPORTE DEL ANALISTA:
${safeContentTruncate(analystData, 2500)}

🌍 REPORTE DEL TREND SCOUT:
${safeContentTruncate(trendData, 2000)}

📸 PLAN DE CONTENIDO:
${safeContentTruncate(contentData, 1500)}

CONTEXTO CELAVIE:
- Marca mayorista argentina, modal/algodón basics
- Producción: ~18,750 prendas/mes, ~15 modelos
- Canal: mayoristas (70%) + web (30%)
- Meta Ads activas para captación web
- Equipo: dueño + marketing + operaciones

───────────────────────
Generá un **REPORTE ESTRATÉGICO** con:

## 🏆 DIAGNÓSTICO GENERAL (score 0-100)
## 💰 ESTRATEGIA PUBLICITARIA — Budget óptimo, distribución, escalar/pausar/nuevas
## 📦 ESTRATEGIA DE PRODUCTO — Pushear, discontinuar, desarrollar, pricing
## 📈 CRECIMIENTO — Oportunidad esta semana, mediano plazo, riesgo principal
## 🎯 PLAN DE ACCIÓN SEMANAL — Max 5 acciones (Acción | Responsable | Deadline | Resultado)
## 📊 PROYECCIÓN — Revenue proyectado, ROAS objetivo, meta de conversiones`;

  const { text, tokens } = await callOpenAI(apiKey, STRATEGIST_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.4 });
  return { type: 'strategist', content: text, timestamp: agentTimestamp(), tokens };
}
