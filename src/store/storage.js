import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

const STORAGE_KEY = 'organizador_moldes_data';
const BACKUP_INDEX_KEY = 'organizador_moldes_data_backups';
const RECOVERY_SESSION_KEY = 'organizador_moldes_data_recovery';
const PENDING_CHANGES_KEY = 'organizador_moldes_data_pending';
const FIRESTORE_DOC = 'app-data/main';
const MAX_LOCAL_BACKUPS = 3;
const APP_STORAGE_DB_NAME = 'organizador-app-storage';
const APP_STORAGE_DB_VERSION = 1;
const APP_STORAGE_STORE = 'snapshots';
const APP_MAIN_SNAPSHOT_KEY = 'main';
const APP_RECOVERY_SNAPSHOT_KEY = 'recovery';
const CONFIG_SPLIT_DOCS = {
    mercaderiaConteos: 'mercaderia',
    bankPayments: 'bank-payments',
    saldoMovimientos: 'saldo-movimientos',
    posProductos: 'pos-productos',
    clientes: 'clientes',
    mesanMovimientos: 'mesan-movimientos',
    mesanVentasDiarias: 'mesan-ventas-diarias',
    pedidosOnline: 'pedidos-online',
    posVentas: 'pos-ventas',
    posCerradoZ: 'pos-cerrado-z',
    posGastos: 'pos-gastos',
    planillasCortes: 'planillas-cortes',
    fabricPayments: 'fabric-payments',
    fotoTasks: 'foto-tasks',
    instagramPlanner: 'instagram-planner'
};
const CONFIG_SPLIT_KEYS = Object.keys(CONFIG_SPLIT_DOCS);
const RICH_TOP_LEVEL_KEYS = ['moldes', 'telas', 'tareas'];
const RICH_CONFIG_ARRAY_KEYS = [
    'cortes',
    'talleres',
    'cortadores',
    'empleados',
    'asistencia',
    'clientes',
    'pedidosOnline',
    'mercaderiaConteos',
    'fotoTasks',
    'instagramPlanner',
    'imageLibrary',
    'planillasCortes',
    'mesanMovimientos',
    'mesanVentasDiarias',
    'mesanEmbeddedImports',
    'saldoMovimientos',
    'bankPayments',
    'fabricPayments',
    'posCerradoZ',
    'posGastos',
    'posHistorialTickets',
    'posProductos',
    'posVentas'
];
const RICH_CONFIG_OBJECT_KEYS = ['saldoClienteFotos'];

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

const PROTECTED_MARKETING_KEYS = ['metaToken', 'openaiKey', 'claudeKey', 'metaAdAccountId', 'metaPixelId', 'tiktokToken', 'tiktokPixelId'];
const PROTECTED_KEYS_STORAGE = 'celavie_protected_api_keys';

const saveProtectedKeys = (marketing) => {
    try {
        const current = JSON.parse(localStorage.getItem(PROTECTED_KEYS_STORAGE) || '{}');
        const updated = { ...current };
        PROTECTED_MARKETING_KEYS.forEach(key => {
            if (marketing?.[key]) updated[key] = marketing[key];
        });
        localStorage.setItem(PROTECTED_KEYS_STORAGE, JSON.stringify(updated));
    } catch {}
};

const recoverProtectedKeys = (marketing) => {
    try {
        const saved = JSON.parse(localStorage.getItem(PROTECTED_KEYS_STORAGE) || '{}');
        const result = { ...marketing };
        PROTECTED_MARKETING_KEYS.forEach(key => {
            if (!result[key] && saved[key]) result[key] = saved[key];
        });
        return result;
    } catch { return marketing; }
};

const normalizeMarketingConfig = (marketing = {}) => {
    const recovered = recoverProtectedKeys(marketing);
    const normalized = {
        ...DEFAULT_MARKETING,
        ...recovered,
        metaAdAccountId: recovered?.metaAdAccountId || DEFAULT_MARKETING.metaAdAccountId,
        wooUrl: recovered?.wooUrl || SUPPORT_WOO_CREDENTIALS.wooUrl,
        wooKey: recovered?.wooKey || SUPPORT_WOO_CREDENTIALS.wooKey,
        wooSecret: recovered?.wooSecret || SUPPORT_WOO_CREDENTIALS.wooSecret
    };
    saveProtectedKeys(normalized);
    return normalized;
};

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
        instagramPlanner: [],
        imageLibrary: [],
        planillasCortes: [],
        mesanMovimientos: [],
        mesanVentasDiarias: [],
        mesanEmbeddedImports: [],
        saldoMovimientos: [],
        monthlyPaymentReminders: [
            { id: 'colegio', nombre: 'Colegio', categoria: 'Educacion', soloAdmin: true },
            { id: 'comedor-colegio', nombre: 'Comedor de colegio', categoria: 'Educacion', soloAdmin: true },
            { id: 'alquiler-casa', nombre: 'Alquiler casa', categoria: 'Hogar', soloAdmin: true },
            { id: 'alquiler-local', nombre: 'Alquiler local', categoria: 'Local', soloAdmin: true },
            { id: 'abl-casa', nombre: 'ABL casa', categoria: 'Hogar', soloAdmin: true },
            { id: 'metrogas', nombre: 'Metrogas', categoria: 'Servicios', soloAdmin: true },
            { id: 'hdi-seguros', nombre: 'HDI Seguros', categoria: 'Seguros', soloAdmin: true },
            { id: 'edesur-casa', nombre: 'Edesur casa', categoria: 'Servicios', soloAdmin: true },
            { id: 'edesur-local', nombre: 'Edesur local', categoria: 'Servicios', soloAdmin: true },
            { id: 'personal-david', nombre: 'Personal David', categoria: 'Telefonia', soloAdmin: true },
            { id: 'personal-yuliya', nombre: 'Personal Yuliya', categoria: 'Telefonia', soloAdmin: true },
            { id: 'personal-local', nombre: 'Personal local', categoria: 'Telefonia', soloAdmin: true },
            { id: 'personal-casa', nombre: 'Personal casa', categoria: 'Telefonia', soloAdmin: true },
            { id: 'expensas', nombre: 'Expensas', categoria: 'Hogar', soloAdmin: true },
            { id: 'inacap', nombre: 'Inacap', categoria: 'Cargas', soloAdmin: true },
            { id: 'la-estrella', nombre: 'La Estrella', categoria: 'Cargas', soloAdmin: true },
            { id: 'faecys', nombre: 'FAECYS', categoria: 'Cargas', soloAdmin: true },
            { id: 'sec', nombre: 'SEC', categoria: 'Cargas', soloAdmin: true },
            { id: 'osecac', nombre: 'OSECAC', categoria: 'Cargas', soloAdmin: true }
        ],
        monthlyReminderStatus: {},
        bankPayments: [],
        fabricPayments: [],
        posPermissions: { encargadaCanCloseZ: false, encargadaCanAddExpenses: false },
        posCerradoZ: [],
        posGastos: [],
        posHistorialTickets: [],
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
            instagramPlanner: parsed.config?.instagramPlanner || [],
            imageLibrary: parsed.config?.imageLibrary || [],
            planillasCortes: parsed.config?.planillasCortes || [],
            mesanMovimientos: parsed.config?.mesanMovimientos || [],
            mesanVentasDiarias: parsed.config?.mesanVentasDiarias || [],
            mesanEmbeddedImports: parsed.config?.mesanEmbeddedImports || [],
            saldoMovimientos: parsed.config?.saldoMovimientos || [],
            monthlyPaymentReminders: parsed.config?.monthlyPaymentReminders || DEFAULT_DATA.config.monthlyPaymentReminders,
            monthlyReminderStatus: parsed.config?.monthlyReminderStatus || {},
            bankPayments: parsed.config?.bankPayments || [],
            fabricPayments: parsed.config?.fabricPayments || [],
            posPermissions: parsed.config?.posPermissions || { encargadaCanCloseZ: false, encargadaCanAddExpenses: false },
            posCerradoZ: parsed.config?.posCerradoZ || [],
            posGastos: parsed.config?.posGastos || [],
            posHistorialTickets: parsed.config?.posHistorialTickets || [],
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

const getCollectionSize = (value) => {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
};

const pickRicherCollection = (preferredValue, candidateValue) => (
    getCollectionSize(candidateValue) > getCollectionSize(preferredValue)
        ? candidateValue
        : preferredValue
);

export const mergeDataPreservingRicherSections = (...sources) => {
    const normalizedSources = sources
        .filter(Boolean)
        .map((source) => normalizeData(source));

    if (!normalizedSources.length) return null;

    return normalizedSources.reduce((merged, candidate) => {
        const nextConfig = {
            ...(candidate.config || {}),
            ...(merged.config || {})
        };

        RICH_CONFIG_ARRAY_KEYS.forEach((key) => {
            nextConfig[key] = pickRicherCollection(merged.config?.[key], candidate.config?.[key]) || [];
        });

        RICH_CONFIG_OBJECT_KEYS.forEach((key) => {
            nextConfig[key] = pickRicherCollection(merged.config?.[key], candidate.config?.[key]) || {};
        });

        const mergedSyncRevision = Number(merged.config?.syncMeta?.revision || 0);
        const candidateSyncRevision = Number(candidate.config?.syncMeta?.revision || 0);
        nextConfig.syncMeta = candidateSyncRevision > mergedSyncRevision
            ? candidate.config?.syncMeta || merged.config?.syncMeta || DEFAULT_DATA.config.syncMeta
            : merged.config?.syncMeta || candidate.config?.syncMeta || DEFAULT_DATA.config.syncMeta;

        const nextData = {
            ...candidate,
            ...merged,
            config: nextConfig
        };

        RICH_TOP_LEVEL_KEYS.forEach((key) => {
            nextData[key] = pickRicherCollection(merged[key], candidate[key]) || [];
        });

        return normalizeData(nextData);
    });
};

const stripInlineImagePayload = (items = []) => (
    (Array.isArray(items) ? items : []).map((item) => {
        if (!item || typeof item !== 'object') return item;
        const next = { ...item };
        delete next.data;
        delete next.base64;
        delete next.preview;
        delete next.localPreview;
        delete next.thumbDataUrl;
        delete next.dataUrl;
        delete next.imageData;
        return next;
    })
);

const buildLocalStorageSafeData = (data, { keepBackupMeta = false } = {}) => {
    const normalized = normalizeData(data);

    return {
        ...normalized,
        moldes: (normalized.moldes || []).map((molde) => ({
            ...molde,
            imagenes: stripInlineImagePayload(molde.imagenes)
        })),
        telas: (normalized.telas || []).map((tela) => ({
            ...tela,
            imagenes: stripInlineImagePayload(tela.imagenes)
        })),
        config: {
            ...normalized.config,
            fotoTasks: (normalized.config.fotoTasks || []).map((task) => ({
                ...task,
                imagenes: stripInlineImagePayload(task.imagenes),
                fotos: stripInlineImagePayload(task.fotos)
            })),
            imageLibrary: (normalized.config.imageLibrary || []).map((image) => {
                const next = { ...image };
                delete next.dataUrl;
                delete next.thumbDataUrl;
                delete next.preview;
                delete next.localPreview;
                return next;
            }),
            posProductos: (normalized.config.posProductos || []).map((product) => ({
                ...product,
                imagenes: stripInlineImagePayload(product.imagenes),
                imagenesArticulo: [],
                imagenBibliotecaThumb: ''
            })),
            marketingCache: {
                accountInsights: normalized.config.marketingCache?.accountInsights || null,
                campaigns: Array.isArray(normalized.config.marketingCache?.campaigns)
                    ? normalized.config.marketingCache.campaigns.slice(0, 50)
                    : [],
                adSets: {},
                aiReport: keepBackupMeta ? '' : (normalized.config.marketingCache?.aiReport || '').slice(0, 3000),
                agentsCache: keepBackupMeta ? { history: (normalized.config.agentsCache?.history || []).slice(0, 5) } : {},
                lastSyncedAt: normalized.config.marketingCache?.lastSyncedAt || null
            },
            paginaWebCache: {
                allProducts: [],
                productStatsById: {},
                lastLoadedAt: normalized.config.paginaWebCache?.lastLoadedAt || null
            }
        }
    };
};

const openAppStorageDb = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no esta disponible en este dispositivo.'));
        return;
    }

    const request = indexedDB.open(APP_STORAGE_DB_NAME, APP_STORAGE_DB_VERSION);

    request.onupgradeneeded = () => {
        const dbInstance = request.result;
        if (!dbInstance.objectStoreNames.contains(APP_STORAGE_STORE)) {
            dbInstance.createObjectStore(APP_STORAGE_STORE, { keyPath: 'key' });
        }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base local de la app.'));
});

const writeAppSnapshotToIndexedDb = async (key, data) => {
    try {
        const dbInstance = await openAppStorageDb();
        await new Promise((resolve, reject) => {
            const tx = dbInstance.transaction(APP_STORAGE_STORE, 'readwrite');
            tx.objectStore(APP_STORAGE_STORE).put({
                key,
                savedAt: new Date().toISOString(),
                data
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('No se pudo guardar snapshot local en IndexedDB.'));
        });
        dbInstance.close();
    } catch (err) {
        console.error('Error guardando snapshot en IndexedDB:', err);
    }
};

const readAppSnapshotFromIndexedDb = async (key) => {
    try {
        const dbInstance = await openAppStorageDb();
        const record = await new Promise((resolve, reject) => {
            const tx = dbInstance.transaction(APP_STORAGE_STORE, 'readonly');
            const request = tx.objectStore(APP_STORAGE_STORE).get(key);
            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error || new Error('No se pudo leer snapshot local desde IndexedDB.'));
        });
        dbInstance.close();
        return record ? normalizeData(record) : null;
    } catch (err) {
        console.error('Error leyendo snapshot en IndexedDB:', err);
        return null;
    }
};

const getFirestoreSplitDocPayload = (key, value) => ({ [key]: Array.isArray(value) ? value : [] });

const buildConfigWithoutSplitDocs = (config = {}) => (
    CONFIG_SPLIT_KEYS.reduce((nextConfig, key) => {
        nextConfig[key] = [];
        return nextConfig;
    }, { ...config })
);

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
        const splitDocEntries = Object.entries(CONFIG_SPLIT_DOCS);
        const splitDocReads = splitDocEntries.map(([, docId]) => getDoc(doc(db, 'app-data', docId)));
        const [configSnap, moldesSnap, telasSnap, tareasSnap, legacySnap, ...splitDocSnaps] = await Promise.all([
            getDoc(doc(db, 'app-data', 'config')),
            getDoc(doc(db, 'app-data', 'moldes')),
            getDoc(doc(db, 'app-data', 'telas')),
            getDoc(doc(db, 'app-data', 'tareas')),
            getDoc(doc(db, 'app-data', 'main')),  // legacy single-doc format
            ...splitDocReads
        ]);

        // If new split format exists, use it
        if (configSnap.exists()) {
            const configBase = configSnap.data()?.config || configSnap.data() || {};
            const config = {
                ...configBase
            };
            splitDocEntries.forEach(([key], index) => {
                const splitSnap = splitDocSnaps[index];
                config[key] = splitSnap?.exists()
                    ? (splitSnap.data()?.[key] || [])
                    : (configBase[key] || []);
            });
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
            if (m.imagenes && m.imagenes.length > 0) {
                const totalSize = JSON.stringify(m.imagenes).length;
                if (totalSize > 500000) {
                    console.warn(`⚠️ Molde "${m.nombre}" tiene imágenes muy grandes (${(totalSize/1024).toFixed(0)}KB). Limitando...`);
                    return { ...m, imagenes: m.imagenes.slice(0, 2) };
                }
            }
            return m;
        });

        const configWithoutSplitDocs = buildConfigWithoutSplitDocs(data.config || {});

        // Prepare all doc writes
        const writes = [
            { ref: doc(db, 'app-data', 'config'), data: { config: configWithoutSplitDocs } },
            { ref: doc(db, 'app-data', 'moldes'), data: { moldes: moldesClean } },
            { ref: doc(db, 'app-data', 'telas'), data: { telas: data.telas || [] } },
            { ref: doc(db, 'app-data', 'tareas'), data: { tareas: data.tareas || [] } },
            ...Object.entries(CONFIG_SPLIT_DOCS).map(([key, docId]) => ({
                ref: doc(db, 'app-data', docId),
                data: getFirestoreSplitDocPayload(key, data.config?.[key] || [])
            }))
        ];

        // Try writeBatch first (faster), fallback to parallel setDoc if batch fails
        try {
            const batch = writeBatch(db);
            writes.forEach(w => batch.set(w.ref, w.data));
            await batch.commit();
            console.log('✅ Firestore save OK (batch)');
        } catch (batchErr) {
            console.warn('⚠️ Batch write failed, falling back to parallel setDoc:', batchErr.message);
            await Promise.all(writes.map(w => setDoc(w.ref, w.data)));
            console.log('✅ Firestore save OK (parallel fallback)');
        }
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

export const loadProtectedSessionSnapshotFromIndexedDb = async () => readAppSnapshotFromIndexedDb(APP_RECOVERY_SNAPSHOT_KEY);

export const loadDataFromIndexedDb = async () => readAppSnapshotFromIndexedDb(APP_MAIN_SNAPSHOT_KEY);

const saveBackupSnapshotToLocal = (data) => {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupKey = `${STORAGE_KEY}_backup_${stamp}`;
        const rawIndex = localStorage.getItem(BACKUP_INDEX_KEY);
        const parsedIndex = JSON.parse(rawIndex || '[]');
        const backupKeys = Array.isArray(parsedIndex) ? parsedIndex : [];

        try {
            localStorage.setItem(backupKey, JSON.stringify(buildLocalStorageSafeData(data, { keepBackupMeta: true })));
        } catch {
            // localStorage full — skip backup silently; Firestore + IndexedDB are the primary stores
            return;
        }
        const nextKeys = [...backupKeys, backupKey].slice(-MAX_LOCAL_BACKUPS);

        while (backupKeys.length >= MAX_LOCAL_BACKUPS) {
            const oldKey = backupKeys.shift();
            if (oldKey && !nextKeys.includes(oldKey)) {
                localStorage.removeItem(oldKey);
            }
        }

        try {
            localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(nextKeys));
        } catch { /* ignore */ }
    } catch (err) {
        console.error('Error guardando snapshot local:', err);
    }
};

export const saveDataToLocal = (data) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildLocalStorageSafeData(data)));
        void writeAppSnapshotToIndexedDb(APP_MAIN_SNAPSHOT_KEY, data);
        saveBackupSnapshotToLocal(data);
    } catch (err) {
        console.error('Error guardando datos locales:', err);
        if (err.name === 'QuotaExceededError') {
            try {
                const rawIndex = localStorage.getItem(BACKUP_INDEX_KEY);
                const backupKeys = JSON.parse(rawIndex || '[]');
                if (Array.isArray(backupKeys)) {
                    backupKeys.forEach((key) => localStorage.removeItem(key));
                }
                localStorage.removeItem(BACKUP_INDEX_KEY);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(buildLocalStorageSafeData(data)));
                void writeAppSnapshotToIndexedDb(APP_MAIN_SNAPSHOT_KEY, data);
                return;
            } catch (retryErr) {
                console.error('Error reintentando guardado local compacto:', retryErr);
            }
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
    // IndexedDB is primary — always write there first, localStorage is best-effort
    void writeAppSnapshotToIndexedDb(APP_RECOVERY_SNAPSHOT_KEY, data);
    try {
        localStorage.setItem(RECOVERY_SESSION_KEY, JSON.stringify(buildLocalStorageSafeData(data)));
    } catch (err) {
        if (err.name !== 'QuotaExceededError' && err.code !== 22) {
            console.error('Error guardando snapshot de recuperacion:', err);
        }
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

// Call once on app startup to free localStorage space.
// Backups and recovery snapshots live in Firestore + IndexedDB, so localStorage copies are redundant.
export const cleanupLocalStorageOnStartup = () => {
    try {
        const rawIndex = localStorage.getItem(BACKUP_INDEX_KEY);
        const backupKeys = JSON.parse(rawIndex || '[]');
        if (Array.isArray(backupKeys) && backupKeys.length > 0) {
            backupKeys.forEach((key) => { try { localStorage.removeItem(key); } catch {} });
            localStorage.removeItem(BACKUP_INDEX_KEY);
        }
        // Recovery snapshot is preserved in IndexedDB — remove the localStorage copy
        localStorage.removeItem(RECOVERY_SESSION_KEY);
    } catch {}
};
