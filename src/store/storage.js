import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const STORAGE_KEY = 'organizador_moldes_data';
const FIRESTORE_DOC = 'app-data/main';

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
        pedidosOnline: [],
        posPermissions: { encargadaCanCloseZ: false, encargadaCanAddExpenses: false },
        posCerradoZ: [],
        posGastos: [],
        posProductos: [],
        posVentas: [],
        marketing: {
            metaToken: '',
            metaAdAccountId: '938112566730962',
            metaPixelId: '',
            tiktokToken: '',
            tiktokPixelId: '',
            wooUrl: 'https://celavie.com.ar',
            wooKey: '',
            wooSecret: '',
            openaiKey: ''
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
            pedidosOnline: parsed.config?.pedidosOnline || [],
            posPermissions: parsed.config?.posPermissions || { encargadaCanCloseZ: false, encargadaCanAddExpenses: false },
            posCerradoZ: parsed.config?.posCerradoZ || [],
            posGastos: parsed.config?.posGastos || [],
            posProductos: parsed.config?.posProductos || [],
            posVentas: parsed.config?.posVentas || [],
            marketing: {
                ...DEFAULT_DATA.config.marketing,
                ...parsed.config?.marketing,
            }
        }
    };
}

// ============ FIRESTORE (SPLIT INTO MULTIPLE DOCS) ============
// Firestore limit = 1MB per document
// We split data into 4 docs to stay under the limit:
//   app-data/config  → config object (cortes, POS, clientes, settings)
//   app-data/moldes  → moldes array
//   app-data/telas   → telas array
//   app-data/tareas  → tareas array

export const loadDataFromFirestore = async () => {
    try {
        const [configSnap, moldesSnap, telasSnap, tareasSnap, legacySnap] = await Promise.all([
            getDoc(doc(db, 'app-data', 'config')),
            getDoc(doc(db, 'app-data', 'moldes')),
            getDoc(doc(db, 'app-data', 'telas')),
            getDoc(doc(db, 'app-data', 'tareas')),
            getDoc(doc(db, 'app-data', 'main')),  // legacy single-doc format
        ]);

        // If new split format exists, use it
        if (configSnap.exists()) {
            const config = configSnap.data()?.config || configSnap.data() || {};
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

        await Promise.all([
            setDoc(doc(db, 'app-data', 'config'), { config: data.config || {} }),
            setDoc(doc(db, 'app-data', 'moldes'), { moldes: moldesClean }),
            setDoc(doc(db, 'app-data', 'telas'), { telas: data.telas || [] }),
            setDoc(doc(db, 'app-data', 'tareas'), { tareas: data.tareas || [] }),
        ]);
        console.log('✅ Datos guardados en Firestore (4 documentos)');
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

export const saveDataToLocal = (data) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
