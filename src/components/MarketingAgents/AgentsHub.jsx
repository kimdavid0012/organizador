import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Zap, BarChart3, Globe, Instagram, Brain, Play, Loader2, Clock,
  ChevronDown, ChevronRight, Plus, X, Trash2, RefreshCw, Copy, Check,
  AlertCircle
} from 'lucide-react';
import { useData } from '../../store/DataContext';
import {
  runAnalystAgent,
  runTrendScoutAgent,
  runContentAgent,
  runStrategistAgent
} from '../../services/agentService';

const TABS = [
  { id: 'analyst', label: 'Analista', icon: BarChart3, color: '#3b82f6', desc: 'Reporte diario consolidado' },
  { id: 'trendScout', label: 'Trend Scout', icon: Globe, color: '#8b5cf6', desc: 'Tendencias de moda' },
  { id: 'contentCreator', label: 'Content', icon: Instagram, color: '#ec4899', desc: 'Plan de contenido IG' },
  { id: 'strategist', label: 'Estratega', icon: Brain, color: '#f59e0b', desc: 'Recomendaciones estratégicas' },
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

  // ─── Run all agents in sequence ────────────────────────────
  const runAllAgents = async () => {
    setLoading('all');
    setError(null);
    setCompletedSteps([]);
    try {
      setActiveTab('analyst');
      const analyst = await runAnalystAgent(config, state, onProgress);
      setResults(prev => ({ ...prev, analyst }));
      addToHistory(analyst);
      setCompletedSteps(['analyst']);

      setActiveTab('trendScout');
      const trendScout = await runTrendScoutAgent(config, brands, onProgress);
      setResults(prev => ({ ...prev, trendScout }));
      addToHistory(trendScout);
      setCompletedSteps(['analyst', 'trendScout']);

      setActiveTab('contentCreator');
      const content = await runContentAgent(config, analyst, trendScout, onProgress);
      setResults(prev => ({ ...prev, contentCreator: content }));
      addToHistory(content);
      setCompletedSteps(['analyst', 'trendScout', 'contentCreator']);

      setActiveTab('strategist');
      const strategist = await runStrategistAgent(config, analyst, trendScout, content, onProgress);
      const finalResults = { analyst, trendScout, contentCreator: content, strategist };
      setResults(finalResults);
      const nextHistory = addToHistory(strategist);
      persistCache({ ...finalResults, history: nextHistory });
      setCompletedSteps(['analyst', 'trendScout', 'contentCreator', 'strategist']);
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
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Marketing Intelligence System</span>
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
          {loading === 'all' ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={16} />}
          Ejecutar Todos
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
            {progressMsg || 'Procesando...'} ({completedSteps.length}/4)
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.map(tab => {
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
