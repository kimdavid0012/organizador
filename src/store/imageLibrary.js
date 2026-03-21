import { generateId } from '../utils/helpers';

const DB_NAME = 'organizador-image-library';
const DB_VERSION = 1;
const STORE_NAME = 'article-images';

const openDb = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está disponible en este dispositivo.'));
        return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base local de imágenes.'));
});

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen.'));
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
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

            const blob = await new Promise((resolveBlob) => {
                canvas.toBlob(
                    (generatedBlob) => resolveBlob(generatedBlob),
                    'image/jpeg',
                    quality
                );
            });

            if (!blob) {
                reject(new Error('No se pudo comprimir la imagen.'));
                return;
            }

            resolve({
                blob,
                width: targetWidth,
                height: targetHeight
            });
        };
        image.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
        image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.readAsDataURL(file);
});

const saveImageRecord = async (record) => {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('No se pudo guardar la imagen en memoria local.'));
    });
    db.close();
};

export const saveArticleLibraryImage = async (file, meta = {}) => {
    const id = generateId();
    const createdAt = new Date().toISOString();

    const [{ blob, width, height }, thumb] = await Promise.all([
        drawResizedImage(file, 1400, 1400, 0.82),
        drawResizedImage(file, 220, 220, 0.7)
    ]);

    const thumbDataUrl = await blobToDataUrl(thumb.blob);

    await saveImageRecord({
        id,
        blob,
        thumbDataUrl,
        createdAt,
        width,
        height,
        originalName: file.name,
        mimeType: blob.type || 'image/jpeg'
    });

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
            width,
            height
        },
        thumbDataUrl
    };
};

export const getArticleLibraryThumb = async (id) => {
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result?.thumbDataUrl || '');
        request.onerror = () => reject(request.error || new Error('No se pudo cargar la miniatura.'));
    });
    db.close();
    return result;
};

export const getArticleLibraryImageUrl = async (id) => {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('No se pudo cargar la imagen.'));
    });
    db.close();
    if (!record?.blob) return '';
    return URL.createObjectURL(record.blob);
};

export const deleteArticleLibraryImage = async (id) => {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('No se pudo borrar la imagen.'));
    });
    db.close();
};
