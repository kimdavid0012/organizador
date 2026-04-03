import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, BarChart3, Globe, Instagram, Brain, Play, Loader2, Clock,
  ChevronDown, ChevronRight, Plus, X, Trash2, RefreshCw
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

export default function AgentsHub() {
  const { state, updateConfig } = useData();
  const { config } = state;
  const agentsCache = config.agentsCache || {};

  const [activeTab, setActiveTab] = useState('analyst');
  const [loading, setLoading] = useState(null);
  const [results, setResults] = useState(agentsCache);
  const [brands, setBrands] = useState(agentsCache.trendScoutBrands || DEFAULT_BRANDS);
  const [newBrand, setNewBrand] = useState('');
  const [history, setHistory] = useState(agentsCache.history || []);

  // Persist to Firestore
  const persistCache = useCallback((overrides = {}) => {
    const next = { ...results, history, trendScoutBrands: brands, ...overrides };
    updateConfig({ agentsCache: next });
  }, [results, history, brands, updateConfig]);

  // Restore from cache
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

  // ─── Run individual agents ─────────────────────────────────
  const runAgent = async (agentId) => {
    setLoading(agentId);
    try {
      let result;
      switch (agentId) {
        case 'analyst':
          result = await runAnalystAgent(config, state);
          break;
        case 'trendScout':
          result = await runTrendScoutAgent(config, brands);
          break;
        case 'contentCreator':
          result = await runContentAgent(config, results.analyst, results.trendScout);
          break;
        case 'strategist':
          result = await runStrategistAgent(config, results.analyst, results.trendScout, results.contentCreator);
          break;
        default:
          return;
      }
      const nextResults = { ...results, [agentId]: result };
      setResults(nextResults);
      const nextHistory = addToHistory(result);
      persistCache({ ...nextResults, history: nextHistory });
    } catch (err) {
      alert(`Error en agente ${agentId}: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  // ─── Run all agents in sequence ────────────────────────────
  const runAllAgents = async () => {
    setLoading('all');
    try {
      // 1. Analyst
      setActiveTab('analyst');
      const analyst = await runAnalystAgent(config, state);
      setResults(prev => ({ ...prev, analyst }));
      addToHistory(analyst);

      // 2. Trend Scout
      setActiveTab('trendScout');
      const trendScout = await runTrendScoutAgent(config, brands);
      setResults(prev => ({ ...prev, trendScout }));
      addToHistory(trendScout);

      // 3. Content Creator (uses analyst + trend data)
      setActiveTab('contentCreator');
      const content = await runContentAgent(config, analyst, trendScout);
      setResults(prev => ({ ...prev, contentCreator: content }));
      addToHistory(content);

      // 4. Strategist (uses all three)
      setActiveTab('strategist');
      const strategist = await runStrategistAgent(config, analyst, trendScout, content);
      const finalResults = { analyst, trendScout, contentCreator: content, strategist };
      setResults(finalResults);
      const nextHistory = addToHistory(strategist);
      persistCache({ ...finalResults, history: nextHistory });
    } catch (err) {
      alert(`Error en cadena de agentes: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  // ─── Brand management for Trend Scout ──────────────────────
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

  // ─── Render helpers ────────────────────────────────────────
  const currentResult = results[activeTab];
  const currentTab = TABS.find(t => t.id === activeTab);
  const isLoading = loading === activeTab || loading === 'all';

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

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
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
            fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1,
            transition: 'all 0.2s',
          }}
        >
          {loading === 'all' ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          Ejecutar Todos los Agentes
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const hasData = !!results[tab.id];
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
              {hasData && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />}
            </button>
          );
        })}
      </div>

      {/* Agent Content Area */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Main panel */}
        <div style={{ flex: '1 1 650px', minWidth: 0 }}>
          {/* Agent header + run button */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 14, padding: 20, marginBottom: 16,
          }}>
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
                {isLoading ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                {isLoading ? 'Procesando...' : 'Ejecutar'}
              </button>
            </div>

            {/* Trend Scout brand config */}
            {activeTab === 'trendScout' && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(139,92,246,0.08)', borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6', marginBottom: 8 }}>Marcas a investigar:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {brands.map(b => (
                    <span key={b} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 6, fontSize: 12,
                      background: 'rgba(139,92,246,0.15)', color: '#c084fc',
                    }}>
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
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
                      background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12,
                    }}
                  />
                  <button onClick={addBrand} style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none',
                    background: '#8b5cf6', color: '#fff', cursor: 'pointer', fontSize: 12,
                  }}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Content Creator dependency notice */}
            {activeTab === 'contentCreator' && !results.analyst && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(236,72,153,0.08)', borderRadius: 8, fontSize: 12, color: '#ec4899' }}>
                💡 Tip: Ejecutá primero el Agente Analista para que el Content Creator use datos reales de ventas.
              </div>
            )}
            {activeTab === 'strategist' && !results.analyst && (
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(245,158,11,0.08)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
                💡 Tip: El Estratega funciona mejor cuando tiene datos de los otros 3 agentes. Ejecutá "Todos los Agentes" para el análisis completo.
              </div>
            )}
          </div>

          {/* Result display */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 14, padding: 20, minHeight: 300,
          }}>
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
                <Loader2 size={32} color={currentTab.color} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  {activeTab === 'analyst' && 'Recopilando datos de Meta Ads + WooCommerce + POS...'}
                  {activeTab === 'trendScout' && `Investigando tendencias de ${brands.join(', ')}...`}
                  {activeTab === 'contentCreator' && 'Generando plan de contenido semanal...'}
                  {activeTab === 'strategist' && 'Analizando toda la información y generando estrategia...'}
                </span>
              </div>
            )}

            {!isLoading && !currentResult && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
                <currentTab.icon size={40} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  Presioná "Ejecutar" para activar el agente
                </span>
              </div>
            )}

            {!isLoading && currentResult && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    {formatTimestamp(currentResult.timestamp)}
                  </span>
                </div>
                <div style={{
                  fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {currentResult.content}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — History */}
        <div style={{ flex: '0 0 260px', minWidth: 240 }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 14, padding: 16,
          }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> Historial
            </h4>
            {history.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin ejecuciones previas</span>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
              {history.map((entry, idx) => {
                const tab = TABS.find(t => t.id === entry.type);
                if (!tab) return null;
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setActiveTab(entry.type);
                      setResults(prev => ({ ...prev, [entry.type]: entry }));
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = tab.color + '40'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <tab.icon size={14} color={tab.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>{tab.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{formatTimestamp(entry.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
