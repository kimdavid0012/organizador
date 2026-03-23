import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const STORAGE_KEY = 'organizador_moldes_data';
const BACKUP_INDEX_KEY = 'organizador_moldes_data_backups';
const RECOVERY_SESSION_KEY = 'organizador_moldes_data_recovery';
const PENDING_CHANGES_KEY = 'organizador_moldes_data_pending';
const FIRESTORE_DOC = 'app-data/main';
const MAX_LOCAL_BACKUPS = 12;

const DEFAULT_COLUMNAS = [
    { id: 'por-hacer', nombre: 'Por hacer', orden: 0, color: '#6366f1' },
    { id: 'en-progreso', nombre: 'En progreso', orden: 1, color: '#f59e0b' },
    { id: 'listo', nombre: 'Listo', orden: 2, color: '#22c55e' },
    { id: 'a-revisar', nombre: 'A revisar', orden: 3, color: '#ec4899' },
    { id: 'archivado', nombre: 'Archivado', orden: 4, color: '#6b7280' }
];

const DEFAULT_CATEGORIAS = [
    'Remera', 'Pantalón', 'Buzo', 'Chaqueta', 'Vestido',
    'Falda', 'Short', 'Campera', 'Camisa', 'Otro'
];

const DEFAULT_PERSONAS = ['Sin asignar'];
const DEFAULT_CORTADORES = ['Sin asignar'];
const DEFAULT_TALLERES = [];

const DEFAULT_TEMPORADAS = [
    'Invierno 2026', 'Verano 2026', 'Intermedio 2026',
    'Invierno 2027', 'Verano 2027', 'Intermedio 2027'
];

const DEFAULT_ESTADOS_CORTE = [
    { id: 'sin-enviar', nombre: 'Sin enviar', color: '#6b7280' },
    { id: 'enviado', nombre: 'Enviado a corte', color: '#f59e0b' },
    { id: 'cortado', nombre: 'Cortado', color: '#22c55e' },
    { id: 'falta', nombre: 'Falta', color: '#ef4444' },
];

export const SUPPORT_WOO_CREDENTIALS = {
    wooUrl: 'https://celavie.com.ar',
    wooKey: 'ck_0abd4bc2e628702e2f1aad337a38c11c58547019',
    wooSecret: 'cs_12621d75437aa33853a0bb0420749882dad3088e'
};

const DEFAULT_MARKETING = {
    metaToken: '',
    metaAdAccountId: '938112566730962',
    metaPixelId: '',
    tiktokToken: '',
    tiktokPixelId: '',
    wooUrl: SUPPORT_WOO_CREDENTIALS.wooUrl,
    wooKey: SUPPORT_WOO_CREDENTIALS.wooKey,
    wooSecret: SUPPORT_WOO_CREDENTIALS.wooSecret,
    openaiKey: ''
};

const DEFAULT_ACCENT_COLOR = '#14b8a6';
const LEGACY_PURPLE_ACCENTS = new Set(['#8b5cf6', '#7c3aed', '#a855f7', '#c084fc']);
const normalizeStoredAccentColor = (value) => {
    const normalized = (value || '').toLowerCase();
    return LEGACY_PURPLE_ACCENTS.has(normalized) ? DEFAULT_ACCENT_COLOR : (value || DEFAULT_ACCENT_COLOR);
};

const normalizeMarketingConfig = (marketing = {}) => ({
    ...DEFAULT_MARKETING,
    ...marketing,
    metaAdAccountId: marketing?.metaAdAccountId || DEFAULT_MARKETING.metaAdAccountId,
    wooUrl: marketing?.wooUrl || SUPPORT_WOO_CREDENTIALS.wooUrl,
    wooKey: marketing?.wooKey || SUPPORT_WOO_CREDENTIALS.wooKey,
    wooSecret: marketing?.wooSecret || SUPPORT_WOO_CREDENTIALS.wooSecret
});

export const DEFAULT_DATA = {
    moldes: [],
    tareas: [],
    telas: [],
    config: {
        columnas: DEFAULT_COLUMNAS,
        categorias: DEFAULT_CATEGORIAS,
        personas: DEFAULT_PERSONAS,
        cortadores: DEFAULT_CORTADORES,
        talleres: DEFAULT_TALLERES,
        temporadas: DEFAULT_TEMPORADAS,
        estadosCorte: DEFAULT_ESTADOS_CORTE,
        cortes: [],
        empleados: [],
        asistencia: [],
        clientes: [],
        pedidosOnline: [],
        mercaderiaConteos: [],
        fotoTasks: [],
        imageLibrary: [],
        mesanMovimientos: [],
        mesanVentasDiarias: [],
        mesanEmbeddedImports: [],
        saldoMovimientos: [],
        bankPayments: [],
        fabricPayments: [],
        posPermissions: { encargadaCanCloseZ: false, encargadaCanAddExpenses: false },
        posCerradoZ: [],
        posGastos: [],
        posProductos: [],
        posVentas: [],
        syncMeta: {
            revision: 0,
            updatedAt: null,
            source: 'bootstrap'
        },
        uiTheme: {
            backgroundColor: '#0a0a12',
            accentColor: DEFAULT_ACCENT_COLOR,
            surfaceColor: 'rgba(25, 25, 40, 0.55)',
            textColor: '#f0f0fa'
        },
        marketing: DEFAULT_MARKETING,
        marketingCache: {
            accountInsights: null,
            campaigns: [],
            adSets: {},
            aiReport: '',
            lastSyncedAt: null
        },
            paginaWebCache: {
                allProducts: [],
                productStatsById: {},
                lastLoadedAt: null
            }
    }
};

export function normalizeData(parsed) {
    if (!parsed) return { ...DEFAULT_DATA };
    return {
        moldes: parsed.moldes || [],
        tareas: parsed.tareas || [],
        telas: parsed.telas || [],
        config: {
            columnas: parsed.config?.columnas || DEFAULT_COLUMNAS,
            categorias: parsed.config?.categorias || DEFAULT_CATEGORIAS,
            personas: parsed.config?.personas || DEFAULT_PERSONAS,
            cortadores: parsed.config?.cortadores || DEFAULT_CORTADORES,
            talleres: parsed.config?.talleres || DEFAULT_TALLERES,
            temporadas: parsed.config?.temporadas || DEFAULT_TEMPORADAS,
            estadosCorte: parsed.config?.estadosCorte || DEFAULT_ESTADOS_CORTE,
            cortes: parsed.config?.cortes || [],
            empleados: parsed.config?.empleados || [],
            asistencia: parsed.config?.asistencia || [],
            clientes: parsed.config?.clientes || [],
            pedidosOnline: parsed.config?.pedidosOnline || [],
            mercaderiaConteos: parsed.config?.mercaderiaConteos || [],
            fotoTasks: parsed.config?.fotoTasks || [],
            imageLibrary: parsed.config?.imageLibrary || [],
            mesanMovimientos: parsed.config?.mesanMovimientos || [],
            mesanVentasDiarias: parsed.config?.mesanVentasDiarias || [],
            mesanEmbeddedImports: parsed.config?.mesanEmbeddedImports || [],
            saldoMovimientos: parsed.config?.saldoMovimientos || [],
            bankPayments: parsed.config?.bankPayments || [],
            fabricPayments: parsed.config?.fabricPayments || [],
            posPermissions: parsed.config?.posPermissions || { encargadaCanCloseZ: false, encargadaCanAddExpenses: false },
            posCerradoZ: parsed.config?.posCerradoZ || [],
            posGastos: parsed.config?.posGastos || [],
            posProductos: parsed.config?.posProductos || [],
            posVentas: parsed.config?.posVentas || [],
            syncMeta: {
                ...DEFAULT_DATA.config.syncMeta,
                ...parsed.config?.syncMeta
            },
            uiTheme: {
                ...DEFAULT_DATA.config.uiTheme,
                ...parsed.config?.uiTheme,
                accentColor: normalizeStoredAccentColor(parsed.config?.uiTheme?.accentColor)
            },
            marketing: normalizeMarketingConfig(parsed.config?.marketing),
            marketingCache: {
                ...DEFAULT_DATA.config.marketingCache,
                ...parsed.config?.marketingCache
            },
            paginaWebCache: {
                ...DEFAULT_DATA.config.paginaWebCache,
                ...parsed.config?.paginaWebCache
            }
        }
    };
}

// ============ FIRESTORE (SPLIT INTO MULTIPLE DOCS) ============
// Firestore limit = 1MB per document
// We split data into multiple docs to stay under the 1MB Firestore limit:
//   app-data/config       → config object (without mercaderiaConteos)
//   app-data/mercaderia   → mercaderiaConteos array
//   app-data/moldes       → moldes array
//   app-data/telas        → telas array
//   app-data/tareas       → tareas array

export const loadDataFromFirestore = async () => {
    try {
        const [configSnap, mercaderiaSnap, moldesSnap, telasSnap, tareasSnap, legacySnap] = await Promise.all([
            getDoc(doc(db, 'app-data', 'config')),
            getDoc(doc(db, 'app-data', 'mercaderia')),
            getDoc(doc(db, 'app-data', 'moldes')),
            getDoc(doc(db, 'app-data', 'telas')),
            getDoc(doc(db, 'app-data', 'tareas')),
            getDoc(doc(db, 'app-data', 'main')),  // legacy single-doc format
        ]);

        // If new split format exists, use it
        if (configSnap.exists()) {
            const configBase = configSnap.data()?.config || configSnap.data() || {};
            const mercaderiaConteos = mercaderiaSnap.exists()
                ? (mercaderiaSnap.data()?.mercaderiaConteos || [])
                : (configBase.mercaderiaConteos || []);
            const config = {
                ...configBase,
                mercaderiaConteos
            };
            const moldes = moldesSnap.exists() ? (moldesSnap.data()?.moldes || []) : [];
            const telas = telasSnap.exists() ? (telasSnap.data()?.telas || []) : [];
            const tareas = tareasSnap.exists() ? (tareasSnap.data()?.tareas || []) : [];
            return normalizeData({ config, moldes, telas, tareas });
        }

        // Fallback to legacy single-doc format
        if (legacySnap.exists()) {
            console.log('📦 Migrating from legacy single-doc to split format...');
            const legacyData = normalizeData(legacySnap.data());
            // Auto-migrate to new format
            await saveDataToFirestore(legacyData);
            return legacyData;
        }

        return { ...DEFAULT_DATA };
    } catch (err) {
        console.error('Error cargando datos de Firestore:', err);
        return { ...DEFAULT_DATA };
    }
};

export const saveDataToFirestore = async (data) => {
    try {
        // Strip base64 images from moldes if document is too large
        const moldesClean = (data.moldes || []).map(m => {
            // If a molde has huge base64 images, truncate them to save space
            if (m.imagenes && m.imagenes.length > 0) {
                const totalSize = JSON.stringify(m.imagenes).length;
                if (totalSize > 500000) { // 500KB per molde is too much
                    console.warn(`⚠️ Molde "${m.nombre}" tiene imágenes muy grandes (${(totalSize/1024).toFixed(0)}KB). Limitando...`);
                    return { ...m, imagenes: m.imagenes.slice(0, 2) }; // keep max 2 images
                }
            }
            return m;
        });

        const configWithoutMercaderia = {
            ...(data.config || {}),
            mercaderiaConteos: []
        };

        await Promise.all([
            setDoc(doc(db, 'app-data', 'config'), { config: configWithoutMercaderia }),
            setDoc(doc(db, 'app-data', 'mercaderia'), { mercaderiaConteos: data.config?.mercaderiaConteos || [] }),
            setDoc(doc(db, 'app-data', 'moldes'), { moldes: moldesClean }),
            setDoc(doc(db, 'app-data', 'telas'), { telas: data.telas || [] }),
            setDoc(doc(db, 'app-data', 'tareas'), { tareas: data.tareas || [] }),
        ]);
        console.log('✅ Datos guardados en Firestore (5 documentos)');
    } catch (err) {
        console.error('Error guardando datos en Firestore:', err);
        throw err;
    }
};

// ============ LOCAL STORAGE (backup / fallback) ============

export const loadDataFromLocal = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return normalizeData(JSON.parse(raw));
    } catch (err) {
        console.error('Error cargando datos locales:', err);
        return null;
    }
};

export const loadLatestBackupFromLocal = () => {
    try {
        const rawIndex = localStorage.getItem(BACKUP_INDEX_KEY);
        if (!rawIndex) return null;
        const backupKeys = JSON.parse(rawIndex);
        if (!Array.isArray(backupKeys) || backupKeys.length === 0) return null;

        for (let i = backupKeys.length - 1; i >= 0; i -= 1) {
            const backupRaw = localStorage.getItem(backupKeys[i]);
            if (!backupRaw) continue;
            return normalizeData(JSON.parse(backupRaw));
        }
        return null;
    } catch (err) {
        console.error('Error cargando backup local historico:', err);
        return null;
    }
};

const saveBackupSnapshotToLocal = (data) => {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupKey = `${STORAGE_KEY}_backup_${stamp}`;
        const rawIndex = localStorage.getItem(BACKUP_INDEX_KEY);
        const parsedIndex = JSON.parse(rawIndex || '[]');
        const backupKeys = Array.isArray(parsedIndex) ? parsedIndex : [];

        localStorage.setItem(backupKey, JSON.stringify(data));
        const nextKeys = [...backupKeys, backupKey].slice(-MAX_LOCAL_BACKUPS);

        while (backupKeys.length >= MAX_LOCAL_BACKUPS) {
            const oldKey = backupKeys.shift();
            if (oldKey && !nextKeys.includes(oldKey)) {
                localStorage.removeItem(oldKey);
            }
        }

        localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(nextKeys));
    } catch (err) {
        console.error('Error guardando snapshot local:', err);
    }
};

export const saveDataToLocal = (data) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        saveBackupSnapshotToLocal(data);
    } catch (err) {
        console.error('Error guardando datos locales:', err);
        if (err.name === 'QuotaExceededError') {
            alert('⚠️ Se alcanzó el límite de almacenamiento local.');
        }
    }
};

// ============ DOWNLOAD / IMPORT JSON ============

export const downloadBackupJSON = (data) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-celavie-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// ============ MIGRATE LOCAL → FIRESTORE ============

export const migrateLocalToFirestore = async () => {
    const localData = loadDataFromLocal();
    if (!localData) {
        throw new Error('No hay datos locales para migrar');
    }
    await saveDataToFirestore(localData);
    return localData;
};

// ============ DEPRECATED WRAPPERS (for backwards compat) ============

export const loadData = () => {
    return loadDataFromLocal() || { ...DEFAULT_DATA };
};

export const saveData = (data) => {
    saveDataToLocal(data);
};

export const clearData = () => {
    localStorage.removeItem(STORAGE_KEY);
    try {
        const rawIndex = localStorage.getItem(BACKUP_INDEX_KEY);
        const backupKeys = JSON.parse(rawIndex || '[]');
        if (Array.isArray(backupKeys)) {
            backupKeys.forEach((key) => localStorage.removeItem(key));
        }
        localStorage.removeItem(BACKUP_INDEX_KEY);
    } catch {
        localStorage.removeItem(BACKUP_INDEX_KEY);
    }
};

export const saveProtectedSessionSnapshot = (data) => {
    try {
        localStorage.setItem(RECOVERY_SESSION_KEY, JSON.stringify(data));
    } catch (err) {
        console.error('Error guardando snapshot de recuperacion:', err);
    }
};

export const loadProtectedSessionSnapshot = () => {
    try {
        const raw = localStorage.getItem(RECOVERY_SESSION_KEY);
        if (!raw) return null;
        return normalizeData(JSON.parse(raw));
    } catch (err) {
        console.error('Error cargando snapshot de recuperacion:', err);
        return null;
    }
};

export const clearProtectedSessionSnapshot = () => {
    localStorage.removeItem(RECOVERY_SESSION_KEY);
};

export const setPendingLocalChangesFlag = (value) => {
    try {
        localStorage.setItem(PENDING_CHANGES_KEY, value ? '1' : '0');
    } catch (err) {
        console.error('Error guardando estado pendiente local:', err);
    }
};

export const loadPendingLocalChangesFlag = () => {
    try {
        return localStorage.getItem(PENDING_CHANGES_KEY) === '1';
    } catch {
        return false;
    }
};

export const getStorageUsage = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { used: 0, usedMB: '0' };
    const bytes = new Blob([raw]).size;
    return {
        used: bytes,
        usedMB: (bytes / (1024 * 1024)).toFixed(2)
    };
};
