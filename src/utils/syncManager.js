// Sync Manager — offline/online coordination
// When online: saves to Firebase AND IndexedDB
// When offline: saves to IndexedDB only, queues for later upload
// When reconnected: flushes the sync queue to Firebase

import { saveData, getData, getAllData, deleteData } from './indexedDB';

const MAIN_DATA_KEY = 'main';
const SYNC_QUEUE_STORE = 'sync-queue';
const APP_DATA_STORE = 'app-data';

// ── Status ────────────────────────────────────────────────────────────────────

export const SyncStatus = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    SYNCING: 'syncing'
};

const listeners = new Set();

let currentStatus = navigator.onLine ? SyncStatus.ONLINE : SyncStatus.OFFLINE;

const notifyListeners = (status) => {
    currentStatus = status;
    listeners.forEach((fn) => fn(status));
};

export const getSyncStatus = () => currentStatus;

export const subscribeSyncStatus = (fn) => {
    listeners.add(fn);
    fn(currentStatus); // emit current status immediately
    return () => listeners.delete(fn);
};

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

export const saveAppDataLocally = (data) => saveData(APP_DATA_STORE, MAIN_DATA_KEY, data);

export const loadAppDataLocally = () => getData(APP_DATA_STORE, MAIN_DATA_KEY);

// ── Sync Queue ────────────────────────────────────────────────────────────────

export const enqueueChange = async (data) => {
    const id = `change-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await saveData(SYNC_QUEUE_STORE, id, { enqueuedAt: new Date().toISOString(), data });
    console.log('[SyncManager] Change queued offline:', id);
};

const flushSyncQueue = async (firebaseSaveFn) => {
    const allEntries = await getAllData(SYNC_QUEUE_STORE);
    if (!allEntries.length) return;

    notifyListeners(SyncStatus.SYNCING);
    console.log(`[SyncManager] Flushing ${allEntries.length} queued change(s) to Firebase...`);

    // Sort by enqueue time, process oldest first
    const sorted = [...allEntries].sort((a, b) => {
        const ta = a.data?.enqueuedAt || '';
        const tb = b.data?.enqueuedAt || '';
        return ta.localeCompare(tb);
    });

    let lastSuccessfulData = null;

    for (const entry of sorted) {
        try {
            const changeData = entry.data?.data;
            if (changeData) {
                await firebaseSaveFn(changeData);
                lastSuccessfulData = changeData;
            }
            await deleteData(SYNC_QUEUE_STORE, entry.key);
        } catch (err) {
            console.error('[SyncManager] Failed to flush queued change:', entry.key, err);
            // Stop processing on error — network may have dropped again
            break;
        }
    }

    const remaining = await getAllData(SYNC_QUEUE_STORE);
    if (!remaining.length) {
        notifyListeners(SyncStatus.ONLINE);
        console.log('[SyncManager] Sync queue flushed successfully.');
    } else {
        notifyListeners(SyncStatus.OFFLINE);
        console.warn('[SyncManager] Some changes still pending in queue.');
    }

    return lastSuccessfulData;
};

// ── Online/Offline listeners ───────────────────────────────────────────────────

let firebaseSaveFnRef = null;

export const initSyncManager = (firebaseSaveFn) => {
    firebaseSaveFnRef = firebaseSaveFn;

    const handleOnline = async () => {
        console.log('[SyncManager] Connection restored. Flushing queue...');
        if (firebaseSaveFnRef) {
            await flushSyncQueue(firebaseSaveFnRef);
        }
        notifyListeners(SyncStatus.ONLINE);
    };

    const handleOffline = () => {
        console.log('[SyncManager] Connection lost. Working locally.');
        notifyListeners(SyncStatus.OFFLINE);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial status
    notifyListeners(navigator.onLine ? SyncStatus.ONLINE : SyncStatus.OFFLINE);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
};

// ── Main save helper ──────────────────────────────────────────────────────────
// Call this instead of calling Firebase directly when you want offline queuing.
// (DataContext still calls its own Firebase save — this is an additive layer.)

export const saveWithSync = async (data, firebaseSaveFn) => {
    // Always persist locally
    await saveAppDataLocally(data);

    if (navigator.onLine) {
        try {
            await firebaseSaveFn(data);
            notifyListeners(SyncStatus.ONLINE);
        } catch (err) {
            console.warn('[SyncManager] Firebase save failed, queuing change:', err.message);
            await enqueueChange(data);
            notifyListeners(SyncStatus.OFFLINE);
        }
    } else {
        await enqueueChange(data);
        notifyListeners(SyncStatus.OFFLINE);
    }
};
