import React, { useState, useRef } from 'react';
import { Columns3, Users, Tag, CalendarRange, Download, Upload, Database, Plus, Trash2, HardDrive, AlertTriangle, FileJson, Scissors, Factory, Key, Lock, Shield, Eye, EyeOff, Cloud, CloudUpload, Megaphone, Palette } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { useAuth } from '../store/AuthContext';
import { getStorageUsage, clearData, migrateLocalToFirestore, loadDataFromLocal, SUPPORT_WOO_CREDENTIALS } from '../store/storage';
import { generateId } from '../utils/helpers';
import { exportMoldesCSV, exportTelasCSV, parseCSV } from '../utils/csvUtils';
import './Settings.css';

const SYSTEM_ACCOUNTS = [
    { email: 'kimdavid0012@gmail.com', role: 'admin', label: 'Administrador' },
    { email: 'giselakim.wk@gmail.com', role: 'marketing', label: 'Marketing' },
    { email: 'nadia@celavie.com', role: 'encargada', label: 'Encargada' },
    { email: 'naara@celavie.com', role: 'deposito', label: 'Deposito' },
    { email: 'juan@celavie.com', role: 'pedidos', label: 'Pedidos Online' },
    { email: 'rocio@celavie.com', role: 'fotos', label: 'Fotos' }
];

export default function Settings() {
    const { state, syncStatus, exportBackupNow, updateConfig, updatePosSettings, importMoldes, importTelas, setData } = useData();
    const { config, moldes, telas } = state;
    const { t } = useI18n();
    const { user: currentUser, users, updateUserRole, loadAllFirebaseUsers, rolePermissions, updateRolePermissions, getAllowedSections, ALL_SECTIONS, SECTION_LABELS } = useAuth();
    const [loadingUsers, setLoadingUsers] = useState(false);
    const csvInputRef = useRef(null);
    const jsonInputRef = useRef(null);
    const [csvTarget, setCsvTarget] = useState('moldes');
    const [confirmClear, setConfirmClear] = useState(false);

    const storage = getStorageUsage();
    const maxMB = 10;
    const percent = Math.min((parseFloat(storage.usedMB) / maxMB) * 100, 100);

    // ---- Column management ----
    const updateColumn = (id, field, value) => {
        const updated = config.columnas.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        );
        updateConfig({ columnas: updated });
    };

    const addColumn = () => {
        const newCol = {
            id: generateId(),
            nombre: 'Nueva columna',
            orden: config.columnas.length,
            color: '#6b7280'
        };
        updateConfig({ columnas: [...config.columnas, newCol] });
    };

    const removeColumn = (id) => {
        if (config.columnas.length <= 1) {
            alert(t('alMenosUnaColumna'));
            return;
        }
        updateConfig({ columnas: config.columnas.filter(c => c.id !== id) });
    };

    // ---- List management ----
    const addToList = (key) => {
        updateConfig({ [key]: [...config[key], ''] });
    };

    const updateListItem = (key, index, value) => {
        const updated = [...config[key]];
        updated[index] = value;
        updateConfig({ [key]: updated });
    };

    const removeFromList = (key, index) => {
        const updated = config[key].filter((_, i) => i !== index);
        updateConfig({ [key]: updated });
    };

    // ---- Migrate Local to Cloud ----
    const [migrating, setMigrating] = useState(false);
    const handleMigrateToCloud = async () => {
        if (!state || (!state.moldes?.length && !state.config?.cortes?.length)) {
            alert('No hay datos para migrar.');
            return;
        }
        
        const moldesCount = state.moldes?.length || 0;
        const cortesCount = state.config?.cortes?.length || 0;
        const telasCount = state.telas?.length || 0;
        
        if (!window.confirm(`¿Guardar datos a la nube?\n\n- ${moldesCount} moldes\n- ${cortesCount} cortes\n- ${telasCount} telas\n\nLos datos se dividen automáticamente en múltiples documentos para no superar límites.`)) return;
        
        setMigrating(true);
        try {
            const { saveDataToFirestore, saveDataToLocal } = await import('../store/storage');
            saveDataToLocal(state);
            await saveDataToFirestore(state);
            alert('✅ Datos guardados en la nube exitosamente (formato dividido en 4 documentos).');
        } catch (err) {
            console.error('Error migrar:', err);
            alert(`❌ Error al guardar: ${err.message}\n\nLos datos están seguros en localStorage.`);
        } finally {
            setMigrating(false);
        }
    };

    // ---- JSON Export/Import ----
    const handleExportJSON = async () => {
        const { tareas } = state;
        // Include everything from current state (which comes from Firestore)
        const data = {
            moldes,
            tareas: tareas || [],
            telas,
            config
        };
        const json = JSON.stringify(data, null, 2);
        const fileName = `celavie-backup-completo-${new Date().toISOString().slice(0, 10)}.json`;

        // Try modern File System Access API first (opens Save As dialog)
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'JSON files',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                alert('✅ Backup completo guardado correctamente.');
                return;
            } catch (err) {
                if (err.name === 'AbortError') return; // User cancelled
            }
        }

        // Fallback for browsers without File System Access API
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const handleImportJSON = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            if (!text || text.length < 10) {
                alert('❌ El archivo está vacío o es inválido.');
                return;
            }
            const data = JSON.parse(text);

            // SPECIAL CASE: It's a JSON exported specifically for WooCommerce (Array of products)
            if (Array.isArray(data) && data.length > 0 && data[0].SKU !== undefined) {
                if (window.confirm(`Detectado archivo de ${data.length} artículos de WooCommerce. ¿Deseas importarlos como productos del POS?`)) {
                    const mappedProducts = data.map(p => ({
                        id: generateId(),
                        codigoInterno: p.SKU || '',
                        detalleCorto: p.Nombre || '',
                        detalleLargo: p['Descripción corta'] || '',
                        precioVentaL1: parseFloat(p['Precio normal']) || 0,
                        stock: parseInt(p.Inventario) || 0,
                        categoria: ''
                    }));

                    const finalData = {
                        ...state,
                        config: {
                            ...config,
                            posProductos: [...mappedProducts, ...(config.posProductos || [])]
                        }
                    };
                    setData(finalData);
                    alert(`✅ Se importaron ${mappedProducts.length} productos con éxito.`);
                }
                return;
            }

            // If it's a legacy or partial file, wrap it or handle missing pieces
            if (!data.config && !data.moldes && !data.telas) {
                alert('❌ El archivo no contiene datos válidos.');
                return;
            }

            const configFromData = data.config || {};

            // Build final data with all sections merged with defaults
            const finalData = {
                moldes: data.moldes || [],
                tareas: data.tareas || [],
                telas: data.telas || [],
                config: {
                    ...config, // Preserve existing config defaults
                    ...configFromData,
                    cortes: configFromData.cortes || [],
                    empleados: configFromData.empleados || [],
                    asistencia: configFromData.asistencia || [],
                    pedidosOnline: configFromData.pedidosOnline || [],
                    posProductos: configFromData.posProductos || [],
                    posVentas: configFromData.posVentas || [],
                    posGastos: configFromData.posGastos || [],
                    posCerradoZ: configFromData.posCerradoZ || [],
                    posPermissions: configFromData.posPermissions || { encargadaCanCloseZ: false, encargadaCanAddExpenses: false }
                }
            };

            // Use setData which triggers Firestore save via DataContext
            setData(finalData);

            const counts = [];
            counts.push(`${(data.moldes || []).length} moldes`);
            counts.push(`${(data.telas || []).length} telas`);
            counts.push(`${(configFromData.cortes || []).length} cortes`);
            counts.push(`${(configFromData.posVentas || []).length} ventas POS`);
            counts.push(`${(configFromData.posProductos || []).length} productos POS`);
            counts.push(`${(configFromData.pedidosOnline || []).length} pedidos`);

            alert(`✅ Backup importado y sincronizado con la nube: ${counts.join(', ')}.`);
        } catch (err) {
            alert(`❌ Error al importar: ${err.message}`);
        }
        e.target.value = '';
    };

    // ---- CSV ----
    const handleExportMoldes = () => exportMoldesCSV(moldes, telas);
    const handleExportTelas = () => exportTelasCSV(telas);

    const handleImportCSV = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const data = await parseCSV(file);
            if (csvTarget === 'moldes') {
                const imported = data.map((row, i) => ({
                    id: generateId(),
                    nombre: row['Nombre'] || row['nombre'] || `Molde importado ${i + 1}`,
                    codigo: row['Código'] || row['codigo'] || '',
                    categoria: row['Categoría'] || row['categoria'] || '',
                    talles: row['Talles'] || row['talles'] || '',
                    estado: config.columnas[0]?.id || 'por-hacer',
                    orden: i,
                    telasIds: [],
                    prioridad: row['Prioridad'] || row['prioridad'] || 'Media',
                    temporada: row['Temporada'] || row['temporada'] || '',
                    responsable: row['Responsable'] || row['responsable'] || '',
                    fechaObjetivo: row['Fecha Objetivo'] || row['fecha_objetivo'] || null,
                    observaciones: row['Observaciones'] || row['observaciones'] || '',
                    checklist: [],
                    imagenes: [],
                    coverImageId: null,
                    creadoEn: new Date().toISOString(),
                    actualizadoEn: new Date().toISOString()
                }));
                importMoldes(imported);
                alert(`✅ ${t('importadosMoldes', { count: imported.length })}`);
            } else {
                const imported = data.map((row) => ({
                    id: generateId(),
                    nombre: row['Nombre'] || row['nombre'] || '',
                    color: row['Color'] || row['color'] || '',
                    composicion: row['Composición'] || row['composicion'] || '',
                    proveedor: row['Proveedor'] || row['proveedor'] || '',
                    imagenes: [],
                    notas: row['Notas'] || row['notas'] || ''
                }));
                importTelas(imported);
                alert(`✅ ${t('importadasTelas', { count: imported.length })}`);
            }
        } catch (err) {
            alert(`❌ ${t('errorImportar')}${err.message}`);
        }
        e.target.value = '';
    };

    const handleClearData = () => {
        if (confirmClear) {
            clearData();
            window.location.reload();
        } else {
            setConfirmClear(true);
            setTimeout(() => setConfirmClear(false), 3000);
        }
    };

    return (
        <div className="settings">
            <h2>{t('configuracion')}</h2>

            {/* Cotización USD */}
            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><FileJson /> 💲 {t('cotizacionUSD')}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>1 USD =</span>
                        <input
                            type="number"
                            className="form-input"
                            value={config.cotizacionUSD || ''}
                            min={0}
                            step="0.01"
                            placeholder="1500"
                            onChange={(e) => updateConfig({ cotizacionUSD: e.target.value })}
                            style={{ maxWidth: 150 }}
                        />
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>ARS</span>
                    </div>
                </div>
            )}

            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Palette /> Apariencia</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Cambiá el fondo y color principal de la interfaz con una paleta simple.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Fondo</label>
                            <input
                                type="color"
                                className="form-input"
                                value={config.uiTheme?.backgroundColor || '#0a0a12'}
                                onChange={(e) => updateConfig({ uiTheme: { ...(config.uiTheme || {}), backgroundColor: e.target.value } })}
                                style={{ minHeight: 44 }}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Color principal</label>
                            <input
                                type="color"
                                className="form-input"
                                value={config.uiTheme?.accentColor || '#8b5cf6'}
                                onChange={(e) => updateConfig({ uiTheme: { ...(config.uiTheme || {}), accentColor: e.target.value } })}
                                style={{ minHeight: 44 }}
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Superficie</label>
                            <input
                                type="text"
                                className="form-input"
                                value={config.uiTheme?.surfaceColor || 'rgba(25, 25, 40, 0.55)'}
                                onChange={(e) => updateConfig({ uiTheme: { ...(config.uiTheme || {}), surfaceColor: e.target.value } })}
                                placeholder="rgba(25, 25, 40, 0.55)"
                            />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Texto</label>
                            <input
                                type="color"
                                className="form-input"
                                value={config.uiTheme?.textColor || '#f0f0fa'}
                                onChange={(e) => updateConfig({ uiTheme: { ...(config.uiTheme || {}), textColor: e.target.value } })}
                                style={{ minHeight: 44 }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Cloud Sync Info (Admin Only) */}
            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Cloud /> Sincronización en la Nube</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        La app guarda localmente, sigue funcionando sin internet y reintenta sincronizar sola cuando vuelve la conexión.
                    </p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                        marginBottom: 16
                    }}>
                        <div className="glass-panel" style={{ padding: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Estado</div>
                            <div style={{ fontWeight: 'var(--fw-bold)', color: syncStatus.online ? 'var(--success)' : 'var(--warning)' }}>
                                {syncStatus.status}
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Conexión</div>
                            <div style={{ fontWeight: 'var(--fw-bold)' }}>{syncStatus.online ? 'Online' : 'Offline'}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Cambios pendientes</div>
                            <div style={{ fontWeight: 'var(--fw-bold)' }}>{syncStatus.pendingChanges || 0}</div>
                        </div>
                        <div className="glass-panel" style={{ padding: 14 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Última nube</div>
                            <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 12 }}>
                                {syncStatus.lastCloudSaveAt ? new Date(syncStatus.lastCloudSaveAt).toLocaleString() : 'Todavía no'}
                            </div>
                        </div>
                    </div>
                    <div className="settings-csv">
                        <button className="btn btn-secondary" onClick={handleMigrateToCloud} disabled={migrating}>
                            <CloudUpload /> {migrating ? 'Migrando...' : 'Migrar datos locales a la nube'}
                        </button>
                        <button className="btn btn-danger" onClick={() => {
                            if (window.confirm('⚠️ Esto borra los datos locales del browser y recarga TODO desde Firebase.\\n\\nUsalo si ves datos desactualizados (stock, artículos, etc).\\n\\n¿Continuar?')) {
                                localStorage.clear();
                                indexedDB.deleteDatabase('organizador-app-storage');
                                window.location.reload();
                            }
                        }}>
                            ☁️ Forzar carga desde la nube
                        </button>
                        <button className="btn btn-primary" onClick={exportBackupNow}>
                            <Download /> Descargar backup ahora
                        </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 8 }}>
                        Si se corta internet, los cambios quedan locales y Firestore los sincroniza automáticamente cuando vuelve la conexión.
                    </p>
                    {syncStatus.lastError && (
                        <p style={{ fontSize: '11px', color: 'var(--danger)', marginTop: 8 }}>
                            Último error: {syncStatus.lastError}
                        </p>
                    )}
                </div>
            )}

            {/* Marketing Integrations (Admin + Marketing) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'marketing') && (
                <div className="settings-section">
                    <h3><Megaphone /> Integraciones de Marketing</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Conectá tus cuentas de Meta y TikTok para ver métricas en tiempo real.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="form-group-row" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Meta Access Token</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={config.marketing?.metaToken || ''}
                                    placeholder="EAAB..."
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), metaToken: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ad Account ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={config.marketing?.metaAdAccountId || ''}
                                    placeholder="4206..."
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), metaAdAccountId: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Meta Pixel ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={config.marketing?.metaPixelId || ''}
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), metaPixelId: e.target.value } })}
                                />
                            </div>
                        </div>
                        <div className="form-group-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>TikTok Access Token</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={config.marketing?.tiktokToken || ''}
                                    placeholder="act..."
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), tiktokToken: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>TikTok Pixel ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={config.marketing?.tiktokPixelId || ''}
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), tiktokPixelId: e.target.value } })}
                                />
                            </div>
                        </div>
                        <div className="form-group-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tienda URL</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={config.marketing?.wooUrl || ''}
                                    placeholder="https://tutienda.com"
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), wooUrl: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Customer Key (CK)</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={config.marketing?.wooKey || ''}
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), wooKey: e.target.value } })}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Customer Secret (CS)</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={config.marketing?.wooSecret || ''}
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), wooSecret: e.target.value } })}
                                />
                            </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <button
                                className="btn btn-sm btn-ghost"
                                style={{ fontSize: 10, opacity: 0.6 }}
                                onClick={() => {
                                    updateConfig({
                                        marketing: {
                                            ...(config.marketing || {}),
                                            wooUrl: SUPPORT_WOO_CREDENTIALS.wooUrl,
                                            wooKey: SUPPORT_WOO_CREDENTIALS.wooKey,
                                            wooSecret: SUPPORT_WOO_CREDENTIALS.wooSecret
                                        }
                                    });
                                    alert('Credenciales de WooCommerce sincronizadas con éxito.');
                                }}
                            >
                                🔄 Sincronizar credenciales de soporte (WooCommerce)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* OpenAI / AI Assistant (Admin + Marketing) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'marketing') && (
                <div className="settings-section">
                    <h3>🤖 Asistente IA (CELA IA)</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Conectá tu cuenta de OpenAI para habilitar el asistente inteligente que puede crear moldes, clientes y productos por vos hablándole en lenguaje natural.
                    </p>
                    <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>OpenAI API Key</label>
                        <input
                            type="password"
                            className="form-input"
                            value={config.marketing?.openaiKey || ''}
                            placeholder="sk-..."
                            onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), openaiKey: e.target.value } })}
                        />
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                            Obtené tu key en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>platform.openai.com/api-keys</a>. Usa modelo gpt-4o-mini (barato y rápido).
                        </p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 16 }}>
                        <h4 style={{ fontSize: 13, marginBottom: 8 }}>🧠 Agentes AI — Proveedor de LLM</h4>
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Motor de IA para agentes</label>
                            <select
                                className="form-input"
                                value={config.marketing?.llmProvider || 'openai'}
                                onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), llmProvider: e.target.value } })}
                                style={{ marginTop: 4 }}
                            >
                                <option value="openai">OpenAI (GPT-4o-mini) — Rápido y barato</option>
                                <option value="claude">Claude (Sonnet) — Más inteligente para análisis</option>
                            </select>
                        </div>

                        {(config.marketing?.llmProvider === 'claude') && (
                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Claude API Key (Anthropic)</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    value={config.marketing?.claudeKey || ''}
                                    placeholder="sk-ant-..."
                                    onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), claudeKey: e.target.value } })}
                                />
                                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Obtené tu key en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>console.anthropic.com</a>. Claude Sonnet: más profundo en análisis estratégico.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Google Drive Integration (Admin + Marketing) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'marketing') && (
                <div className="settings-section">
                    <h3><Cloud /> Google Drive</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Link a la carpeta compartida de Google Drive para el equipo.
                    </p>
                    <div className="settings-field">
                        <label>URL de carpeta Google Drive</label>
                        <input
                            className="form-input"
                            placeholder="https://drive.google.com/drive/folders/..."
                            value={config.marketing?.googleDriveUrl || ''}
                            onChange={(e) => updateConfig({ marketing: { ...(config.marketing || {}), googleDriveUrl: e.target.value } })}
                        />
                    </div>
                </div>
            )}

            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Cloud /> Respaldo en Google Drive</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Guardá copias de seguridad de tus moldes y ventas directamente en tu cuenta de Google Drive.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary" onClick={() => alert('Para conectar Google Drive necesito: \n1. Client ID \n2. Client Secret \n(Desde Google Cloud Console).')}>
                                <Key size={16} /> Conectar Google Drive
                            </button>
                            <button className="btn btn-ghost" disabled={true}>
                                <Download size={16} /> Subir Backup Ahora
                            </button>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--accent)', marginTop: 4 }}>
                            💡 <strong>Para activar esto:</strong> Necesito que me pases el <strong>Client ID</strong> y <strong>Client Secret</strong> de una "OAuth 2.0 Client ID" creada en Google Cloud Console.
                        </p>
                    </div>
                </div>
            )}

            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Key /> Accesos del Sistema</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Estos son los mails de acceso activos. Los usuarios comunes no pueden cambiar la contraseña desde la app.
                    </p>
                    <div className="settings-list">
                        {SYSTEM_ACCOUNTS.map((account) => (
                            <div key={account.email} className="settings-list-item" style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'var(--fw-semibold)', color: 'var(--accent)' }}>
                                    {account.label}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                    {account.email}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 10 }}>
                        Si alguien olvida su contraseña, hay que resetearla. Firebase no permite ver la contraseña actual.
                    </p>
                </div>
            )}

            {/* Firebase User Role Management (Admin Only) */}
            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Users /> Gestión de Usuarios Firebase</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Asigná roles a los usuarios registrados. Los usuarios con rol "pendiente" no pueden acceder a ninguna sección.
                    </p>
                    <button className="btn btn-sm btn-secondary" style={{ marginBottom: 16 }} onClick={async () => {
                        setLoadingUsers(true);
                        await loadAllFirebaseUsers();
                        setLoadingUsers(false);
                    }} disabled={loadingUsers}>
                        {loadingUsers ? '⏳ Cargando...' : '🔄 Cargar/Actualizar lista de usuarios'}
                    </button>
                    {users.length > 0 && (
                        <div className="settings-list">
                            {users.map((u) => (
                                <div key={u.uid} className="settings-list-item" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'center', padding: '12px' }}>
                                    <div>
                                        <input
                                            type="text"
                                            className="form-input"
                                            defaultValue={u.name || u.email}
                                            placeholder="Nombre del usuario"
                                            onBlur={async (e) => {
                                                if (e.target.value !== u.name) {
                                                    await updateUserRole(u.uid, u.role, e.target.value);
                                                }
                                            }}
                                            style={{ fontSize: '13px', padding: '6px 10px' }}
                                        />
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>{u.email}</div>
                                    </div>
                                    <select
                                        className="form-select"
                                        value={u.role || 'pendiente'}
                                        onChange={async (e) => {
                                            const ok = await updateUserRole(u.uid, e.target.value, u.name);
                                            if (ok) alert(`Rol actualizado a "${e.target.value}" para ${u.name || u.email}`);
                                        }}
                                        style={{ fontSize: '13px', padding: '6px 10px' }}
                                    >
                                        <option value="admin">👨‍💻 Administrador</option>
                                        <option value="encargada">👩‍💼 Encargada</option>
                                        <option value="deposito">📦 Depósito</option>
                                        <option value="pedidos">🌐 Pedidos Online</option>
                                        <option value="marketing">📣 Marketing</option>
                                        <option value="fotos">📸 Fotos</option>
                                        <option value="pendiente">⏳ Pendiente (sin acceso)</option>
                                    </select>
                                    <div style={{ fontSize: '11px', color: u.role === 'pendiente' ? 'var(--danger)' : 'var(--success)', fontWeight: 'var(--fw-bold)' }}>
                                        {u.role === 'pendiente' ? '⚠️' : '✅'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {users.length === 0 && (
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Hacé click en "Cargar/Actualizar lista" para ver los usuarios registrados.
                        </p>
                    )}
                </div>
            )}

            {/* POS Permissions (Admin Only) */}
            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Lock /> Permisos POS (Punto de Venta)</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>
                        Configura qué acciones puede realizar la Encargada en la Caja.
                    </p>
                    <div className="settings-list" style={{ gap: '12px', display: 'flex', flexDirection: 'column' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={config.posPermissions?.encargadaCanCloseZ || false}
                                onChange={(e) => updatePosSettings({ encargadaCanCloseZ: e.target.checked })}
                                style={{ transform: 'scale(1.2)' }}
                            />
                            <span>Permitir a la encargada hacer el Cierre Z</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={config.posPermissions?.encargadaCanAddExpenses || false}
                                onChange={(e) => updatePosSettings({ encargadaCanAddExpenses: e.target.checked })}
                                style={{ transform: 'scale(1.2)' }}
                            />
                            <span>Permitir a la encargada cargar Gastos Extra</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Columns */}
            <div className="settings-section">
                <h3><Columns3 /> {t('columnasTablero')}</h3>
                <div className="settings-list">
                    {config.columnas.map(col => (
                        <div key={col.id} className="settings-list-item">
                            <input
                                type="color"
                                value={col.color}
                                onChange={(e) => updateColumn(col.id, 'color', e.target.value)}
                                className="color-dot"
                                style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer' }}
                            />
                            <input
                                value={col.nombre}
                                onChange={(e) => updateColumn(col.id, 'nombre', e.target.value)}
                            />
                            <button className="remove-btn" onClick={() => removeColumn(col.id)}>
                                <Trash2 />
                            </button>
                        </div>
                    ))}
                </div>
                <button className="btn btn-sm btn-secondary settings-add-btn" onClick={addColumn}>
                    <Plus /> {t('agregarColumna')}
                </button>
            </div>

            {/* Categories */}
            <div className="settings-section">
                <h3><Tag /> {t('categoriasMolde')}</h3>
                <div className="settings-list">
                    {config.categorias.map((cat, i) => (
                        <div key={i} className="settings-list-item">
                            <input
                                value={cat}
                                onChange={(e) => updateListItem('categorias', i, e.target.value)}
                            />
                            <button className="remove-btn" onClick={() => removeFromList('categorias', i)}>
                                <Trash2 />
                            </button>
                        </div>
                    ))}
                </div>
                <button className="btn btn-sm btn-secondary settings-add-btn" onClick={() => addToList('categorias')}>
                    <Plus /> {t('agregarCategoria')}
                </button>
            </div>

            {/* Persons */}
            <div className="settings-section">
                <h3><Users /> {t('personasResponsables')}</h3>
                <div className="settings-list">
                    {config.personas.map((per, i) => (
                        <div key={i} className="settings-list-item">
                            <input
                                value={per}
                                onChange={(e) => updateListItem('personas', i, e.target.value)}
                            />
                            <button className="remove-btn" onClick={() => removeFromList('personas', i)}>
                                <Trash2 />
                            </button>
                        </div>
                    ))}
                </div>
                <button className="btn btn-sm btn-secondary settings-add-btn" onClick={() => addToList('personas')}>
                    <Plus /> {t('agregarPersona')}
                </button>
            </div>

            {/* Cortadores */}
            <div className="settings-section">
                <h3><Scissors /> {t('cortadores')}</h3>
                <div className="settings-list">
                    {(config.cortadores || []).map((cor, i) => (
                        <div key={i} className="settings-list-item">
                            <input
                                value={cor}
                                onChange={(e) => updateListItem('cortadores', i, e.target.value)}
                            />
                            <button className="remove-btn" onClick={() => removeFromList('cortadores', i)}>
                                <Trash2 />
                            </button>
                        </div>
                    ))}
                </div>
                <button className="btn btn-sm btn-secondary settings-add-btn" onClick={() => addToList('cortadores')}>
                    <Plus /> {t('agregarCortador')}
                </button>
            </div>

            {/* Talleres */}
            <div className="settings-section">
                <h3><Factory /> {t('talleres')}</h3>
                <div className="settings-list">
                    {(config.talleres || []).map((tal, i) => (
                        <div key={i} className="settings-list-item">
                            <input
                                value={tal}
                                onChange={(e) => updateListItem('talleres', i, e.target.value)}
                            />
                            <button className="remove-btn" onClick={() => removeFromList('talleres', i)}>
                                <Trash2 />
                            </button>
                        </div>
                    ))}
                </div>
                <button className="btn btn-sm btn-secondary settings-add-btn" onClick={() => addToList('talleres')}>
                    <Plus /> {t('agregarTaller')}
                </button>
            </div>

            {/* Seasons */}
            <div className="settings-section">
                <h3><CalendarRange /> {t('temporadas')}</h3>
                <div className="settings-list">
                    {config.temporadas.map((temp, i) => (
                        <div key={i} className="settings-list-item">
                            <input
                                value={temp}
                                onChange={(e) => updateListItem('temporadas', i, e.target.value)}
                            />
                            <button className="remove-btn" onClick={() => removeFromList('temporadas', i)}>
                                <Trash2 />
                            </button>
                        </div>
                    ))}
                </div>
                <button className="btn btn-sm btn-secondary settings-add-btn" onClick={() => addToList('temporadas')}>
                    <Plus /> {t('agregarTemporada')}
                </button>
            </div>

            {/* JSON Backup */}
            <div className="settings-section">
                <h3><FileJson /> {t('backupCompleto')}</h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    {t('backupDescripcion')}
                </p>
                <div className="settings-csv">
                    <button className="btn btn-primary" onClick={handleExportJSON}>
                        <Download /> {t('exportarJSON')}
                    </button>
                    <button className="btn btn-secondary" onClick={() => jsonInputRef.current?.click()}>
                        <Upload /> {t('importarJSON')}
                    </button>
                    <input
                        ref={jsonInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportJSON}
                        style={{ display: 'none' }}
                    />
                </div>
            </div>

            {/* Import/Export CSV */}
            <div className="settings-section">
                <h3><Database /> {t('importarExportar')}</h3>
                <div className="settings-csv">
                    <button className="btn btn-secondary" onClick={handleExportMoldes}>
                        <Download /> {t('exportarMoldesCSV')}
                    </button>
                    <button className="btn btn-secondary" onClick={handleExportTelas}>
                        <Download /> {t('exportarTelasCSV')}
                    </button>
                </div>
                <div className="settings-csv" style={{ marginTop: 12 }}>
                    <select
                        className="form-select"
                        value={csvTarget}
                        onChange={(e) => setCsvTarget(e.target.value)}
                        style={{ width: 'auto' }}
                    >
                        <option value="moldes">{t('importarMoldes')}</option>
                        <option value="telas">{t('importarTelas')}</option>
                    </select>
                    <button className="btn btn-secondary" onClick={() => csvInputRef.current?.click()}>
                        <Upload /> {t('importarCSV')}
                    </button>
                    <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleImportCSV}
                        style={{ display: 'none' }}
                    />
                </div>
            </div>

            {/* User & Role Permissions (Admin Only) */}
            {currentUser?.role === 'admin' && (
                <div className="settings-section">
                    <h3><Shield /> Gestión de Usuarios y Permisos</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>
                        Configurá qué secciones puede ver cada usuario del sistema.
                    </p>

                    {users.map(u => {
                        const perms = rolePermissions[u.role] || [];
                        return (
                            <div key={u.role} style={{
                                marginBottom: 20,
                                padding: '16px 20px',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid rgba(255,255,255,0.06)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-md)', color: 'var(--accent)' }}>
                                            {u.name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            Rol: {u.role} · {u.email}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {perms.length} / {ALL_SECTIONS.length - 1} secciones
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                                    {ALL_SECTIONS.filter(s => s !== 'settings').map(sectionId => {
                                        const isEnabled = perms.includes(sectionId);
                                        return (
                                            <label key={sectionId} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '8px 12px',
                                                background: isEnabled ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.01)',
                                                borderRadius: 'var(--radius-sm)',
                                                border: `1px solid ${isEnabled ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                transition: 'all 0.15s ease'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    onChange={() => {
                                                        const newPerms = isEnabled
                                                            ? perms.filter(p => p !== sectionId)
                                                            : [...perms, sectionId];
                                                        updateRolePermissions(u.role, newPerms);
                                                    }}
                                                    style={{ accentColor: 'var(--accent)' }}
                                                />
                                                {isEnabled ? <Eye size={14} style={{ color: 'var(--accent)' }} /> : <EyeOff size={14} style={{ color: 'var(--text-muted)' }} />}
                                                <span style={{ color: isEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                    {SECTION_LABELS[sectionId] || sectionId}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Storage */}
            <div className="settings-section">
                <h3><HardDrive /> {t('almacenamiento')}</h3>
                <div className="settings-storage-info">
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {storage.usedMB} MB / ~{maxMB} MB
                    </span>
                    <div className="storage-bar">
                        <div
                            className="storage-fill"
                            style={{
                                width: `${percent}%`,
                                background: percent > 80 ? 'var(--danger)' : 'var(--accent)'
                            }}
                        />
                    </div>
                </div>
                <div style={{ marginTop: 16 }}>
                    <button
                        className={`btn btn-sm ${confirmClear ? 'btn-danger' : 'btn-ghost'}`}
                        onClick={handleClearData}
                    >
                        <AlertTriangle />
                        {confirmClear ? t('confirmarBorrar') : t('borrarTodosDatos')}
                    </button>
                </div>
            </div>
        </div>
    );
}
