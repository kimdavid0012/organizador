import { nanoid } from 'nanoid';

export const generateId = () => nanoid(10);

export const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateInput = (isoString) => {
    if (!isoString) return '';
    return isoString.split('T')[0];
};

export const isOverdue = (fechaObjetivo) => {
    if (!fechaObjetivo) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(fechaObjetivo);
    target.setHours(0, 0, 0, 0);
    return target < today;
};

export const isToday = (fechaObjetivo) => {
    if (!fechaObjetivo) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(fechaObjetivo);
    target.setHours(0, 0, 0, 0);
    return target.getTime() === today.getTime();
};

export const isTodayOrOverdue = (fechaObjetivo) => {
    return isToday(fechaObjetivo) || isOverdue(fechaObjetivo);
};

export const PRIORIDAD_COLORS = {
    'Alta': '#ef4444',
    'Media': '#f59e0b',
    'Baja': '#22c55e'
};

export const PRIORIDAD_OPTIONS = ['Alta', 'Media', 'Baja'];

export const resizeImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// Returns the best available thumbnail for a product (works across all devices since thumbDataUrl is in Firestore)
export const getProductThumb = (codigoInterno, posProductos = []) => {
    if (!codigoInterno || !posProductos.length) return '';

    // Normalize: strip "ART " prefix and spaces for flexible matching
    // e.g. "6208", "ART 6208", "ART6208" all match product with codigoInterno "ART 6208"
    const normalizeCode = (val) => (val || '').toString().trim().toUpperCase().replace(/^ART\s*/, '');
    const code = normalizeCode(codigoInterno);

    const product = posProductos.find((p) => {
        const pCode = normalizeCode(p?.codigoInterno);
        return pCode && pCode === code;
    });
    if (!product) return '';

    // WooCommerce images come as URL strings — use them directly (work on all devices)
    const wooImage = Array.isArray(product.imagenes)
        ? product.imagenes.map(img => (typeof img === 'string' ? img : img?.url || img?.src || '')).find(Boolean)
        : '';

    // Priority: thumb base64 (Firestore) > Firebase Storage URL > WooCommerce image > other fields
    return product.imagenBibliotecaThumb
        || product.storageUrl
        || wooImage
        || product.imagen
        || product.image
        || product.thumbnail
        || '';
};
