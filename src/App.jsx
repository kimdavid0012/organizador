import React, { useState, useMemo, useEffect } from 'react';
import {
    LayoutDashboard, BookOpen, Scissors, Settings as SettingsIcon, HardDrive, Globe, Factory, UserCheck, PackageOpen, Users, Store, Megaphone, ShoppingCart, MoreHorizontal, X as XIcon, Boxes, Camera, Landmark, BarChart3, FileText, Wallet, Instagram, Zap, Menu, Video, TableProperties
} from 'lucide-react';
import { DataProvider, useData } from './store/DataContext';
import { I18nProvider, useI18n } from './store/I18nContext';
import { getStorageUsage } from './store/storage';
import { isTodayOrOverdue } from './utils/helpers';
import Header from './components/Header';
import KanbanBoard from './components/KanbanBoard';
import Library from './components/Library';
import FabricCatalog from './components/FabricCatalog';
import Settings from './components/Settings';
import CortadoresPage from './components/CortadoresPage';
import TalleresPage from './components/TalleresPage';
import CortesPage from './components/CortesPage';
import EmpleadosPage from './components/EmpleadosPage';
import PedidosOnlinePage from './components/PedidosOnlinePage';
import PosPage from './components/POS/PosPage';
import MarketingSection from './components/MarketingSection.jsx';
import PaginaWebSection from './components/PaginaWebSection.jsx';
import ConteoMercaderiaPage from './components/ConteoMercaderiaPage.jsx';
import FotosPage from './components/FotosPage.jsx';
import FotosPrendasPage from './components/FotosPrendasPage.jsx';
import InstagramPlannerPage from './components/InstagramPlannerPage.jsx';
import MesanPage from './components/MesanPage.jsx';
import BankPaymentsPage from './components/BankPaymentsPage.jsx';
import InformesPage from './components/InformesPage.jsx';
import AgentsHub from './components/MarketingAgents/AgentsHub.jsx';
import SaldoPage from './components/SaldoPage.jsx';
import TikTokContentPage from './components/TikTokContentPage.jsx';
import DailyTasksPanel from './components/DailyTasksPanel.jsx';
import MoldModal from './components/MoldModal';
import TaskModal from './components/TaskModal';
import Login from './components/Login';
import ClientesPage from './components/ClientesPage';
import PosProductos from './components/POS/PosProductos';
import { AuthProvider, useAuth } from './store/AuthContext';
import AIAssistant from './components/AIAssistant';
import YuliyaPage from './components/YuliyaPage';
import OfflineIndicator from './components/OfflineIndicator';
import { firebaseConfigured, firebaseConfigMissingKeys } from './store/firebase';
import './App.css';

const LEGACY_PURPLE_ACCENTS = new Set(['#8b5cf6', '#7c3aed', '#a855f7', '#c084fc']);
const DEFAULT_ACCENT = '#14b8a6';
const DEFAULT_ACCENT_HOVER = '#0f766e';
const DAILY_QUOTE_STORAGE_KEY = 'organizador_daily_inspiration_quotes';

const DAILY_QUOTES = [
    'Hoy ya es una oportunidad nueva para agradecer, respirar y volver a empezar con ganas.',
    'Cada pequeño avance de hoy construye un futuro mucho más grande de lo que parece.',
    'Lo que hacemos con cariño también deja huella en la vida de los demás.',
    'Empezar el día con buena energía también es una forma de cuidar al equipo.',
    'No hace falta que todo sea perfecto: hace falta que hoy demos lo mejor que podamos.',
    'La vida siempre devuelve algo lindo cuando trabajamos con corazón y constancia.',
    'A veces un buen día empieza con algo simple: estar vivos, juntos y con una nueva chance.',
    'Todo lo que hoy ordenemos con amor mañana se transforma en tranquilidad.',
    'Hay fuerza en cada persona de este equipo, incluso en los días más cansados.',
    'Respirar, agradecer y seguir: a veces ahí está toda la magia del día.',
    'Cada tarea hecha con intención suma más de lo que se ve en el momento.',
    'La paciencia también es productividad cuando se trabaja con propósito.',
    'Hoy puede ser un gran día si recordamos todo lo que ya hemos podido superar.',
    'El esfuerzo compartido vale el doble cuando se hace con respeto y buena energía.',
    'Que nunca falte gratitud por el trabajo, por la salud y por una nueva mañana.',
    'Incluso los días intensos pueden traer algo hermoso si los atravesamos con calma.',
    'La actitud con la que empezamos el día cambia la forma en que vivimos todo lo demás.',
    'Cada uno aporta algo único, y eso hace especial a este equipo.',
    'Agradecer lo que sí tenemos también nos da fuerza para ir por lo que falta.',
    'Un día a la vez, una mejora a la vez, un paso a la vez: así se construyen cosas grandes.',
    'La vida florece mejor donde hay compromiso, respeto y ganas de salir adelante.',
    'Que este día nos encuentre presentes, enfocados y con el corazón liviano.',
    'Lo bueno también se entrena: la paciencia, la alegría y la forma de mirar el día.',
    'Trabajar con amor propio y con respeto por los demás también es crecer.',
    'Hoy puede pasar algo muy bueno, aunque todavía no lo sepamos.',
    'Valorar lo cotidiano también es una forma profunda de felicidad.',
    'Cada amanecer trae la posibilidad de hacerlo un poco mejor que ayer.',
    'Lo que hacemos con disciplina y buena intención termina dando fruto.',
    'Que hoy no nos falte energía, claridad ni gratitud por estar acá.',
    'El verdadero progreso también se nota en la calma con la que resolvemos las cosas.',
    'Que este comienzo de día nos recuerde que siempre vale la pena seguir apostando.',
    'Hay días para correr y días para respirar; ambos también forman parte del camino.'
];

const normalizeAccentColor = (value) => {
    const normalized = (value || '').toLowerCase();
    return LEGACY_PURPLE_ACCENTS.has(normalized) ? DEFAULT_ACCENT : (value || DEFAULT_ACCENT);
};

const getTodayLocalDateKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const hashString = (value = '') => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
};

const buildUserQuoteOrder = (email = '') => {
    const seed = hashString(email.toLowerCase()) || 1;
    return DAILY_QUOTES
        .map((quote, index) => ({
            id: `q-${index + 1}`,
            quote,
            sort: (seed * (index + 3) + ((index + 1) * 97)) % 10007
        }))
        .sort((left, right) => left.sort - right.sort);
};

const getDailyQuoteForUser = (user) => {
    if (!user?.email) return null;

    const emailKey = user.email.toLowerCase();
    const todayKey = getTodayLocalDateKey();
    const stored = JSON.parse(localStorage.getItem(DAILY_QUOTE_STORAGE_KEY) || '{}');
    const current = stored[emailKey] || { lastShownDate: '', usedIds: [] };

    if (current.lastShownDate === todayKey && current.quoteId) {
        const existing = DAILY_QUOTES.findIndex((_, index) => `q-${index + 1}` === current.quoteId);
        if (existing >= 0) {
            return {
                shouldShow: false,
                quote: DAILY_QUOTES[existing]
            };
        }
    }

    const order = buildUserQuoteOrder(emailKey);
    let usedIds = Array.isArray(current.usedIds) ? current.usedIds : [];
    let next = order.find((item) => !usedIds.includes(item.id));

    if (!next) {
        usedIds = [];
        next = order[0];
    }

    stored[emailKey] = {
        lastShownDate: todayKey,
        quoteId: next.id,
        usedIds: [...usedIds, next.id]
    };
    localStorage.setItem(DAILY_QUOTE_STORAGE_KEY, JSON.stringify(stored));

    return {
        shouldShow: true,
        quote: next.quote
    };
};

// ===== Mobile Bottom Nav with "More" popup =====
function MobileNav({ navItems, view, setView }) {
    const [showMore, setShowMore] = useState(false);
    // Show first 4 items + "Más" button
    const mainItems = navItems.slice(0, 4);
    const moreItems = navItems.slice(4);
    const isInMore = moreItems.find(i => i.id === view);

    return (
        <>
            {showMore && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.7)', zIndex: 9991,
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
                    }}
                    onClick={() => setShowMore(false)}
                >
                    <div
                        style={{
                            background: 'var(--bg-card, #1e1e2e)',
                            borderRadius: '16px 16px 0 0',
                            padding: '16px 12px',
                            paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
                            width: '100%', maxWidth: 500,
                            maxHeight: '70vh', overflowY: 'auto'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
                            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Menú</span>
                            <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                                <XIcon size={20} />
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {navItems.map(item => (
                                <div
                                    key={`more-${item.id}`}
                                    onClick={() => { setView(item.id); setShowMore(false); }}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                        padding: '14px 8px', borderRadius: 12, cursor: 'pointer',
                                        background: view === item.id ? 'rgba(20, 184, 166, 0.15)' : 'rgba(255,255,255,0.03)',
                                        color: view === item.id ? `var(--accent, ${DEFAULT_ACCENT})` : 'var(--text-secondary)',
                                        border: view === item.id ? '1px solid rgba(20, 184, 166, 0.3)' : '1px solid transparent',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <item.icon size={22} />
                                    <span style={{ fontSize: 11, fontWeight: 500, textAlign: 'center', lineHeight: 1.2 }}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <nav className="mobile-bottom-nav">
                {mainItems.map(item => (
                    <div
                        key={`mob-${item.id}`}
                        className={`mobile-nav-item ${view === item.id ? 'active' : ''}`}
                        onClick={() => setView(item.id)}
                    >
                        <item.icon />
                        <span>{item.label.length > 7 ? item.label.slice(0, 6) + '…' : item.label}</span>
                    </div>
                ))}
                {moreItems.length > 0 && (
                    <div
                        className={`mobile-nav-item ${isInMore ? 'active' : ''}`}
                        onClick={() => setShowMore(true)}
                    >
                        <MoreHorizontal />
                        <span>Más</span>
                    </div>
                )}
            </nav>
        </>
    );
}

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, errorInfo) { console.error("App Crash:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 40, textAlign: 'center', background: '#121212', color: 'white', minHeight: '100vh' }}>
                    <h2>Oops! Algo salió mal.</h2>
                    <p>La aplicación encontró un error inesperado:</p>
                    <div style={{
                        background: '#222', padding: 20, borderRadius: 8,
                        margin: '20px auto', maxWidth: 600, textAlign: 'left',
                        fontFamily: 'monospace', fontSize: 12, overflow: 'auto',
                        border: '1px solid #444', color: '#ff5555'
                    }}>
                        {this.state.error && this.state.error.toString()}
                    </div>
                    <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar página</button>
                    <div style={{ marginTop: 20, fontSize: 10, color: '#444' }}>
                        Por favor, enviame una captura de este error para que pueda arreglarlo.
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function AppContent() {
    const { state, addMolde, addTarea, syncStatus, updateConfig, runPriceMigration2026April, runPriceMigrationL2Fix, runPriceMigrationL2Force, runPriceMigrationL2Uniform, runPriceMigrationL2Fix2, forceSaveNow } = useData();
    const [saveStatus, setSaveStatus] = React.useState('idle'); // idle | saving | saved | error
    const { moldes, telas, config } = state;
    const { t, lang, changeLang, LANGUAGE_LABELS } = useI18n();
    const { user, users, originalAdmin, logout, switchUser, getAllowedSections } = useAuth(); // Auth integration

    const initialView = () => {
        const allowed = getAllowedSections(user.role, user.email);
        if (allowed.includes('kanban')) return 'kanban';
        return allowed[0] || 'kanban';
    };
    const [view, setView] = useState(initialView());
    const [searchQuery, setSearchQuery] = useState('');
    const [filters, setFilters] = useState({
        tela: '', estado: '', responsable: '', temporada: '', prioridad: ''
    });
    const [soloHoy, setSoloHoy] = useState(false);
    const [editingMolde, setEditingMolde] = useState(null);
    const [dailyQuote, setDailyQuote] = useState('');
    const [showDailyQuote, setShowDailyQuote] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const storage = getStorageUsage();

    useEffect(() => {
        const theme = state?.config?.uiTheme || {};
        const root = document.documentElement;
        const accentColor = normalizeAccentColor(theme.accentColor);
        root.style.setProperty('--bg-primary', theme.backgroundColor || '#0a0a12');
        root.style.setProperty('--accent', accentColor);
        root.style.setProperty('--accent-hover', accentColor === DEFAULT_ACCENT ? DEFAULT_ACCENT_HOVER : accentColor);
        root.style.setProperty('--accent-light', `${accentColor}22`);
        root.style.setProperty('--bg-card', theme.surfaceColor || 'rgba(25, 25, 40, 0.55)');
        root.style.setProperty('--text-primary', theme.textColor || '#f0f0fa');
    }, [state?.config?.uiTheme]);

    // One-time price migration
    useEffect(() => {
        if (state?.config?.posProductos?.length > 0 && !state?.config?._priceMigration2026April) {
            runPriceMigration2026April();
        }
    }, [state?.config?.posProductos?.length]);

    // L2 price fix migration
    useEffect(() => {
        if (state?.config?.posProductos?.length > 0 && !state?.config?._priceMigrationL2Fix_2026April) {
            runPriceMigrationL2Fix();
        }
    }, [state?.config?.posProductos?.length]);

    // L2 force migration — overrides previous incomplete migrations
    useEffect(() => {
        if (state?.config?.posProductos?.length > 0 && !state?.config?._priceMigrationL2Force_2026April) {
            runPriceMigrationL2Force();
        }
    }, [state?.config?.posProductos?.length]);

    // L2 uniform migration — ensure L2 > L1 for all products
    useEffect(() => {
        if (state?.config?.posProductos?.length > 0 && !state?.config?._priceMigrationL2Uniform_2026April) {
            runPriceMigrationL2Uniform();
        }
    }, [state?.config?.posProductos?.length]);

    // L2 price fix2 — set exact L2 values for 4xxx products
    useEffect(() => {
        if (state?.config?.posProductos?.length > 0 && !state?.config?._priceMigrationL2Fix2_2026April) {
            runPriceMigrationL2Fix2();
        }
    }, [state?.config?.posProductos?.length]);

    useEffect(() => {
        if (state?.config?.idioma === lang) return;
        updateConfig({ idioma: lang });
    }, [lang, state?.config?.idioma, updateConfig]);

    useEffect(() => {
        if (!user?.email) return;

        try {
            const nextQuote = getDailyQuoteForUser(user);
            if (nextQuote?.shouldShow) {
                setDailyQuote(nextQuote.quote);
                setShowDailyQuote(true);
            } else {
                setShowDailyQuote(false);
            }
        } catch (error) {
            console.error('No se pudo preparar el mensaje diario:', error);
            setShowDailyQuote(false);
        }
    }, [user?.email]);

    // Filter moldes
    const filteredMoldes = useMemo(() => {
        return moldes.filter(m => {
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const match =
                    (m.nombre || '').toLowerCase().includes(q) ||
                    (m.codigo || '').toLowerCase().includes(q) ||
                    (m.categoria || '').toLowerCase().includes(q) ||
                    (m.observaciones || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            if (filters.prioridad && m.prioridad !== filters.prioridad) return false;
            if (filters.temporada && m.temporada !== filters.temporada) return false;
            if (filters.responsable && m.responsable !== filters.responsable) return false;
            if (filters.estado) {
                const col = config.columnas.find(c => c.nombre === filters.estado);
                if (col && m.estado !== col.id) return false;
            }
            if (filters.tela) {
                const tela = telas.find(t => t.nombre === filters.tela);
                if (tela && !(m.telasIds || []).includes(tela.id)) return false;
            }
            if (soloHoy && !isTodayOrOverdue(m.fechaObjetivo)) return false;
            return true;
        });
    }, [moldes, searchQuery, filters, soloHoy, config.columnas, telas]);

    const handleAddMolde = () => {
        addMolde({ nombre: '', estado: config.columnas[0]?.id || 'por-hacer' });
        setTimeout(() => setEditingMolde('latest'), 50);
    };

    const handleAddTarea = (columnId) => {
        const estado = columnId || config.columnas[0]?.id || 'por-hacer';
        const tareasInCol = state.tareas.filter(t => t.estado === estado);
        addTarea({ nombre: '', estado, orden: tareasInCol.length });
        setTimeout(() => setEditingMolde('latest_tarea'), 50);
    };

    const handleOpenMolde = (molde) => setEditingMolde({ id: molde.id, type: 'molde' });
    const handleOpenTarea = (tarea) => setEditingMolde({ id: tarea.id, type: 'tarea' });

    // Detect if we're editing a molde or a tarea
    let resolvedEditItem = null;
    let editType = 'molde';

    if (editingMolde === 'latest') {
        resolvedEditItem = moldes[moldes.length - 1];
    } else if (editingMolde === 'latest_tarea') {
        resolvedEditItem = state.tareas[state.tareas.length - 1];
        editType = 'tarea';
    } else if (editingMolde && editingMolde.type === 'tarea') {
        resolvedEditItem = state.tareas.find(t => t.id === editingMolde.id);
        editType = 'tarea';
    } else if (editingMolde && editingMolde.type === 'molde') {
        resolvedEditItem = moldes.find(m => m.id === editingMolde.id);
    } else if (typeof editingMolde === 'string') {
        // Fallback for older code
        resolvedEditItem = moldes.find(m => m.id === editingMolde);
    }

    // Role-based NavItems filtering
    let navItems = [
        { id: 'kanban', icon: LayoutDashboard, label: t('navTablero') },
        { id: 'pos', icon: Store, label: 'Punta de Venta' },
        { id: 'articulos', icon: ShoppingCart, label: 'Artículos' },
        { id: 'library', icon: BookOpen, label: t('navBiblioteca') },
        { id: 'pedidos', icon: Globe, label: 'Pedidos Online' },
        { id: 'clientes', icon: Users, label: 'Clientes' },
        { id: 'fabrics', icon: Scissors, label: t('navTelas') },
        { id: 'cortes', icon: PackageOpen, label: t('cortes') },
        { id: 'cortadores', icon: UserCheck, label: t('cortadores') },
        { id: 'talleres', icon: Factory, label: t('talleres') },
        { id: 'empleados', icon: Users, label: 'Empleados' },
        { id: 'marketing', icon: Megaphone, label: 'Marketing' },
        { id: 'agents', icon: Zap, label: 'Agentes AI' },
        { id: 'paginaweb', icon: Globe, label: 'Página Web' },
        { id: 'conteomercaderia', icon: Boxes, label: 'Conteo Mercadería' },
        { id: 'fotos', icon: Camera, label: 'Fotos' },
        { id: 'fotosprendas', icon: Camera, label: 'Fotos Prendas' },
        { id: 'instagramplanner', icon: Instagram, label: t('navInstagramPlanner') },
        { id: 'tiktok', icon: Video, label: 'TikTok' },
        { id: 'mesan', icon: BarChart3, label: 'Mesan' },
        { id: 'banking', icon: Landmark, label: 'Banco y MP' },
        { id: 'settings', icon: SettingsIcon, label: t('navConfiguracion') },
        { id: 'informes', icon: FileText, label: t('navInformes') },
        { id: 'saldo', icon: Wallet, label: t('navSaldo') },
        ...(user.role === 'admin' ? [{ id: 'yuliya', icon: TableProperties, label: 'Yuliya' }] : []),
    ];

    if (user.role !== 'admin') {
        const allowed = getAllowedSections(user.role, user.email);
        navItems = navItems.filter(i => allowed.includes(i.id));
    }

    useEffect(() => {
        const allowed = getAllowedSections(user.role, user.email);
        if (!allowed.length) return;
        if (!allowed.includes(view)) {
            setView(allowed.includes('kanban') ? 'kanban' : allowed[0]);
        }
    }, [user.role, user.email, view, getAllowedSections]);

    return (
        <div className="app">
            <OfflineIndicator />
            {/* Mobile hamburger button */}
            <button
                className="mobile-hamburger"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menú"
            >
                <Menu size={22} />
            </button>

            {/* Mobile sidebar overlay backdrop */}
            {mobileMenuOpen && (
                <div
                    className="sidebar-overlay-backdrop"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            <div className="app-body">
                <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
                    <button
                        className="sidebar-close-btn"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-label="Cerrar menú"
                    >
                        <XIcon size={20} />
                    </button>
                    <div className="sidebar-brand">
                        <div className="sidebar-brand-icon">
                            <Scissors size={20} />
                        </div>
                        <div>
                            <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {t('appName')}
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: state ? 'var(--success)' : 'var(--danger)',
                                    boxShadow: state ? '0 0 8px var(--success)' : 'none'
                                }} title={state ? 'Sincronizado con la nube' : 'Sin conexión a la nube'} />
                            </h1>
                            <span>{t('appSubtitle')}</span>
                        </div>
                    </div>

                    <nav className="sidebar-nav">
                        {navItems.map(item => (
                            <div
                                key={item.id}
                                className={`sidebar-item ${view === item.id ? 'active' : ''}`}
                                onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
                            >
                                <item.icon />
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </nav>

                    <div className="sidebar-divider" />

                    {/* Language switcher */}
                    <div className="sidebar-item" style={{ gap: 8 }}>
                        <Globe style={{ width: 18, height: 18, flexShrink: 0 }} />
                        <select
                            value={lang}
                            onChange={(e) => changeLang(e.target.value)}
                            style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--text-primary)',
                                fontSize: 'var(--fs-xs)',
                                padding: '2px 6px',
                                fontFamily: 'var(--font-family)',
                                cursor: 'pointer',
                                flex: 1,
                                outline: 'none',
                            }}
                        >
                            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                                <option key={code} value={code}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="sidebar-storage">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                                {originalAdmin ? 'Simulando vista de:' : 'Conectado como:'}
                            </div>
                            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)', color: originalAdmin ? 'var(--warning)' : 'var(--accent)' }}>
                                {user.name}
                            </div>

                            {/* User Switcher Dropdown for Admins */}
                            {(user.role === 'admin' || originalAdmin) && (
                                <select
                                    className="form-select"
                                    style={{ fontSize: '11px', padding: '4px', marginTop: '4px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                    value={user.role}
                                    onChange={(e) => {
                                        switchUser(e.target.value);
                                        // Update default view based on permissions
                                        const role = e.target.value;
                                        const allowed = getAllowedSections(role, role === 'marketing' ? 'giselakim.wk@gmail.com' : '');
                                        if (allowed.includes('kanban')) setView('kanban');
                                        else setView(allowed[0] || 'kanban');
                                    }}
                                >
                                    <option value="admin">👨‍💻 Administrador</option>
                                    <option value="encargada">👩‍💼 Encargada (Nadia)</option>
                                    <option value="deposito">📦 Depósito (Naara)</option>
                                    <option value="pedidos">🌐 Pedidos Online (Juan)</option>
                                    <option value="marketing">📣 Marketing (Gisela)</option>
                                    <option value="fotos">📸 Fotos (Rocio)</option>
                                    <option value="contenido_instagram">📷 Instagram (Erica)</option>
                                </select>
                            )}

                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '4px' }} onClick={logout}>
                                Cerrar Sesión
                            </button>
                        </div>
                        <div style={{
                            marginBottom: 12,
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>
                                Sincronización
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 'var(--fw-semibold)', color: syncStatus.online ? 'var(--success)' : 'var(--warning)' }}>
                                {syncStatus.status}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                                {syncStatus.online ? 'Online' : 'Offline'} · Pendientes: {syncStatus.pendingChanges || 0}
                            </div>
                            {syncStatus.lastCloudSaveAt && (
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 4 }}>
                                    Última nube: {new Date(syncStatus.lastCloudSaveAt).toLocaleString()}
                                </div>
                            )}
                        </div>
                        <div className="sidebar-storage-label">
                            <HardDrive style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />
                            {storage.usedMB} {t('mbUsados')}
                        </div>
                        <div className="sidebar-storage-bar">
                            <div
                                className="sidebar-storage-bar-fill"
                                style={{ width: `${Math.min((parseFloat(storage.usedMB) / 10) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                </aside>

                <div className="main-content">
                    {(view === 'kanban' || view === 'library') && (
                        <Header
                            filters={filters}
                            setFilters={setFilters}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            soloHoy={soloHoy}
                            setSoloHoy={setSoloHoy}
                        />
                    )}
                    {<DailyTasksPanel />}
                    {view === 'kanban' && (
                        <KanbanBoard
                            tareas={state.tareas || []}
                            onOpenTarea={handleOpenTarea}
                            onAddTarea={handleAddTarea}
                        />
                    )}
                    {view === 'library' && (
                        <Library
                            filteredMoldes={filteredMoldes}
                            onOpenMolde={handleOpenMolde}
                            onAddMolde={handleAddMolde}
                        />
                    )}
                    {view === 'fabrics' && <FabricCatalog />}
                    {view === 'cortes' && <CortesPage />}
                    {view === 'cortadores' && <CortadoresPage />}
                    {view === 'talleres' && <TalleresPage />}
                    {view === 'pos' && <PosPage />}
                    {view === 'empleados' && <EmpleadosPage />}
                    {view === 'settings' && <Settings />}
                    {view === 'pedidos' && <PedidosOnlinePage />}
                    {view === 'marketing' && <MarketingSection />}
                    {view === 'agents' && <AgentsHub />}
                    {view === 'paginaweb' && <PaginaWebSection />}
                    {view === 'conteomercaderia' && <ConteoMercaderiaPage />}
                    {view === 'fotos' && <FotosPage />}
                    {view === 'fotosprendas' && <FotosPrendasPage />}
                    {view === 'instagramplanner' && <InstagramPlannerPage />}
                    {view === 'tiktok' && <TikTokContentPage />}
                    {view === 'mesan' && <MesanPage />}
                    {view === 'banking' && <BankPaymentsPage />}
                    {view === 'articulos' && <PosProductos />}
                    {view === 'clientes' && <ClientesPage />}
                    {view === 'informes' && <InformesPage />}
                    {view === 'saldo' && <SaldoPage />}
                    {view === 'yuliya' && <YuliyaPage />}
                </div>
            </div>

            {resolvedEditItem && editType === 'molde' && (
                <MoldModal
                    molde={resolvedEditItem}
                    onClose={() => setEditingMolde(null)}
                />
            )}
            {/* For now we'll reuse MoldModal for Tareas but hide specific fields, or ideally build a TaskModal. 
                Wait, building a Task modal is better, but maybe just use the basic fields.
                Let's use a quick inline prompt or build a simplified Modal if needed. 
                Actually, MoldModal has a lot of Mold-specific logic. Let's build TaskModal shortly. */}
            {resolvedEditItem && editType === 'tarea' && (
                <TaskModal
                    tarea={resolvedEditItem}
                    onClose={() => setEditingMolde(null)}
                />
            )}

            {showDailyQuote && (
                <div className="daily-quote-backdrop" onClick={() => setShowDailyQuote(false)}>
                    <div className="daily-quote-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="daily-quote-kicker">Mensaje para empezar el día</div>
                        <h3 className="daily-quote-title">Buen día, {user.name}</h3>
                        <p className="daily-quote-text">“{dailyQuote}”</p>
                        <button className="btn btn-primary daily-quote-button" onClick={() => setShowDailyQuote(false)}>
                            Gracias, a darlo todo
                        </button>
                    </div>
                </div>
            )}

            {/* AI Assistant - floating chat */}
            <AIAssistant />

            {/* Mobile Bottom Navigation */}
            <MobileNav navItems={navItems} view={view} setView={setView} />

            {/* Global floating Guardar button */}
            {view !== 'yuliya' && (
                <button
                    onClick={async () => {
                        console.log('[Guardar] Botón presionado — guardando en Firestore...');
                        setSaveStatus('saving');
                        const ok = await forceSaveNow();
                        console.log('[Guardar] Resultado:', ok ? 'OK' : 'ERROR');
                        setSaveStatus(ok ? 'saved' : 'error');
                        setTimeout(() => setSaveStatus('idle'), 2500);
                    }}
                    disabled={saveStatus === 'saving'}
                    style={{
                        position: 'fixed',
                        bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
                        right: 16,
                        zIndex: 9000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '10px 16px',
                        borderRadius: 24,
                        border: 'none',
                        cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: 13,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        background: saveStatus === 'saved' ? '#16a34a' : saveStatus === 'error' ? '#dc2626' : '#15803d',
                        color: '#fff',
                        transition: 'background 0.2s',
                        opacity: saveStatus === 'saving' ? 0.7 : 1,
                    }}
                >
                    {saveStatus === 'saving' && <span style={{ width: 14, height: 14, border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                    {saveStatus === 'saved' && <span style={{ fontSize: 14 }}>✓</span>}
                    {saveStatus === 'error' && <span style={{ fontSize: 14 }}>✗</span>}
                    {saveStatus === 'idle' && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                        </svg>
                    )}
                    {saveStatus === 'idle' ? 'Guardar' : saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? 'Guardado ✓' : 'Error'}
                </button>
            )}
        </div>
    );
}

function AppWrapper() {
    const { user, logout } = useAuth();
    if (!user) return <Login />;

    // Users with 'pendiente' role can't access the app yet
    if (user.role === 'pendiente') {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: '100vh', background: 'var(--bg-app)',
                padding: '20px'
            }}>
                <div style={{
                    textAlign: 'center', maxWidth: 420,
                    background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
                    padding: '40px 32px', border: '1px solid var(--border-color)'
                }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                    <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Cuenta pendiente</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 24 }}>
                        Tu cuenta fue creada pero el administrador todavía no te asignó un rol.
                        Contactá al administrador para que active tu acceso.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: 16 }}>
                        Conectado como: {user.email}
                    </p>
                    <button className="btn btn-ghost" onClick={logout} style={{ color: 'var(--text-muted)' }}>
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        );
    }

    return <AppContent />;
}

export default function App() {
    if (!firebaseConfigured) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                background: 'radial-gradient(circle at center, #241734 0%, #0f1220 55%, #090b14 100%)',
                color: '#fff'
            }}>
                <div style={{
                    width: '100%',
                    maxWidth: 720,
                    background: 'rgba(16, 18, 30, 0.9)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 20,
                    padding: 28,
                    boxShadow: '0 20px 80px rgba(0,0,0,0.35)'
                }}>
                    <h1 style={{ margin: 0, marginBottom: 12, fontSize: 28 }}>Falta configurar Firebase en Netlify</h1>
                    <p style={{ marginTop: 0, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                        La app ya no se queda en blanco: necesita las variables de entorno de Firebase para iniciar.
                        Agregalas en Netlify y luego hacé un redeploy.
                    </p>
                    <div style={{
                        marginTop: 20,
                        padding: 16,
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontFamily: 'monospace',
                        fontSize: 14,
                        lineHeight: 1.8
                    }}>
                        {firebaseConfigMissingKeys.map((key) => (
                            <div key={key}>{`VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`}</div>
                        ))}
                    </div>
                    <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.72)' }}>
                        Ruta: Site configuration → Environment variables
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ErrorBoundary>
            <AuthProvider>
                <I18nProvider>
                    <DataProvider>
                        <AppWrapper />
                    </DataProvider>
                </I18nProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}
