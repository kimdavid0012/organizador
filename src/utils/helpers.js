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
