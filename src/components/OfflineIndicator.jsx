import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../store/DataContext';

export default function OfflineIndicator() {
    const { syncStatus } = useData();
    const { online, pendingChanges, hasPendingWrites, lastCloudSaveAt } = syncStatus || {};
    const [visible, setVisible] = useState(false);
    const hideTimerRef = useRef(null);

    const isOffline = !online;
    const isSyncing = online && (hasPendingWrites || pendingChanges > 0);

    useEffect(() => {
        if (isOffline) {
            setVisible(true);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            return;
        }
        if (isSyncing) {
            setVisible(true);
            // Auto-hide after 6 seconds — if sync is still pending, it will re-trigger
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            hideTimerRef.current = setTimeout(() => setVisible(false), 6000);
        } else {
            // Sync finished — hide after a brief moment
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            hideTimerRef.current = setTimeout(() => setVisible(false), 800);
        }
        return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
    }, [isSyncing, isOffline, lastCloudSaveAt]);

    if (!visible) return null;

    const bannerStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 16px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 0.2,
        background: isOffline ? 'rgba(239, 68, 68, 0.92)' : 'rgba(245, 158, 11, 0.92)',
        color: '#fff',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        transition: 'background 0.3s ease'
    };

    const dotStyle = {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#fff',
        opacity: 0.85,
        animation: isSyncing ? 'pulse 1.2s infinite' : 'none',
        flexShrink: 0
    };

    return (
        <>
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.4; transform: scale(0.85); }
                    50% { opacity: 1; transform: scale(1.1); }
                }
            `}</style>
            <div style={bannerStyle} role="status" aria-live="polite">
                <span style={dotStyle} />
                {isOffline
                    ? 'Sin conexion — trabajando offline'
                    : 'Sincronizando...'}
            </div>
        </>
    );
}
