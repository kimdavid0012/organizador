import React, { useState, useEffect, useMemo } from 'react';
import { Video, RefreshCw, CheckCircle2, Circle, Calendar, ChevronLeft, ChevronRight, Clock, Music, Hash, Camera as CameraIcon, Type, ShoppingBag } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';

function getDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getTodayKey() {
    return getDateKey(new Date());
}

function getWeekDates(referenceDate) {
    const d = new Date(referenceDate);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push(date);
    }
    return dates;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_NAMES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Comprehensive TikTok content briefs
const TIKTOK_BRIEFS = [
    {
        format: 'Get Ready With Me',
        concepto: 'Preparate con un look completo Cela Vie para salir',
        guion: [
            '🎬 HOOK (0-3s): Empezá en ropa cómoda/pijama mirando a cámara. Texto: "¿Salimos?"',
            '👗 DESARROLLO (3-20s): Transición rápida. Mostrá cada prenda mientras te la ponés. Nombrá el artículo.',
            '💄 ACCESORIOS (20-35s): Sumá accesorios, maquillaje rápido, pelo.',
            '🔥 CIERRE (35-45s): Look final con giro/pose. Texto: "Lista ✨". CTA: "¿Cuál es tu prenda favorita? Comentá 👇"'
        ],
        duracion: '30-45 segundos',
        audio: 'Audio trending "Get Ready With Me" o canción pop del momento',
        hashtags: ['#GRWM', '#CelaVie', '#GetReadyWithMe', '#OutfitCompleto', '#ModaArgentina', '#OOTD', '#LookDelDia', '#FashionTikTok'],
        horario: '19:00 - 21:00 (hora pico Argentina)',
        tips: [
            'Filmá con luz natural o ring light de frente',
            'Usá trípode a altura media, plano americano',
            'Transiciones con corte al ritmo de la música',
            'Mostrá etiquetas/tags de las prendas brevemente'
        ],
        textoEnPantalla: ['"¿Salimos?"', 'Nombre de cada prenda + precio', '"Disponible en celavie.com"', '"Link en bio 🔗"'],
        categoriaProducto: 'nuevos'
    },
    {
        format: 'Outfit Check',
        concepto: 'Alguien te para en la calle y te pregunta qué tenés puesto',
        guion: [
            '🎬 HOOK (0-3s): Caminando, alguien dice "¡Para! ¿Qué tenés puesto?" (voz en off o texto)',
            '👆 DETALLE (3-15s): Zoom a cada prenda de arriba a abajo. Mostrá textura, caída.',
            '🏷️ INFO (15-25s): Texto con nombre + precio de cada artículo.',
            '💫 CIERRE (25-30s): Plano completo del look. CTA: "Guardalo para tu próximo outfit 📌"'
        ],
        duracion: '15-30 segundos',
        audio: 'Sonido viral "Outfit Check" o beat con bajo',
        hashtags: ['#OutfitCheck', '#CelaVie', '#StreetStyle', '#ModaArgentina', '#WhatImWearing', '#OOTD', '#FashionCheck', '#LookCelaVie'],
        horario: '12:00 - 14:00 (pausa almuerzo)',
        tips: [
            'Filmá en exterior (vereda, parque, local)',
            'Movimientos de cámara de arriba a abajo',
            'Que se vea bien la calidad de la tela en cada zoom',
            'Usá el efecto de cámara lenta en los zooms'
        ],
        textoEnPantalla: ['"Outfit Check ✔️"', 'Nombre prenda → Precio', '"Todo @celavie"', '"Comentá qué look querés ver 👇"'],
        categoriaProducto: 'destacados'
    },
    {
        format: 'Antes / Después',
        concepto: 'Transformación de look básico/casual a uno completo Cela Vie',
        guion: [
            '🎬 HOOK (0-3s): Mostrarte "antes" — sin arreglar, ropa básica. Cara de aburrida.',
            '✨ TRANSICIÓN (3-5s): Snap de dedos / palmada / giro = CORTE',
            '🔥 DESPUÉS (5-20s): Revelación del look armado. Plano completo + detalles.',
            '📍 CIERRE (20-30s): Posá con confianza. Texto: "Misma persona, distinto nivel". CTA: "Guardá este look 📌"'
        ],
        duracion: '15-30 segundos',
        audio: 'Audio trending de transformación (ej: "Glow Up", "Material Girl")',
        hashtags: ['#AntesYDespues', '#CelaVie', '#GlowUp', '#Transformacion', '#ModaArgentina', '#LookDelDia', '#FashionTransformation', '#BeforeAndAfter'],
        horario: '18:00 - 20:00',
        tips: [
            'El contraste tiene que ser FUERTE — cuanto más diferente, mejor',
            'La transición tiene que ser limpia y rápida',
            'Usá el mismo encuadre antes y después para máximo impacto',
            'Buena iluminación en el "después"'
        ],
        textoEnPantalla: ['"Antes 😴"', '"Después 🔥"', '"Misma persona, distinto nivel"', '"Shop: celavie.com"'],
        categoriaProducto: 'looks'
    },
    {
        format: 'POV',
        concepto: 'POV: Entrás a Cela Vie y te armamos un look completo',
        guion: [
            '🎬 HOOK (0-3s): Texto "POV: entrás a Cela Vie y..." con la cámara entrando al local',
            '👀 RECORRIDO (3-15s): Mostrá perchas, prendas, el ambiente del local',
            '🛍️ SELECCIÓN (15-30s): Elegí prendas, probátelas en el vestidor (transiciones rápidas)',
            '✨ REVEAL (30-40s): Salí del vestidor con el look armado. CTA: "¿Venís? 📍 [dirección]"'
        ],
        duracion: '30-45 segundos',
        audio: 'Música chill/aesthetic o audio viral POV',
        hashtags: ['#POV', '#CelaVie', '#ShoppingPOV', '#ModaArgentina', '#TiendaDeRopa', '#NuevosIngresos', '#FashionPOV', '#Shopping'],
        horario: '17:00 - 19:00',
        tips: [
            'Filmá en primera persona (cámara = ojos del cliente)',
            'Movimientos suaves, sin sacudir',
            'Mostrá bien el local, que se sienta "aspiracional"',
            'Si podés, usá estabilizador de celular'
        ],
        textoEnPantalla: ['"POV: entrás a Cela Vie"', '"Esto me llevo 🛍️"', '"¿Cuál elegís vos?"', '"📍 [dirección del local]"'],
        categoriaProducto: 'nuevos'
    },
    {
        format: 'Pack an Order',
        concepto: 'Preparando un pedido online paso a paso con amor',
        guion: [
            '🎬 HOOK (0-3s): Mesa con papel tissue, bolsa Cela Vie, stickers. Texto: "Preparando tu pedido 🤍"',
            '📦 PROCESO (3-25s): Mostrá la prenda, doblala con cuidado, envolvé, agregá tarjeta/sticker',
            '🎀 DETALLE (25-35s): Cerrá la bolsa/paquete. Zoom al resultado final.',
            '✉️ CIERRE (35-45s): "Ya sale para [ciudad] ✈️". CTA: "Hacé tu pedido en el link de la bio"'
        ],
        duracion: '30-45 segundos',
        audio: 'ASMR (sonido del papel) + música suave aesthetic',
        hashtags: ['#PackAnOrder', '#CelaVie', '#SmallBusiness', '#Packaging', '#PackingOrders', '#ModaArgentina', '#Emprendimiento', '#PedidoOnline'],
        horario: '20:00 - 22:00',
        tips: [
            'Cenital (cámara desde arriba) — ESENCIAL para este formato',
            'Mesa limpia, fondo aesthetic (madera, mármol, tela)',
            'Movimientos lentos y prolijos',
            'ASMR real: no pongas música muy fuerte si querés el sonido del papel'
        ],
        textoEnPantalla: ['"Preparando tu pedido 🤍"', '"Nombre del artículo"', '"Gracias por elegirnos 🥹"', '"celavie.com | Envíos a todo el país"'],
        categoriaProducto: 'pedidos'
    },
    {
        format: 'Detrás de Escena',
        concepto: 'Mostrá el proceso real: taller, producción, control de calidad',
        guion: [
            '🎬 HOOK (0-3s): Texto: "Lo que no ves detrás de cada prenda Cela Vie 🧵"',
            '🧵 PROCESO (3-20s): Tomas rápidas del taller: tela, máquina, costura, plancha',
            '👁️ CALIDAD (20-30s): Control de calidad, revisión de terminaciones',
            '👗 RESULTADO (30-40s): La prenda terminada, lista para vos. CTA: "¿Valorás el trabajo artesanal? 🤍"'
        ],
        duracion: '30-45 segundos',
        audio: 'Música inspiracional/emotional + sonido ambiente del taller',
        hashtags: ['#BehindTheScenes', '#CelaVie', '#HechoEnArgentina', '#ModaSustentable', '#Taller', '#ProduccionLocal', '#SlowFashion', '#Detras'],
        horario: '11:00 - 13:00',
        tips: [
            'Tomas cortas (2-3 seg cada una) para mantener el ritmo',
            'Mostrá manos trabajando — genera conexión',
            'Luz natural del taller queda auténtica',
            'Incluí el sonido real de las máquinas si es posible'
        ],
        textoEnPantalla: ['"Detrás de cada prenda..."', '"Diseño → Corte → Confección → Calidad"', '"Hecho con amor en Argentina 🇦🇷"', '"¿Querés ver más del proceso?"'],
        categoriaProducto: 'proceso'
    },
    {
        format: '3 Looks 1 Prenda',
        concepto: 'Una misma prenda, 3 estilos completamente diferentes',
        guion: [
            '🎬 HOOK (0-3s): Mostrá la prenda sola en percha. Texto: "1 prenda, 3 looks 👀"',
            '1️⃣ LOOK 1 (3-12s): Estilo casual/día. Transición rápida.',
            '2️⃣ LOOK 2 (12-21s): Estilo oficina/smart casual. Transición.',
            '3️⃣ LOOK 3 (21-30s): Estilo noche/elegante. CTA: "¿Cuál es tu favorito? 1, 2 o 3"'
        ],
        duracion: '25-35 segundos',
        audio: 'Canción pop/trending con 3 cambios de ritmo',
        hashtags: ['#3Looks1Prenda', '#CelaVie', '#StylingTips', '#CapsuleWardrobe', '#ModaArgentina', '#ConsejoDeModa', '#VersatileFashion', '#Outfit'],
        horario: '19:00 - 21:00',
        tips: [
            'Usá el mismo fondo para los 3 looks (comparación limpia)',
            'Transiciones sincronizadas con la música',
            'Que los 3 estilos sean MUY diferentes entre sí',
            'Podés agregar número "1/3", "2/3", "3/3" en pantalla'
        ],
        textoEnPantalla: ['"1 prenda, 3 looks"', '"Look 1: Casual ☀️"', '"Look 2: Oficina 💼"', '"Look 3: Noche ✨"', '"¿Cuál elegís? Comentá 👇"'],
        categoriaProducto: 'versatil'
    },
    {
        format: 'Haul Nuevos Ingresos',
        concepto: 'Mostrá todo lo nuevo que llegó a Cela Vie esta semana',
        guion: [
            '🎬 HOOK (0-3s): Bolsas/perchas tapadas. Texto: "Lo nuevo de esta semana 🛍️👀"',
            '🆕 PRENDAS (3-35s): Mostrá cada prenda: sacala de la bolsa, desplegala, ponétela o mostrala en percha',
            '⭐ FAVORITA (35-45s): "Mi favorita es esta" — zoom y detalles de la mejor',
            '🛒 CIERRE (45-50s): "¿Cuál te llevo? Está todo en celavie.com". CTA: "Guardá para no olvidarte 📌"'
        ],
        duracion: '40-55 segundos',
        audio: 'Música upbeat/happy trending',
        hashtags: ['#Haul', '#CelaVie', '#NuevosIngresos', '#Novedades', '#ModaArgentina', '#NewArrivals', '#FashionHaul', '#Temporada'],
        horario: '18:00 - 20:00',
        tips: [
            'No muestres todo de golpe — la revelación genera expectativa',
            'Mostrá textura pasando la mano por la tela',
            'Si podés, mostrá precio en pantalla',
            'Terminá con todas las prendas juntas en un plano general'
        ],
        textoEnPantalla: ['"Lo nuevo de esta semana 🛍️"', '"Prenda X — $XX.XXX"', '"Mi favorita 😍"', '"Todo disponible en celavie.com"'],
        categoriaProducto: 'nuevos'
    },
    {
        format: 'Respuesta a Comentario',
        concepto: 'Respondé la pregunta más frecuente de tus seguidores con video',
        guion: [
            '🎬 HOOK (0-3s): Mostrá el "comentario" (creá un mockup o usá uno real). Texto del comentario visible.',
            '💬 RESPUESTA (3-20s): Respondé con la prenda/info en mano. Sé directa y natural.',
            '📏 DEMO (20-35s): Si es sobre talle/calce, mostralo. Si es sobre combinación, armá el look.',
            '✅ CIERRE (35-40s): "Espero que te sirva 🤍". CTA: "Dejá tu pregunta y la respondo en video"'
        ],
        duracion: '25-40 segundos',
        audio: 'Audio suave de fondo o trending conversacional',
        hashtags: ['#Respuesta', '#CelaVie', '#FAQ', '#PreguntasFrecuentes', '#ModaArgentina', '#Talles', '#ConsultasClientes', '#Ayuda'],
        horario: '15:00 - 17:00',
        tips: [
            'Mirá a cámara como si hablaras con esa persona',
            'Sé auténtica y cercana, no robótica',
            'Si respondés sobre talle, mostrá la prenda puesta',
            'Usá subtítulos porque muchos ven sin audio'
        ],
        textoEnPantalla: ['"@usuario preguntó: [pregunta]"', 'Respuesta clave en texto', '"¿Más preguntas? Dejá en comentarios 💬"'],
        categoriaProducto: 'consultados'
    },
    {
        format: 'Día en el Local',
        concepto: 'Vlog estilo "un día en Cela Vie" mostrando la rutina real',
        guion: [
            '🎬 HOOK (0-3s): "Un día en Cela Vie ☀️" — mostrá la apertura del local',
            '🏪 MAÑANA (3-15s): Acomodando prendas, recibiendo mercadería, preparando vidriera',
            '🛍️ TARDE (15-30s): Clientas probándose ropa (con permiso), armando looks, asesorando',
            '🌙 CIERRE (30-40s): Cerrando el local, recap del día. CTA: "¿Te gustaría conocer el local? 📍"'
        ],
        duracion: '30-45 segundos',
        audio: 'Música chill/aesthetic "day in my life"',
        hashtags: ['#DayInMyLife', '#CelaVie', '#TiendaDeRopa', '#Emprendimiento', '#LocalDeRopa', '#VidaReal', '#ModaArgentina', '#Vlog'],
        horario: '20:00 - 22:00',
        tips: [
            'Grabá a lo largo del día, no todo junto',
            'Tomas variadas: close-up, plano general, time-lapse',
            'Mostrá momentos reales, no todo "perfecto"',
            'Un time-lapse de acomodar prendas funciona siempre'
        ],
        textoEnPantalla: ['"Un día en Cela Vie ☀️"', '"AM: Preparando el local"', '"PM: Asesorando clientas"', '"¿Venís a visitarnos? 📍"'],
        categoriaProducto: 'general'
    }
];

// Pick random products from inventory for the brief
function getProductSuggestions(products, categoria, count = 3) {
    if (!products || !products.length) return [];
    let pool = products.filter(p => p.stock > 0);
    if (categoria === 'nuevos') {
        // Sort by most recently added
        pool = [...pool].sort((a, b) => (b.updatedAt || b.id || '').localeCompare(a.updatedAt || a.id || ''));
    } else {
        pool = [...pool].sort(() => Math.random() - 0.5);
    }
    return pool.slice(0, count).map(p => ({
        codigo: p.articuloVenta || p.codigoInterno || '',
        nombre: p.nombre || p.articuloVenta || 'Producto',
        stock: p.stock || 0,
        precio: p.precioVentaL1 || p.precioVentaWeb || ''
    }));
}

function pickRandomBriefs(count, seed) {
    // Use seed for deterministic daily picks
    const shuffled = [...TIKTOK_BRIEFS];
    let s = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
        s = (s * 9301 + 49297) % 233280;
        const j = s % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
}

function dateToSeed(dateStr) {
    const parts = dateStr.split('-');
    return parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
}

function generateDayBriefs(dateKey, products) {
    const seed = dateToSeed(dateKey);
    const picked = pickRandomBriefs(3, seed);
    return picked.map((brief, idx) => ({
        id: `tt-${dateKey}-${idx + 1}`,
        ...brief,
        productos: getProductSuggestions(products, brief.categoriaProducto),
        realizado: false,
        completedAt: null
    }));
}

const SectionLabel = ({ icon: Icon, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 }}>
        <Icon size={14} />
        {label}
    </div>
);

export default function TikTokContentPage() {
    const { state, updateConfig } = useData();
    const { user } = useAuth();
    const today = getTodayKey();
    const [view, setView] = useState('hoy'); // 'hoy' or 'semana'
    const [weekOffset, setWeekOffset] = useState(0);
    const [expandedId, setExpandedId] = useState(null);

    const products = state.config.posProductos || [];
    const tiktokCalendar = state.config.tiktokCalendar || {};

    // Get current week dates
    const refDate = new Date();
    refDate.setDate(refDate.getDate() + weekOffset * 7);
    const weekDates = useMemo(() => getWeekDates(refDate), [weekOffset]);

    // Ensure today's briefs exist
    useEffect(() => {
        if (!tiktokCalendar[today]) {
            const briefs = generateDayBriefs(today, products);
            updateConfig({
                tiktokCalendar: {
                    ...tiktokCalendar,
                    [today]: { options: briefs }
                }
            });
        }
    }, [today]);

    // Ensure full week is generated when viewing calendar
    useEffect(() => {
        if (view !== 'semana') return;
        let needsUpdate = false;
        const updated = { ...tiktokCalendar };
        weekDates.forEach(d => {
            const key = getDateKey(d);
            if (!updated[key]) {
                updated[key] = { options: generateDayBriefs(key, products) };
                needsUpdate = true;
            }
        });
        if (needsUpdate) {
            updateConfig({ tiktokCalendar: updated });
        }
    }, [view, weekOffset]);

    const todayBriefs = tiktokCalendar[today]?.options || [];

    const handleToggle = (dateKey, optionId) => {
        const dayData = tiktokCalendar[dateKey];
        if (!dayData) return;
        const updated = dayData.options.map(opt =>
            opt.id === optionId ? { ...opt, realizado: !opt.realizado, completedAt: !opt.realizado ? new Date().toISOString() : null } : opt
        );
        updateConfig({
            tiktokCalendar: {
                ...tiktokCalendar,
                [dateKey]: { ...dayData, options: updated }
            }
        });
    };

    const handleRegenerate = (dateKey) => {
        const briefs = generateDayBriefs(dateKey + '-' + Date.now(), products);
        // Re-assign IDs with the actual date
        const fixed = briefs.map((b, i) => ({ ...b, id: `tt-${dateKey}-${i + 1}-r` }));
        updateConfig({
            tiktokCalendar: {
                ...tiktokCalendar,
                [dateKey]: { options: fixed }
            }
        });
    };

    const renderBrief = (opt, dateKey, compact = false) => {
        const isExpanded = expandedId === opt.id;
        return (
            <div
                key={opt.id}
                style={{
                    background: 'var(--bg-card, rgba(25, 25, 40, 0.55))',
                    border: opt.realizado
                        ? '1px solid var(--success, #22c55e)'
                        : '1px solid var(--border-color, rgba(255,255,255,0.08))',
                    borderRadius: 14, padding: compact ? '14px 16px' : '20px 24px',
                    transition: 'all 0.2s'
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <button
                        onClick={() => handleToggle(dateKey, opt.id)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: opt.realizado ? 'var(--success, #22c55e)' : 'var(--text-muted)',
                            padding: 0, marginTop: 2, flexShrink: 0
                        }}
                    >
                        {opt.realizado ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{
                                background: 'rgba(20, 184, 166, 0.15)', color: 'var(--accent)',
                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700
                            }}>
                                {opt.format}
                            </span>
                            <span style={{
                                background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                padding: '3px 8px', borderRadius: 6, fontSize: 11
                            }}>
                                ⏱ {opt.duracion}
                            </span>
                            <span style={{
                                background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                                padding: '3px 8px', borderRadius: 6, fontSize: 11
                            }}>
                                📅 {opt.horario}
                            </span>
                        </div>
                        <h3 style={{
                            margin: 0, fontSize: 15, fontWeight: 600,
                            color: opt.realizado ? 'var(--text-muted)' : 'var(--text-primary)',
                            textDecoration: opt.realizado ? 'line-through' : 'none'
                        }}>
                            {opt.concepto}
                        </h3>

                        {/* Always show guión summary */}
                        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {opt.guion[0]}
                        </div>

                        {/* Expand/collapse */}
                        <button
                            onClick={() => setExpandedId(isExpanded ? null : opt.id)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                                padding: '6px 0', marginTop: 4
                            }}
                        >
                            {isExpanded ? '▲ Ver menos' : '▼ Ver brief completo'}
                        </button>

                        {isExpanded && (
                            <div style={{ marginTop: 8 }}>
                                {/* Full Script */}
                                <SectionLabel icon={Video} label="Guión paso a paso" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {opt.guion.map((step, i) => (
                                        <div key={i} style={{
                                            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
                                            padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6
                                        }}>
                                            {step}
                                        </div>
                                    ))}
                                </div>

                                {/* Audio */}
                                <SectionLabel icon={Music} label="Audio / Música" />
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0' }}>
                                    🎵 {opt.audio}
                                </div>

                                {/* Filming Tips */}
                                <SectionLabel icon={CameraIcon} label="Tips de Filmación" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {opt.tips.map((tip, i) => (
                                        <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                            📷 {tip}
                                        </div>
                                    ))}
                                </div>

                                {/* On-screen Text */}
                                <SectionLabel icon={Type} label="Texto en Pantalla" />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {opt.textoEnPantalla.map((txt, i) => (
                                        <span key={i} style={{
                                            fontSize: 12, color: 'var(--text-primary)',
                                            background: 'rgba(255,255,255,0.06)',
                                            padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)'
                                        }}>
                                            {txt}
                                        </span>
                                    ))}
                                </div>

                                {/* Products to Feature */}
                                {opt.productos && opt.productos.length > 0 && (
                                    <>
                                        <SectionLabel icon={ShoppingBag} label="Productos a Destacar" />
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {opt.productos.map((p, i) => (
                                                <div key={i} style={{
                                                    fontSize: 12, padding: '6px 12px', borderRadius: 8,
                                                    background: 'rgba(20, 184, 166, 0.08)',
                                                    border: '1px solid rgba(20, 184, 166, 0.15)'
                                                }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{p.codigo}</span>
                                                    <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>{p.nombre}</span>
                                                    {p.precio && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>$ {Number(p.precio).toLocaleString('es-AR')}</span>}
                                                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({p.stock} un)</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Hashtags */}
                                <SectionLabel icon={Hash} label="Hashtags" />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {opt.hashtags.map(tag => (
                                        <span key={tag} style={{
                                            fontSize: 11, color: 'var(--accent)',
                                            background: 'rgba(20, 184, 166, 0.08)',
                                            padding: '2px 8px', borderRadius: 4
                                        }}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                {/* Posting Time */}
                                <SectionLabel icon={Clock} label="Mejor Horario" />
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0' }}>
                                    🕐 Publicar {opt.horario}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Video size={28} style={{ color: 'var(--accent)' }} />
                    <div>
                        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 22, fontWeight: 700 }}>
                            TikTok Content Planner
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
                            Briefs completos listos para filmar
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => setView('hoy')}
                        className={`btn ${view === 'hoy' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 13 }}
                    >
                        Hoy
                    </button>
                    <button
                        onClick={() => { setView('semana'); setWeekOffset(0); }}
                        className={`btn ${view === 'semana' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 13 }}
                    >
                        <Calendar size={14} /> Semana
                    </button>
                </div>
            </div>

            {/* TODAY VIEW */}
            {view === 'hoy' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                            {today} — {todayBriefs.filter(o => o.realizado).length}/{todayBriefs.length} completados
                        </div>
                        <button
                            onClick={() => handleRegenerate(today)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', borderRadius: 8,
                                background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                                fontSize: 12, fontWeight: 600
                            }}
                        >
                            <RefreshCw size={14} /> Regenerar ideas
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {todayBriefs.map(opt => renderBrief(opt, today))}
                    </div>
                    {todayBriefs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            Generando briefs para hoy...
                        </div>
                    )}
                </>
            )}

            {/* WEEKLY CALENDAR VIEW */}
            {view === 'semana' && (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <button onClick={() => setWeekOffset(w => w - 1)} className="btn btn-secondary btn-sm">
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {getDateKey(weekDates[0])} — {getDateKey(weekDates[6])}
                        </span>
                        <button onClick={() => setWeekOffset(w => w + 1)} className="btn btn-secondary btn-sm">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {weekDates.map((date, dayIdx) => {
                            const dateKey = getDateKey(date);
                            const isToday = dateKey === today;
                            const dayBriefs = tiktokCalendar[dateKey]?.options || [];
                            const doneCount = dayBriefs.filter(o => o.realizado).length;
                            return (
                                <div key={dateKey}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                                        background: isToday ? 'rgba(20, 184, 166, 0.1)' : 'rgba(255,255,255,0.03)',
                                        border: isToday ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                {DAY_NAMES_FULL[dayIdx]}
                                            </span>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateKey}</span>
                                            {isToday && <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>HOY</span>}
                                            <span style={{ fontSize: 12, color: doneCount === dayBriefs.length && dayBriefs.length > 0 ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}>
                                                {doneCount}/{dayBriefs.length}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRegenerate(dateKey)}
                                            style={{
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: 'var(--text-muted)', padding: 4
                                            }}
                                            title="Regenerar"
                                        >
                                            <RefreshCw size={14} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 8 }}>
                                        {dayBriefs.map(opt => renderBrief(opt, dateKey, true))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}


