import React, { useState, useRef } from 'react';
import { Upload, ImagePlus } from 'lucide-react';
import { resizeImage, MAX_IMAGE_SIZE_MB, MAX_IMAGE_SIZE_BYTES } from '../utils/helpers';
import { useI18n } from '../store/I18nContext';
import './ImageUploader.css';

export default function ImageUploader({ onUpload, className }) {
    const [dragActive, setDragActive] = useState(false);
    const [imageType, setImageType] = useState('Molde');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const { t } = useI18n();

    const handleFiles = async (files) => {
        setUploading(true);
        try {
            for (const file of files) {
                if (!file.type.startsWith('image/')) {
                    alert(`"${file.name}" no es una imagen válida.`);
                    continue;
                }
                if (file.size > MAX_IMAGE_SIZE_BYTES) {
                    alert(`"${file.name}" supera el límite de ${MAX_IMAGE_SIZE_MB}MB. Se va a comprimir.`);
                }
                const data = await resizeImage(file, 800, 800, 0.7);
                onUpload({
                    data,
                    tipo: imageType,
                    notas: '',
                });
            }
        } catch (err) {
            alert('Error al procesar imagen: ' + err.message);
        }
        setUploading(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files.length) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragActive(true);
    };

    const handleDragLeave = () => {
        setDragActive(false);
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleInputChange = (e) => {
        if (e.target.files.length) {
            handleFiles(Array.from(e.target.files));
        }
        e.target.value = '';
    };

    return (
        <div className={`image-uploader ${className || ''}`}>
            <div className="image-type-select">
                <label>{t('tipo')}:</label>
                <select
                    className="form-select"
                    value={imageType}
                    onChange={(e) => setImageType(e.target.value)}
                    style={{ width: 'auto', minWidth: 130 }}
                >
                    <option value="Molde">{t('tipoMolde')}</option>
                    <option value="Cabezal">{t('tipoCabezal')}</option>
                    <option value="Otro">{t('tipoOtro')}</option>
                </select>
            </div>
            <div
                className={`image-drop-zone ${dragActive ? 'drag-active' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={handleClick}
            >
                {uploading ? (
                    <>
                        <Upload />
                        <span>{t('subiendo')}</span>
                    </>
                ) : (
                    <>
                        <ImagePlus />
                        <span>{t('arrastrarImagenes')}</span>
                        <p>{t('formatosPermitidos')} {MAX_IMAGE_SIZE_MB}MB</p>
                    </>
                )}
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleInputChange}
            />
        </div>
    );
}
