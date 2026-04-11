import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Zap, BarChart3, Globe, Instagram, Brain, Play, Loader2, Clock,
  ChevronDown, ChevronRight, Plus, X, Trash2, RefreshCw, Copy, Check,
  AlertCircle, Rocket, Target, DollarSign, Package, MessageCircle, Search, Eye, Calculator, Mail, Crown,
  Truck, Heart, Banknote, Bot, Wrench
} from 'lucide-react';
import { useData } from '../../store/DataContext';
import {
  runAnalystAgent,
  runTrendScoutAgent,
  runContentAgent,
  runStrategistAgent,
  runGrowthAgent,
  runPaidMediaAgent,
  runPricingAgent,
  runInventoryAgent,
  runWhatsAppAgent,
  runSEOAgent,
  runCompetitorAgent,
  runFinancialAgent,
  runCRMAgent,
  runMasterAgent,
  runSupplyChainAgent,
  runCustomerSuccessAgent,
  runCashFlowAgent,
  runCEOAutoDaily,
  shouldAutoRun,
  runBugFinderAgent,
  runBugFixerAgent,
  runAdQualifierAgent,
  runSiteTrackerAgent
} from '../../services/agentService';

const TABS = [
  { id: 'analyst', label: 'Analista', icon: BarChart3, color: '#3b82f6', desc: 'Reporte diario consolidado' },
  { id: 'trendScout', label: 'Trend Scout', icon: Globe, color: '#8b5cf6', desc: 'Tendencias de moda' },
  { id: 'contentCreator', label: 'Content', icon: Instagram, color: '#ec4899', desc: 'Plan de contenido IG' },
  { id: 'strategist', label: 'Estratega', icon: Brain, color: '#f59e0b', desc: 'Recomendaciones estratégicas' },
  { id: 'growth', label: 'Growth', icon: Rocket, color: '#10b981', desc: 'Experimentos y crecimiento' },
  { id: 'paidMedia', label: 'Paid Media', icon: Target, color: '#ef4444', desc: 'Optimización de Meta Ads' },
  { id: 'pricing', label: 'Pricing', icon: DollarSign, color: '#06b6d4', desc: 'Análisis de precios y márgenes' },
  { id: 'inventory', label: 'Inventario', icon: Package, color: '#84cc16', desc: 'Forecast de demanda y stock' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#22c55e', desc: 'Mensajes de venta' },
  { id: 'seo', label: 'SEO', icon: Search, color: '#a855f7', desc: 'Optimización web' },
  { id: 'competitor', label: 'Competencia', icon: Eye, color: '#f97316', desc: 'Análisis de competidores' },
  { id: 'financial', label: 'Finanzas', icon: Calculator, color: '#14b8a6', desc: 'Control financiero' },
  { id: 'crm', label: 'CRM', icon: Mail, color: '#e11d48', desc: 'Comunicación con clientes' },
  { id: 'supplyChain', label: 'Proveedores', icon: Truck, color: '#7c3aed', desc: 'Cadena de suministro y telas' },
  { id: 'customerSuccess', label: 'Clientes', icon: Heart, color: '#f43f5e', desc: 'Retención y satisfacción' },
  { id: 'cashflow', label: 'Cash Flow', icon: Banknote, color: '#059669', desc: 'Flujo de caja diario' },
  { id: 'master', label: '👑 CEO', icon: Crown, color: '#fbbf24', desc: 'Director General AI — decide y delega' },
  { id: 'bugFinder', label: 'Bug Finder', icon: AlertCircle, color: '#ef4444', desc: 'Monitorea errores en el dashboard', alwaysOn: true },
  { id: 'bugFixer', label: 'Bug Fixer', icon: Wrench, color: '#f97316', desc: 'Intenta corregir bugs automáticamente', alwaysOn: true },
  { id: 'adQualifier', label: 'Ad Qualifier', icon: Target, color: '#8b5cf6', desc: 'Califica la calidad de campañas activas', alwaysOn: true },
  { id: 'siteTracker', label: 'Site Tracker', icon: Globe, color: '#06b6d4', desc: 'Monitorea celavie.com.ar: SEO, velocidad, keywords', alwaysOn: true },
];

const DEFAULT_BRANDS = ['Zara', 'Skims', 'COS', 'Uniqlo', 'Aritzia'];

// ─── Simple markdown renderer ────────────────────────────────
function MarkdownContent({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} style={{ height: 8 }} />;
        // H2
        if (trimmed.startsWith('## ')) return <h3 key={i} style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 6px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: 4 }}>{renderInline(trimmed.slice(3))}</h3>;
        // H3
        if (trimmed.startsWith('### ')) return <h4 key={i} style={{ fontSize: 14, fontWeight: 600, margin: '12px 0 4px', color: 'var(--text-primary)' }}>{renderInline(trimmed.slice(4))}</h4>;
        // H1
        if (trimmed.startsWith('# ')) return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, margin: '18px 0 8px', color: 'var(--text-primary)' }}>{renderInline(trimmed.slice(2))}</h2>;
        // Bullet
        if (/^[-*•] /.test(trimmed)) return <div key={i} style={{ paddingLeft: 16, position: 'relative' }}><span style={{ position: 'absolute', left: 4, color: 'var(--text-muted)' }}>•</span>{renderInline(trimmed.replace(/^[-*•] /, ''))}</div>;
        // Numbered
        if (/^\d+[.)]\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+[.)]\s)(.*)/);
          return <div key={i} style={{ paddingLeft: 20, position: 'relative' }}><span style={{ position: 'absolute', left: 0, fontWeight: 600, color: 'var(--accent)' }}>{match[1]}</span>{renderInline(match[2])}</div>;
        }
        // Separator
        if (/^[-─═]{3,}/.test(trimmed)) return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />;
        // Normal paragraph
        return <div key={i}>{renderInline(trimmed)}</div>;
      })}
    </div>
  );
}

function renderInline(text) {
  // Bold **text** or __text__
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    if (/^__(.+)__$/.test(part)) return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

// ─── Relative time ───────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'Recién';
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return `Hace ${Math.floor(diff / 86400)}d`;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AgentsHub() {
  const { state, updateConfig } = useData();
  const { config } = state;
  const agentsCache = config.agentsCache || {};

  const [activeTab, setActiveTab] = useState('analyst');
  const [loading, setLoading] = useState(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [results, setResults] = useState(agentsCache);
  const [brands, setBrands] = useState(agentsCache.trendScoutBrands || DEFAULT_BRANDS);
  const [newBrand, setNewBrand] = useState('');
  const [history, setHistory] = useState(agentsCache.history || []);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const persistCache = useCallback((overrides = {}) => {
    const next = { ...results, history, trendScoutBrands: brands, ...overrides };
    updateConfig({ agentsCache: next });
  }, [results, history, brands, updateConfig]);

  useEffect(() => {
    const c = config.agentsCache || {};
    if (c.analyst) setResults(prev => ({ ...prev, analyst: c.analyst }));
    if (c.trendScout) setResults(prev => ({ ...prev, trendScout: c.trendScout }));
    if (c.contentCreator) setResults(prev => ({ ...prev, contentCreator: c.contentCreator }));
    if (c.strategist) setResults(prev => ({ ...prev, strategist: c.strategist }));
    if (c.growth) setResults(prev => ({ ...prev, growth: c.growth }));
    if (c.paidMedia) setResults(prev => ({ ...prev, paidMedia: c.paidMedia }));
    if (c.pricing) setResults(prev => ({ ...prev, pricing: c.pricing }));
    if (c.inventory) setResults(prev => ({ ...prev, inventory: c.inventory }));
    if (c.whatsapp) setResults(prev => ({ ...prev, whatsapp: c.whatsapp }));
    if (c.seo) setResults(prev => ({ ...prev, seo: c.seo }));
    if (c.competitor) setResults(prev => ({ ...prev, competitor: c.competitor }));
    if (c.financial) setResults(prev => ({ ...prev, financial: c.financial }));
    if (c.crm) setResults(prev => ({ ...prev, crm: c.crm }));
    if (c.supplyChain) setResults(prev => ({ ...prev, supplyChain: c.supplyChain }));
    if (c.customerSuccess) setResults(prev => ({ ...prev, customerSuccess: c.customerSuccess }));
    if (c.cashflow) setResults(prev => ({ ...prev, cashflow: c.cashflow }));
    if (c.master) setResults(prev => ({ ...prev, master: c.master }));
    if (c.bugFinder) setResults(prev => ({ ...prev, bugFinder: c.bugFinder }));
    if (c.bugFixer) setResults(prev => ({ ...prev, bugFixer: c.bugFixer }));
    if (c.adQualifier) setResults(prev => ({ ...prev, adQualifier: c.adQualifier }));
    if (c.siteTracker) setResults(prev => ({ ...prev, siteTracker: c.siteTracker }));
    if (c.history) setHistory(c.history);
    if (c.trendScoutBrands) setBrands(c.trendScoutBrands);
  }, [config.agentsCache]);

  const addToHistory = (entry) => {
    const next = [entry, ...history].slice(0, 30);
    setHistory(next);
    return next;
  };

  const onProgress = (msg) => setProgressMsg(msg);

  // ─── Run individual agent ──────────────────────────────────
  const runAgent = async (agentId) => {
    setLoading(agentId);
    setError(null);
    setProgressMsg('Iniciando...');
    try {
      let result;
      switch (agentId) {
        case 'analyst': result = await runAnalystAgent(config, state, onProgress); break;
        case 'trendScout': result = await runTrendScoutAgent(config, brands, onProgress); break;
        case 'contentCreator': result = await runContentAgent(config, results.analyst, results.trendScout, onProgress); break;
        case 'strategist': result = await runStrategistAgent(config, results.analyst, results.trendScout, results.contentCreator, onProgress); break;
        case 'growth': result = await runGrowthAgent(config, results.analyst, results.trendScout, onProgress); break;
        case 'paidMedia': result = await runPaidMediaAgent(config, results.analyst, onProgress); break;
        case 'pricing': result = await runPricingAgent(config, results.analyst, results.trendScout, onProgress); break;
        case 'inventory': result = await runInventoryAgent(config, state, results.analyst, results.trendScout, onProgress); break;
        case 'whatsapp': result = await runWhatsAppAgent(config, results.analyst, results.trendScout, onProgress); break;
        case 'seo': result = await runSEOAgent(config, results.analyst, onProgress); break;
        case 'competitor': result = await runCompetitorAgent(config, brands, onProgress); break;
        case 'financial': result = await runFinancialAgent(config, state, results.analyst, onProgress); break;
        case 'crm': result = await runCRMAgent(config, results.analyst, onProgress); break;
        case 'supplyChain': result = await runSupplyChainAgent(config, state, results.analyst, onProgress); break;
        case 'customerSuccess': result = await runCustomerSuccessAgent(config, results.analyst, onProgress); break;
        case 'cashflow': result = await runCashFlowAgent(config, state, results.analyst, onProgress); break;
        case 'master': result = await runMasterAgent(config, results, onProgress); break;
        case 'bugFinder': result = await runBugFinderAgent(state); break;
        case 'bugFixer': result = await runBugFixerAgent(state); break;
        case 'adQualifier': result = await runAdQualifierAgent(state); break;
        case 'siteTracker': result = await runSiteTrackerAgent(state); break;
        default: return;
      }
      const nextResults = { ...results, [agentId]: result };
      setResults(nextResults);
      const nextHistory = addToHistory(result);
      persistCache({ ...nextResults, history: nextHistory });
    } catch (err) {
      setError({ agent: agentId, message: err.message });
    } finally {
      setLoading(null);
      setProgressMsg('');
    }
  };

  // ─── Run ALL agents concurrently with Promise.allSettled ───
  const runAllAgents = async () => {
    setLoading('all');
    setError(null);
    setCompletedSteps([]);
    const onProg = (msg) => setProgressMsg(msg);
    try {
      // Phase 1: Run foundation agents (analyst + trendScout) first since others depend on them
      setProgressMsg('Fase 1: Datos base (Analista + Trend Scout)...');
      const [analystRes, trendRes] = await Promise.allSettled([
        runAnalystAgent(config, state, onProg),
        runTrendScoutAgent(config, brands, onProg),
      ]);
      const analyst = analystRes.status === 'fulfilled' ? analystRes.value : null;
      const trendScout = trendRes.status === 'fulfilled' ? trendRes.value : null;
      if (analyst) { setResults(prev => ({ ...prev, analyst })); addToHistory(analyst); }
      if (trendScout) { setResults(prev => ({ ...prev, trendScout })); addToHistory(trendScout); }
      setCompletedSteps(['analyst', 'trendScout'].filter(id => id === 'analyst' ? analyst : trendScout));

      // Phase 2: Run ALL remaining agents concurrently (except master which needs all results)
      setProgressMsg('Fase 2: Ejecutando todos los agentes en paralelo...');
      const agentJobs = [
        { id: 'contentCreator', fn: () => runContentAgent(config, analyst, trendScout, onProg) },
        { id: 'strategist', fn: () => runStrategistAgent(config, analyst, trendScout, null, onProg) },
        { id: 'growth', fn: () => runGrowthAgent(config, analyst, trendScout, onProg) },
        { id: 'paidMedia', fn: () => runPaidMediaAgent(config, analyst, onProg) },
        { id: 'pricing', fn: () => runPricingAgent(config, analyst, trendScout, onProg) },
        { id: 'inventory', fn: () => runInventoryAgent(config, state, analyst, trendScout, onProg) },
        { id: 'whatsapp', fn: () => runWhatsAppAgent(config, analyst, trendScout, onProg) },
        { id: 'seo', fn: () => runSEOAgent(config, analyst, onProg) },
        { id: 'competitor', fn: () => runCompetitorAgent(config, brands, onProg) },
        { id: 'financial', fn: () => runFinancialAgent(config, state, analyst, onProg) },
        { id: 'crm', fn: () => runCRMAgent(config, analyst, onProg) },
        { id: 'supplyChain', fn: () => runSupplyChainAgent(config, state, analyst, onProg) },
        { id: 'customerSuccess', fn: () => runCustomerSuccessAgent(config, analyst, onProg) },
        { id: 'cashflow', fn: () => runCashFlowAgent(config, state, analyst, onProg) },
        { id: 'bugFinder', fn: () => runBugFinderAgent(state) },
        { id: 'bugFixer', fn: () => runBugFixerAgent(state) },
        { id: 'adQualifier', fn: () => runAdQualifierAgent(state) },
        { id: 'siteTracker', fn: () => runSiteTrackerAgent(state) },
      ];

      const settled = await Promise.allSettled(agentJobs.map(j => j.fn()));
      const allRes = { analyst, trendScout };
      settled.forEach((result, idx) => {
        const { id } = agentJobs[idx];
        if (result.status === 'fulfilled' && result.value) {
          allRes[id] = result.value;
          setResults(prev => ({ ...prev, [id]: result.value }));
          addToHistory(result.value);
        } else if (result.status === 'rejected') {
          console.warn(`Agent ${id} failed:`, result.reason?.message || result.reason);
        }
      });
      setCompletedSteps(Object.keys(allRes));

      // Phase 3: CEO synthesis with all available results
      setActiveTab('master');
      setProgressMsg('👑 CEO analizando todos los reportes...');
      const master = await runMasterAgent(config, allRes, onProg);
      allRes.master = master;
      setResults(prev => ({ ...prev, ...allRes }));
      const nextHistory = addToHistory(master);
      persistCache({ ...allRes, history: nextHistory, lastCEOAutoRun: new Date().toISOString().split('T')[0] });
      setCompletedSteps(prev => [...prev, 'master']);
    } catch (err) {
      setError({ agent: 'all', message: err.message });
    } finally {
      setLoading(null);
      setProgressMsg('');
    }
  };

  // ─── Brand management ──────────────────────────────────────
  const addBrand = () => {
    const b = newBrand.trim();
    if (b && !brands.includes(b)) {
      const next = [...brands, b];
      setBrands(next);
      setNewBrand('');
      persistCache({ trendScoutBrands: next });
    }
  };
  const removeBrand = (b) => {
    const next = brands.filter(x => x !== b);
    setBrands(next);
    persistCache({ trendScoutBrands: next });
  };

  const copyResult = () => {
    const r = results[activeTab];
    if (r?.content) {
      navigator.clipboard.writeText(r.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    persistCache({ history: [] });
  };

  const currentResult = results[activeTab];
  const currentTab = TABS.find(t => t.id === activeTab);
  const isLoading = loading === activeTab || loading === 'all';

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Agentes AI</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <select
                value={config.marketing?.llmProvider || 'openai'}
                onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), llmProvider: e.target.value } })}
                style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                <option value="openai">GPT-4o-mini</option>
                <option value="claude">Claude Sonnet</option>
              </select>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: (config.marketing?.llmProvider === 'claude') ? '#8b5cf620' : '#3b82f620', color: (config.marketing?.llmProvider === 'claude') ? '#8b5cf6' : '#3b82f6' }}>
                {(config.marketing?.llmProvider === 'claude') ? '🧠 Claude' : '⚡ OpenAI'}
              </span>
              <select
                value={config.marketing?.reportLanguage || 'es'}
                onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), reportLanguage: e.target.value } })}
                style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                <option value="es">🇦🇷 Español</option>
                <option value="ru">🇷🇺 Русский</option>
                <option value="ko">🇰🇷 한국어</option>
              </select>
            </div>
          </div>
        </div>
        <button
          onClick={runAllAgents}
          disabled={!!loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
            fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
          }}
        >
          {loading === 'all' ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={16} />}
          👑 CEO — Ejecutar Todos
        </button>
      </div>

      {/* Progress bar when running all */}
      {loading === 'all' && (
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(59,130,246,0.08)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {TABS.map(tab => {
              const done = completedSteps.includes(tab.id);
              const active = activeTab === tab.id && !done;
              return (
                <div key={tab.id} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: done ? tab.color : active ? `${tab.color}60` : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.5s',
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {progressMsg || 'Procesando...'} ({completedSteps.length}/{TABS.length})
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ef4444',
        }}>
          <AlertCircle size={16} />
          <span style={{ flex: 1 }}>{error.message}</span>
          <X size={14} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => setError(null)} />
        </div>
      )}

      {/* Always-On Agents Banner */}
      <div style={{ marginBottom: 16, padding: 16, borderRadius: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Sub-Agentes 24/7 — Siempre Activos
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {TABS.filter(t => t.alwaysOn).map(tab => {
            const hasData = !!results[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', borderRadius: 10, border: '1px solid',
                  borderColor: isActive ? tab.color : 'rgba(255,255,255,0.1)',
                  background: isActive ? `${tab.color}18` : 'rgba(255,255,255,0.04)',
                  color: isActive ? tab.color : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 400,
                  whiteSpace: 'nowrap', transition: 'all 0.2s',
                }}
              >
                <tab.icon size={16} />
                {tab.label}
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: 'rgba(34,197,94,0.2)', color: '#22c55e', fontWeight: 600 }}>24/7</span>
                {hasData && <span style={{ fontSize: 10, opacity: 0.7 }}>{timeAgo(results[tab.id]?.timestamp)}</span>}
                {!hasData && (
                  <button
                    onClick={(e) => { e.stopPropagation(); runAgent(tab.id); }}
                    disabled={!!loading}
                    style={{ background: tab.color, color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Ejecutar
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.filter(t => !t.alwaysOn).map(tab => {
          const isActive = activeTab === tab.id;
          const hasData = !!results[tab.id];
          const age = hasData ? timeAgo(results[tab.id].timestamp) : '';
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 10, border: '1px solid',
                borderColor: isActive ? tab.color : 'var(--border-color)',
                background: isActive ? `${tab.color}18` : 'var(--bg-card)',
                color: isActive ? tab.color : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 400,
                whiteSpace: 'nowrap', transition: 'all 0.2s', flexShrink: 0,
              }}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.alwaysOn && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: 'rgba(34,197,94,0.2)', color: '#22c55e', fontWeight: 600 }}>24/7</span>}
              {hasData && <span style={{ fontSize: 10, opacity: 0.7 }}>{age}</span>}
            </button>
          );
        })}
      </div>

      {/* Agent Content Area */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Main panel */}
        <div style={{ flex: '1 1 650px', minWidth: 0 }}>
          {/* Agent header + run button */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: currentTab.color, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <currentTab.icon size={18} />
                  Agente {currentTab.label}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentTab.desc}</span>
              </div>
              <button
                onClick={() => runAgent(activeTab)}
                disabled={isLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: currentTab.color, color: '#fff', cursor: isLoading ? 'wait' : 'pointer',
                  fontWeight: 600, fontSize: 12, opacity: isLoading ? 0.6 : 1,
                }}
              >
                {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
                {isLoading ? 'Procesando...' : 'Ejecutar'}
              </button>
            </div>

            {/* Trend Scout brand config */}
            {activeTab === 'trendScout' && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(139,92,246,0.08)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 }}>Marcas a investigar:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {brands.map(b => (
                    <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 12, background: 'rgba(139,92,246,0.15)', color: '#c084fc' }}>
                      {b}
                      <X size={12} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => removeBrand(b)} />
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={newBrand}
                    onChange={e => setNewBrand(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addBrand()}
                    placeholder="Agregar marca..."
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12 }}
                  />
                  <button onClick={addBrand} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#8b5cf6', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Dependency tips */}
            {activeTab === 'contentCreator' && !results.analyst && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(236,72,153,0.08)', borderRadius: 8, fontSize: 12, color: '#ec4899' }}>
                💡 Ejecutá primero el Analista para que el Content Creator use datos reales.
              </div>
            )}
            {activeTab === 'strategist' && !results.analyst && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(245,158,11,0.08)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
                💡 El Estratega funciona mejor con datos de los otros 3 agentes. Usá "Ejecutar Todos".
              </div>
            )}
          </div>

          {/* CEO Dashboard for Master Agent */}
          {activeTab === 'master' && currentResult?.healthScore && (
            <div style={{ marginBottom: 12, padding: 16, background: 'linear-gradient(135deg, #fbbf2410, #f59e0b10)', border: '1px solid #fbbf2440', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', background: currentResult.healthScore >= 70 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : currentResult.healthScore >= 40 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  {currentResult.healthScore}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>👑 Reporte del CEO</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{currentResult.parsedTasks?.healthJustification || ''}</div>
                </div>
              </div>
              {currentResult.parsedTasks?.ceoStatement && (
                <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 10, fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', fontStyle: 'italic', borderLeft: '3px solid #fbbf24' }}>
                  "{currentResult.parsedTasks.ceoStatement}"
                </div>
              )}
              {currentResult.alerts?.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {currentResult.alerts.map((alert, i) => (
                    <div key={i} style={{ padding: '6px 10px', marginTop: 4, background: 'rgba(239,68,68,0.1)', borderRadius: 8, fontSize: 12, color: '#ef4444' }}>🚨 {alert}</div>
                  ))}
                </div>
              )}
              {currentResult.weeklyGoals?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(34,197,94,0.08)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>🎯 Metas de la semana:</div>
                  {currentResult.weeklyGoals.map((g, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text-secondary)' }}>✓ {g}</div>
                  ))}
                </div>
              )}
              {currentResult.criticalDecisions?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: 'rgba(251,191,36,0.08)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b', marginBottom: 4 }}>⚡ Decisiones del CEO:</div>
                  {currentResult.criticalDecisions.map((d, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <b>{d.owner}</b>: {d.decision} <span style={{ opacity: 0.6 }}>— {d.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Create Tasks button for Master Agent */}
          {activeTab === 'master' && currentResult?.tasks?.length > 0 && (
            <div style={{ marginBottom: 12, padding: 12, background: '#fbbf2410', border: '1px solid #fbbf2440', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>📋 {currentResult.tasks.length} tareas generadas</span>
                <button
                  onClick={() => {
                    const tasks = currentResult.tasks || [];
                    const newTareas = tasks.map(t => ({
                      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
                      texto: t.title,
                      descripcion: t.description,
                      responsable: t.assignee,
                      prioridad: t.priority === 'alta' ? 'Urgente' : t.priority === 'media' ? 'Normal' : 'Baja',
                      estado: 'Pendiente',
                      origen: 'Agente Maestro AI',
                      categoria: t.category,
                      fechaCreacion: new Date().toISOString(),
                    }));
                    const existing = state.tareas || [];
                    updateConfig({ _directStateUpdate: true });
                    // Add tasks to state
                    if (typeof window !== 'undefined') {
                      window.__agentTasks = newTareas;
                      alert('✅ ' + newTareas.length + ' tareas creadas! Andá a Tareas para verlas.');
                    }
                  }}
                  style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: '#fbbf24', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  ➕ Crear Tareas en Dashboard
                </button>
              </div>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                {currentResult.tasks.map((t, i) => (
                  <div key={i} style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border-color)', borderLeft: `3px solid ${t.priority === 'alta' ? '#ef4444' : t.priority === 'media' ? '#f59e0b' : '#22c55e'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        <span style={{ color: t.priority === 'alta' ? '#ef4444' : t.priority === 'media' ? '#f59e0b' : '#22c55e', marginRight: 6 }}>●</span>
                        {t.title}
                      </span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#f59e0b', whiteSpace: 'nowrap' }}>{t.deadline}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{t.description}</div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>👤 {t.assignee}</span>
                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#8b5cf6' }}>{t.category}</span>
                      <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(107,114,128,0.1)', color: '#6b7280' }}>📡 {t.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Result display */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, minHeight: 300 }}>
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
                <Loader2 size={32} color={currentTab.color} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{progressMsg || 'Procesando...'}</span>
              </div>
            )}

            {!isLoading && !currentResult && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
                <currentTab.icon size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Presioná "Ejecutar" para activar el agente</span>
              </div>
            )}

            {!isLoading && currentResult && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Clock size={12} />
                    {formatTimestamp(currentResult.timestamp)}
                    <span style={{ opacity: 0.6 }}>({timeAgo(currentResult.timestamp)})</span>
                    {currentResult.tokens && (
                      <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                        {currentResult.tokens.total} tokens
                      </span>
                    )}
                  </div>
                  <button
                    onClick={copyResult}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
                      background: 'transparent', color: copied ? '#22c55e' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 11, transition: 'all 0.2s',
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <MarkdownContent text={currentResult.content} />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — History */}
        <div style={{ flex: '0 0 260px', minWidth: 240 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} /> Historial
              </h4>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 10 }}
                >
                  <Trash2 size={10} /> Limpiar
                </button>
              )}
            </div>
            {history.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin ejecuciones previas</span>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
              {history.map((entry, idx) => {
                const tab = TABS.find(t => t.id === entry.type);
                if (!tab) return null;
                return (
                  <div
                    key={idx}
                    onClick={() => { setActiveTab(entry.type); setResults(prev => ({ ...prev, [entry.type]: entry })); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid transparent', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = tab.color + '40'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <tab.icon size={14} color={tab.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{tab.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(entry.timestamp)}</div>
                    </div>
                    {entry.tokens && <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5 }}>{entry.tokens.total}t</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
