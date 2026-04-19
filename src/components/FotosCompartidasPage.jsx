import React from 'react';
import { FolderOpen, ExternalLink } from 'lucide-react';
import { useData } from '../store/DataContext';

export default function FotosCompartidasPage() {
    const { state, updateConfig } = useData();
    const driveUrl = state.config?.marketing?.googleDriveUrl || '';

    return (
        <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <FolderOpen size={22} /> Google Drive
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 13 }}>
                Material de fotos, archivos compartidos y recursos del equipo en Google Drive.
            </p>

            {driveUrl ? (
                <a
                    href={driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 12, padding: '20px 32px', borderRadius: 14,
                        background: 'linear-gradient(135deg, rgba(66,133,244,0.15), rgba(52,168,83,0.15))',
                        border: '1px solid rgba(66,133,244,0.3)',
                        color: '#4285F4', fontWeight: 700, fontSize: 16,
                        textDecoration: 'none', transition: 'all 0.2s', cursor: 'pointer'
                    }}
                >
                    <FolderOpen size={24} />
                    Abrir Google Drive
                    <ExternalLink size={18} />
                </a>
            ) : (
                <div style={{ padding: 32, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <FolderOpen size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 8 }}>
                        No hay link de Google Drive configurado.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        Andá a <strong>Configuración</strong> y pegá el link de tu carpeta de Google Drive.
                    </p>
                </div>
            )}
        </div>
    );
}
