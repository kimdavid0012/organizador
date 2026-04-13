// IndexedDB wrapper for offline data persistence
// Database: 'organizador-local'
// Stores: 'app-data', 'sync-queue', 'cache-meta'

const DB_NAME = 'organizador-local';
const DB_VERSION = 1;
const STORES = ['app-data', 'sync-queue', 'cache-meta'];

let dbInstance = null;

export const initDB = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no disponible'));
        return;
    }

    if (dbInstance) {
        resolve(dbInstance);
        return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        STORES.forEach((storeName) => {
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'key' });
            }
        });
    };

    request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
    };

    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
});

export const saveData = async (storeName, key, data) => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put({ key, data, savedAt: new Date().toISOString() });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[IndexedDB] saveData error:', err);
        return false;
    }
};

export const getData = async (storeName, key) => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result?.data ?? null);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('[IndexedDB] getData error:', err);
        return null;
    }
};

export const getAllData = async (storeName) => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('[IndexedDB] getAllData error:', err);
        return [];
    }
};

export const deleteData = async (storeName, key) => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[IndexedDB] deleteData error:', err);
        return false;
    }
};

export const clearStore = async (storeName) => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[IndexedDB] clearStore error:', err);
        return false;
    }
};
