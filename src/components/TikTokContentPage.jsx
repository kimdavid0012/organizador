import React, { useState, useEffect, useMemo } from 'react';
import { Video, RefreshCw, CheckCircle2, Circle } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

const TIKTOK_TEMPLATES = [
    { format: 'OOTD', desc: 'Outfit del día mostrando combinaciones de prendas Cela Vie', hashtags: ['#OOTD', '#CelaVie', '#OutfitDelDia', '#ModaArgentina'] },
    { format: 'Detrás de escena', desc: 'Proceso de producción, taller, corte de tela', hashtags: ['#BehindTheScenes', '#CelaVie', '#ModaSustentable', '#Taller'] },
    { format: 'Tendencia', desc: 'Replicar tendencia viral con ropa Cela Vie', hashtags: ['#Trending', '#CelaVie', '#TendenciaModa', '#ViralFashion'] },
    { format: 'Antes/Después', desc: 'Transformación de look casual a elegante', hashtags: ['#AntesYDespues', '#CelaVie', '#Transformacion', '#LookDelDia'] },
    { format: 'Styling tips', desc: '3 formas de usar una misma prenda', hashtags: ['#StylingTips', '#CelaVie', '#ConsejoDeModa', '#3Looks'] },
    { format: 'Haul', desc: 'Mostrar nuevos ingresos de temporada', hashtags: ['#Haul', '#CelaVie', '#NuevaTemporada', '#Novedades'] },
    { format: 'Get Ready With Me', desc: 'Prepararse con outfit completo Cela Vie', hashtags: ['#GRWM', '#CelaVie', '#GetReadyWithMe', '#OutfitCompleto'] },
    { format: 'Respuesta a comentario', desc: 'Responder preguntas frecuentes de clientes', hashtags: ['#FAQ', '#CelaVie', '#Respuestas', '#ClientesFelices'] },
];

const TITLE_PREFIXES = [
    'Inspiración:', 'Idea del día:', 'Contenido:', 'Para hoy:', 'Propuesta:'
];

function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function pickRandom(arr, count) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function generateOptions() {
    const picked = pickRandom(TIKTOK_TEMPLATES, 3);
    return picked.map((tpl, idx) => {
        const prefix = TITLE_PREFIXES[Math.floor(Math.random() * TITLE_PREFIXES.length)];
        return {
            id: `tt-${idx + 1}`,
            format: tpl.format,
            title: `${prefix} ${tpl.format}`,
            description: tpl.desc,
            hashtags: tpl.hashtags,
            realizado: false
        };
    });
}

export default function TikTokContentPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const today = getTodayKey();

    const tiktokData = state.config.tiktokDailyOptions || null;

    const options = useMemo(() => {
        if (tiktokData && tiktokData.fecha === today) {
            return tiktokData.options;
        }
        return null;
    }, [tiktokData, today]);

    useEffect(() => {
        if (!options) {
            const newOptions = generateOptions();
            updateConfig({
                tiktokDailyOptions: {
                    fecha: today,
                    options: newOptions
                }
            });
        }
    }, [options, today, updateConfig]);

    const handleToggleRealizado = (optionId) => {
        if (!tiktokData) return;
        const updated = tiktokData.options.map(opt =>
            opt.id === optionId ? { ...opt, realizado: !opt.realizado } : opt
        );
        updateConfig({
            tiktokDailyOptions: {
                ...tiktokData,
                options: updated
            }
        });
    };

    const handleRegenerate = () => {
        const newOptions = generateOptions();
        updateConfig({
            tiktokDailyOptions: {
                fecha: today,
                options: newOptions
            }
        });
    };

    const displayOptions = options || [];

    return (
        <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Video size={28} style={{ color: 'var(--accent)' }} />
                    <div>
                        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22, fontWeight: 700 }}>
                            TikTok - Ideas del Día
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                            {today}
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleRegenerate}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 10,
                        background: 'var(--accent)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontWeight: 600,
                        fontSize: 13, transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                    <RefreshCw size={16} />
                    Generar nuevas ideas
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {displayOptions.map(opt => (
                    <div
                        key={opt.id}
                        style={{
                            background: 'var(--bg-card, rgba(25, 25, 40, 0.55))',
                            border: opt.realizado
                                ? '1px solid var(--success, #22c55e)'
                                : '1px solid var(--border-color, rgba(255,255,255,0.08))',
                            borderRadius: 14, padding: '20px 24px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                            <button
                                onClick={() => handleToggleRealizado(opt.id)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: opt.realizado ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                                    padding: 0, marginTop: 2, flexShrink: 0
                                }}
                            >
                                {opt.realizado
                                    ? <CheckCircle2 size={24} />
                                    : <Circle size={24} />
                                }
                            </button>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                    <span style={{
                                        background: 'rgba(20, 184, 166, 0.15)',
                                        color: 'var(--accent)',
                                        padding: '3px 10px', borderRadius: 6,
                                        fontSize: 11, fontWeight: 700, letterSpacing: 0.3
                                    }}>
                                        {opt.format}
                                    </span>
                                    <h3 style={{
                                        margin: 0, fontSize: 16, fontWeight: 600,
                                        color: opt.realizado ? 'var(--text-muted)' : 'var(--text-primary)',
                                        textDecoration: opt.realizado ? 'line-through' : 'none'
                                    }}>
                                        {opt.title}
                                    </h3>
                                </div>
                                <p style={{
                                    margin: 0, fontSize: 14,
                                    color: 'var(--text-secondary)', lineHeight: 1.5
                                }}>
                                    {opt.description}
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                    {(opt.hashtags || []).map(tag => (
                                        <span
                                            key={tag}
                                            style={{
                                                fontSize: 11, color: 'var(--accent)',
                                                background: 'rgba(20, 184, 166, 0.08)',
                                                padding: '2px 8px', borderRadius: 4
                                            }}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {displayOptions.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: 40,
                    color: 'var(--text-muted)', fontSize: 14
                }}>
                    Generando ideas para hoy...
                </div>
            )}
        </div>
    );
}
