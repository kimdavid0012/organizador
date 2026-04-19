import React from 'react';
import { BarChart3, ExternalLink, TrendingUp } from 'lucide-react';
import { useData } from '../store/DataContext';

export default function GoogleAnalyticsPage() {
    const { state } = useData();
    const gaId = state.config?.marketing?.googleAnalyticsId || '';
    const gaUrl = gaId
        ? `https://analytics.google.com/analytics/web/#/p${gaId}/reports/dashboard`
        : 'https://analytics.google.com/analytics/web/';

    return (
        <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <TrendingUp size={22} /> Google Analytics
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontSize: 13 }}>
                Datos de tráfico y comportamiento de visitantes en celavie.com.ar.
                {gaId && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Measurement ID: {gaId}</span>}
            </p>

            <a
                href={gaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 12, padding: '20px 32px', borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(234,67,53,0.12), rgba(251,188,5,0.12))',
                    border: '1px solid rgba(234,67,53,0.3)',
                    color: '#EA4335', fontWeight: 700, fontSize: 16,
                    textDecoration: 'none', transition: 'all 0.2s', cursor: 'pointer',
                    marginBottom: 24
                }}
            >
                <BarChart3 size={24} />
                Abrir Google Analytics
                <ExternalLink size={18} />
            </a>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ padding: 20, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Conectado con</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>WooCommerce</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Eventos de compra y conversión</div>
                </div>
                <div style={{ padding: 20, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Sitio web</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>celavie.com.ar</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Tráfico, sesiones, usuarios</div>
                </div>
                <div style={{ padding: 20, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Integración</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>Meta Pixel + GA4</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Tracking de conversiones</div>
                </div>
            </div>

            {!gaId && (
                <div style={{ padding: 24, borderRadius: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                    <p style={{ color: '#f59e0b', fontSize: 14, marginBottom: 8 }}>
                        Para ver datos directamente acá, agregá tu <strong>Measurement ID de GA4</strong> en Configuración.
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        Lo encontrás en Google Analytics → Admin → Data Streams → tu stream → Measurement ID (empieza con G-)
                    </p>
                </div>
            )}
        </div>
    );
}
