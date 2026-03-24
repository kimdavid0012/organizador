import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';
import { generateId } from '../utils/helpers';

// IndexedDB fallback for local blob storage (full-res images stay local)
const DB_NAME = 'organizador-image-library';
const DB_VERSION = 1;
const STORE_NAME = 'article-images';

const openDb = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no disponible')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
});

const drawResizedImage = (file, maxWidth, maxHeight, quality = 0.82) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const image = new Image();
        image.onload = async () => {
            let { width, height } = image;
            const ratio = Math.min(maxWidth / width || 1, maxHeight / height || 1, 1);
            const targetWidth = Math.max(1, Math.round(width * ratio));
            const targetHeight = Math.max(1, Math.round(height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth; canvas.height = targetHeight;
            canvas.getContext('2d').drawImage(image, 0, 0, targetWidth, targetHeight);
            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
            if (!blob) { reject(new Error('No se pudo comprimir')); return; }
            resolve({ blob, width: targetWidth, height: targetHeight });
        };
        image.onerror = () => reject(new Error('No se pudo procesar la imagen'));
        image.src = reader.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});


const saveLocalBlob = async (record) => {
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) { console.warn('IndexedDB save failed (ok on other devices):', e.message); }
};

// Upload full image to Firebase Storage, return public download URL
const uploadToStorage = async (blob, id, meta = {}) => {
    if (!storage) throw new Error('Firebase Storage no configurado');
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const path = `article-images/${meta.productCode || 'unknown'}/${id}.${ext}`;
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
    const downloadURL = await getDownloadURL(snapshot.ref);
    return { downloadURL, storagePath: path };
};

export const saveArticleLibraryImage = async (file, meta = {}) => {
    const id = generateId();
    const createdAt = new Date().toISOString();

    const [{ blob, width, height }, thumb] = await Promise.all([
        drawResizedImage(file, 1400, 1400, 0.85),
        drawResizedImage(file, 220, 220, 0.75)
    ]);

    const thumbDataUrl = await blobToDataUrl(thumb.blob);

    // Upload full image to Firebase Storage (shared across all devices)
    const { downloadURL, storagePath } = await uploadToStorage(blob, id, meta);

    // Also save locally for fast full-res preview on this device
    await saveLocalBlob({ id, blob, thumbDataUrl, createdAt, width, height, originalName: file.name, mimeType: blob.type || 'image/jpeg' });

    return {
        metadata: {
            id,
            productId: meta.productId || '',
            productCode: meta.productCode || '',
            productName: meta.productName || '',
            uploadedAt: createdAt,
            uploadedBy: meta.uploadedBy || '',
            note: meta.note || '',
            sizeBytes: blob.size || 0,
            width, height,
            thumbDataUrl,
            storageUrl: downloadURL,
            storagePath,
            // Legacy field for backwards compat
            sharedPreviewUrl: downloadURL
        },
        thumbDataUrl
    };
};


export const getArticleLibraryThumb = async (id) => {
    // First try IndexedDB (local device, fast)
    try {
        const db = await openDb();
        const result = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(id);
            request.onsuccess = () => resolve(request.result?.thumbDataUrl || '');
            request.onerror = () => reject(request.error);
        });
        db.close();
        if (result) return result;
    } catch (e) { /* fallback below */ }
    return '';
};

export const getArticleLibraryImageUrl = async (id) => {
    // First try local IndexedDB blob (fast, this device)
    try {
        const db = await openDb();
        const record = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        db.close();
        if (record?.blob) return URL.createObjectURL(record.blob);
    } catch (e) { /* fallback below */ }
    return '';
};

export const deleteArticleLibraryImage = async (id, storagePath) => {
    // Delete from Firebase Storage if path known
    if (storagePath && storage) {
        try {
            const storageRef = ref(storage, storagePath);
            await deleteObject(storageRef);
        } catch (e) { console.warn('Storage delete failed:', e.message); }
    }
    // Delete from local IndexedDB
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(id);
            tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (e) { console.warn('IndexedDB delete failed:', e.message); }
};
