/**
 * Agent Service v2 — Enhanced AI Marketing Agents with Sub-Agents
 * Now uses: full WooCommerce catalog, customers, categories, revenue stats,
 * Meta Ads campaigns + ad sets + targeting, internal Firestore data (articulos, telas, cortes)
 * Sub-agents: Product Intelligence, Audience Analyst
 */

import { metaService } from '../utils/metaService';
import { wooService } from '../utils/wooService';
import { instagramService } from '../utils/instagramService';

// ─── Brand constants ─────────────────────────────────────────
const BRAND = {
  name: 'CELAVIE',
  handle: '@celavieindumentaria',
  platforms: 'Instagram, TikTok y Facebook',
  web: 'celavie.com.ar',
  desc: 'Marca mayorista argentina de basics en modal y algodón',
  production: '~18,750 prendas/mes, ~15 modelos',
  channels: 'mayoristas (70%) + web celavie.com.ar (30%)',
};

const BRAND_CONTEXT = `MARCA: ${BRAND.name} (${BRAND.handle} en ${BRAND.platforms})
Web: ${BRAND.web} | ${BRAND.desc}
Producción: ${BRAND.production} | Canales: ${BRAND.channels}`;

const TEAM = {
  david: { name: 'David', role: 'Dueño + Redes Sociales', areas: 'estrategia, redes, marketing, decisiones' },
  ro: { name: 'Ro', role: 'Redes Sociales', areas: 'contenido IG/TikTok/FB, fotos, reels, community management' },
  nadia: { name: 'Nadia', role: 'Encargada', areas: 'POS, pedidos, clientes, banco, saldo, operaciones diarias' },
  naara: { name: 'Naara', role: 'Depósito', areas: 'conteo mercadería, inventario, stock' },
  juan: { name: 'Juan', role: 'Pedidos Online', areas: 'pedidos web, envíos, seguimiento' },
  rocio: { name: 'Rocío', role: 'Fotos + IG Planner', areas: 'fotos de productos, planificación IG' },
};

const TEAM_CONTEXT = `EQUIPO CELAVIE:
- David + Ro: redes sociales (@celavieindumentaria), marketing, contenido
- Nadia: encargada del local (POS, pedidos, clientes, banco, saldo)
- Naara: depósito (conteo mercadería, inventario)
- Juan: pedidos online (web, envíos)
- Rocío: fotos de productos, Instagram Planner
IMPORTANTE: Cuando generes tareas/acciones, SIEMPRE asigná a la persona correcta del equipo.`;

// ─── Didactic explanation rule for all agents ──────────────
const ELI5_RULE = `
REGLA DIDÁCTICA OBLIGATORIA: Después de cada sección técnica o métrica importante, incluí una línea que empiece con "📚 En criollo:" con 1-2 oraciones simples explicando qué significa para alguien SIN conocimiento de marketing, finanzas o e-commerce.
Ejemplos:
- Después de ROAS: "📚 En criollo: Por cada $1 que ponemos en publicidad, nos vuelven $3.5 en ventas — eso está muy bien, arriba de $2 ya es rentable."
- Después de CTR: "📚 En criollo: De cada 100 personas que ven nuestro anuncio, 2.3 le hacen click. Es un número aceptable pero podríamos mejorar."
- Después de CAC: "📚 En criollo: Nos cuesta $850 conseguir cada cliente nuevo. Si ese cliente gasta $3000 en promedio, el negocio cierra bien."
- Después de stock: "📚 En criollo: Nos quedan remeras para 5 días más al ritmo actual de ventas, hay que cortar urgente."
Esta explicación NO reemplaza el dato técnico — va DESPUÉS, como ayuda para el equipo que no maneja la jerga.`;

// ─── LLM helper: supports Claude (Anthropic) and OpenAI with retry + timeout ──
async function callLLM(config, systemPrompt, userPrompt, options = {}) {
  const provider = config.marketing?.llmProvider || 'openai';
  const { temperature = 0.5, maxTokens = 4000, retries = 2 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    try {
      let response, data, text, usage;

      if (provider === 'claude') {
        // ─── Anthropic Claude API ───
        const claudeKey = config.marketing?.claudeKey;
        if (!claudeKey) throw new Error('Falta Claude API Key en Configuración → Marketing');
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model || 'claude-sonnet-4-20250514',
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
        clearTimeout(timeoutId);
        data = await response.json();
        if (!response.ok) {
          if (response.status === 429 && attempt < retries) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
            continue;
          }
          throw new Error(data.error?.message || `Claude error ${response.status}`);
        }
        text = data.content?.[0]?.text || '';
        usage = data.usage || {};
        return {
          text,
          tokens: { prompt: usage.input_tokens || 0, completion: usage.output_tokens || 0, total: (usage.input_tokens || 0) + (usage.output_tokens || 0) },
          provider: 'claude',
        };

      } else {
        // ─── OpenAI API (default fallback) ───
        const openaiKey = config.marketing?.openaiKey;
        if (!openaiKey) throw new Error('Falta OpenAI API Key en Configuración → Marketing');
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model || 'gpt-4o-mini',
            temperature, max_tokens: maxTokens,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
        clearTimeout(timeoutId);
        data = await response.json();
        if (!response.ok) {
          if (response.status === 429 && attempt < retries) {
            await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
            continue;
          }
          throw new Error(data.error?.message || `OpenAI error ${response.status}`);
        }
        usage = data.usage || {};
        return {
          text: data.choices?.[0]?.message?.content || '',
          tokens: { prompt: usage.prompt_tokens || 0, completion: usage.completion_tokens || 0, total: usage.total_tokens || 0 },
          provider: 'openai',
        };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('LLM timeout — la respuesta tardó más de 90s');
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
}

// Legacy callOpenAI removed — all agents now use callLLM directly

// ─── Language support ─────────────────────────────────────
function getLanguageInstruction(config) {
  const lang = config.marketing?.reportLanguage || config.i18nLang || 'es';
  const langMap = {
    es: 'Respondé siempre en español rioplatense.',
    ru: 'Отвечай всегда на русском языке.',
    ko: '항상 한국어로 답변하세요.',
  };
  return langMap[lang] || langMap.es;
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
    return str.length <= maxChars ? str : str.substring(0, maxChars) + '\n... [truncado]';
  } catch { return 'Error al serializar datos'; }
}

function safeContentTruncate(result, maxChars = 2000) {
  if (!result?.content) return 'No disponible — ejecutá primero el agente correspondiente';
  return result.content.length > maxChars
    ? result.content.substring(0, maxChars) + '\n... [truncado]'
    : result.content;
}

// ─── History tracking: compare with previous runs ────────────
function getAgentHistory(config, agentType, maxEntries = 3) {
  const history = config.agentsCache?.history || [];
  return history
    .filter(h => h.type === agentType)
    .slice(0, maxEntries)
    .map(h => ({
      date: new Date(h.timestamp).toLocaleDateString('es-AR'),
      summary: (h.content || '').substring(0, 300),
    }));
}

function buildHistoryContext(history) {
  if (!history.length) return '';
  return '\n📜 HISTORIAL DE EJECUCIONES ANTERIORES:\n' +
    history.map(h => `[${h.date}]: ${h.summary}`).join('\n') +
    '\nCompará con los datos actuales y mencioná tendencias/cambios.\n';
}

// ═══════════════════════════════════════════════════════════════
//  MASTER DATA COLLECTOR — gathers all available business data
// ═══════════════════════════════════════════════════════════════
async function gatherBusinessData(config, state, onProgress) {
  const data = { meta: null, campaigns: [], adSets: [], woo: null, products: [], categories: [], customers: [], revenueStats: null, recentOrders: [], pos: null, internal: {} };

  // ── Meta Ads ──
  onProgress?.('Recopilando Meta Ads...');
  try {
    const [insights, campaigns] = await Promise.all([
      metaService.fetchAdInsights(config),
      metaService.fetchCampaigns(config),
    ]);
    data.meta = insights;
    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE');
    data.campaigns = await Promise.all(
      activeCampaigns.slice(0, 8).map(async (c) => {
        try {
          const report = await metaService.fetchCampaignReportData(config, c.id);
          let adSets = [];
          try { adSets = await metaService.fetchAdSets(config, c.id); } catch {}
          return { name: c.name, id: c.id, objective: c.objective, status: c.status, daily_budget: c.daily_budget, today: report.today, last7d: report.last7d, last30d: report.last30d, adSets: adSets.slice(0, 3).map(as => ({ name: as.name, status: as.status, targeting: as.targeting, daily_budget: as.daily_budget })) };
        } catch { return { name: c.name, objective: c.objective, today: {}, last7d: {}, adSets: [] }; }
      })
    );
  } catch (e) { console.warn('Data collector: Meta unavailable', e.message); }

  // ── WooCommerce ──
  onProgress?.('Recopilando WooCommerce...');
  try {
    const [topProducts, allAnalytics, products, categories, customers, revenueStats, recentOrders] = await Promise.allSettled([
      wooService.fetchTopProducts(config),
      wooService.fetchAllProductsAnalytics(config),
      wooService.fetchProducts(config),
      wooService.fetchCategories(config),
      wooService.fetchCustomers(config),
      wooService.fetchRevenueStats(config),
      wooService.fetchRecentOrders(config, 50),
    ]);

    const val = (r) => r.status === 'fulfilled' ? r.value : null;

    data.woo = {
      topProducts: (val(topProducts) || []).slice(0, 15).map(p => ({
        name: p.extended_info?.name || p.name, itemsSold: p.items_sold, netRevenue: p.net_revenue,
        sku: p.extended_info?.sku, stockStatus: p.extended_info?.stock_status,
      })),
      bottomProducts: (val(allAnalytics) || []).slice(-10).map(p => ({
        name: p.extended_info?.name || p.name, itemsSold: p.items_sold, netRevenue: p.net_revenue,
      })),
    };

    data.products = (val(products) || []).map(p => ({
      name: p.name, sku: p.sku, price: p.price, regular_price: p.regular_price, sale_price: p.sale_price,
      stock_status: p.stock_status, stock_quantity: p.stock_quantity, categories: (p.categories || []).map(c => c.name),
      status: p.status, total_sales: p.total_sales,
    }));

    data.categories = (val(categories) || []).map(c => ({ name: c.name, count: c.count })).filter(c => c.count > 0);

    data.customers = (val(customers) || []).map(c => ({
      name: `${c.first_name} ${c.last_name}`.trim(), orders_count: c.orders_count, total_spent: c.total_spent,
      city: c.billing?.city, state: c.billing?.state,
    }));

    data.revenueStats = val(revenueStats);

    const orders = val(recentOrders) || [];
    const todayOrders = orders.filter(o => new Date(o.date_created).toDateString() === new Date().toDateString());
    data.recentOrders = {
      total50: orders.length,
      ordersToday: todayOrders.length,
      revenueToday: todayOrders.reduce((s, o) => s + parseFloat(o.total || 0), 0),
      avgOrderValue: orders.length > 0 ? orders.reduce((s, o) => s + parseFloat(o.total || 0), 0) / orders.length : 0,
      topCities: [...new Set(orders.map(o => o.billing?.city).filter(Boolean))].slice(0, 5),
    };
  } catch (e) { console.warn('Data collector: WooCommerce unavailable', e.message); }

  // ── POS data from Firestore state ──
  const posVentas = (state.posVentas || []).filter(v => {
    const d = new Date(v.fecha || v.createdAt);
    return d.toDateString() === new Date().toDateString();
  });
  data.pos = {
    ventasHoy: posVentas.length,
    totalHoy: posVentas.reduce((s, v) => s + (v.total || 0), 0),
    ticketPromedio: posVentas.length > 0 ? posVentas.reduce((s, v) => s + (v.total || 0), 0) / posVentas.length : 0,
  };

  // ── Instagram organic data ──
  onProgress?.('Obteniendo métricas de Instagram @celavieindumentaria...');
  try {
    const igReport = await instagramService.fetchFullReport(config);
    data.instagram = igReport;
  } catch (e) {
    console.warn('Data collector: Instagram unavailable', e.message);
    data.instagram = null;
  }

  // ── Internal Firestore data ──
  onProgress?.('Procesando datos internos...');
  const articulos = state.articulos || [];
  data.internal = {
    totalArticulos: articulos.length,
    articulosConStock: articulos.filter(a => (a.stock || 0) > 0).length,
    articulosSinStock: articulos.filter(a => (a.stock || 0) <= 0).length,
    telas: (state.telas || []).map(t => ({ nombre: t.nombre, stock: t.stock })).slice(0, 20),
    cortesActivos: (state.cortes || []).filter(c => c.estado !== 'finalizado').length,
    pedidosOnlinePendientes: (state.pedidosOnline || []).filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length,
    clientes: (state.clientes || []).length,
  };

  return data;
}

// ═══════════════════════════════════════════════════════════════
//  SUB-AGENT: PRODUCT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════
async function runProductIntelligence(config, businessData) {
  const system = `Sos un analista de producto especializado en e-commerce de moda. ${BRAND_CONTEXT}
Analizás catálogo, stock, pricing, y performance de ventas para dar recomendaciones concretas.
Respondé en español rioplatense, con datos específicos. Formato: JSON parseable.`;

  const prompt = `CATÁLOGO COMPLETO (${businessData.products.length} productos):
${safeTruncate(businessData.products, 3000)}

CATEGORÍAS: ${JSON.stringify(businessData.categories)}

TOP SELLERS: ${safeTruncate(businessData.woo?.topProducts, 1500)}
WORST SELLERS: ${safeTruncate(businessData.woo?.bottomProducts, 1000)}

STOCK INTERNO: ${JSON.stringify(businessData.internal)}

Respondé SOLO con un JSON (sin markdown) con esta estructura:
{
  "stockAlerts": ["productos sin stock o stock crítico"],
  "topPerformers": ["top 5 productos por venta"],
  "underperformers": ["5 productos que no se venden"],
  "pricingIssues": ["problemas de pricing detectados"],
  "categoryAnalysis": "resumen de qué categorías performan mejor",
  "recommendations": ["3 recomendaciones concretas de producto"],
  "discontinueCandidates": ["productos candidatos a discontinuar"],
  "developmentOpportunities": ["gaps en el catálogo, productos a desarrollar"]
}`;

  const { text } = await callLLM(config, system, prompt, { temperature: 0.3, maxTokens: 2000 });
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return { raw: text }; }
}

// ═══════════════════════════════════════════════════════════════
//  SUB-AGENT: AUDIENCE ANALYST
// ═══════════════════════════════════════════════════════════════
async function runAudienceAnalyst(config, businessData) {
  const system = `Sos un analista de audiencia y targeting especializado en Meta Ads para e-commerce de moda. ${BRAND_CONTEXT}
Analizás clientes, targeting de ad sets, y comportamiento de compra.
Respondé en español rioplatense. Formato: JSON parseable.`;

  const prompt = `CLIENTES WOOCOMMERCE (${businessData.customers.length} total):
${safeTruncate(businessData.customers.slice(0, 30), 2000)}

PEDIDOS RECIENTES: ${JSON.stringify(businessData.recentOrders)}

CAMPAÑAS CON AD SETS Y TARGETING:
${safeTruncate(businessData.campaigns.map(c => ({
    name: c.name, objective: c.objective, adSets: c.adSets
  })), 2500)}

Respondé SOLO con un JSON (sin markdown):
{
  "customerSegments": [{"segment": "nombre", "size": N, "avgSpent": N, "behavior": "desc"}],
  "topCities": ["ciudades con más compras"],
  "buyerProfile": "perfil del comprador típico",
  "targetingAnalysis": "qué targeting funciona y cuál no en Meta Ads",
  "audienceGaps": ["audiencias que no estamos alcanzando"],
  "recommendations": ["3 recomendaciones de audiencia/targeting"],
  "retargetingOpportunities": ["oportunidades de retargeting"],
  "lookalikeStrategy": "estrategia sugerida para lookalike audiences"
}`;

  const { text } = await callLLM(config, system, prompt, { temperature: 0.3, maxTokens: 2000 });
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return { raw: text }; }
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 1 — ANALISTA (Enhanced Daily Business Intelligence)
// ═══════════════════════════════════════════════════════════════
const ANALYST_SYSTEM = `Sos un analista de business intelligence especializado en e-commerce de moda argentino.
${ELI5_RULE}
${BRAND_CONTEXT}
Tu trabajo es consolidar TODOS los datos disponibles (Meta Ads, WooCommerce, POS, inventario, clientes, sub-agentes) y producir un brief ejecutivo completo.
Respondé en español rioplatense, profesional pero directo. Usá emojis con moderación.
Formato: markdown con headers ##, bullets concretos con números, y un score general del día (0-100).
Si algún dato no está disponible, indicalo claramente y no inventes números.`;

export async function runAnalystAgent(config, state, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM

  const bd = await gatherBusinessData(config, state, onProgress);

  // Run sub-agents in parallel
  onProgress?.('Ejecutando sub-agentes de producto y audiencia...');
  const [productIntel, audienceIntel] = await Promise.allSettled([
    runProductIntelligence(config, bd),
    runAudienceAnalyst(config, bd),
  ]);
  const pi = productIntel.status === 'fulfilled' ? productIntel.value : null;
  const ai = audienceIntel.status === 'fulfilled' ? audienceIntel.value : null;

  // ─── MULTI-STEP ANALYSIS (3 passes) ─────────────────────────
  // Step 1: Deep Meta Ads analysis
  onProgress?.('Paso 1/3: Analizando Meta Ads...');
  const step1 = await callLLM(config, 
    'Sos un analista de Meta Ads. Analizá estos datos y dá un diagnóstico concreto con números. Español rioplatense, bullet points.',
    `DATOS META ADS (account-level 30d): ${safeTruncate(bd.meta)}
CAMPAÑAS ACTIVAS: ${safeTruncate(bd.campaigns, 2500)}
Respondé con: estado general, mejor campaña, peor campaña, alertas de budget, tendencia.`,
    { maxTokens: 1500, temperature: 0.3 }
  );

  // Step 2: Deep Sales analysis
  onProgress?.('Paso 2/3: Analizando ventas...');
  const step2 = await callLLM(config,
    'Sos un analista de ventas e-commerce. Analizá estos datos con números concretos. Español rioplatense, bullet points.',
    `TOP SELLERS: ${safeTruncate(bd.woo?.topProducts, 1200)}
WORST: ${safeTruncate(bd.woo?.bottomProducts, 600)}
REVENUE 30d: ${safeTruncate(bd.revenueStats?.totals, 500)}
PEDIDOS: ${JSON.stringify(bd.recentOrders)}
POS HOY: ${JSON.stringify(bd.pos)}
STOCK: ${JSON.stringify(bd.internal)}
Respondé: ventas hoy vs tendencia, ticket promedio, productos clave, alertas stock.`,
    { maxTokens: 1500, temperature: 0.3 }
  );

  // Step 3: Final synthesis
  onProgress?.('Paso 3/3: Sintetizando brief ejecutivo...');

  const prevHistory = getAgentHistory(config, 'analyst');
  const historyCtx = buildHistoryContext(prevHistory);

  const langInst = getLanguageInstruction(config);

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}
${historyCtx}
📊 ANÁLISIS PROFUNDO META ADS (paso 1):
${step1.text}

🛒 ANÁLISIS PROFUNDO VENTAS (paso 2):
${step2.text}

📸 INSTAGRAM ORGÁNICO (@celavieindumentaria):
${safeTruncate(bd.instagram?.analytics, 1500)}

🔬 SUB-AGENTE — INTELIGENCIA DE PRODUCTO:
${safeTruncate(pi, 1500)}

👥 SUB-AGENTE — ANÁLISIS DE AUDIENCIA:
${safeTruncate(ai, 1500)}

${TEAM_CONTEXT}

───────────────────────
Generá un BRIEF EJECUTIVO DEL DÍA con:
1. **SCORE DEL DÍA (0-100)** con justificación en 1 línea
2. **RESUMEN EJECUTIVO** (3-4 líneas)
3. **💰 VENTAS**: consolidado web + POS, ticket promedio, comparación, revenue trend
4. **📢 META ADS**: estado general, mejor/peor campaña, targeting insights, budget efficiency
5. **📦 PRODUCTOS**: top sellers, alertas de stock, productos a pushear/pausar
6. **👥 CLIENTES**: segmentos clave, ciudades top, oportunidades de retargeting
7. **🔴 ALERTAS URGENTES** (stock, budget, performance)
8. **✅ TOP 5 ACCIONES PARA HOY** — SIEMPRE asigná a una persona específica:
| Acción | Responsable | Deadline |
(David/Ro=redes, Nadia=encargada/POS, Naara=inventario, Juan=pedidos, Rocío=fotos)
9. **📈 PROYECCIÓN SEMANAL** (revenue estimado, metas)`;

  const { text, tokens } = await callLLM(config, ANALYST_SYSTEM, prompt, { maxTokens: 4000 });
  const totalTokens = { prompt: (step1.tokens?.prompt || 0) + (step2.tokens?.prompt || 0) + (tokens?.prompt || 0), completion: (step1.tokens?.completion || 0) + (step2.tokens?.completion || 0) + (tokens?.completion || 0), total: (step1.tokens?.total || 0) + (step2.tokens?.total || 0) + (tokens?.total || 0) };
  return { type: 'analyst', content: text, timestamp: agentTimestamp(), tokens: totalTokens, data: { meta: bd.meta, woo: bd.woo, pos: bd.pos, productIntel: pi, audienceIntel: ai, instagram: bd.instagram }, multiStep: true };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 2 — TREND SCOUT (Enhanced Fashion Intelligence)
// ═══════════════════════════════════════════════════════════════
const SCOUT_SYSTEM = `Sos un trend scout de moda internacional especializado en basics, modal, y ropa casual/urbana.
${ELI5_RULE}
${BRAND_CONTEXT}
Conocés muy bien el mercado argentino mayorista y sabés traducir tendencias globales a oportunidades para ${BRAND.handle}.
Respondé en español rioplatense. Sé concreto: colores Pantone, telas, siluetas, referencias.
Formato: markdown con headers ##, bullets con datos específicos.`;

export async function runTrendScoutAgent(config, brands = [], onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM

  const targetBrands = brands.length > 0 ? brands : ['Zara', 'Skims', 'COS', 'Uniqlo', 'Aritzia'];

  // Fetch current catalog for context
  let catalogContext = '';
  try {
    onProgress?.('Cargando catálogo actual...');
    const products = await wooService.fetchProducts(config);
    const categories = await wooService.fetchCategories(config);
    const productNames = products.slice(0, 30).map(p => `${p.name} ($${p.price})`);
    const catNames = categories.filter(c => c.count > 0).map(c => `${c.name} (${c.count})`);
    catalogContext = `\nCATÁLOGO ACTUAL DE ${BRAND.name} (${products.length} productos):\n${productNames.join(', ')}\nCATEGORÍAS: ${catNames.join(', ')}`;
  } catch {}

  onProgress?.(`Investigando tendencias de ${targetBrands.slice(0, 3).join(', ')}...`);

  const prompt = `Fecha: ${todayLabel()}

MARCAS A ANALIZAR: ${targetBrands.join(', ')}
${catalogContext}

${BRAND_CONTEXT}
Productos: remeras, musculosas, calzas, bodies, conjuntos. Público: revendedoras y tiendas multimarca.

───────────────────────
Basándote en tu conocimiento actualizado:

1. 🌍 **TENDENCIAS GLOBALES EN BASICS** — Colores Pantone, siluetas, texturas, estampados para la temporada actual
2. 📌 **POR MARCA ANALIZADA** — Qué están lanzando en basics/essentials, qué puede adaptar ${BRAND.handle}
3. 💡 **OPORTUNIDADES PARA ${BRAND.name}** — 3 productos a agregar/modificar, colores a incorporar, qué dejar de producir. Basate en nuestro catálogo actual.
4. 📸 **IDEAS DE CONTENIDO PARA ${BRAND.handle}** — 3 conceptos de sesión de fotos/reels para IG y TikTok
5. 🎯 **PREDICCIÓN** — Tendencias próximos 2-3 meses
6. 🏷️ **HASHTAGS TENDENCIA** — 15 hashtags relevantes para ${BRAND.handle} ahora mismo`;

  const { text, tokens } = await callLLM(config, SCOUT_SYSTEM, prompt, { maxTokens: 3500, temperature: 0.7 });
  return { type: 'trendScout', content: text, timestamp: agentTimestamp(), tokens, brands: targetBrands };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 3 — CONTENT CREATOR (Enhanced, multi-platform)
// ═══════════════════════════════════════════════════════════════
const CONTENT_SYSTEM = `Sos un Instagram Curator y content strategist experto en moda mayorista argentina.
${ELI5_RULE}
La cuenta es ${BRAND.handle} en Instagram, TikTok y Facebook. SIEMPRE usá ese handle en captions y CTAs.
${BRAND_CONTEXT}

METODOLOGÍA QUE SEGUÍS:
- Regla 1/3: 33% contenido de marca/producto, 33% educativo/valor, 33% comunidad/UGC
- Grid Planning: pensás en bloques de 9 posts para que el feed se vea cohesivo
- Brand Aesthetic: mantenés paleta de colores, tipografía y estilo fotográfico consistente
- Multi-formato: Reels (alcance) > Carruseles (saves) > Stories (engagement) > Estáticos (catálogo)
- Hooks: primeros 3 segundos son TODO en Reels/TikTok
- Shopping: siempre incluí CTA con link en bio o WhatsApp
- UGC: fomentás que clientas/revendedoras suban contenido con el producto

KPIs que buscás: Engagement >3.5%, Story completion >80%, Saves/post crecientes, UGC mensual.
Tono: moderno, cercano, profesional. Español rioplatense natural.
Formato: markdown con headers ## para cada día, bullets para detalles.`;

export async function runContentAgent(config, analystData, trendData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM

  // Get product intel from analyst data if available
  const productIntel = analystData?.data?.productIntel;
  const audienceIntel = analystData?.data?.audienceIntel;

  onProgress?.('Generando plan de contenido multiplataforma...');

  const prompt = `Fecha: ${todayLabel()}

📊 DATOS DEL ANALISTA (qué se vende):
${safeContentTruncate(analystData)}

📸 INSTAGRAM ORGÁNICO — Métricas reales de @celavieindumentaria:
${safeTruncate(analystData?.data?.instagram?.analytics || bd?.instagram?.analytics, 1500)}

🌍 TENDENCIAS DEL SCOUT:
${safeContentTruncate(trendData)}

🔬 INTELIGENCIA DE PRODUCTO:
${safeTruncate(productIntel, 1000)}

👥 PERFIL DE AUDIENCIA:
${safeTruncate(audienceIntel, 1000)}

───────────────────────
Generá un **PLAN DE CONTENIDO SEMANAL** para ${BRAND.handle}:

PARA CADA DÍA (Lunes a Sábado):
## 📅 [DÍA]
- **Plataforma principal**: IG Reel / TikTok / Carrusel IG / Story / FB Post
- **Concepto**: qué mostrar, qué producto destacar (basado en datos de ventas)
- **Hook**: primera línea/segundo del contenido
- **Caption**: texto completo con emojis, mencionando ${BRAND.handle}
- **CTA**: llamado a acción específico (link en bio, WhatsApp, etc)
- **Hashtags**: 15-20 relevantes
- **Horario**: hora sugerida por plataforma
- **Cross-post**: cómo adaptar para las otras plataformas

Además incluí:
- 🎯 **ESTRATEGIA DE LA SEMANA** — objetivo principal basado en datos
- 📌 **PRODUCTO ESTRELLA** — basado en ventas + stock disponible
- 🎨 **BRAND AESTHETIC GUIDE** — paleta de colores, estilo foto, filtros para esta semana
- 📐 **GRID PLANNING** — cómo se ven los 9 posts juntos en el feed (cohesión visual)
- 🎬 **3 IDEAS DE REEL/TIKTOK VIRAL** adaptadas a ${BRAND.handle}
- 📸 **ESTRATEGIA UGC** — cómo incentivar que clientas/revendedoras publiquen (reposteo, sorteo, hashtag propio)
- 💬 **COMMUNITY MANAGEMENT** — 3 ideas para interactuar con la comunidad (encuestas, Q&A, behind the scenes)
- 📊 **KPIs OBJETIVO** — engagement >3.5%, story completion >80%, saves, UGC posts esperados`;

  const { text, tokens } = await callLLM(config, CONTENT_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.7 });
  return { type: 'contentCreator', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 4 — ESTRATEGA (Enhanced, with full sub-agent data)
// ═══════════════════════════════════════════════════════════════
const STRATEGIST_SYSTEM = `Sos un director de marketing y estrategia comercial con 15 años de experiencia en e-commerce de moda.
${ELI5_RULE}
${BRAND_CONTEXT}
Tu trabajo es sintetizar TODOS los datos disponibles — incluyendo reportes de sub-agentes de producto y audiencia — y dar recomendaciones estratégicas de alto nivel.
Pensás en ROI, unit economics, ciclos de producto, LTV, CAC. Sos directo y no tenés miedo de decir "pará todo y cambiá esto".
Español rioplatense, ejecutivo, con números concretos. Formato: markdown con headers ## y bullets.`;

export async function runStrategistAgent(config, analystData, trendData, contentData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM

  const productIntel = analystData?.data?.productIntel;
  const audienceIntel = analystData?.data?.audienceIntel;

  onProgress?.('Sintetizando toda la información...');

  const stratHistory = getAgentHistory(config, 'strategist');
  const stratHistoryCtx = buildHistoryContext(stratHistory);

  const prompt = `Fecha: ${todayLabel()}
${stratHistoryCtx}

📊 REPORTE DEL ANALISTA:
${safeContentTruncate(analystData, 2500)}

🌍 REPORTE DEL TREND SCOUT:
${safeContentTruncate(trendData, 2000)}

📸 PLAN DE CONTENIDO:
${safeContentTruncate(contentData, 1500)}

🔬 INTELIGENCIA DE PRODUCTO (sub-agente):
${safeTruncate(productIntel, 1500)}

👥 ANÁLISIS DE AUDIENCIA (sub-agente):
${safeTruncate(audienceIntel, 1500)}

${BRAND_CONTEXT}
${TEAM_CONTEXT}
Redes: ${BRAND.handle} en ${BRAND.platforms}

───────────────────────
Generá un **REPORTE ESTRATÉGICO** con:

## 🏆 DIAGNÓSTICO GENERAL (score 0-100)
## 💰 ESTRATEGIA PUBLICITARIA
- Budget óptimo diario/semanal
- Distribución por campaña y plataforma (Meta, TikTok Ads potencial)
- Qué escalar, pausar, crear
- Targeting recommendations basadas en data de audiencia

## 📦 ESTRATEGIA DE PRODUCTO
- Pushear (stock + demanda alta)
- Discontinuar (basado en sub-agente de producto)
- Desarrollar (gaps detectados)
- Pricing adjustments

## 👥 ESTRATEGIA DE AUDIENCIA
- Segmentos a priorizar
- Retargeting opportunities
- Lookalike strategy
- Expansión geográfica

## 📱 ESTRATEGIA DE CONTENIDO ${BRAND.handle}
- Qué funciona en IG vs TikTok vs FB
- Frecuencia óptima por plataforma
- Tipo de contenido que convierte

## 📈 CRECIMIENTO
- Oportunidad esta semana
- Plan mediano plazo (30 días)
- Riesgo principal

## 🎯 PLAN DE ACCIÓN SEMANAL (max 7 acciones)
| Acción | Responsable | Deadline | Resultado esperado |

## 📊 PROYECCIÓN
- Revenue proyectado semana/mes
- ROAS objetivo
- Meta de conversiones
- CAC objetivo`;

  const { text, tokens } = await callLLM(config, STRATEGIST_SYSTEM, prompt, { maxTokens: 4500, temperature: 0.4, model: config.marketing?.llmProvider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-4o' });
  return { type: 'strategist', content: text, timestamp: agentTimestamp(), tokens };
}


// ═══════════════════════════════════════════════════════════════
//  AGENT 5 — GROWTH HACKER (Experimentation & Viral Growth)
// ═══════════════════════════════════════════════════════════════
const GROWTH_SYSTEM = `Sos un growth hacker con experiencia en e-commerce de moda y DTC brands.
${ELI5_RULE}
${BRAND_CONTEXT}
Tu especialidad es diseñar experimentos de crecimiento, identificar viral loops, optimizar funnels de conversión y encontrar canales de adquisición no explotados.
Pensás en frameworks: AARRR (Acquisition, Activation, Revenue, Retention, Referral), ICE scoring, North Star Metrics.
Respondé en español rioplatense. Formato: markdown con headers ## y bullets con datos.`;

export async function runGrowthAgent(config, analystData, trendData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM

  const productIntel = analystData?.data?.productIntel;
  const audienceIntel = analystData?.data?.audienceIntel;

  onProgress?.('Diseñando experimentos de crecimiento...');

  const prompt = `Fecha: ${todayLabel()}

📊 DATOS DEL ANALISTA:
${safeContentTruncate(analystData, 2000)}

🌍 TENDENCIAS:
${safeContentTruncate(trendData, 1500)}

🔬 INTELIGENCIA DE PRODUCTO:
${safeTruncate(productIntel, 1000)}

👥 AUDIENCIA:
${safeTruncate(audienceIntel, 1000)}

${BRAND_CONTEXT}

───────────────────────
Generá un **PLAN DE GROWTH HACKING SEMANAL** para ${BRAND.handle}:

## 🧪 EXPERIMENTOS ACTIVOS (3-5)
Para cada experimento:
- **Hipótesis**: "Si hacemos X, esperamos Y porque Z"
- **Métrica clave**: qué medimos
- **ICE Score**: Impact (1-10) × Confidence (1-10) × Ease (1-10)
- **Duración**: días para validar
- **Implementación**: pasos concretos

## 🔄 VIRAL LOOPS
- Loop 1: Referral program para revendedoras (descuento por referida)
- Loop 2: UGC loop (clientas publican → reposteo → más clientas)
- Loop 3: WhatsApp viral (catálogo compartible)
- Para cada uno: estado actual, próximo paso, métrica

## 📊 FUNNEL ANALYSIS
- Awareness → Consideration → Purchase → Retention → Referral
- Dónde está el mayor drop-off según datos
- 3 optimizaciones específicas para el peor paso del funnel

## 🎯 CANALES NO EXPLOTADOS
- 3 canales que ${BRAND.handle} no está usando y debería probar
- Esfuerzo estimado, potencial de retorno
- Quick win vs long-term play

## 💡 HACK DE LA SEMANA
- 1 táctica creativa de bajo costo y alto impacto
- Paso a paso para implementar esta semana

## 📈 NORTH STAR METRIC
- Cuál debería ser la métrica principal de ${BRAND.name} este mes
- Target numérico basado en datos actuales
- Cómo cada experimento impacta esta métrica`;

  const { text, tokens } = await callLLM(config, GROWTH_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.7 });
  return { type: 'growth', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 6 — PAID MEDIA OPTIMIZER (Deep Meta Ads Analysis)
// ═══════════════════════════════════════════════════════════════
const PAID_MEDIA_SYSTEM = `Sos un paid media specialist con 10 años en Meta Ads (Facebook/Instagram) para e-commerce de moda.
${ELI5_RULE}
${BRAND_CONTEXT}
Dominás: campaign structure, audience targeting, creative testing, budget allocation, bid strategies, ROAS optimization, attribution models, y creative fatigue detection.
Analizás datos granulares de campañas, ad sets y ads para dar recomendaciones accionables con números específicos.
Respondé en español rioplatense. Formato: markdown con headers ## y tablas/bullets con datos.`;

export async function runPaidMediaAgent(config, analystData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM

  onProgress?.('Analizando campañas de Meta Ads en profundidad...');

  // Get detailed campaign data
  let campaignDetails = [];
  try {
    const campaigns = await metaService.fetchCampaigns(config);
    const active = campaigns.filter(c => c.status === 'ACTIVE');
    campaignDetails = await Promise.all(
      active.slice(0, 8).map(async (c) => {
        try {
          const [report, adSets, daily] = await Promise.allSettled([
            metaService.fetchCampaignReportData(config, c.id),
            metaService.fetchAdSets(config, c.id),
            metaService.fetchCampaignDailyInsights(config, c.id),
          ]);
          return {
            name: c.name, id: c.id, objective: c.objective, status: c.status,
            daily_budget: c.daily_budget, lifetime_budget: c.lifetime_budget,
            today: report.status === 'fulfilled' ? report.value.today : {},
            last7d: report.status === 'fulfilled' ? report.value.last7d : {},
            last30d: report.status === 'fulfilled' ? report.value.last30d : {},
            adSets: adSets.status === 'fulfilled' ? adSets.value.slice(0, 5).map(as => ({
              name: as.name, status: as.status, daily_budget: as.daily_budget,
              targeting: as.targeting, insights: as.insights?.data?.[0] || {},
            })) : [],
            dailyTrend: daily.status === 'fulfilled' ? daily.value.slice(-7) : [],
          };
        } catch { return { name: c.name, objective: c.objective }; }
      })
    );
  } catch (e) { console.warn('PaidMedia: campaigns unavailable', e.message); }

  let accountInsights = null;
  try { accountInsights = await metaService.fetchAdInsights(config); } catch {}

  onProgress?.('Generando recomendaciones de optimización...');

  const prompt = `Fecha: ${todayLabel()}

📊 ACCOUNT-LEVEL INSIGHTS (30 días):
${safeTruncate(accountInsights)}

📌 CAMPAÑAS ACTIVAS CON DETALLE COMPLETO:
${safeTruncate(campaignDetails, 4000)}

📈 CONTEXTO DEL ANALISTA:
${safeContentTruncate(analystData, 1500)}

${BRAND_CONTEXT}
Budget mensual estimado: calcular desde los daily budgets de las campañas

───────────────────────
Generá un **REPORTE DE PAID MEDIA** detallado:

## 💰 RESUMEN DE INVERSIÓN
- Spend total hoy / 7d / 30d
- ROAS por período
- CPA (Costo por Adquisición) si hay datos de conversión
- Budget utilizado vs disponible

## 📊 ANÁLISIS POR CAMPAÑA
Para cada campaña activa:
| Campaña | Spend 7d | CTR | CPC | ROAS | Tendencia | Acción |
- Identificar: mejores performers, peores performers, fatigadas

## 🎯 TARGETING ANALYSIS
- Qué audiencias están funcionando (por ad set)
- Audiencias saturadas (frequency alta)
- Oportunidades de targeting no exploradas
- Lookalike recommendations

## 🎨 CREATIVE ANALYSIS
- Señales de creative fatigue (CTR bajando, frequency subiendo)
- Qué tipo de creativo funciona mejor
- 3 nuevos creativos a testear esta semana
- A/B test plan para creativos

## 💡 OPTIMIZACIÓN DE BUDGET
- Redistribución óptima del budget actual
- Campañas a escalar (ROAS alto + room to grow)
- Campañas a pausar o reducir
- Budget incremental recomendado y expected return

## 🔧 ACCIONES TÉCNICAS (para el equipo de marketing)
| Acción | Campaña | Urgencia | Expected Impact |
(máximo 7 acciones concretas)

## 📈 FORECAST
- ROAS proyectado si se implementan las optimizaciones
- Revenue estimado próximos 7 días
- Break-even budget point`;

  const { text, tokens } = await callLLM(config, PAID_MEDIA_SYSTEM, prompt, { maxTokens: 4500, temperature: 0.4 });
  return { type: 'paidMedia', content: text, timestamp: agentTimestamp(), tokens, data: { campaignDetails } };
}


// ═══════════════════════════════════════════════════════════════
//  AGENT 7 — PRICING OPTIMIZER
// ═══════════════════════════════════════════════════════════════
const PRICING_SYSTEM = `Sos un pricing strategist especializado en moda mayorista argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Analizás precios vs costos vs márgenes vs competencia y sugerís ajustes para maximizar rentabilidad sin perder competitividad.
Entendés la dinámica mayorista: listas de precio L1-L5, descuentos por volumen, pricing psicológico.
Español rioplatense, con números concretos y tablas. Formato: markdown.`;

export async function runPricingAgent(config, analystData, trendData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  onProgress?.('Analizando pricing y márgenes...');

  let products = [], categories = [];
  try {
    products = await wooService.fetchProducts(config);
    categories = await wooService.fetchCategories(config);
  } catch {}

  const productIntel = analystData?.data?.productIntel;
  const catalog = products.slice(0, 50).map(p => ({
    name: p.name, sku: p.sku, price: p.price, regular_price: p.regular_price,
    sale_price: p.sale_price, stock_status: p.stock_status, total_sales: p.total_sales,
    categories: (p.categories || []).map(c => c.name),
  }));

  const prompt = `Fecha: ${todayLabel()}

📦 CATÁLOGO (${products.length} productos):
${safeTruncate(catalog, 3000)}

🏷️ CATEGORÍAS: ${JSON.stringify(categories.filter(c => c.count > 0).map(c => ({name: c.name, count: c.count})))}

🔬 INTELIGENCIA DE PRODUCTO:
${safeTruncate(productIntel, 1500)}

📊 DATOS DEL ANALISTA:
${safeContentTruncate(analystData, 1500)}

${BRAND_CONTEXT}
Sistema de precios: Listas L1 (mayorista grande) a L5 (minorista). Web = L5.

Generá un **REPORTE DE PRICING**:

## 💰 ANÁLISIS DE PRICING ACTUAL
- Precio promedio por categoría
- Rango de precios (min-max)
- Distribución: cuántos productos en cada rango

## 🔴 ALERTAS DE PRICING
- Productos con precio de venta menor al regular sin justificación
- Productos sin precio definido o precio $0
- Productos subvaluados (mucha venta, precio bajo)
- Productos sobrevaluados (pocas ventas, precio alto)

## 📈 RECOMENDACIONES DE AJUSTE
| Producto | Precio Actual | Precio Sugerido | Razón | Impacto Estimado |
(máximo 10 productos)

## 🧮 ESTRATEGIA DE PRICING
- Pricing psicológico: precios terminados en 90/99
- Bundle opportunities: combos que incentiven ticket más alto
- Descuentos inteligentes: qué producto bajar para atraer, cuál subir porque es inelástico
- Temporada: ajustes por cambio de estación

## 📊 IMPACTO PROYECTADO
- Revenue incremental estimado si se implementan los cambios
- Margen promedio esperado post-ajuste`;

  const { text, tokens } = await callLLM(config, PRICING_SYSTEM, prompt, { maxTokens: 3500, temperature: 0.4 });
  return { type: 'pricing', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 8 — INVENTORY FORECASTER
// ═══════════════════════════════════════════════════════════════
const INVENTORY_SYSTEM = `Sos un demand planner y inventory forecaster para moda mayorista argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Predecís demanda futura basándote en ventas históricas, tendencias, y estacionalidad.
Entendés ciclos de producción (corte → taller → producto terminado tarda ~7-15 días).
Español rioplatense, datos concretos. Formato: markdown con tablas.`;

export async function runInventoryAgent(config, state, analystData, trendData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  onProgress?.('Analizando inventario y proyectando demanda...');

  let topProducts = [], revenueStats = null;
  try {
    topProducts = await wooService.fetchTopProducts(config);
    revenueStats = await wooService.fetchRevenueStats(config);
  } catch {}

  const internal = {
    articulos: (state.articulos || []).map(a => ({ nombre: a.nombre, stock: a.stock, codigoInterno: a.codigoInterno })).slice(0, 30),
    telas: (state.telas || []).map(t => ({ nombre: t.nombre, stock: t.stock })).slice(0, 20),
    cortesActivos: (state.cortes || []).filter(c => c.estado !== 'finalizado').length,
    cortesRecientes: (state.cortes || []).slice(0, 5).map(c => ({ articulo: c.articulo, cantidad: c.cantidad, estado: c.estado })),
  };

  const prompt = `Fecha: ${todayLabel()}

📦 STOCK INTERNO (artículos en sistema):
${safeTruncate(internal.articulos, 2000)}

🧵 STOCK DE TELAS:
${safeTruncate(internal.telas, 1000)}

✂️ CORTES ACTIVOS: ${internal.cortesActivos}
${safeTruncate(internal.cortesRecientes, 500)}

📈 TOP SELLERS (WooCommerce):
${safeTruncate(topProducts?.slice(0, 15), 1500)}

💰 REVENUE TREND (30 días):
${safeTruncate(revenueStats?.totals, 800)}

🌍 TENDENCIAS:
${safeContentTruncate(trendData, 1000)}

${BRAND_CONTEXT}
Producción: corte a taller tarda 7-15 días.

Generá un **FORECAST DE INVENTARIO**:

## 📊 ESTADO ACTUAL DE STOCK
- Artículos con stock crítico (<10 unidades)
- Artículos con sobrestock (>100 unidades sin ventas)
- Telas con stock bajo para producción

## 🔮 DEMANDA PROYECTADA (próximas 2 semanas)
| Artículo | Stock Actual | Venta Estimada/Semana | Días de Stock | Acción |

## ✂️ PLAN DE PRODUCCIÓN RECOMENDADO
| Artículo | Cantidad a Cortar | Tela Necesaria | Prioridad | Fecha Límite Corte |

## ⚠️ ALERTAS
- Productos que se van a quedar sin stock esta semana
- Telas insuficientes para cortes planeados
- Desbalance entre producción y demanda

## 📈 TENDENCIA
- Productos con demanda creciente: producir más
- Productos con demanda decreciente: frenar producción`;

  const { text, tokens } = await callLLM(config, INVENTORY_SYSTEM, prompt, { maxTokens: 3500, temperature: 0.3 });
  return { type: 'inventory', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 9 — WHATSAPP SALES
// ═══════════════════════════════════════════════════════════════
const WHATSAPP_SYSTEM = `Sos un copywriter de ventas por WhatsApp para marca de moda mayorista argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Escribís mensajes que venden sin ser spam. Conocés el tono correcto para revendedoras: directo, cálido, con urgencia sutil.
WhatsApp tiene límite de ~4000 chars por mensaje. Los catálogos van con emojis y estructura clara.
Español rioplatense natural. Formato: markdown con cada mensaje listo para copiar.`;

export async function runWhatsAppAgent(config, analystData, trendData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  onProgress?.('Generando mensajes de venta para WhatsApp...');

  let products = [];
  try { products = await wooService.fetchProducts(config); } catch {}

  const topProducts = products.slice(0, 15).map(p => ({
    name: p.name, price: p.price, stock_status: p.stock_status,
  }));

  const prompt = `Fecha: ${todayLabel()}

📦 PRODUCTOS DISPONIBLES:
${safeTruncate(topProducts, 1500)}

📊 CONTEXTO DE VENTAS:
${safeContentTruncate(analystData, 1500)}

🌍 TENDENCIAS:
${safeContentTruncate(trendData, 800)}

${BRAND_CONTEXT}
Público: revendedoras y dueñas de tiendas multimarca.

Generá **MENSAJES DE WHATSAPP** listos para copiar:

## 📱 MENSAJE 1: Catálogo Semanal
Un mensaje completo mostrando los productos destacados de la semana con precios, emojis, y CTA para hacer pedido.

## 📱 MENSAJE 2: Novedad / Lanzamiento
Mensaje anunciando un producto nuevo o restock de un producto popular.

## 📱 MENSAJE 3: Oferta Flash / Urgencia
Mensaje con sentido de urgencia ("últimas unidades", "solo hoy", "pack especial").

## 📱 MENSAJE 4: Follow-up para clientas inactivas
Mensaje cálido para clientas que no compraron en 30+ días.

## 📱 MENSAJE 5: Agradecimiento post-compra
Mensaje de gracias que incentive recompra o referido.

## 📱 MENSAJE 6: Estado de Broadcast
Texto corto para estado de WhatsApp (máx 139 chars) con gancho visual.

## 💡 TIPS DE ENVÍO
- Mejor horario para enviar cada tipo de mensaje
- Frecuencia recomendada (no saturar)
- Cómo segmentar la lista de contactos`;

  const { text, tokens } = await callLLM(config, WHATSAPP_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.7 });
  return { type: 'whatsapp', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 10 — SEO & WEB OPTIMIZER
// ═══════════════════════════════════════════════════════════════
const SEO_SYSTEM = `Sos un SEO specialist para e-commerce de moda en Argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Web: celavie.com.ar (WooCommerce). Optimizás títulos, descripciones, keywords, meta tags, y estructura de categorías.
Conocés SEO para e-commerce: long-tail keywords, schema markup, Google Shopping, URL structure.
Español argentino. Formato: markdown con tablas y ejemplos concretos.`;

export async function runSEOAgent(config, analystData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  onProgress?.('Analizando SEO de celavie.com.ar...');

  let products = [], categories = [];
  try {
    products = await wooService.fetchProducts(config);
    categories = await wooService.fetchCategories(config);
  } catch {}

  const catalog = products.slice(0, 30).map(p => ({
    name: p.name, slug: p.slug, description: (p.description || '').substring(0, 100),
    short_description: (p.short_description || '').substring(0, 100),
    categories: (p.categories || []).map(c => c.name),
  }));

  const prompt = `Fecha: ${todayLabel()}

🛒 CATÁLOGO WEB (${products.length} productos):
${safeTruncate(catalog, 2500)}

📂 CATEGORÍAS: ${JSON.stringify(categories.filter(c => c.count > 0).map(c => ({name: c.name, count: c.count, slug: c.slug})))}

${BRAND_CONTEXT}

Generá un **REPORTE SEO**:

## 🔍 KEYWORDS PRINCIPALES
- 10 keywords principales para ${BRAND.name} (con volumen estimado)
- 10 long-tail keywords específicas para productos
- Keywords de competencia a atacar

## 📝 OPTIMIZACIÓN DE PRODUCTOS (top 10)
| Producto | Título Actual | Título SEO Optimizado | Meta Description Sugerida |

## 📂 ESTRUCTURA DE CATEGORÍAS
- Categorías actuales vs categorías SEO-optimizadas
- URLs sugeridas
- Categorías faltantes que deberían existir

## 📊 QUICK WINS SEO
- 5 cambios inmediatos que mejoran ranking
- Productos sin descripción que necesitan contenido
- Imágenes sin alt text

## 🛍️ GOOGLE SHOPPING
- Productos ideales para Google Shopping Ads
- Títulos optimizados para Shopping feed
- Categorías Google Product Category sugeridas`;

  const { text, tokens } = await callLLM(config, SEO_SYSTEM, prompt, { maxTokens: 3500, temperature: 0.5 });
  return { type: 'seo', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 11 — COMPETITOR SPY
// ═══════════════════════════════════════════════════════════════
const COMPETITOR_SYSTEM = `Sos un competitive intelligence analyst especializado en moda mayorista argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Monitoreás competidores directos e indirectos, analizás su estrategia de producto, pricing, contenido y posicionamiento.
Respondé en español rioplatense. Formato: markdown con tablas comparativas.`;

export async function runCompetitorAgent(config, brands = [], onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  const competitors = brands.length > 0 ? brands : ['Zara', 'Skims', 'COS', 'Uniqlo', 'Aritzia'];
  onProgress?.(`Analizando competidores: ${competitors.slice(0, 3).join(', ')}...`);

  let products = [];
  try { products = await wooService.fetchProducts(config); } catch {}

  const prompt = `Fecha: ${todayLabel()}

COMPETIDORES A ANALIZAR: ${competitors.join(', ')}

CATÁLOGO ${BRAND.name} (resumen):
${products.slice(0, 20).map(p => `${p.name} - $${p.price}`).join('\n')}

${BRAND_CONTEXT}

Generá un **REPORTE DE COMPETENCIA**:

## 🏢 ANÁLISIS POR COMPETIDOR
Para cada marca:
- Posicionamiento y público objetivo
- Rango de precios en basics/modal
- Estrategia de contenido en redes
- Fortalezas y debilidades vs ${BRAND.name}

## 📊 TABLA COMPARATIVA
| Aspecto | ${BRAND.name} | Competidor 1 | Competidor 2 | Competidor 3 |
(Precio promedio, calidad percibida, presencia digital, público)

## 💡 OPORTUNIDADES
- Gaps que los competidores no cubren
- Segmentos desatendidos
- Ventajas competitivas de ${BRAND.name} a explotar

## ⚠️ AMENAZAS
- Movimientos de competidores a monitorear
- Tendencias que favorecen a la competencia

## 🎯 PLAN DE DIFERENCIACIÓN
- 3 acciones para diferenciarse esta semana
- Messaging vs cada competidor`;

  const { text, tokens } = await callLLM(config, COMPETITOR_SYSTEM, prompt, { maxTokens: 3500, temperature: 0.6 });
  return { type: 'competitor', content: text, timestamp: agentTimestamp(), tokens, brands: competitors };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 12 — FINANCIAL CONTROLLER
// ═══════════════════════════════════════════════════════════════
const FINANCIAL_SYSTEM = `Sos un controller financiero especializado en PyMEs de moda argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Analizás P&L, cash flow, márgenes, y proyectás resultados. Entendés la dinámica mayorista: cobro a 10 días, producción adelantada.
Pensás en: gross margin, operating margin, break-even, cash conversion cycle.
Español rioplatense, ejecutivo. Formato: markdown con tablas de números.`;

export async function runFinancialAgent(config, state, analystData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  onProgress?.('Consolidando datos financieros...');
  const finHistory = getAgentHistory(config, 'financial');
  const finHistoryCtx = buildHistoryContext(finHistory);

  let revenueStats = null;
  try { revenueStats = await wooService.fetchRevenueStats(config); } catch {}

  const posVentas = state.posVentas || [];
  const posHoy = posVentas.filter(v => new Date(v.fecha || v.createdAt).toDateString() === new Date().toDateString());
  const pos7d = posVentas.filter(v => {
    const d = new Date(v.fecha || v.createdAt);
    return (Date.now() - d.getTime()) < 7 * 24 * 60 * 60 * 1000;
  });

  const bankPayments = state.bankPayments || [];
  const clientes = state.clientes || [];

  const prompt = `Fecha: ${todayLabel()}

💰 REVENUE WEB (30 días):
${safeTruncate(revenueStats?.totals, 1000)}

🏪 POS:
- Hoy: ${posHoy.length} ventas, $${posHoy.reduce((s, v) => s + (v.total || 0), 0)}
- Últimos 7 días: ${pos7d.length} ventas, $${pos7d.reduce((s, v) => s + (v.total || 0), 0)}

🏦 MOVIMIENTOS BANCARIOS: ${bankPayments.length} registros
Últimos 5: ${safeTruncate(bankPayments.slice(0, 5), 500)}

👥 CLIENTES CON SALDO: ${clientes.filter(c => (c.saldo || 0) !== 0).length}
Deuda total: $${clientes.reduce((s, c) => s + Math.max(0, c.saldo || 0), 0)}

📊 DATOS DEL ANALISTA:
${safeContentTruncate(analystData, 1500)}

${BRAND_CONTEXT}
Regla: no producir más de lo que se puede pagar en 10 días.

Generá un **REPORTE FINANCIERO**:

## 📊 P&L ESTIMADO (últimos 30 días)
| Concepto | Monto |
Revenue Web + POS, Costo estimado, Gross Margin, Gastos Meta Ads, Net estimado

## 💸 CASH FLOW
- Cobros pendientes (saldos de clientes)
- Pagos pendientes estimados
- Cash position estimado

## 📈 MÉTRICAS CLAVE
- Ticket promedio (web vs POS)
- Revenue por día promedio
- Costo de adquisición estimado (spend Meta / clientes nuevos)
- LTV estimado por cliente

## 🔮 PROYECCIÓN MENSUAL
- Revenue proyectado próximo mes
- Break-even point
- Margen objetivo

## ⚠️ ALERTAS FINANCIERAS
- Deuda de clientes alta
- Cash flow negativo
- Gastos fuera de rango

## ✅ ACCIONES
| Acción | Impacto Financiero | Urgencia |`;

  const { text, tokens } = await callLLM(config, FINANCIAL_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.3, model: config.marketing?.llmProvider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-4o' });
  return { type: 'financial', content: text, timestamp: agentTimestamp(), tokens };
}

// ═══════════════════════════════════════════════════════════════
//  AGENT 13 — EMAIL/CRM COMMUNICATIONS
// ═══════════════════════════════════════════════════════════════
const CRM_SYSTEM = `Sos un CRM strategist y email marketer para moda mayorista argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Diseñás comunicaciones personalizadas para diferentes segmentos de clientes: mayoristas activos, inactivos, nuevos, y web.
Tono: profesional pero cercano, español rioplatense. Formato: markdown con templates listos para usar.`;

export async function runCRMAgent(config, analystData, onProgress) {
  // API key handled by callLLM
  // Key validation handled by callLLM
  onProgress?.('Generando estrategia CRM y templates...');

  let customers = [];
  try { customers = await wooService.fetchCustomers(config); } catch {}

  const audienceIntel = analystData?.data?.audienceIntel;
  const customerSummary = {
    total: customers.length,
    active: customers.filter(c => c.orders_count > 0).length,
    topSpenders: customers.sort((a, b) => parseFloat(b.total_spent || 0) - parseFloat(a.total_spent || 0)).slice(0, 10).map(c => ({
      name: `${c.first_name} ${c.last_name}`.trim(), orders: c.orders_count, spent: c.total_spent,
    })),
    cities: [...new Set(customers.map(c => c.billing?.city).filter(Boolean))].slice(0, 10),
  };

  const prompt = `Fecha: ${todayLabel()}

👥 CLIENTES (${customerSummary.total} total, ${customerSummary.active} activos):
Top spenders: ${JSON.stringify(customerSummary.topSpenders)}
Ciudades: ${customerSummary.cities.join(', ')}

👥 AUDIENCIA:
${safeTruncate(audienceIntel, 1000)}

📊 CONTEXTO:
${safeContentTruncate(analystData, 1000)}

${BRAND_CONTEXT}

Generá una **ESTRATEGIA CRM COMPLETA**:

## 👥 SEGMENTACIÓN
| Segmento | Criterio | Cantidad Est. | Prioridad |
(VIP, Activos, Durmientes, Nuevos, One-time)

## 📧 TEMPLATE 1: Bienvenida (cliente nuevo)
Asunto + cuerpo completo listo para enviar

## 📧 TEMPLATE 2: Reactivación (cliente 30+ días inactivo)
Asunto + cuerpo con incentivo

## 📧 TEMPLATE 3: VIP Exclusivo (top spenders)
Asunto + cuerpo con preview exclusivo

## 📧 TEMPLATE 4: Post-compra (upsell/cross-sell)
Asunto + cuerpo sugiriendo productos complementarios

## 📧 TEMPLATE 5: Feedback Request
Asunto + cuerpo pidiendo opinión

## 📅 CALENDARIO CRM
- Frecuencia de contacto por segmento
- Triggers automáticos sugeridos
- Secuencia de onboarding para nuevos clientes

## 📊 KPIs CRM
- Open rate objetivo, Click rate, Recompra rate`;

  const { text, tokens } = await callLLM(config, CRM_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.6 });
  return { type: 'crm', content: text, timestamp: agentTimestamp(), tokens };
}


// ═══════════════════════════════════════════════════════════════
//  MASTER AGENT — Orchestrator that creates actionable tasks
// ═══════════════════════════════════════════════════════════════
const MASTER_SYSTEM = `Sos el CEO VIRTUAL de CELAVIE — el Director General AI que toma decisiones autónomas y dirige la operación diaria.
${ELI5_RULE}
${BRAND_CONTEXT}
${TEAM_CONTEXT}

FILOSOFÍA DE GESTIÓN:
- NO sos un asistente que sugiere — sos un ejecutivo que DECIDE. Hablás en primera persona del plural ("hacemos", "vamos a", "decidí que").
- Pensás como dueño: cada peso cuenta, cada decisión afecta el P&L
- Priorizás por impacto en revenue y cash flow
- Delegás bien: sabés qué puede hacer cada persona del equipo
- Medís todo: si no se mide, no se gestiona
- Anticipás problemas: no esperás a que explote
- Sos directo: si algo anda mal, lo decís sin vueltas

REGLAS CRÍTICAS:
- Cada tarea DEBE tener: título corto, descripción, responsable, prioridad (alta/media/baja), deadline
- Solo asigná tareas a personas que pueden ejecutarlas según su rol
- Máximo 10 tareas por ejecución
- Las tareas deben ser ACCIONABLES (no análisis ni sugerencias vagas)
- Formato de respuesta: JSON puro, sin markdown

ASIGNACIÓN DE RESPONSABLES:
- David: decisiones estratégicas, presupuesto, nuevos productos, pricing
- Ro: contenido IG/TikTok/FB, reels, captions, community management
- Nadia: POS, atención al cliente, pedidos físicos, banco, saldo
- Naara: conteo de mercadería, inventario, stock, depósito
- Juan: pedidos online, envíos, seguimiento de entregas
- Rocío: fotografía de productos, Instagram Planner`;

export async function runMasterAgent(config, allResults, onProgress) {
  const langInst = getLanguageInstruction(config);
  onProgress?.('Agente Maestro: analizando todos los reportes...');

  // Collect all available agent reports
  const reports = {};
  if (allResults.analyst?.content) reports.analyst = allResults.analyst.content.substring(0, 1500);
  if (allResults.trendScout?.content) reports.trendScout = allResults.trendScout.content.substring(0, 800);
  if (allResults.contentCreator?.content) reports.contentCreator = allResults.contentCreator.content.substring(0, 800);
  if (allResults.strategist?.content) reports.strategist = allResults.strategist.content.substring(0, 1000);
  if (allResults.growth?.content) reports.growth = allResults.growth.content.substring(0, 800);
  if (allResults.paidMedia?.content) reports.paidMedia = allResults.paidMedia.content.substring(0, 800);
  if (allResults.pricing?.content) reports.pricing = allResults.pricing.content.substring(0, 800);
  if (allResults.inventory?.content) reports.inventory = allResults.inventory.content.substring(0, 800);
  if (allResults.financial?.content) reports.financial = allResults.financial.content.substring(0, 800);
  if (allResults.supplyChain?.content) reports.supplyChain = allResults.supplyChain.content.substring(0, 800);
  if (allResults.cashflow?.content) reports.cashflow = allResults.cashflow.content.substring(0, 800);
  if (allResults.customerSuccess?.content) reports.customerSuccess = allResults.customerSuccess.content.substring(0, 800);

  if (Object.keys(reports).length === 0) {
    throw new Error('No hay reportes de agentes disponibles. Ejecutá al menos el Analista primero.');
  }

  onProgress?.(`Generando tareas basadas en ${Object.keys(reports).length} reportes...`);

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}

REPORTES DE AGENTES DISPONIBLES:
${Object.entries(reports).map(([k, v]) => `--- ${k.toUpperCase()} ---\n${v}`).join('\n\n')}

───────────────────────
Sos el CEO de CELAVIE. Analizá TODOS los reportes y TOMÁ DECISIONES.
No sugieras — DECIDÍ. Hablá como director: "Decidí que...", "Vamos a...", "Hoy hacemos...".

Respondé con JSON válido (sin markdown, sin backticks):

{
  "ceoStatement": "Párrafo de 3-5 líneas donde el CEO habla sobre el estado del negocio HOY, qué le preocupa, y qué decidió. Tono ejecutivo, directo, con números.",
  "healthScore": 75,
  "healthJustification": "justificación en 1 línea del score",
  "criticalDecisions": [
    {
      "decision": "qué se decidió",
      "reason": "por qué, con datos",
      "impact": "qué pasa si no se hace",
      "owner": "David|Ro|Nadia|Naara|Juan|Rocío"
    }
  ],
  "tasks": [
    {
      "title": "título corto de la tarea",
      "description": "qué hay que hacer concretamente + explicación simple de por qué",
      "assignee": "David|Ro|Nadia|Naara|Juan|Rocío",
      "priority": "alta|media|baja",
      "deadline": "hoy|mañana|esta semana|próxima semana",
      "source": "nombre del agente que generó esta necesidad",
      "category": "marketing|ventas|inventario|contenido|operaciones|finanzas|proveedores"
    }
  ],
  "alerts": ["alertas críticas que necesitan atención inmediata"],
  "weeklyGoals": ["3-5 metas medibles para esta semana"],
  "summary": "resumen de 2 líneas de las prioridades del día"
}`;

  const { text, tokens } = await callLLM(config, MASTER_SYSTEM, prompt, { maxTokens: 3000, temperature: 0.3 });

  // Parse JSON response
  let parsedTasks = null;
  try {
    parsedTasks = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    parsedTasks = { tasks: [], summary: text, parseError: true };
  }

  return {
    type: 'master',
    content: parsedTasks.ceoStatement || parsedTasks.summary || text,
    timestamp: agentTimestamp(),
    tokens,
    tasks: parsedTasks.tasks || [],
    parsedTasks,
    healthScore: parsedTasks.healthScore,
    criticalDecisions: parsedTasks.criticalDecisions || [],
    alerts: parsedTasks.alerts || [],
    weeklyGoals: parsedTasks.weeklyGoals || [],
  };
}


// ═══════════════════════════════════════════════════════════════
//  AGENT 14 — SUPPLY CHAIN MANAGER (Fabric & Provider Tracking)
// ═══════════════════════════════════════════════════════════════
const SUPPLY_CHAIN_SYSTEM = `Sos un supply chain manager especializado en la industria textil argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Controlás proveedores de tela, deudas, entregas, calidad, y timing de producción.
Entendés que CELAVIE trabaja con proveedores clave (MARITEL, KLH, DAN, BRIAN, AM TEX) y que el flujo es: compra tela → entrega → corte → taller → producto terminado (7-15 días).
Español rioplatense, directo, con tablas de números. Formato: markdown.`;

export async function runSupplyChainAgent(config, state, analystData, onProgress) {
  onProgress?.('Analizando cadena de suministro y proveedores...');
  const telas = state.telas || [];
  const telasTransactions = state.telasTransactions || [];
  const cortes = state.cortes || [];

  const providerData = {};
  telasTransactions.forEach(t => {
    const prov = t.textil || t.proveedor || 'DESCONOCIDO';
    if (!providerData[prov]) providerData[prov] = { entregas: [], pagos: [], totalEntregas: 0, totalPagos: 0 };
    if (t.estado === 'ENTREGA') {
      providerData[prov].entregas.push({ fecha: t.fecha, tela: t.tipoTela, rollos: t.rollos, kilos: t.kilos, monto: t.totalDol || 0 });
      providerData[prov].totalEntregas += parseFloat(t.totalDol || 0);
    } else if (t.estado === 'PAGO') {
      providerData[prov].pagos.push({ fecha: t.fecha, monto: Math.abs(parseFloat(t.totalDol || t.totalPeso || 0)) });
      providerData[prov].totalPagos += Math.abs(parseFloat(t.totalDol || 0));
    }
  });

  const KNOWN_DEBTS = {
    MARITEL: { usd: 62253, telas: ['Modal Soft', 'Super Soft', 'Kerry Brush'] },
    KLH: { usd: 17439, telas: ['Lanilla Melow', 'Lanilla Sweter'] },
    DAN: { usd: 2657, telas: ['saldo verano'] },
    BRIAN: { usd: 0, telas: [] },
    'AM TEX': { usd: 0, pesos: 7430632, telas: ['Algodón Frisado'] },
  };

  const cortesActivos = cortes.filter(c => c.estado !== 'finalizado');
  const langInst = getLanguageInstruction(config);

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}

🏭 PROVEEDORES Y DEUDAS ACTUALES:
${JSON.stringify(KNOWN_DEBTS, null, 2)}

📦 TRANSACCIONES POR PROVEEDOR:
${safeTruncate(providerData, 3000)}

🧵 STOCK DE TELAS:
${safeTruncate(telas.map(t => ({ nombre: t.nombre, stock: t.stock })), 1500)}

✂️ CORTES ACTIVOS (${cortesActivos.length}):
${safeTruncate(cortesActivos.slice(0, 10).map(c => ({ articulo: c.articulo, cantidad: c.cantidad, estado: c.estado, tela: c.tela })), 1000)}

📊 CONTEXTO DE VENTAS:
${safeContentTruncate(analystData, 1000)}

${BRAND_CONTEXT}

Generá un **REPORTE DE CADENA DE SUMINISTRO**:

## 🏭 DEUDA POR PROVEEDOR
| Proveedor | Deuda USD | Deuda ARS | Última Entrega | Último Pago | Estado |
- Clasificar: al día, atrasado, crítico

## 📊 ANÁLISIS DE PROVEEDORES
Para cada proveedor: confiabilidad, precio/calidad, riesgo de dependencia
📚 En criollo: explicar qué significa cada análisis

## 🧵 STOCK DE TELAS vs DEMANDA
| Tela | Stock Actual | Consumo Semanal Est. | Días de Stock | Acción |

## 💸 PLAN DE PAGOS SUGERIDO
| Proveedor | Monto Sugerido | Fecha | Prioridad | Razón |

## ⚠️ RIESGOS
- Proveedores con deuda alta que pueden cortar suministro
- Telas sin stock para cortes planeados

## ✅ ACCIONES INMEDIATAS
| Acción | Responsable | Deadline |`;

  const { text, tokens } = await callLLM(config, SUPPLY_CHAIN_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.3 });
  return { type: 'supplyChain', content: text, timestamp: agentTimestamp(), tokens, data: { providerData, KNOWN_DEBTS } };
}


// ═══════════════════════════════════════════════════════════════
//  AGENT 15 — CUSTOMER SUCCESS (Retention & Satisfaction)
// ═══════════════════════════════════════════════════════════════
const CUSTOMER_SUCCESS_SYSTEM = `Sos un Customer Success Manager especializado en e-commerce de moda mayorista argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Tu foco es retención, satisfacción, recompra, y lifetime value. Identificás clientes en riesgo y oportunidades de upsell.
Entendés la dinámica mayorista: las revendedoras son clientas recurrentes que compran cada 2-4 semanas.
Español rioplatense. Formato: markdown con tablas.`;

export async function runCustomerSuccessAgent(config, analystData, onProgress) {
  onProgress?.('Analizando éxito y retención de clientes...');
  let customers = [], recentOrders = [];
  try {
    customers = await wooService.fetchCustomers(config);
    recentOrders = await wooService.fetchRecentOrders(config, 100);
  } catch {}

  const audienceIntel = analystData?.data?.audienceIntel;
  const now = Date.now();

  const segmented = {
    vip: customers.filter(c => parseFloat(c.total_spent || 0) > 50000 && c.orders_count > 5),
    active: customers.filter(c => c.orders_count > 2 && c.orders_count <= 5),
    atRisk: customers.filter(c => {
      if (!c.date_modified) return false;
      const daysSince = (now - new Date(c.date_modified).getTime()) / (1000*60*60*24);
      return daysSince > 30 && c.orders_count > 0;
    }),
    newCust: customers.filter(c => c.orders_count <= 1),
    dormant: customers.filter(c => {
      if (!c.date_modified) return c.orders_count > 0;
      const daysSince = (now - new Date(c.date_modified).getTime()) / (1000*60*60*24);
      return daysSince > 60 && c.orders_count > 0;
    }),
  };

  const ordersByCustomer = {};
  recentOrders.forEach(o => {
    const key = o.billing?.email || o.billing?.phone || 'unknown';
    if (!ordersByCustomer[key]) ordersByCustomer[key] = [];
    ordersByCustomer[key].push({ date: o.date_created, total: o.total });
  });
  const repeatBuyers = Object.values(ordersByCustomer).filter(orders => orders.length > 1).length;
  const avgOrders = customers.length > 0 ? customers.reduce((s,c) => s + c.orders_count, 0) / customers.length : 0;
  const langInst = getLanguageInstruction(config);

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}

👥 CLIENTES TOTALES: ${customers.length}
VIP (>$50k, >5 orders): ${segmented.vip.length}
Activos (2-5 orders): ${segmented.active.length}
Nuevos (0-1 orders): ${segmented.newCust.length}
En riesgo (>30 días sin compra): ${segmented.atRisk.length}
Dormidos (>60 días): ${segmented.dormant.length}

📊 MÉTRICAS:
- Repeat buyers en últimos 100 pedidos: ${repeatBuyers}
- Promedio de órdenes por cliente: ${avgOrders.toFixed(1)}

🏆 TOP CLIENTES:
${safeTruncate(customers.sort((a,b) => parseFloat(b.total_spent||0) - parseFloat(a.total_spent||0)).slice(0,15).map(c => ({
  name: (c.first_name+' '+c.last_name).trim(), orders: c.orders_count, spent: c.total_spent, city: c.billing?.city
})), 1500)}

👥 AUDIENCIA (del sub-agente):
${safeTruncate(audienceIntel, 1000)}

${BRAND_CONTEXT}

Generá un **REPORTE DE CUSTOMER SUCCESS**:

## 📊 HEALTH SCORE DE CLIENTES (0-100)
Score general + justificación
📚 En criollo: explicación simple

## 👥 SEGMENTACIÓN DETALLADA
| Segmento | Cantidad | % del Total | Revenue Contrib. | Acción Clave |

## 🔴 CLIENTES EN RIESGO (Top 10 por valor)
| Cliente | Última Compra | Total Gastado | Días Sin Comprar | Acción Sugerida |

## 🏆 PROGRAMA VIP
- Clientes que deberían ser VIP
- Beneficios sugeridos
- Cómo premiar fidelidad sin regalar margen

## 📈 RETENCIÓN Y RECOMPRA
- Tasa de recompra estimada
- Frecuencia promedio de compra
- LTV estimado por segmento

## 💡 OPORTUNIDADES DE UPSELL/CROSS-SELL
- Clientes de 1 categoría → ofrecerles otras
- Packs o combos para subir ticket
- Timing óptimo para contactar

## ✅ PLAN DE ACCIÓN
| Acción | Segmento Target | Canal | Responsable | Timeline |`;

  const { text, tokens } = await callLLM(config, CUSTOMER_SUCCESS_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.4 });
  return { type: 'customerSuccess', content: text, timestamp: agentTimestamp(), tokens, data: { segmented, repeatBuyers } };
}


// ═══════════════════════════════════════════════════════════════
//  AGENT 16 — CASH FLOW GUARDIAN (Daily Cash Position)
// ═══════════════════════════════════════════════════════════════
const CASHFLOW_SYSTEM = `Sos un tesorero y guardian de cash flow para PyME textil argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Tu obsesión es que NUNCA falte plata para operar. Controlás cobros, pagos, deudas de clientes, deudas a proveedores, y flujo diario.
Regla de oro de CELAVIE: no producir más de lo que se puede pagar en 10 días.
Entendés la economía argentina: dólar blue, inflación, pagos en cuotas, transferencias, efectivo, Mercado Pago.
Español rioplatense, alarmista cuando hay peligro. Formato: markdown con tablas de dinero.`;

export async function runCashFlowAgent(config, state, analystData, onProgress) {
  onProgress?.('Monitoreando cash flow en tiempo real...');
  let revenueStats = null;
  try { revenueStats = await wooService.fetchRevenueStats(config); } catch {}

  const posVentas = state.posVentas || [];
  const bankPayments = state.bankPayments || [];
  const clientes = state.clientes || [];
  const now = new Date();
  const today = now.toDateString();
  const segmented = {
    vip: customers.filter(c => parseFloat(c.total_spent || 0) > 50000 && c.orders_count > 5),
    active: customers.filter(c => c.orders_count > 2 && c.orders_count <= 5),
    atRisk: customers.filter(c => {
      if (!c.date_modified) return false;
      const daysSince = (now - new Date(c.date_modified).getTime()) / (1000*60*60*24);
      return daysSince > 30 && c.orders_count > 0;
    }),
    newCustomers: customers.filter(c => c.orders_count <= 1),
    dormant: customers.filter(c => {
      if (!c.date_modified) return c.orders_count > 0;
      const daysSince = (now - new Date(c.date_modified).getTime()) / (1000*60*60*24);
      return daysSince > 60 && c.orders_count > 0;
    }),
  };

  const ordersByCustomer = {};
  recentOrders.forEach(o => {
    const key = o.billing?.email || o.billing?.phone || 'unknown';
    if (!ordersByCustomer[key]) ordersByCustomer[key] = [];
    ordersByCustomer[key].push({ date: o.date_created, total: o.total });
  });
  const repeatBuyers = Object.values(ordersByCustomer).filter(orders => orders.length > 1).length;
  const avgOrders = customers.length > 0 ? customers.reduce((s,c) => s + c.orders_count, 0) / customers.length : 0;
  const langInst = getLanguageInstruction(config);


  const posHoy = posVentas.filter(v => new Date(v.fecha || v.createdAt).toDateString() === today);
  const pos7d = posVentas.filter(v => (now - new Date(v.fecha || v.createdAt)) < 7*24*60*60*1000);
  const pos30d = posVentas.filter(v => (now - new Date(v.fecha || v.createdAt)) < 30*24*60*60*1000);

  const clientesConDeuda = clientes.filter(c => (c.saldo || 0) > 0);
  const totalCuentasPorCobrar = clientes.reduce((s, c) => s + Math.max(0, c.saldo || 0), 0);
  const PROVIDER_DEBTS = { MARITEL: 62253, KLH: 17439, DAN: 2657, BRIAN: 0 };
  const totalCuentasPorPagar = Object.values(PROVIDER_DEBTS).reduce((s, v) => s + v, 0);

  const finHistory = getAgentHistory(config, 'cashflow');
  const finHistoryCtx = buildHistoryContext(finHistory);
  const langInst = getLanguageInstruction(config);

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}
${finHistoryCtx}

💰 INGRESOS:
- POS hoy: ${posHoy.length} ventas, $${posHoy.reduce((s,v) => s + (v.total||0), 0).toLocaleString()}
- POS 7 días: ${pos7d.length} ventas, $${pos7d.reduce((s,v) => s + (v.total||0), 0).toLocaleString()}
- POS 30 días: ${pos30d.length} ventas, $${pos30d.reduce((s,v) => s + (v.total||0), 0).toLocaleString()}
- Web revenue 30d: ${safeTruncate(revenueStats?.totals, 500)}

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}

👥 CLIENTES TOTALES: ${customers.length}
VIP (>$50k, >5 orders): ${segmented.vip.length}
Activos (2-5 orders): ${segmented.active.length}
Nuevos (0-1 orders): ${segmented.newCustomers.length}
En riesgo (>30 días sin compra): ${segmented.atRisk.length}
Dormidos (>60 días): ${segmented.dormant.length}

📊 MÉTRICAS:
- Repeat buyers en últimos 100 pedidos: ${repeatBuyers}
- Promedio de órdenes por cliente: ${avgOrders.toFixed(1)}

🏆 TOP CLIENTES:
${safeTruncate(customers.sort((a,b) => parseFloat(b.total_spent||0) - parseFloat(a.total_spent||0)).slice(0,15).map(c => ({
  name: (c.first_name+' '+c.last_name).trim(), orders: c.orders_count, spent: c.total_spent, city: c.billing?.city
})), 1500)}

👥 AUDIENCIA (del sub-agente):
${safeTruncate(audienceIntel, 1000)}

${BRAND_CONTEXT}

💸 CUENTAS POR COBRAR (clientes):
Total: $${totalCuentasPorCobrar.toLocaleString()}
Clientes con deuda (${clientesConDeuda.length}):
${safeTruncate(clientesConDeuda.slice(0, 15).map(c => ({ nombre: c.nombre, saldo: c.saldo })), 1000)}

🏭 CUENTAS POR PAGAR (proveedores tela):
MARITEL: USD ${PROVIDER_DEBTS.MARITEL.toLocaleString()}
KLH: USD ${PROVIDER_DEBTS.KLH.toLocaleString()}
DAN: USD ${PROVIDER_DEBTS.DAN.toLocaleString()}
Total proveedores: USD ${totalCuentasPorPagar.toLocaleString()}

🏦 MOVIMIENTOS BANCARIOS:
${safeTruncate(bankPayments.slice(0, 10), 800)}

📊 CONTEXTO:
${safeContentTruncate(analystData, 1000)}

${BRAND_CONTEXT}
Regla: no producir más de lo que se puede pagar en 10 días.

Generá un **REPORTE DE CUSTOMER SUCCESS**:

## 📊 HEALTH SCORE DE CLIENTES (0-100)
Score general + justificación
📚 En criollo: explicación simple

## 👥 SEGMENTACIÓN DETALLADA
| Segmento | Cantidad | % del Total | Revenue Contrib. | Acción Clave |

## 🔴 CLIENTES EN RIESGO (top 10 por valor)
| Cliente | Última Compra | Total Gastado | Días Sin Comprar | Acción |

## 🏆 PROGRAMA VIP
- Clientes VIP actuales y potenciales
- Beneficios sugeridos
- Cómo premiar fidelidad sin regalar margen

## 📈 RETENCIÓN Y RECOMPRA
- Tasa de recompra estimada
- Frecuencia promedio de compra
- LTV estimado por segmento

## 💡 OPORTUNIDADES DE UPSELL/CROSS-SELL
- Clientes de 1 categoría → ofrecerles otras
- Packs o combos para subir ticket

## ✅ PLAN DE ACCIÓN
| Acción | Segmento Target | Canal | Responsable | Timeline |`;

  const { text, tokens } = await callLLM(config, CUSTOMER_SUCCESS_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.4 });
  return { type: 'customerSuccess', content: text, timestamp: agentTimestamp(), tokens, data: { segmented, repeatBuyers } };
}

Generá un **REPORTE DE CASH FLOW**:

## 🚦 SEMÁFORO DE CAJA (Verde/Amarillo/Rojo)
Estado actual + justificación en 1 línea
📚 En criollo: explicación simple del estado

## 💰 POSICIÓN DE CAJA ESTIMADA
| Concepto | Monto |
Efectivo estimado, MP, banco, total disponible

## 📈 FLUJO DE CAJA PROYECTADO (próximos 7 días)
| Día | Ingresos Est. | Egresos Est. | Saldo Proyectado |

## 🔴 COBROS URGENTES
| Cliente | Deuda | Días | Acción |

## 💸 PAGOS PROGRAMADOS
| Proveedor | Monto | Prioridad | Consecuencia si no se paga |

## ⚠️ ALERTAS DE LIQUIDEZ
- Cash runway: cuántos días podemos operar sin cobrar nada
- Ratio cobros/pagos
- Riesgo de descalce

## ✅ PLAN DE ACCIÓN FINANCIERO
| Acción | Monto Involucrado | Responsable | Deadline |`;

  const { text, tokens } = await callLLM(config, CASHFLOW_SYSTEM, prompt, { maxTokens: 4000, temperature: 0.3 });
  return { type: 'cashflow', content: text, timestamp: agentTimestamp(), tokens, data: { totalCuentasPorCobrar, totalCuentasPorPagar } };
}


// ═══════════════════════════════════════════════════════════════
//  CEO DAILY AUTO-RUN — Autonomous daily execution
// ═══════════════════════════════════════════════════════════════
export async function runCEOAutoDaily(config, state, onProgress) {
  const cacheKey = 'ceoDailyRun_' + new Date().toISOString().split('T')[0];
  const cached = config.agentsCache?.[cacheKey];
  if (cached) {
    onProgress?.('CEO: reporte de hoy ya fue generado, cargando desde cache...');
    return cached;
  }

  onProgress?.('🤖 CEO AUTO-RUN: Iniciando análisis diario completo...');
  const results = {};

  // Phase 1: Core data
  onProgress?.('Fase 1/4: Recopilando datos del negocio...');
  try { results.analyst = await runAnalystAgent(config, state, onProgress); }
  catch (e) { console.warn('CEO: Analyst failed', e.message); }

  // Phase 2: Market intelligence
  onProgress?.('Fase 2/4: Inteligencia de mercado...');
  try { results.trendScout = await runTrendScoutAgent(config, [], onProgress); }
  catch (e) { console.warn('CEO: TrendScout failed', e.message); }


// ═══════════════════════════════════════════════════════════════
//  AGENT 16 — CASH FLOW GUARDIAN (Daily Cash Position)
// ═══════════════════════════════════════════════════════════════
const CASHFLOW_SYSTEM = `Sos un tesorero y guardian de cash flow para PyME textil argentina.
${ELI5_RULE}
${BRAND_CONTEXT}
Tu obsesión es que NUNCA falte plata para operar. Controlás cobros, pagos, deudas de clientes, deudas a proveedores, y flujo diario.
Regla de oro de CELAVIE: no producir más de lo que se puede pagar en 10 días.
Entendés la economía argentina: dólar blue, inflación, pagos en cuotas, transferencias, efectivo, Mercado Pago.
Español rioplatense, alarmista cuando hay peligro. Formato: markdown con tablas de dinero.`;

export async function runCashFlowAgent(config, state, analystData, onProgress) {
  onProgress?.('Monitoreando cash flow en tiempo real...');
  let revenueStats = null;
  try { revenueStats = await wooService.fetchRevenueStats(config); } catch {}

  const posVentas = state.posVentas || [];
  const bankPayments = state.bankPayments || [];
  const clientes = state.clientes || [];

  // Phase 3: Strategy & operations (parallel)
  onProgress?.('Fase 3/4: Estrategia y operaciones...');
  const [strat, content, supply, cashflow, custSuccess] = await Promise.allSettled([
    runStrategistAgent(config, results.analyst, results.trendScout, null, onProgress),
    runContentAgent(config, results.analyst, results.trendScout, onProgress),
    runSupplyChainAgent(config, state, results.analyst, onProgress),
    runCashFlowAgent(config, state, results.analyst, onProgress),
    runCustomerSuccessAgent(config, results.analyst, onProgress),
  ]);
  if (strat.status === 'fulfilled') results.strategist = strat.value;
  if (content.status === 'fulfilled') results.contentCreator = content.value;
  if (supply.status === 'fulfilled') results.supplyChain = supply.value;
  if (cashflow.status === 'fulfilled') results.cashflow = cashflow.value;
  if (custSuccess.status === 'fulfilled') results.customerSuccess = custSuccess.value;

  // Phase 4: CEO synthesis
  onProgress?.('Fase 4/4: CEO sintetizando y tomando decisiones...');
  try { results.master = await runMasterAgent(config, results, onProgress); }
  catch (e) { console.warn('CEO: Master failed', e.message); }

  return { type: 'ceoDailyRun', results, timestamp: agentTimestamp(), cached: false };
}

// ── Check if CEO auto-run should trigger ──
export function shouldAutoRun(config) {
  const today = new Date().toISOString().split('T')[0];
  const lastRun = config.agentsCache?.lastCEOAutoRun;
  return lastRun !== today;
}
  const now = new Date();
  const today = now.toDateString();
  const posHoy = posVentas.filter(v => new Date(v.fecha || v.createdAt).toDateString() === today);
  const pos7d = posVentas.filter(v => (now - new Date(v.fecha || v.createdAt)) < 7*24*60*60*1000);
  const pos30d = posVentas.filter(v => (now - new Date(v.fecha || v.createdAt)) < 30*24*60*60*1000);

  const clientesConDeuda = clientes.filter(c => (c.saldo || 0) > 0);
  const totalCuentasPorCobrar = clientes.reduce((s, c) => s + Math.max(0, c.saldo || 0), 0);
  const PROVIDER_DEBTS = { MARITEL: 62253, KLH: 17439, DAN: 2657, BRIAN: 0 };
  const totalCuentasPorPagar = Object.values(PROVIDER_DEBTS).reduce((s, v) => s + v, 0);

  const finHistory = getAgentHistory(config, 'cashflow');
  const finHistoryCtx = buildHistoryContext(finHistory);
  const langInst = getLanguageInstruction(config);

  const prompt = `Fecha: ${todayLabel()}
IDIOMA: ${langInst}
${finHistoryCtx}

💰 INGRESOS:
- POS hoy: ${posHoy.length} ventas, $${posHoy.reduce((s,v) => s + (v.total||0), 0).toLocaleString()}
- POS 7 días: ${pos7d.length} ventas, $${pos7d.reduce((s,v) => s + (v.total||0), 0).toLocaleString()}
- POS 30 días: ${pos30d.length} ventas, $${pos30d.reduce((s,v) => s + (v.total||0), 0).toLocaleString()}
- Web revenue 30d: ${safeTruncate(revenueStats?.totals, 500)}

💸 CUENTAS POR COBRAR (clientes):
Total: $${totalCuentasPorCobrar.toLocaleString()}
Clientes con deuda (${clientesConDeuda.length}):
${safeTruncate(clientesConDeuda.slice(0, 15).map(c => ({ nombre: c.nombre, saldo: c.saldo })), 1000)}

🏭 CUENTAS POR PAGAR (proveedores tela):
MARITEL: USD ${PROVIDER_DEBTS.MARITEL.toLocaleString()}
KLH: USD ${PROVIDER_DEBTS.KLH.toLocaleString()}
DAN: USD ${PROVIDER_DEBTS.DAN.toLocaleString()}
Total proveedores: USD ${totalCuentasPorPagar.toLocaleString()}

🏦 MOVIMIENTOS BANCARIOS:
${safeTruncate(bankPayments.slice(0, 10), 800)}

📊 CONTEXTO:
${safeContentTruncate(analystData, 1000)}

${BRAND_CONTEXT}
Regla: no producir más de lo que se puede pagar en 10 días.

