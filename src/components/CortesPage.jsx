import React, { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, PackageOpen, ChevronRight, DollarSign, TrendingUp, Image as ImageIcon, ArrowRightCircle, Upload } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useI18n } from '../store/I18nContext';
import { useAuth } from '../store/AuthContext';
import { generateId } from '../utils/helpers';
import * as XLSX from 'xlsx';

export default function CortesPage() {
    const { state, updateConfig, updateMolde, addMolde, addTela, setData, addPosProduct, updatePosProduct, updateMoldeInCorte, addMoldeToCorte, removeMoldeFromCorte } = useData();
    const { t } = useI18n();
    const { user } = useAuth();
    const { config, moldes, telas } = state;
    const cortes = config.cortes || [];

    const [collapsedMolds, setCollapsedMolds] = useState({});
    const toggleCollapse = (id) => setCollapsedMolds(prev => ({ ...prev, [id]: !prev[id] }));

    const [selected, setSelected] = useState(null);
    const [newName, setNewName] = useState('');
    const [addingMolde, setAddingMolde] = useState(false);
    const [searchMolde, setSearchMolde] = useState('');

    const addCorte = () => {
        const nombre = newName.trim() || `Corte ${cortes.length + 1}`;
        const corte = { id: generateId(), nombre, fecha: new Date().toISOString().split('T')[0], moldeIds: [] };
        updateConfig({ cortes: [...cortes, corte] });
        setNewName('');
        setSelected(corte.id);
    };

    // ============ IMPORTAR EXCEL DE PLANILLA TALLER / CORTE ============
    const fileInputRef = useRef(null);

    const handleImportExcel = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

                if (rows.length === 0) { alert('El Excel está vacío.'); return; }

                // Detectar columnas por header o por posición
                const detectCol = (row, keys) => {
                    // Primero buscar por key exacta
                    for (const k of keys) {
                        if (row[k] !== undefined && row[k] !== '') return row[k];
                    }
                    // Fallback: buscar case-insensitive con trim
                    const rowKeys = Object.keys(row);
                    for (const k of keys) {
                        const kLower = k.toLowerCase().trim();
                        for (const rk of rowKeys) {
                            if (rk.toLowerCase().trim() === kLower && row[rk] !== undefined && row[rk] !== '') {
                                return row[rk];
                            }
                        }
                    }
                    return '';
                };

                // Agrupar filas por # corte (columna P = "# corte")
                const grouped = {};
                rows.forEach(row => {
                    const nroCorte = String(detectCol(row, ['# corte', '#corte', 'P', 'corte', '# Corte']) || 'sin-numero').trim();
                    if (!grouped[nroCorte]) grouped[nroCorte] = [];
                    grouped[nroCorte].push(row);
                });

                const newCortes = [...cortes];
                const newMoldes = [...moldes];
                const newTelas = [...telas];
                let totalImported = 0;

                Object.entries(grouped).forEach(([nroCorte, filas]) => {
                    // Crear corte
                    const primeraFila = filas[0];
                    const fechaRaw = detectCol(primeraFila, ['fecha', 'Fecha', 'R']);
                    let fechaStr = '';
                    if (fechaRaw instanceof Date) {
                        fechaStr = fechaRaw.toISOString().split('T')[0];
                    } else if (fechaRaw) {
                        fechaStr = String(fechaRaw).slice(0, 10);
                    }

                    const corteId = generateId();
                    const corte = {
                        id: corteId,
                        nombre: `Corte #${nroCorte}`,
                        fecha: fechaStr || new Date().toISOString().split('T')[0],
                        moldeIds: [],
                        moldesData: [],
                        consumos: []
                    };

                    filas.forEach((row, rowIdx) => {
                        // DEBUG: log primera fila para verificar detección de columnas
                        if (rowIdx === 0 && Object.keys(grouped)[0] === nroCorte) {
                            console.log('🔍 DEBUG Import - Keys del Excel:', Object.keys(row));
                            console.log('🔍 DEBUG Import - row.DOMO:', row['DOMO'], '| row.taller2:', row['taller2']);
                            console.log('🔍 DEBUG Import - Todos los valores:', Object.entries(row).map(([k,v]) => `${k}=${v}`).join(' | '));
                        }
                        // === COLUMNAS BÁSICAS ===
                        // A (ART M) → se omite, usamos B (Column1 / ART D) como código principal
                        const artD = String(detectCol(row, ['ART D', 'Column1', 'Art D', 'ART_D']) || '').trim();
                        const descripcion = String(detectCol(row, ['Descripcion', 'descripcion', 'DESCRIPCION', 'Detalle']) || 'Sin nombre').trim();
                        const telaName = String(detectCol(row, ['tela', 'Tela', 'TELA']) || '').trim();
                        const cotizacion = parseFloat(detectCol(row, ['cotisacion', 'cotizacion', 'Cotizacion', 'COTIZACION']) || 0);
                        const costoCalc = parseFloat(detectCol(row, ['COSTO', 'costo', 'Costo']) || 0);
                        const costoTallerConf = parseFloat(detectCol(row, ['TALLER', 'taller', 'Taller']) || 0);
                        // I (% ganancia) → variable por artículo, puede ser decimal (0.7) o entero (70)
                        const margenRaw = parseFloat(detectCol(row, ['% ganancia', '% Ganancia', 'ganancia', '%ganancia']) || 0);
                        const margen = margenRaw > 0 && margenRaw < 1 ? Math.round(margenRaw * 100) : margenRaw;

                        // === PRECIOS ===
                        // J (luis) → omitido
                        const precioCalc = parseFloat(detectCol(row, ['precio', 'Precio', 'PRECIO']) || 0);
                        // L (DOMO) → PRECIO DE VENTA LOCAL (el precio real de venta)
                        const precioLocal = parseFloat(detectCol(row, ['DOMO', 'domo', 'Domo']) || 0);
                        // M (PAPA) → omitido

                        // === TALLER Y CORTADOR ===
                        const tallerNombre = String(detectCol(row, ['taller2', 'Taller2', 'TALLER2']) || '').trim();
                        const presioTaller = parseFloat(detectCol(row, ['presio taller', 'precio taller', 'Presio taller']) || 0);
                        const cantidad = parseFloat(detectCol(row, ['cantidad', 'Cantidad', 'CANTIDAD']) || 0);

                        // === TELA: precio USD, metros/kg, % de tela ===
                        const telaPrecioUSD = parseFloat(detectCol(row, ['tela presio', 'tela precio', 'Tela Presio', 'tela_presio']) || 0);
                        const metrosKgTotal = parseFloat(detectCol(row, ['m/kg', 'M/KG', 'mkg', 'metros']) || 0);
                        const porcentajeTelaRaw = parseFloat(detectCol(row, ['%de tela', '% de tela', '%tela', 'porcentaje tela']) || 0);

                        // === PRODUCCIÓN EXTRA ===
                        const rollosCorte = parseFloat(detectCol(row, ['ROLLO', 'rollo', 'Rollo', 'rollos']) || 0);
                        const costoAccesorio = parseFloat(detectCol(row, ['ACCESORIO', 'accesorio', 'Accesorio']) || 0);
                        const costoAccesorio2 = parseFloat(detectCol(row, ['accesorio2', 'Accesorio2', 'ACCESORIO2']) || 0);
                        const costoMolde = parseFloat(detectCol(row, ['molde', 'Molde', 'MOLDE']) || 0);
                        const fason = parseFloat(detectCol(row, ['fason', 'Fason', 'FASON', 'fasón']) || 0);
                        const pagoTaller = parseFloat(detectCol(row, ['pago taller', 'Pago taller', 'PAGO TALLER']) || 0);
                        const costoTotal2 = parseFloat(detectCol(row, ['COSTO2', 'costo2', 'Costo2']) || 0);
                        const precioDomo2 = parseFloat(detectCol(row, ['DOMO2', 'domo2', 'Domo2']) || 0);

                        // U (%de tela) = porcentaje que usa ESTE artículo del total del rollo
                        // Excel muestra: 23,05% / 24,42% / 12,22% etc. (viene como 0.2305)
                        // Convertir a porcentaje exacto igual que el Excel
                        const porcTelaFinal = porcentajeTelaRaw > 0 && porcentajeTelaRaw < 1 
                            ? Math.round(porcentajeTelaRaw * 10000) / 100  // 0.2305 → 23.05
                            : (porcentajeTelaRaw || 0);

                        // Buscar o crear tela
                        let telaObj = newTelas.find(t2 => t2.nombre?.toLowerCase() === telaName.toLowerCase());
                        if (!telaObj && telaName) {
                            telaObj = { id: generateId(), nombre: telaName, precioPorUnidad: telaPrecioUSD || 0, moneda: 'USD', color: '', descripcion: '' };
                            newTelas.push(telaObj);
                        } else if (telaObj && telaPrecioUSD > 0 && !telaObj.precioPorUnidad) {
                            telaObj.precioPorUnidad = telaPrecioUSD;
                        }

                        // Buscar o crear molde por código ART D o nombre
                        let molde = null;
                        if (artD) {
                            molde = newMoldes.find(m => String(m.codigo) === String(artD));
                        }
                        if (!molde) {
                            molde = newMoldes.find(m => m.nombre?.toLowerCase() === descripcion.toLowerCase());
                        }

                        if (!molde) {
                            molde = {
                                id: generateId(),
                                nombre: descripcion,
                                codigo: artD || '',
                                categoria: '',
                                estado: config.columnas?.[0]?.id || 'por-hacer',
                                telasIds: telaObj ? [telaObj.id] : [],
                                consumoTela: telaPrecioUSD || 0,         // S = 4.9 (precio/consumo tela USD)
                                porcentajeTela: porcTelaFinal,            // U = 23.05% (% del rollo por artículo)
                                cotizacion: cotizacion || 0,
                                cantidadCorte: cantidad || 0,
                                costoTaller: costoTallerConf,
                                costoCortador: presioTaller || fason || 0,
                                costoAccesorio: costoAccesorio || 0,
                                costoAccesorio2: costoAccesorio2 || 0,
                                costoMolde: costoMolde || 0,
                                margenGanancia: margen,
                                precioLocal: precioLocal || precioCalc || 0,
                                imagenes: [],
                                checklist: [],
                                observaciones: `Importado desde Excel · Corte #${nroCorte}`,
                                createdAt: new Date().toISOString()
                            };
                            newMoldes.push(molde);
                        } else {
                            // Actualizar datos del molde existente
                            if (telaObj && !(molde.telasIds || []).includes(telaObj.id)) {
                                molde.telasIds = [...(molde.telasIds || []), telaObj.id];
                            }
                            if (!molde.consumoTela && telaPrecioUSD) molde.consumoTela = telaPrecioUSD;
                            if (!molde.cotizacion && cotizacion) molde.cotizacion = cotizacion;
                            if (precioLocal) molde.precioLocal = precioLocal;
                            if (margen) molde.margenGanancia = margen;
                            if (porcTelaFinal && (!molde.porcentajeTela || molde.porcentajeTela === 70)) molde.porcentajeTela = porcTelaFinal;
                            if (!molde.costoAccesorio && costoAccesorio) molde.costoAccesorio = costoAccesorio;
                            if (!molde.costoAccesorio2 && costoAccesorio2) molde.costoAccesorio2 = costoAccesorio2;
                            if (!molde.costoMolde && costoMolde) molde.costoMolde = costoMolde;
                        }

                        // Agregar molde al corte con los datos específicos de esta tirada
                        corte.moldeIds.push(molde.id);
                        corte.moldesData.push({
                            id: molde.id,
                            cantidad: cantidad || 0,
                            costoCortador: presioTaller || fason || 0,
                            costoTaller: costoTallerConf || 0,
                            tallerAsignado: tallerNombre || '',
                            cortadorAsignado: '',
                            precioLocal: precioLocal || precioCalc || 0,
                            margenGanancia: margen || 0,
                            porcentajeTela: porcTelaFinal || 0,       // U = 23.05% del Excel
                            usoRealTela: telaPrecioUSD || 0,          // S = 4.9 consumo tela
                            pagadoCortador: false,
                            pagadoTaller: false,
                            prendasFalladas: 0,
                            rollosCorte: rollosCorte || 0,
                            kilajeTotal: metrosKgTotal || 0,
                            costoAccesorio: costoAccesorio || 0,
                            costoAccesorio2: costoAccesorio2 || 0,
                            costoMolde: costoMolde || 0,
                            fason: fason || 0,
                            pagoTallerTotal: pagoTaller || 0,
                            costoTotal: costoCalc || 0,
                            costoTotal2: costoTotal2 || 0,
                            precioDomo2: precioDomo2 || 0,
                            notas: `Costo: $${Math.round(costoCalc)} | Calc: $${Math.round(precioCalc)}${fason ? ` | Fasón: $${fason}` : ''}${pagoTaller ? ` | Pago Taller: $${Math.round(pagoTaller)}` : ''}`
                        });

                        totalImported++;

                        // DEBUG: verificar valores importados
                        if (rowIdx < 3) {
                            console.log(`🔍 Art "${descripcion}" → precioLocal=${precioLocal}, tallerAsignado=${tallerNombre}, %tela=${porcTelaFinal}`);
                        }
                    });

                    newCortes.push(corte);
                });

                // Recopilar talleres únicos del Excel para agregarlos a la config
                const talleresExistentes = state.config.talleres || [];
                const talleresNuevos = new Set(talleresExistentes);
                newCortes.forEach(c => {
                    (c.moldesData || []).forEach(md => {
                        if (md.tallerAsignado && md.tallerAsignado.trim()) {
                            talleresNuevos.add(md.tallerAsignado.trim().toUpperCase());
                        }
                    });
                });

                // ===== GUARDADO ATÓMICO =====
                // En vez de hacer muchos dispatches individuales (que causan race conditions con Firestore),
                // hacemos UN SOLO dispatch con todo el state actualizado de una vez.
                const updatedConfig = {
                    ...state.config,
                    cortes: newCortes,
                    talleres: [...talleresNuevos]
                };

                setData({
                    ...state,
                    moldes: newMoldes,
                    telas: newTelas,
                    config: updatedConfig
                });

                console.log('✅ Import completo:', {
                    cortes: newCortes.length,
                    moldes: newMoldes.length,
                    telas: newTelas.length,
                    talleres: [...talleresNuevos],
                    primerCorte: newCortes[newCortes.length - Object.keys(grouped).length]
                });

                alert(`✅ Se importaron ${totalImported} artículos en ${Object.keys(grouped).length} cortes desde el Excel.`);

            } catch (err) {
                console.error('Error importando Excel:', err);
                alert('❌ Error al leer el archivo Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const removeCorte = (id) => {
        updateConfig({ cortes: cortes.filter(c => c.id !== id) });
        if (selected === id) setSelected(null);
    };

    const updateCorte = (id, changes) => {
        updateConfig({ cortes: cortes.map(c => c.id === id ? { ...c, ...changes } : c) });
    };

    const selectedCorte = cortes.find(c => c.id === selected);

    // Transferir molde de corte a posProductos (Artículos)
    const transferirAArticulos = (molde, cData, cost) => {
        const img = getCoverImage(molde);
        const precioVenta = cData?.precioLocal > 0 ? cData.precioLocal : cost.precioVentaSugerido;

        const nuevoProducto = {
            id: generateId(),
            codigoInterno: molde.codigo || molde.nombre?.slice(0, 6).toUpperCase() || generateId().slice(0, 6).toUpperCase(),
            articuloVenta: molde.codigo || molde.nombre?.slice(0, 6).toUpperCase() || generateId().slice(0, 6).toUpperCase(),
            articuloFabrica: molde.codigo || '',
            codigoBarras: '',
            detalleCorto: molde.nombre || '(sin nombre)',
            detalleLargo: molde.observaciones || '',
            moneda: 'PESOS',
            proveedor: 'Producción propia',
            precioCosto: cost.costoTotal || 0,
            alertaStockMinimo: 0,
            precioVentaL1: precioVenta,
            precioVentaL2: cData?.precioVentaL2 || 0,
            precioVentaL3: cData?.precioVentaL3 || 0,
            precioVentaL4: cData?.precioVentaL4 || 0,
            precioVentaL5: 0,
            precioVentaWeb: 0,
            activo: true,
            stock: cData?.cantidad || 0,
            imagenBase64: img || null
        };
        addPosProduct(nuevoProducto);
        alert(`✅ "${molde.nombre}" fue copiado a Artículos con precio $${precioVenta.toFixed(0)} y stock ${cData?.cantidad || 0} unidades.`);
    };

    const syncArticuloDesdeCorte = (molde, cData, cost) => {
        const img = getCoverImage(molde);
        const precioVenta = cData?.precioLocal > 0 ? cData.precioLocal : cost.precioVentaSugerido;
        const codigoInterno = (molde.codigo || molde.nombre?.slice(0, 6).toUpperCase() || generateId().slice(0, 6).toUpperCase()).toString().trim().toUpperCase();
        const existingProduct = (config.posProductos || []).find((product) => (product.codigoInterno || '').toString().trim().toUpperCase() === codigoInterno);
        const productoBase = {
            codigoInterno,
            articuloVenta: existingProduct?.articuloVenta || codigoInterno,
            articuloFabrica: molde.codigo || existingProduct?.articuloFabrica || '',
            codigoBarras: existingProduct?.codigoBarras || '',
            detalleCorto: molde.nombre || '(sin nombre)',
            detalleLargo: molde.observaciones || existingProduct?.detalleLargo || '',
            moneda: existingProduct?.moneda || 'PESOS',
            proveedor: cData?.tallerAsignado || existingProduct?.proveedor || 'Produccion propia',
            precioCosto: cost.costoTotal || existingProduct?.precioCosto || 0,
            alertaStockMinimo: existingProduct?.alertaStockMinimo || 0,
            precioVentaL1: precioVenta,
            precioVentaL2: cData?.precioVentaL2 !== undefined ? cData.precioVentaL2 : (existingProduct?.precioVentaL2 || 0),
            precioVentaL3: cData?.precioVentaL3 !== undefined ? cData.precioVentaL3 : (existingProduct?.precioVentaL3 || 0),
            precioVentaL4: cData?.precioVentaL4 !== undefined ? cData.precioVentaL4 : (existingProduct?.precioVentaL4 || 0),
            precioVentaL5: existingProduct?.precioVentaL5 || 0,
            precioVentaWeb: existingProduct?.precioVentaWeb || 0,
            activo: existingProduct?.activo ?? true,
            stock: cData?.cantidad || existingProduct?.stock || 0,
            imagenBase64: img || existingProduct?.imagenBase64 || null,
            stockPorColor: [{
                color: '',
                taller: cData?.tallerAsignado || '',
                fechaIngreso: selectedCorte?.fecha || '',
                cantidadOriginal: cData?.cantidad || 0,
                cantidadContada: cData?.cantidad || 0,
                cantidadEllos: 0,
                fallado: cData?.prendasFalladas || 0
            }]
        };

        if (existingProduct) {
            updatePosProduct(existingProduct.id, productoBase);
            alert(`✅ "${molde.nombre}" actualizo el articulo existente ${codigoInterno} en Articulos.`);
            return;
        }

        addPosProduct({ id: generateId(), ...productoBase });
        alert(`✅ "${molde.nombre}" fue copiado a Articulos con codigo ${codigoInterno}, precio $${precioVenta.toFixed(0)} y stock ${cData?.cantidad || 0} unidades.`);
    };

    // Add molde to corte
    const handleAddMoldeToCorte = (moldeId) => {
        if (!selectedCorte) return;
        addMoldeToCorte(selected, moldeId);
        setAddingMolde(false);
    };

    const handleRemoveMoldeFromCorte = (moldeId) => {
        if (!selectedCorte) return;
        removeMoldeFromCorte(selected, moldeId);
    };

    // Get moldes for selected corte
    const corteMoldes = useMemo(() => {
        if (!selectedCorte) return [];
        return (selectedCorte.moldeIds || []).map(id => moldes.find(m => m.id === id)).filter(Boolean);
    }, [selectedCorte, moldes]);

    // Available moldes (not already in this corte)
    const availableMoldes = useMemo(() => {
        if (!selectedCorte) return [];
        const inCorte = new Set(selectedCorte.moldeIds || []);
        let avail = moldes.filter(m => !inCorte.has(m.id));
        if (searchMolde) {
            const q = searchMolde.toLowerCase();
            avail = avail.filter(m =>
                (m.nombre || '').toLowerCase().includes(q) ||
                (m.codigo || '').toLowerCase().includes(q) ||
                (m.categoria || '').toLowerCase().includes(q)
            );
        }
        return avail;
    }, [selectedCorte, moldes, searchMolde]);

    const calcCost = (m, cData) => {
        const telaId = (m.telasIds || [])[0];
        const telaObj = telaId ? telas.find(t => t.id === telaId) : null;
        const precioTela = telaObj ? (parseFloat(telaObj.precioPorUnidad) || 0) : 0;
        const cotiz = parseFloat(m.cotizacion) || parseFloat(config.cotizacionUSD) || 0;

        // Data From Corte (fallback to mold if empty, for backwards compatibility during transition)
        const consumo = cData?.usoRealTela !== undefined ? parseFloat(cData.usoRealTela) : (parseFloat(m.consumoTela) || 0);
        const pctTela = cData?.porcentajeTela !== undefined ? parseFloat(cData.porcentajeTela) : (parseFloat(m.porcentajeTela) || 100);
        const cantidadU = cData?.cantidad !== undefined ? parseFloat(cData.cantidad) : (parseFloat(m.cantidadCorte) || 1);
        const costoTallerVal = cData?.costoTaller !== undefined ? parseFloat(cData.costoTaller) : (parseFloat(m.costoTaller) || 0);
        const costoCortadorVal = cData?.costoCortador !== undefined ? parseFloat(cData.costoCortador) : (parseFloat(m.costoCortador) || 0);
        const costoTallerPrueba = cData?.costoTallerPrueba !== undefined ? parseFloat(cData.costoTallerPrueba) : costoTallerVal;
        const costoFasonPrueba = cData?.costoFasonPrueba !== undefined ? parseFloat(cData.costoFasonPrueba) : costoCortadorVal;

        const acc1 = cData?.costoAccesorio !== undefined ? parseFloat(cData.costoAccesorio) : (parseFloat(m.costoAccesorio) || 0);
        const acc2 = cData?.costoAccesorio2 !== undefined ? parseFloat(cData.costoAccesorio2) : (parseFloat(m.costoAccesorio2) || 0);
        const moldeC = parseFloat(m.costoMolde) || 0;
        const gason = parseFloat(m.costoGason) || 0;
        const margen = cData?.margenGanancia !== undefined ? parseFloat(cData.margenGanancia) : (parseFloat(m.margenGanancia) || 0);

        let costoTelaCalc = 0;
        if (cantidadU > 0 && telaObj) {
            const valTelaTotal = precioTela * consumo * (pctTela / 100);
            costoTelaCalc = ((telaObj.moneda === 'ARS' ? valTelaTotal : valTelaTotal * cotiz) / cantidadU);
        }

        const costoTotal = costoTelaCalc + costoCortadorVal + costoTallerVal + acc1 + acc2 + (moldeC + gason) / (cantidadU || 1);
        const precioVentaSugerido = costoTotal * (1 + (margen / 100));
        const costoPruebaTotal = costoTelaCalc + costoFasonPrueba + costoTallerPrueba + acc1 + acc2 + (moldeC + gason) / (cantidadU || 1);
        const precioLocal = cData?.precioLocal !== undefined && cData.precioLocal !== null && cData.precioLocal > 0
            ? parseFloat(cData.precioLocal)
            : precioVentaSugerido;
        const precioPrueba = cData?.precioPrueba !== undefined && cData.precioPrueba !== null && cData.precioPrueba > 0
            ? parseFloat(cData.precioPrueba)
            : costoPruebaTotal * (1 + (margen / 100));

        return { costoTotal, precioVentaSugerido, precioLocal, costoPruebaTotal, precioPrueba, margen, cantidadU, pctTela, consumo, telaName: telaObj?.nombre || '', costoTallerVal, costoCortadorVal, costoTallerPrueba, costoFasonPrueba, acc1, acc2 };
    };

    // Calculate Unique Fabrics used in this Corte to populate consumos
    const telasInCorte = useMemo(() => {
        const tIds = new Set();
        corteMoldes.forEach(m => {
            if (m.telasIds && m.telasIds.length > 0) tIds.add(m.telasIds[0]);
        });
        return Array.from(tIds).map(id => telas.find(t => t.id === id)).filter(Boolean);
    }, [corteMoldes, telas]);

    // Consumos management
    const addConsumo = () => {
        const consumos = selectedCorte.consumos || [];
        updateCorte(selected, { consumos: [...consumos, { id: generateId(), telaId: '', colorHex: '', cantidad: '', rollos: '' }] });
    };
    const updateConsumo = (cId, field, value) => {
        const consumos = (selectedCorte.consumos || []).map(c => c.id === cId ? { ...c, [field]: value } : c);
        updateCorte(selected, { consumos });
    };
    const removeConsumo = (cId) => {
        const consumos = (selectedCorte.consumos || []).filter(c => c.id !== cId);
        updateCorte(selected, { consumos });
    };

    // Corte totals
    const corteTotals = useMemo(() => {
        if (!corteMoldes.length || !selectedCorte) return null;
        let totalCosto = 0, totalVenta = 0, totalUnidades = 0, totalFallados = 0;
        corteMoldes.forEach(m => {
            const cData = (selectedCorte.moldesData || []).find(d => d.id === m.id);
            const c = calcCost(m, cData);
            const fallados = parseFloat(cData?.prendasFalladas) || 0;
            const unidadesUtiles = Math.max(0, c.cantidadU - fallados);

            // Calculamos costo total teniendo en cuenta que el taller (y ganancia) solo aplica a las útiles,
            // pero la tela se gastó por la cantidad original. Para simplificar, ajustamos la metadata.
            // Para totales del corte, si los costos de taller/cortador eran unitarios, costoTotal ya incluye esa base multiplicada abajo por cantidadU
            totalCosto += c.costoTotal * c.cantidadU;
            totalVenta += c.precioLocal * unidadesUtiles;
            totalUnidades += c.cantidadU;
            totalFallados += fallados;

            // Restar costo de taller/cortador de los fallados (ya que generalmente no se pagan prendas falladas)
            // Evaluando: si no se pagan los fallados, hay que deducir su costo de taller/cortador del total de costos
            totalCosto -= (c.costoTallerVal + c.costoCortadorVal) * fallados;
        });
        return { totalCosto, totalVenta, totalUnidades, totalFallados, ganancia: totalVenta - totalCosto };
    }, [corteMoldes, selectedCorte]);

    const getCoverImage = (molde) => {
        if (!molde.imagenes || molde.imagenes.length === 0) return null;
        if (molde.coverImageId) {
            const cover = molde.imagenes.find(img => img.id === molde.coverImageId);
            if (cover) return cover.data;
        }
        return molde.imagenes[0]?.data || null;
    };

    return (
        <div className="settings" style={{ maxWidth: 1200 }}>
            <h2><PackageOpen style={{ display: 'inline', marginRight: 8 }} /> {t('cortes')}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 'var(--sp-5)', transition: 'all 0.3s ease' }}>
                {/* Left: Cortes list */}
                <div>
                    <div className="settings-section">
                        {user?.role === 'admin' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
                                <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                                    <input
                                        className="form-input"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder={`Corte ${cortes.length + 1}`}
                                        onKeyDown={(e) => e.key === 'Enter' && addCorte()}
                                    />
                                    <button className="btn btn-primary" onClick={addCorte}><Plus /></button>
                                </div>
                                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                    <Upload style={{ width: 14, height: 14 }} /> Importar Planilla Excel
                                </button>
                                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
                            </div>
                        )}

                        <div className="settings-list">
                            {cortes.length === 0 && (
                                <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                                    Crear tu primer corte
                                </div>
                            )}
                            {cortes.map(corte => {
                                const count = (corte.moldeIds || []).length;
                                return (
                                    <div
                                        key={corte.id}
                                        className="settings-list-item"
                                        style={{
                                            cursor: 'pointer',
                                            border: selected === corte.id ? '1px solid var(--accent)' : '1px solid transparent',
                                            background: selected === corte.id ? 'var(--accent-light)' : undefined,
                                            padding: '10px 12px',
                                        }}
                                        onClick={() => setSelected(selected === corte.id ? null : corte.id)}
                                    >
                                        <PackageOpen style={{ width: 18, height: 18, color: 'var(--accent)', flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-semibold)' }}>
                                                {corte.nombre}
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {corte.fecha} · {count} artículos
                                            </div>
                                        </div>
                                        <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                                        {user?.role === 'admin' && (
                                            <button className="remove-btn" onClick={(e) => { e.stopPropagation(); removeCorte(corte.id); }} style={{ opacity: 1 }}>
                                                <Trash2 style={{ width: 14, height: 14 }} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Corte details */}
                {selected && selectedCorte && (
                    <div>
                        {/* Header */}
                        <div className="settings-section" style={{ marginBottom: 'var(--sp-4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
                                <input
                                    className="form-input"
                                    value={selectedCorte.nombre}
                                    onChange={(e) => updateCorte(selected, { nombre: e.target.value })}
                                    style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', flex: 1 }}
                                    disabled={user?.role !== 'admin'}
                                />
                                <input
                                    type="date"
                                    className="form-input"
                                    value={selectedCorte.fecha || ''}
                                    onChange={(e) => updateCorte(selected, { fecha: e.target.value })}
                                    style={{ width: 160 }}
                                    disabled={user?.role !== 'admin'}
                                />
                            </div>

                            {/* Totals cards */}
                            {corteTotals && (
                                <div style={{ display: 'grid', gridTemplateColumns: user?.role === 'admin' ? 'repeat(4, 1fr)' : '1fr', gap: 'var(--sp-3)' }}>
                                    <div className="glass-panel" style={{ padding: 'var(--sp-3)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-bold)', color: 'var(--text)' }}>
                                            {corteMoldes.length}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Artículos</div>
                                    </div>
                                    {user?.role === 'admin' && (
                                        <>
                                            <div className="glass-panel" style={{ padding: 'var(--sp-3)', textAlign: 'center', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                                                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--warning)' }}>
                                                    ${corteTotals.totalCosto.toFixed(0)}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Costo total</div>
                                            </div>
                                            <div className="glass-panel" style={{ padding: 'var(--sp-3)', textAlign: 'center', borderColor: 'rgba(34, 197, 94, 0.3)' }}>
                                                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--success)' }}>
                                                    ${corteTotals.totalVenta.toFixed(0)}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Venta total</div>
                                            </div>
                                            <div className="glass-panel" style={{ padding: 'var(--sp-3)', textAlign: 'center', borderColor: corteTotals.ganancia >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)' }}>
                                                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: corteTotals.ganancia >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                    ${corteTotals.ganancia.toFixed(0)}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ganancia libre</div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Articles table */}
                        <div className="settings-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-3)' }}>
                                <h3 style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>
                                    Artículos del corte ({corteMoldes.length})
                                </h3>
                                {user?.role === 'admin' && (
                                    <button className="btn btn-sm btn-primary" onClick={() => setAddingMolde(!addingMolde)}>
                                        <Plus style={{ width: 14, height: 14 }} /> {t('agregarMolde')}
                                    </button>
                                )}
                            </div>

                            {/* Add molde dropdown */}
                            {addingMolde && (
                                <div style={{
                                    marginBottom: 'var(--sp-3)',
                                    padding: 'var(--sp-2)',
                                    background: 'var(--glass-bg)',
                                    borderRadius: 'var(--radius-sm)',
                                }}>
                                    <input
                                        className="form-input"
                                        placeholder="🔍 Buscar molde por código o nombre..."
                                        value={searchMolde}
                                        onChange={e => setSearchMolde(e.target.value)}
                                        style={{ marginBottom: 8, fontSize: 'var(--fs-sm)' }}
                                        autoFocus
                                    />
                                    <div style={{ maxHeight: 200, overflow: 'auto' }}>
                                        {availableMoldes.length === 0 ? (
                                            <div style={{ padding: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>
                                                No hay moldes disponibles que coincidan
                                            </div>
                                        ) : (
                                            availableMoldes.map(m => (
                                                <div
                                                    key={m.id}
                                                    onClick={() => handleAddMoldeToCorte(m.id)}
                                                    style={{
                                                        padding: '6px 10px',
                                                        cursor: 'pointer',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: 'var(--fs-sm)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = ''}
                                                >
                                                    <Plus style={{ width: 12, height: 12, color: 'var(--accent)' }} />
                                                    {m.nombre || '(sin nombre)'}
                                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                        {m.categoria || ''}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Consumo de Telas section */}
                            {user?.role === 'admin' && (
                                <div className="glass-panel" style={{ marginBottom: 'var(--sp-4)', padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h4 style={{ fontSize: '12px', fontWeight: 'var(--fw-semibold)', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>📏 Consumo de Stock en Telas</h4>
                                        <button className="btn btn-sm btn-secondary" style={{ padding: '4px 10px', fontSize: '10px' }} onClick={addConsumo}>+ Añadir Gasto</button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {(selectedCorte.consumos || []).map(cons => {
                                            const telaSelected = telas.find(t => t.id === cons.telaId);
                                            const colores = telaSelected?.coloresStock || [];
                                            return (
                                                <div key={cons.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 100px 70px 70px 32px', gap: 10, alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <select className="form-select" value={cons.telaId || ''} onChange={(e) => updateConsumo(cons.id, 'telaId', e.target.value)} style={{ fontSize: '11px', padding: '6px' }}>
                                                        <option value="">Seleccionar Tela...</option>
                                                        {telasInCorte.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                                                    </select>

                                                    <select className="form-select" value={cons.colorHex || ''} onChange={(e) => updateConsumo(cons.id, 'colorHex', e.target.value)} style={{ fontSize: '11px', padding: '6px' }}>
                                                        <option value="">Color...</option>
                                                        {colores.map((c, i) => <option key={i} value={c.hex}>{c.nombre || c.hex}</option>)}
                                                    </select>

                                                    <input type="number" className="form-input" min={0} placeholder="Rollos" value={cons.rollos || ''} onChange={(e) => updateConsumo(cons.id, 'rollos', e.target.value)} style={{ fontSize: '11px', padding: '6px' }} />
                                                    <input type="number" className="form-input" min={0} step="0.1" placeholder="Mts/Kg" value={cons.cantidad || ''} onChange={(e) => updateConsumo(cons.id, 'cantidad', e.target.value)} style={{ fontSize: '11px', padding: '6px' }} />

                                                    <button className="btn-icon" onClick={() => removeConsumo(cons.id)} style={{ width: 28, height: 28, padding: 0, color: 'var(--danger)' }}><Trash2 style={{ width: 14, height: 14 }} /></button>
                                                </div>
                                            )
                                        })}
                                        {(!selectedCorte.consumos || selectedCorte.consumos.length === 0) && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>Aún no se ha declarado desgaste de inventario para este corte.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Articles list */}
                            {corteMoldes.length === 0 ? (
                                <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                                    Agregá artículos a este corte
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                                    {corteMoldes.map(m => {
                                        const cData = (selectedCorte.moldesData || []).find(d => d.id === m.id) || {};
                                        const img = getCoverImage(m);
                                        const cost = calcCost(m, cData);

                                        return (
                                            <div key={m.id} className="glass-panel" style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px',
                                                padding: '12px',
                                                marginBottom: '8px'
                                            }}>
                                                {/* Top Row: Thumbnail + Info + Delete */}
                                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                    {/* Minimizer / Toggle */}
                                                    <button
                                                        className="btn-icon"
                                                        onClick={() => toggleCollapse(m.id)}
                                                        style={{ width: 32, height: 32, transform: collapsedMolds[m.id] ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                                                    >
                                                        <ChevronRight size={20} />
                                                    </button>

                                                    {/* Thumbnail */}
                                                    <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageIcon style={{ width: 20, height: 20, color: 'var(--text-muted)', opacity: 0.3 }} />}
                                                    </div>

                                                    {/* Name and cost summary */}
                                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                                            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-bold)', color: 'var(--text)' }}>
                                                                {m.nombre || '(sin nombre)'} {m.codigo ? `(#${m.codigo})` : ''}
                                                            </span>
                                                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                                                                Local: {cData.articuloVenta || m.codigo || '-'}
                                                            </span>
                                                            <span style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                                                                Fabrica: {cData.articuloFabrica || m.codigo || '-'}
                                                            </span>
                                                            {user?.role === 'admin' && (
                                                                <span style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>{cost.telaName}</span>
                                                            )}
                                                        </div>
                                                        {user?.role === 'admin' && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '11px' }}>
                                                                <span style={{ color: 'var(--text-secondary)' }}>Costo real: <strong style={{ color: 'var(--warning)' }}>${cost.costoTotal.toFixed(0)}</strong></span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>Venta real: <strong style={{ color: 'var(--success)' }}>${cost.precioLocal.toFixed(0)}</strong></span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>Costo prueba: <strong style={{ color: '#f59e0b' }}>${cost.costoPruebaTotal.toFixed(0)}</strong></span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>Venta prueba: <strong style={{ color: '#60a5fa' }}>${cost.precioPrueba.toFixed(0)}</strong></span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Remove + Transfer */}
                                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                        {user?.role === 'admin' && (
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid var(--success)', fontSize: '10px', padding: '3px 8px', whiteSpace: 'nowrap' }}
                                                                onClick={() => syncArticuloDesdeCorte(m, cData, cost)}
                                                                title="Copiar este molde al catálogo de Artículos del POS"
                                                            >
                                                                <ArrowRightCircle size={12} style={{ display: 'inline', marginRight: '3px' }} />
                                                                → Art
                                                            </button>
                                                        )}
                                                        {user?.role === 'admin' && (
                                                            <button className="btn-icon" onClick={() => handleRemoveMoldeFromCorte(m.id)} style={{ padding: 6, color: 'var(--text-muted)' }} title="Quitar molde de este corte">
                                                                <Trash2 style={{ width: 16, height: 16 }} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Edit fields grid (Collapsible) */}
                                                {!collapsedMolds[m.id] && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.03)' }}>

                                                        {/* Basic Data */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 12, width: '100%', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Art local</span>
                                                                <input
                                                                    type="text" className="form-input"
                                                                    value={cData.articuloVenta ?? m.codigo ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { articuloVenta: e.target.value.toUpperCase() })}
                                                                    style={{ padding: '6px', fontSize: '12px' }}
                                                                    disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Art fabrica</span>
                                                                <input
                                                                    type="text" className="form-input"
                                                                    value={cData.articuloFabrica ?? m.codigo ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { articuloFabrica: e.target.value.toUpperCase() })}
                                                                    style={{ padding: '6px', fontSize: '12px' }}
                                                                    disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Cantidad</span>
                                                                <input
                                                                    type="number" className="form-input" min={0}
                                                                    value={cData.cantidad ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { cantidad: parseFloat(e.target.value) || 0 })}
                                                                    style={{ padding: '6px', fontSize: '12px' }}
                                                                    disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fallados</span>
                                                                <input
                                                                    type="number" className="form-input" min={0}
                                                                    value={cData.prendasFalladas ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { prendasFalladas: parseFloat(e.target.value) || 0 })}
                                                                    style={{ padding: '6px', fontSize: '12px', color: cData.prendasFalladas > 0 ? 'var(--danger)' : 'inherit' }}
                                                                    disabled={user?.role !== 'admin' && user?.role !== 'encargada' && user?.role !== 'deposito'}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Rollos</span>
                                                                <input
                                                                    type="number" className="form-input" min={0}
                                                                    value={cData.rollosCorte ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { rollosCorte: parseFloat(e.target.value) || 0 })}
                                                                    style={{ padding: '6px', fontSize: '12px' }}
                                                                    disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Kilaje Total</span>
                                                                <input
                                                                    type="number" className="form-input" min={0} step="0.01"
                                                                    value={cData.kilajeTotal ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { kilajeTotal: parseFloat(e.target.value) || 0 })}
                                                                    style={{ padding: '6px', fontSize: '12px' }}
                                                                    disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Assignments */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Cortador Asignado</span>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <select
                                                                        className="form-select"
                                                                        value={cData.cortadorAsignado || ''}
                                                                        onChange={e => {
                                                                            const val = e.target.value;
                                                                            // (3) Autofill: al elegir cortador, aplicar a TODOS los artículos del mismo corte
                                                                            const sc = cortes.find(c => c.id === selected);
                                                                            if (sc && sc.moldesData) {
                                                                                sc.moldesData.forEach(md => {
                                                                                    updateMoldeInCorte(selected, md.id, { cortadorAsignado: val });
                                                                                });
                                                                            } else {
                                                                                updateMoldeInCorte(selected, m.id, { cortadorAsignado: val });
                                                                            }
                                                                        }}
                                                                        style={{ padding: '6px', fontSize: '12px', flex: 1 }}
                                                                        disabled={user?.role === 'deposito'}
                                                                    >
                                                                        <option value="">Seleccionar Cortador...</option>
                                                                        {(config.cortadores || []).map(cor => (
                                                                            <option key={cor} value={cor}>{cor}</option>
                                                                        ))}
                                                                    </select>
                                                                    <input
                                                                        type="number" className="form-input" placeholder="$$"
                                                                        value={cData.costoCortador ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { costoCortador: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px', width: 70 }}
                                                                        disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Taller Asignado</span>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <select
                                                                        className="form-select"
                                                                        value={cData.tallerAsignado || ''}
                                                                        onChange={e => updateMoldeInCorte(selected, m.id, { tallerAsignado: e.target.value })}
                                                                        style={{ padding: '6px', fontSize: '12px', flex: 1 }}
                                                                        disabled={user?.role === 'deposito'}
                                                                    >
                                                                        <option value="">Seleccionar Taller...</option>
                                                                        {(config.talleres || []).map(tal => (
                                                                            <option key={tal} value={tal}>{tal}</option>
                                                                        ))}
                                                                    </select>
                                                                    <input
                                                                        type="number" className="form-input" placeholder="$$"
                                                                        value={cData.costoTaller ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { costoTaller: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px', width: 70 }}
                                                                        disabled={user?.role !== 'admin' && user?.role !== 'encargada'}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Advanced Costs & Price (Admin Only) */}
                                                        {user?.role === 'admin' && (
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 12, width: '100%' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>% Ganancia</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.margenGanancia !== undefined ? cData.margenGanancia : cost.margen}
                                                                        onChange={e => {
                                                                            const val = parseFloat(e.target.value) || 0;
                                                                            updateMoldeInCorte(selected, m.id, { margenGanancia: val, precioLocal: cost.costoTotal * (1 + (val / 100)) });
                                                                        }}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Precio real venta</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.precioLocal ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { precioLocal: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px', color: 'var(--success)', fontWeight: 'bold' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 'bold' }}>Precio de prueba</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.precioPrueba ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { precioPrueba: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px', color: '#60a5fa', fontWeight: 'bold' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Lista 2 Minorista</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.precioVentaL2 ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { precioVentaL2: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Lista 3 Chloe</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.precioVentaL3 ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { precioVentaL3: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Lista 4 Luis</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.precioVentaL4 ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { precioVentaL4: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Precio x m/kg</span>
                                                                    <input
                                                                        type="number" className="form-input" step="0.01"
                                                                        value={cData.usoRealTela !== undefined ? cData.usoRealTela : cost.consumo}
                                                                        onChange={e => updateMoldeInCorte(selected, m.id, { usoRealTela: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 'bold' }}>% de Tela</span>
                                                                    <input
                                                                        type="number" className="form-input" step="0.01"
                                                                        value={cData.porcentajeTela !== undefined ? cData.porcentajeTela : cost.pctTela}
                                                                        onChange={e => updateMoldeInCorte(selected, m.id, { porcentajeTela: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px', color: '#f59e0b', fontWeight: 'bold' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Accesorios 1</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.costoAccesorio !== undefined ? cData.costoAccesorio : cost.acc1}
                                                                        onChange={e => updateMoldeInCorte(selected, m.id, { costoAccesorio: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Accesorios 2</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.costoAccesorio2 !== undefined ? cData.costoAccesorio2 : cost.acc2}
                                                                        onChange={e => updateMoldeInCorte(selected, m.id, { costoAccesorio2: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Taller prueba</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.costoTallerPrueba ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { costoTallerPrueba: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>FasÃ³n prueba</span>
                                                                    <input
                                                                        type="number" className="form-input"
                                                                        value={cData.costoFasonPrueba ?? ''} onChange={e => updateMoldeInCorte(selected, m.id, { costoFasonPrueba: parseFloat(e.target.value) || 0 })}
                                                                        style={{ padding: '6px', fontSize: '12px' }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Status & Extras */}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 8 }}>
                                                            <div style={{ display: 'flex', gap: 12 }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={cData.pagadoCortador || false} onChange={e => updateMoldeInCorte(selected, m.id, { pagadoCortador: e.target.checked })} />
                                                                    Cortador Pagado
                                                                </label>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={cData.pagadoTaller || false} onChange={e => updateMoldeInCorte(selected, m.id, { pagadoTaller: e.target.checked })} />
                                                                    Taller Pagado
                                                                </label>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Estado:</span>
                                                                <select
                                                                    className="form-select"
                                                                    value={cData.estadoTaller || 'pendiente'}
                                                                    onChange={e => {
                                                                        const val = e.target.value;
                                                                        // (2) Autofill: al cambiar estado, aplicar a TODOS los artículos del mismo corte
                                                                        const sc = cortes.find(c => c.id === selected);
                                                                        if (sc && sc.moldesData) {
                                                                            sc.moldesData.forEach(md => {
                                                                                updateMoldeInCorte(selected, md.id, { estadoTaller: val });
                                                                            });
                                                                        } else {
                                                                            updateMoldeInCorte(selected, m.id, { estadoTaller: val });
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px', fontSize: '11px', width: 'auto',
                                                                        background: cData.estadoTaller === 'entregado' ? 'rgba(34, 197, 94, 0.2)' : cData.estadoTaller === 'parcial' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                                        color: cData.estadoTaller === 'entregado' ? 'var(--success)' : cData.estadoTaller === 'parcial' ? 'var(--warning)' : 'var(--danger)',
                                                                        borderColor: cData.estadoTaller === 'entregado' ? 'var(--success)' : cData.estadoTaller === 'parcial' ? 'var(--warning)' : 'var(--danger)',
                                                                        borderRadius: 4
                                                                    }}
                                                                >
                                                                    <option value="pendiente">Pendiente</option>
                                                                    <option value="parcial">Parcial</option>
                                                                    <option value="entregado">Entregado</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
