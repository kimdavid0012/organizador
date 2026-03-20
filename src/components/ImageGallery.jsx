import React, { useState } from 'react';
import { Star, Trash2, X, Eye } from 'lucide-react';
import { useI18n } from '../store/I18nContext';
import './ImageUploader.css';

export default function ImageGallery({ imagenes, coverImageId, onSetCover, onRemove }) {
    const [lightboxImg, setLightboxImg] = useState(null);
    const { t } = useI18n();

    if (!imagenes || imagenes.length === 0) {
        return null;
    }

    return (
        <div className="image-gallery">
            <span className="form-label">{t('imagenes')} ({imagenes.length})</span>
            <div className="image-gallery-grid">
                {imagenes.map(img => (
                    <div
                        key={img.id}
                        className={`image-gallery-item ${img.id === coverImageId ? 'is-cover' : ''}`}
                    >
                        <img src={img.data} alt={img.tipo || 'imagen'} loading="lazy" />
                        {img.tipo && (
                            <span className="image-type-badge">{img.tipo}</span>
                        )}
                        {img.id === coverImageId && (
                            <span className="image-gallery-cover-badge">{t('portada')}</span>
                        )}
                        <div className="image-gallery-overlay">
                            <button onClick={() => setLightboxImg(img.data)}>
                                <Eye style={{ width: 12, height: 12 }} />
                                {t('ver')}
                            </button>
                            {onSetCover && img.id !== coverImageId && (
                                <button onClick={() => onSetCover(img.id)}>
                                    <Star style={{ width: 12, height: 12 }} />
                                    {t('portada')}
                                </button>
                            )}
                            <button className="remove" onClick={() => onRemove(img.id)}>
                                <Trash2 style={{ width: 12, height: 12 }} />
                                {t('eliminarImg')}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {lightboxImg && (
                <div className="lightbox" onClick={() => setLightboxImg(null)}>
                    <img src={lightboxImg} alt={t('vistaAmpliada')} />
                    <button className="lightbox-close" onClick={() => setLightboxImg(null)}>
                        <X />
                    </button>
                </div>
            )}
        </div>
    );
}
