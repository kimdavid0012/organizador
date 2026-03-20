import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, firestoreOfflineReady } from './firebase';
import { DEFAULT_DATA, loadDataFromLocal, saveDataToLocal, normalizeData, downloadBackupJSON } from './storage';
import { generateId } from '../utils/helpers';
import { wooService } from '../utils/wooService';
import { metaService } from '../utils/metaService';

const DataContext = createContext(null);

const normalizeProductCode = (value) => (value || '').toString().trim().toUpperCase();

const normalizeText = (value) => (value || '').toString().trim();

const sanitizeStockBreakdown = (entries = []) =>
    entries
        .map((entry) => ({
            color: normalizeText(entry.color),
            taller: normalizeText(entry.taller),
            fechaIngreso: normalizeText(entry.fechaIngreso),
            cantidadOriginal: Number.parseInt(entry.cantidadOriginal || 0, 10) || 0,
            cantidadContada: Number.parseInt(entry.cantidadContada || 0, 10) || 0,
            cantidadEllos: Number.parseInt(entry.cantidadEllos || 0, 10) || 0,
            fallado: Number.parseInt(entry.fallado || 0, 10) || 0
        }))
        .filter((entry) => entry.color || entry.taller || entry.cantidadOriginal || entry.cantidadContada || entry.cantidadEllos || entry.fallado);

const upsertPosProducts = (existingProducts = [], incomingProducts = []) => {
    const merged = [...existingProducts];

    incomingProducts.forEach((incoming) => {
        const incomingCode = normalizeProductCode(incoming.codigoInterno);
        const incomingWooId = incoming.wooId;
        const index = merged.findIndex((product) => {
            const productCode = normalizeProductCode(product.codigoInterno);
            if (incomingCode && productCode && productCode === incomingCode) return true;
            if (incomingWooId && product.wooId && product.wooId === incomingWooId) return true;
            return false;
        });

        const normalizedIncoming = {
            ...incoming,
            codigoInterno: incomingCode || incoming.codigoInterno || ''
        };

        if (index >= 0) {
            merged[index] = { ...merged[index], ...normalizedIncoming };
        } else {
            merged.push(normalizedIncoming);
        }
    });

    return merged;
};

const syncMercaderiaWithProducts = (existingProducts = [], mercaderiaConteos = []) => {
    const conteos = Array.isArray(mercaderiaConteos) ? mercaderiaConteos : [];
    const groupedByCode = new Map();

    conteos.forEach((item) => {
        const code = normalizeProductCode(item.codigoInterno || item.articulo);
        if (!code) return;

        if (!groupedByCode.has(code)) {
            groupedByCode.set(code, {
                codigoInterno: code,
                detalleCorto: normalizeText(item.descripcion) || code,
                proveedor: normalizeText(item.taller) || 'Produccion propia',
                stock: 0,
                stockPorColor: []
            });
        }

        const group = groupedByCode.get(code);
        const descripcion = normalizeText(item.descripcion);
        const taller = normalizeText(item.taller);
        const color = normalizeText(item.color);
        const fechaIngreso = normalizeText(item.fechaIngreso);
        const cantidadOriginal = Number.parseInt(item.cantidadOriginal || 0, 10) || 0;
        const cantidadContada = Number.parseInt(item.cantidadContada || 0, 10) || 0;
        const cantidadEllos = Number.parseInt(item.cantidadEllos || 0, 10) || 0;
        const fallado = Number.parseInt(item.fallado || 0, 10) || 0;
        const stockDisponible = Math.max(0, cantidadContada - fallado);

        if (descripcion) group.detalleCorto = descripcion;
        if (taller) group.proveedor = taller;
        group.stock += stockDisponible;
        group.stockPorColor.push({
            color,
            taller,
            fechaIngreso,
            cantidadOriginal,
            cantidadContada,
            cantidadEllos,
            fallado,
            stockDisponible
        });
    });

    if (groupedByCode.size === 0) {
        return existingProducts;
    }

    return existingProducts.map((product) => {
        const code = normalizeProductCode(product.codigoInterno);
        if (!code || !groupedByCode.has(code)) return product;

        const group = groupedByCode.get(code);
        return {
            ...product,
            codigoInterno: code,
            detalleCorto: group.detalleCorto || product.detalleCorto,
            proveedor: group.proveedor || product.proveedor,
            stock: group.stock,
            stockPorColor: sanitizeStockBreakdown(group.stockPorColor)
        };
    });
};

const parseWooPrice = (...values) => {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const normalized = value
            .toString()
            .trim()
            .replace(/[^\d,.-]/g, '')
            .replace(/\.(?=\d{3}(?:\D|$))/g, '')
            .replace(',', '.');
        const parsed = Number.parseFloat(normalized);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
};

const ACTION_TYPES = {
    SET_DATA: 'SET_DATA',
    ADD_MOLDE: 'ADD_MOLDE',
    UPDATE_MOLDE: 'UPDATE_MOLDE',
    DELETE_MOLDE: 'DELETE_MOLDE',
    MOVE_MOLDE: 'MOVE_MOLDE',
    REORDER_MOLDES: 'REORDER_MOLDES',
    ADD_TELA: 'ADD_TELA',
    UPDATE_TELA: 'UPDATE_TELA',
    DELETE_TELA: 'DELETE_TELA',
    UPDATE_CONFIG: 'UPDATE_CONFIG',
    IMPORT_MOLDES: 'IMPORT_MOLDES',
    IMPORT_TELAS: 'IMPORT_TELAS',
    ADD_IMAGE_TO_MOLDE: 'ADD_IMAGE_TO_MOLDE',
    REMOVE_IMAGE_FROM_MOLDE: 'REMOVE_IMAGE_FROM_MOLDE',
    SET_COVER_IMAGE: 'SET_COVER_IMAGE',
    ADD_IMAGE_TO_TELA: 'ADD_IMAGE_TO_TELA',
    REMOVE_IMAGE_FROM_TELA: 'REMOVE_IMAGE_FROM_TELA',
    ADD_MOLDE_TO_CORTE: 'ADD_MOLDE_TO_CORTE',
    REMOVE_MOLDE_FROM_CORTE: 'REMOVE_MOLDE_FROM_CORTE',
    UPDATE_MOLDE_IN_CORTE: 'UPDATE_MOLDE_IN_CORTE',
    ADD_PEDIDO_ONLINE: 'ADD_PEDIDO_ONLINE',
    UPDATE_PEDIDO_ONLINE_STATUS: 'UPDATE_PEDIDO_ONLINE_STATUS',
    ADD_PEDIDO_ITEM: 'ADD_PEDIDO_ITEM',
    UPDATE_PEDIDO_ITEM: 'UPDATE_PEDIDO_ITEM',

    // Tareas
    ADD_TAREA: 'ADD_TAREA',
    UPDATE_TAREA: 'UPDATE_TAREA',
    DELETE_TAREA: 'DELETE_TAREA',

    // POS
    ADD_POS_SALE: 'ADD_POS_SALE',
    ADD_POS_EXPENSE: 'ADD_POS_EXPENSE',
    PERFORM_Z_CLOSE: 'PERFORM_Z_CLOSE',
    UPDATE_POS_SETTINGS: 'UPDATE_POS_SETTINGS',
    ADD_POS_PRODUCT: 'ADD_POS_PRODUCT',
    UPDATE_POS_PRODUCT: 'UPDATE_POS_PRODUCT',
    DELETE_POS_PRODUCT: 'DELETE_POS_PRODUCT',
    IMPORT_POS_PRODUCTS: 'IMPORT_POS_PRODUCTS',

    // Clientes
    ADD_CLIENTE: 'ADD_CLIENTE',
    UPDATE_CLIENTE: 'UPDATE_CLIENTE',
    DELETE_CLIENTE: 'DELETE_CLIENTE',

    // Reservas de Ticket (Seña)
    SAVE_RESERVATION: 'SAVE_RESERVATION',
    DELETE_RESERVATION: 'DELETE_RESERVATION',
    IMPORT_WOO_ORDERS: 'IMPORT_WOO_ORDERS',
    IMPORT_WOO_PRODUCTS: 'IMPORT_WOO_PRODUCTS',
    SET_META_ADS_DATA: 'SET_META_ADS_DATA',
    SET_WOO_ANALYTICS_DATA: 'SET_WOO_ANALYTICS_DATA',
    SET_MARKETING_CACHE: 'SET_MARKETING_CACHE',
    SET_PAGINA_WEB_CACHE: 'SET_PAGINA_WEB_CACHE',
    SAVE_MERCADERIA_CONTEOS: 'SAVE_MERCADERIA_CONTEOS'
};

function dataReducer(state, action) {
    switch (action.type) {
        case ACTION_TYPES.ADD_MOLDE: {
            const now = new Date().toISOString();
            const moldesInColumn = state.moldes.filter(m => m.estado === (action.payload.estado || state.config.columnas[0]?.id));
            const newMolde = {
                id: generateId(),
                nombre: '',
                codigo: '',
                categoria: '',
                talles: '',
                estado: state.config.columnas[0]?.id || 'por-hacer',
                orden: moldesInColumn.length,
                telasIds: [],
                prioridad: 'Media',
                temporada: '',
                responsable: '',
                fechaObjetivo: null,
                observaciones: '',
                checklist: [],
                imagenes: [],
                coverImageId: null,
                creadoEn: now,
                actualizadoEn: now,
                ...action.payload
            };
            return { ...state, moldes: [...state.moldes, newMolde] };
        }

        case ACTION_TYPES.UPDATE_MOLDE: {
            const now = new Date().toISOString();
            return {
                ...state,
                moldes: state.moldes.map(m =>
                    m.id === action.payload.id
                        ? { ...m, ...action.payload, actualizadoEn: now }
                        : m
                )
            };
        }

        case ACTION_TYPES.DELETE_MOLDE:
            return {
                ...state,
                moldes: state.moldes.filter(m => m.id !== action.payload)
            };

        case ACTION_TYPES.MOVE_MOLDE: {
            const { moldeId, newEstado, newOrden } = action.payload;
            const now = new Date().toISOString();
            let moldes = state.moldes.map(m => {
                if (m.id === moldeId) {
                    return { ...m, estado: newEstado, orden: newOrden, actualizadoEn: now };
                }
                return m;
            });
            return { ...state, moldes };
        }

        case ACTION_TYPES.REORDER_MOLDES: {
            const { orderedIds, columnId } = action.payload;
            const moldes = state.moldes.map(m => {
                if (m.estado === columnId) {
                    const newIndex = orderedIds.indexOf(m.id);
                    if (newIndex !== -1) {
                        return { ...m, orden: newIndex };
                    }
                }
                return m;
            });
            return { ...state, moldes };
        }

        case ACTION_TYPES.ADD_TELA: {
            const newTela = {
                id: generateId(),
                nombre: '',
                color: '',
                composicion: '',
                proveedor: '',
                imagenes: [],
                notas: '',
                ...action.payload
            };
            return { ...state, telas: [...state.telas, newTela] };
        }

        case ACTION_TYPES.UPDATE_TELA:
            return {
                ...state,
                telas: state.telas.map(t =>
                    t.id === action.payload.id ? { ...t, ...action.payload } : t
                )
            };

        case ACTION_TYPES.DELETE_TELA: {
            const telaId = action.payload;
            return {
                ...state,
                telas: state.telas.filter(t => t.id !== telaId),
                moldes: state.moldes.map(m => ({
                    ...m,
                    telasIds: (m.telasIds || []).filter(id => id !== telaId)
                }))
            };
        }

        case ACTION_TYPES.UPDATE_CONFIG: {
            const nextConfig = { ...state.config, ...action.payload };
            if (Object.prototype.hasOwnProperty.call(action.payload, 'mercaderiaConteos')) {
                return {
                    ...state,
                    config: nextConfig
                };
            }
            return {
                ...state,
                config: nextConfig
            };
        }

        case ACTION_TYPES.IMPORT_MOLDES:
            return {
                ...state,
                moldes: [...state.moldes, ...action.payload]
            };

        case ACTION_TYPES.IMPORT_TELAS:
            return {
                ...state,
                telas: [...state.telas, ...action.payload]
            };

        case ACTION_TYPES.ADD_IMAGE_TO_MOLDE: {
            const { moldeId, imagen } = action.payload;
            return {
                ...state,
                moldes: state.moldes.map(m => {
                    if (m.id === moldeId) {
                        const newImg = { id: generateId(), fecha: new Date().toISOString(), ...imagen };
                        const imagenes = [...(m.imagenes || []), newImg];
                        const coverImageId = m.coverImageId || newImg.id;
                        return { ...m, imagenes, coverImageId };
                    }
                    return m;
                })
            };
        }

        case ACTION_TYPES.REMOVE_IMAGE_FROM_MOLDE: {
            const { moldeId, imagenId } = action.payload;
            return {
                ...state,
                moldes: state.moldes.map(m => {
                    if (m.id === moldeId) {
                        const imagenes = (m.imagenes || []).filter(i => i.id !== imagenId);
                        const coverImageId = m.coverImageId === imagenId
                            ? (imagenes.length > 0 ? imagenes[0].id : null)
                            : m.coverImageId;
                        return { ...m, imagenes, coverImageId };
                    }
                    return m;
                })
            };
        }

        case ACTION_TYPES.SET_COVER_IMAGE: {
            const { moldeId, imagenId } = action.payload;
            return {
                ...state,
                moldes: state.moldes.map(m =>
                    m.id === moldeId ? { ...m, coverImageId: imagenId } : m
                )
            };
        }

        case ACTION_TYPES.ADD_IMAGE_TO_TELA: {
            const { telaId, imagen } = action.payload;
            return {
                ...state,
                telas: state.telas.map(t => {
                    if (t.id === telaId) {
                        const newImg = { id: generateId(), fecha: new Date().toISOString(), ...imagen };
                        return { ...t, imagenes: [...(t.imagenes || []), newImg] };
                    }
                    return t;
                })
            };
        }

        case ACTION_TYPES.REMOVE_IMAGE_FROM_TELA: {
            const { telaId, imagenId } = action.payload;
            return {
                ...state,
                telas: state.telas.map(t => {
                    if (t.id === telaId) {
                        return { ...t, imagenes: (t.imagenes || []).filter(i => i.id !== imagenId) };
                    }
                    return t;
                })
            };
        }

        case ACTION_TYPES.ADD_MOLDE_TO_CORTE: {
            const { corteId, moldeId } = action.payload;
            const cortes = state.config.cortes || [];
            return {
                ...state,
                config: {
                    ...state.config,
                    cortes: cortes.map(c => {
                        if (c.id === corteId) {
                            const molds = c.moldesData || [];
                            if (!molds.find(m => m.id === moldeId)) {
                                molds.push({ id: moldeId, cantidad: 1, costoCortador: 0, pagadoCortador: false, costoTaller: 0, pagadoTaller: false, taller: '', cortador: '', notas: '' });
                            }
                            return { ...c, moldesData: molds, moldeIds: molds.map(m => m.id) };
                        }
                        return c;
                    })
                }
            };
        }

        case ACTION_TYPES.REMOVE_MOLDE_FROM_CORTE: {
            const { corteId, moldeId } = action.payload;
            const cortes = state.config.cortes || [];
            return {
                ...state,
                config: {
                    ...state.config,
                    cortes: cortes.map(c => {
                        if (c.id === corteId) {
                            const molds = (c.moldesData || []).filter(m => m.id !== moldeId);
                            return { ...c, moldesData: molds, moldeIds: molds.map(m => m.id) };
                        }
                        return c;
                    })
                }
            };
        }

        case ACTION_TYPES.UPDATE_MOLDE_IN_CORTE: {
            const { corteId, moldeId, changes } = action.payload;
            const cortes = state.config.cortes || [];
            return {
                ...state,
                config: {
                    ...state.config,
                    cortes: cortes.map(c => {
                        if (c.id === corteId) {
                            const molds = (c.moldesData || []).map(m =>
                                m.id === moldeId ? { ...m, ...changes } : m
                            );
                            return { ...c, moldesData: molds };
                        }
                        return c;
                    })
                }
            };
        }

        case ACTION_TYPES.ADD_PEDIDO_ONLINE: {
            const newPedido = {
                id: generateId(),
                cliente: action.payload.cliente || '',
                numeroPedido: action.payload.numeroPedido || '',
                fecha: new Date().toISOString(),
                estado: 'pendiente',
                items: [],
                ...action.payload
            };
            return {
                ...state,
                config: {
                    ...state.config,
                    pedidosOnline: [newPedido, ...(state.config.pedidosOnline || [])]
                }
            };
        }

        case ACTION_TYPES.UPDATE_PEDIDO_ONLINE_STATUS: {
            const { pedidoId, newEstado } = action.payload;
            const currentPedido = (state.config.pedidosOnline || []).find(p => p.id === pedidoId);
            const isTransitioningToListo = newEstado === 'listo' && currentPedido?.estado !== 'listo';
            const isTransitioningFromListo = newEstado !== 'listo' && currentPedido?.estado === 'listo';

            let updatedPosProductos = state.config.posProductos || [];

            if (isTransitioningToListo) {
                // Deduct stock
                const stockChanges = {};
                currentPedido.items?.forEach(item => {
                    if (item.productId && item.estado === 'ok') {
                        stockChanges[item.productId] = (stockChanges[item.productId] || 0) + (item.cantidad || 1);
                    }
                });
                updatedPosProductos = updatedPosProductos.map(prod => {
                    if (stockChanges[prod.id]) {
                        return { ...prod, stock: Math.max(0, (prod.stock || 0) - stockChanges[prod.id]) };
                    }
                    return prod;
                });
            } else if (isTransitioningFromListo) {
                // Restore stock
                const stockChanges = {};
                currentPedido.items?.forEach(item => {
                    if (item.productId && item.estado === 'ok') {
                        stockChanges[item.productId] = (stockChanges[item.productId] || 0) + (item.cantidad || 1);
                    }
                });
                updatedPosProductos = updatedPosProductos.map(prod => {
                    if (stockChanges[prod.id]) {
                        return { ...prod, stock: (prod.stock || 0) + stockChanges[prod.id] };
                    }
                    return prod;
                });
            }

            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: updatedPosProductos,
                    pedidosOnline: (state.config.pedidosOnline || []).map(p =>
                        p.id === pedidoId ? { ...p, estado: newEstado } : p
                    )
                }
            };
        }

        case ACTION_TYPES.ADD_PEDIDO_ITEM: {
            const { pedidoId, item } = action.payload;
            return {
                ...state,
                config: {
                    ...state.config,
                    pedidosOnline: (state.config.pedidosOnline || []).map(p => {
                        if (p.id === pedidoId) {
                            const newItem = { id: generateId(), ...item };
                            return { ...p, items: [...(p.items || []), newItem] };
                        }
                        return p;
                    })
                }
            };
        }

        case ACTION_TYPES.UPDATE_PEDIDO_ITEM: {
            const { pedidoId, itemId, changes } = action.payload;
            return {
                ...state,
                config: {
                    ...state.config,
                    pedidosOnline: (state.config.pedidosOnline || []).map(p => {
                        if (p.id === pedidoId) {
                            return {
                                ...p,
                                items: (p.items || []).map(item =>
                                    item.id === itemId ? { ...item, ...changes } : item
                                )
                            };
                        }
                        return p;
                    })
                }
            };
        }

        // --- POS ---
        case ACTION_TYPES.ADD_POS_SALE:
            return {
                ...state,
                config: {
                    ...state.config,
                    posVentas: [action.payload, ...(state.config.posVentas || [])]
                }
            };
        case ACTION_TYPES.IMPORT_WOO_PRODUCTS: {
            const existing = state.config.posProductos || [];
            const incoming = action.payload;
            const merged = upsertPosProducts(existing, incoming);

            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: merged
                }
            };
        }

        case ACTION_TYPES.IMPORT_WOO_ORDERS: {
            const existing = state.config.pedidosOnline || [];
            const newOrders = action.payload.filter(no => !existing.some(eo => eo.wooId === no.wooId));
            return {
                ...state,
                config: {
                    ...state.config,
                    pedidosOnline: [...newOrders, ...existing]
                }
            };
        }

        case ACTION_TYPES.SET_META_ADS_DATA: {
            return {
                ...state,
                config: {
                    ...state.config,
                    metaAdsData: action.payload
                }
            };
        }

        case ACTION_TYPES.SET_WOO_ANALYTICS_DATA: {
            return {
                ...state,
                config: {
                    ...state.config,
                    wooAnalyticsTop: action.payload
                }
            };
        }

        case ACTION_TYPES.SET_MARKETING_CACHE: {
            return {
                ...state,
                config: {
                    ...state.config,
                    marketingCache: {
                        ...(state.config.marketingCache || {}),
                        ...action.payload
                    }
                }
            };
        }

        case ACTION_TYPES.SET_PAGINA_WEB_CACHE: {
            return {
                ...state,
                config: {
                    ...state.config,
                    paginaWebCache: {
                        ...(state.config.paginaWebCache || {}),
                        ...action.payload,
                        productStatsById: {
                            ...((state.config.paginaWebCache || {}).productStatsById || {}),
                            ...(action.payload.productStatsById || {})
                        }
                    }
                }
            };
        }

        case ACTION_TYPES.ADD_POS_EXPENSE:
            return {
                ...state,
                config: {
                    ...state.config,
                    posGastos: [action.payload, ...(state.config.posGastos || [])]
                }
            };
        case ACTION_TYPES.PERFORM_Z_CLOSE:
            return {
                ...state,
                config: {
                    ...state.config,
                    posCerradoZ: [action.payload, ...(state.config.posCerradoZ || [])],
                    posVentas: [],
                    posGastos: []
                }
            };
        case ACTION_TYPES.UPDATE_POS_SETTINGS:
            return {
                ...state,
                config: {
                    ...state.config,
                    posPermissions: { ...(state.config.posPermissions || {}), ...action.payload }
                }
            };
        case ACTION_TYPES.ADD_POS_PRODUCT:
            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: upsertPosProducts(state.config.posProductos || [], [action.payload])
                }
            };
        case ACTION_TYPES.UPDATE_POS_PRODUCT:
            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: (state.config.posProductos || []).map(p =>
                        p.id === action.payload.id ? { ...p, ...action.payload.changes } : p
                    )
                }
            };
        case ACTION_TYPES.IMPORT_POS_PRODUCTS:
            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: upsertPosProducts(state.config.posProductos || [], action.payload)
                }
            };
        case ACTION_TYPES.SAVE_MERCADERIA_CONTEOS: {
            const conteos = action.payload.map((item) => ({
                ...item,
                codigoInterno: normalizeProductCode(item.codigoInterno || item.articulo),
                articulo: normalizeProductCode(item.codigoInterno || item.articulo),
                descripcion: normalizeText(item.descripcion),
                color: normalizeText(item.color),
                taller: normalizeText(item.taller),
                fechaIngreso: normalizeText(item.fechaIngreso),
                cantidadOriginal: Number.parseInt(item.cantidadOriginal || 0, 10) || 0,
                cantidadContada: Number.parseInt(item.cantidadContada || 0, 10) || 0,
                cantidadEllos: Number.parseInt(item.cantidadEllos || 0, 10) || 0,
                fallado: Number.parseInt(item.fallado || 0, 10) || 0
            }));

            const conteoDerivedProducts = Array.from(
                conteos.reduce((map, item) => {
                    const code = normalizeProductCode(item.codigoInterno || item.articulo);
                    if (!code) return map;

                    const current = map.get(code) || {
                        id: item.productId || generateId(),
                        codigoInterno: code,
                        codigoBarras: '',
                        detalleCorto: item.descripcion || code,
                        detalleLargo: '',
                        moneda: 'PESOS',
                        proveedor: item.taller || 'Produccion propia',
                        precioCosto: 0,
                        alertaStockMinimo: 0,
                        precioVentaL1: 0,
                        precioVentaL2: 0,
                        precioVentaL3: 0,
                        precioVentaL4: 0,
                        precioVentaL5: 0,
                        precioVentaWeb: 0,
                        activo: true,
                        stock: 0,
                        stockPorColor: []
                    };

                    const stockDisponible = Math.max(0, item.cantidadContada - item.fallado);
                    current.detalleCorto = item.descripcion || current.detalleCorto;
                    current.proveedor = item.taller || current.proveedor;
                    current.stock += stockDisponible;
                    current.stockPorColor = [...(current.stockPorColor || []), {
                        color: item.color,
                        taller: item.taller,
                        fechaIngreso: item.fechaIngreso,
                        cantidadOriginal: item.cantidadOriginal,
                        cantidadContada: item.cantidadContada,
                        cantidadEllos: item.cantidadEllos,
                        fallado: item.fallado
                    }];
                    map.set(code, current);
                    return map;
                }, new Map()).values()
            );

            const mergedProducts = syncMercaderiaWithProducts(
                upsertPosProducts(state.config.posProductos || [], conteoDerivedProducts),
                conteos
            );

            return {
                ...state,
                config: {
                    ...state.config,
                    mercaderiaConteos: conteos,
                    posProductos: mergedProducts
                }
            };
        }

        // --- Clientes ---
        case ACTION_TYPES.ADD_CLIENTE:
            return {
                ...state,
                config: {
                    ...state.config,
                    clientes: [{ id: generateId(), createdAt: new Date().toISOString(), ...action.payload }, ...(state.config.clientes || [])]
                }
            };

        case ACTION_TYPES.UPDATE_CLIENTE:
            return {
                ...state,
                config: {
                    ...state.config,
                    clientes: (state.config.clientes || []).map(c =>
                        c.id === action.payload.id ? { ...c, ...action.payload.changes } : c
                    )
                }
            };

        case ACTION_TYPES.DELETE_CLIENTE:
            return {
                ...state,
                config: {
                    ...state.config,
                    clientes: (state.config.clientes || []).filter(c => c.id !== action.payload)
                }
            };

        // --- Tareas ---
        case ACTION_TYPES.ADD_TAREA:
            return {
                ...state,
                tareas: [...(state.tareas || []), { id: generateId(), ...action.payload }]
            };

        case ACTION_TYPES.UPDATE_TAREA:
            return {
                ...state,
                tareas: (state.tareas || []).map(t =>
                    t.id === action.payload.id ? { ...t, ...action.payload.changes } : t
                )
            };

        case ACTION_TYPES.DELETE_TAREA:
            return {
                ...state,
                tareas: (state.tareas || []).filter(t => t.id !== action.payload)
            };

        case ACTION_TYPES.SET_DATA:
            return normalizeData(action.payload);

        case ACTION_TYPES.SAVE_RESERVATION: {
            const reservas = state.config.posReservas || [];
            return {
                ...state,
                config: {
                    ...state.config,
                    posReservas: [...reservas, action.payload]
                }
            };
        }

        case ACTION_TYPES.DELETE_RESERVATION: {
            return {
                ...state,
                config: {
                    ...state.config,
                    posReservas: (state.config.posReservas || []).filter(r => r.id !== action.payload)
                }
            };
        }

        default:
            return state;
    }
}

export function DataProvider({ children }) {
    const [state, dispatch] = useReducer(dataReducer, null, () => DEFAULT_DATA);
    const [syncStatus, setSyncStatus] = useState({
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        hasPendingWrites: false,
        pendingChanges: 0,
        lastLocalSaveAt: null,
        lastCloudSaveAt: null,
        lastError: null,
        status: firestoreOfflineReady ? 'Sincronizado' : 'Modo local',
        firestoreOfflineReady
    });
    const isFromFirestore = useRef(false);
    const saveTimeout = useRef(null);
    const initialized = useRef(false);
    const stateRef = useRef(state);
    const justSaved = useRef(false);
    const localChangeTimestamp = useRef(0); // timestamp of last local change
    const pendingCloudSave = useRef(false);
    const pendingChangesCount = useRef(0);

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const updateSyncStatus = useCallback((updates) => {
        setSyncStatus((prev) => {
            const next = { ...prev, ...updates };
            let status = next.status;

            if (!next.online) status = 'Sin internet';
            else if (next.lastError) status = 'Error de sincronizacion';
            else if (next.hasPendingWrites || next.pendingChanges > 0) status = 'Pendiente de sincronizar';
            else if (next.firestoreOfflineReady) status = 'Sincronizado';
            else status = 'Modo local';

            return { ...next, status };
        });
    }, []);

    useEffect(() => {
        const handleOnline = () => updateSyncStatus({ online: true, lastError: null });
        const handleOffline = () => updateSyncStatus({ online: false });

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [updateSyncStatus]);

    // Listen for real-time updates from Firestore (watch the config doc as primary)
    useEffect(() => {
        if (!db) {
            updateSyncStatus({ firestoreOfflineReady: false, status: 'Modo local' });
            return undefined;
        }

        // We listen to the config doc as the "trigger" — when it changes, we reload all docs
        const configRef = doc(db, 'app-data', 'config');
        const unsubscribe = onSnapshot(configRef, { includeMetadataChanges: true }, async (snap) => {
            updateSyncStatus({
                hasPendingWrites: snap.metadata.hasPendingWrites,
                pendingChanges: snap.metadata.hasPendingWrites ? Math.max(pendingChangesCount.current, 1) : 0,
                ...( !snap.metadata.hasPendingWrites && snap.exists() ? { lastCloudSaveAt: new Date().toISOString() } : {} ),
                lastError: null
            });

            // Si nosotros acabamos de guardar, ignorar el echo
            if (justSaved.current && !snap.metadata.hasPendingWrites) {
                justSaved.current = false;
                pendingCloudSave.current = false;
                pendingChangesCount.current = 0;
                updateSyncStatus({
                    hasPendingWrites: false,
                    pendingChanges: 0,
                    lastCloudSaveAt: new Date().toISOString(),
                    lastError: null
                });
            }

            if (snap.metadata.hasPendingWrites) {
                return;
            }

            if (pendingCloudSave.current) {
                console.log('Snapshot ignorado: guardado local pendiente.');
                return;
            }

            // Bloquear snapshots por 3 segundos después de cualquier cambio local
            const timeSinceLocalChange = Date.now() - localChangeTimestamp.current;
            if (initialized.current && timeSinceLocalChange < 15000) {
                console.log(`🛡️ Snapshot ignorado (cambio local hace ${timeSinceLocalChange}ms)`);
                return;
            }

            if (snap.exists()) {
                try {
                    // Load all 4 docs
                    const { loadDataFromFirestore } = await import('./storage');
                    const fullData = await loadDataFromFirestore();

                    // Protección: no sobreescribir si tenemos más datos localmente
                    const localCortes = stateRef.current?.config?.cortes?.length || 0;
                    const remoteCortes = fullData?.config?.cortes?.length || 0;
                    const localMoldes = stateRef.current?.moldes?.length || 0;
                    const remoteMoldes = fullData?.moldes?.length || 0;

                    if (initialized.current && (localCortes > remoteCortes || localMoldes > remoteMoldes)) {
                        console.warn(`⚠️ Firestore tiene menos datos que local. Ignorando.`);
                        return;
                    }

                    isFromFirestore.current = true;
                    dispatch({ type: ACTION_TYPES.SET_DATA, payload: fullData });
                    initialized.current = true;
                } catch (err) {
                    console.error('Error loading split docs:', err);
                }
            } else if (!initialized.current) {
                // Check legacy single doc or localStorage
                try {
                    const { loadDataFromFirestore } = await import('./storage');
                    const data = await loadDataFromFirestore();
                    dispatch({ type: ACTION_TYPES.SET_DATA, payload: data });
                } catch (e) {
                    const localData = loadDataFromLocal();
                    if (localData) dispatch({ type: ACTION_TYPES.SET_DATA, payload: localData });
                }
                initialized.current = true;
            }
        }, (error) => {
            console.error('Firestore listener error:', error);
            updateSyncStatus({ lastError: error.message || 'Error de conexion con Firestore' });
            const localData = loadDataFromLocal();
            if (localData) dispatch({ type: ACTION_TYPES.SET_DATA, payload: localData });
            initialized.current = true;
        });

        return () => unsubscribe();
    }, [updateSyncStatus]);

    // Save to Firestore (debounced) when state changes from local actions
    useEffect(() => {
        if (!state || !initialized.current) return;

        if (isFromFirestore.current) {
            isFromFirestore.current = false;
            return;
        }

        // SIEMPRE guardar a localStorage inmediatamente como backup
        saveDataToLocal(state);
        localChangeTimestamp.current = Date.now();
        pendingCloudSave.current = true;
        pendingChangesCount.current += 1;
        updateSyncStatus({
            lastLocalSaveAt: new Date().toISOString(),
            pendingChanges: pendingChangesCount.current,
            lastError: null
        });

        // Debounce saves to Firestore (800ms)
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(async () => {
            try {
                const currentState = stateRef.current;
                const { saveDataToFirestore } = await import('./storage');
                justSaved.current = true;
                await saveDataToFirestore(currentState);
                if (!navigator.onLine) {
                    updateSyncStatus({
                        pendingChanges: pendingChangesCount.current,
                        hasPendingWrites: true
                    });
                    return;
                }
                pendingCloudSave.current = false;
                pendingChangesCount.current = 0;
                updateSyncStatus({
                    pendingChanges: 0,
                    hasPendingWrites: false,
                    lastCloudSaveAt: new Date().toISOString(),
                    lastError: null
                });
            } catch (err) {
                justSaved.current = false;
                pendingCloudSave.current = true;
                console.error('❌ Error saving to Firestore:', err);
                updateSyncStatus({
                    pendingChanges: pendingChangesCount.current,
                    lastError: err.message || 'No se pudo guardar en la nube'
                });
            }
        }, 800);

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [state, updateSyncStatus]);

    useEffect(() => {
        if (!syncStatus.online || !pendingCloudSave.current || !stateRef.current) return;

        const retryTimer = setTimeout(async () => {
            try {
                const { saveDataToFirestore } = await import('./storage');
                await saveDataToFirestore(stateRef.current);
                pendingCloudSave.current = false;
                pendingChangesCount.current = 0;
                justSaved.current = true;
                updateSyncStatus({
                    pendingChanges: 0,
                    hasPendingWrites: false,
                    lastCloudSaveAt: new Date().toISOString(),
                    lastError: null
                });
            } catch (err) {
                console.error('❌ Error reintentando sincronizacion:', err);
                updateSyncStatus({
                    pendingChanges: pendingChangesCount.current,
                    lastError: err.message || 'No se pudo reintentar la sincronizacion'
                });
            }
        }, 1200);

        return () => clearTimeout(retryTimer);
    }, [syncStatus.online, syncStatus.pendingChanges, updateSyncStatus]);

    const actions = useCallback(() => ({
        addMolde: (data) => dispatch({ type: ACTION_TYPES.ADD_MOLDE, payload: data }),
        updateMolde: (data) => dispatch({ type: ACTION_TYPES.UPDATE_MOLDE, payload: data }),
        deleteMolde: (id) => dispatch({ type: ACTION_TYPES.DELETE_MOLDE, payload: id }),
        moveMolde: (moldeId, newEstado, newOrden) =>
            dispatch({ type: ACTION_TYPES.MOVE_MOLDE, payload: { moldeId, newEstado, newOrden } }),
        reorderMoldes: (orderedIds, columnId) =>
            dispatch({ type: ACTION_TYPES.REORDER_MOLDES, payload: { orderedIds, columnId } }),
        addTela: (data) => dispatch({ type: ACTION_TYPES.ADD_TELA, payload: data }),
        updateTela: (data) => dispatch({ type: ACTION_TYPES.UPDATE_TELA, payload: data }),
        deleteTela: (id) => dispatch({ type: ACTION_TYPES.DELETE_TELA, payload: id }),
        updateConfig: (data) => dispatch({ type: ACTION_TYPES.UPDATE_CONFIG, payload: data }),
        importMoldes: (moldes) => dispatch({ type: ACTION_TYPES.IMPORT_MOLDES, payload: moldes }),
        importTelas: (telas) => dispatch({ type: ACTION_TYPES.IMPORT_TELAS, payload: telas }),
        addImageToMolde: (moldeId, imagen) =>
            dispatch({ type: ACTION_TYPES.ADD_IMAGE_TO_MOLDE, payload: { moldeId, imagen } }),
        removeImageFromMolde: (moldeId, imagenId) =>
            dispatch({ type: ACTION_TYPES.REMOVE_IMAGE_FROM_MOLDE, payload: { moldeId, imagenId } }),
        setCoverImage: (moldeId, imagenId) =>
            dispatch({ type: ACTION_TYPES.SET_COVER_IMAGE, payload: { moldeId, imagenId } }),
        addImageToTela: (telaId, imagen) =>
            dispatch({ type: ACTION_TYPES.ADD_IMAGE_TO_TELA, payload: { telaId, imagen } }),
        removeImageFromTela: (telaId, imagenId) =>
            dispatch({ type: ACTION_TYPES.REMOVE_IMAGE_FROM_TELA, payload: { telaId, imagenId } }),
        addMoldeToCorte: (corteId, moldeId) =>
            dispatch({ type: ACTION_TYPES.ADD_MOLDE_TO_CORTE, payload: { corteId, moldeId } }),
        removeMoldeFromCorte: (corteId, moldeId) =>
            dispatch({ type: ACTION_TYPES.REMOVE_MOLDE_FROM_CORTE, payload: { corteId, moldeId } }),
        updateMoldeInCorte: (corteId, moldeId, changes) =>
            dispatch({ type: ACTION_TYPES.UPDATE_MOLDE_IN_CORTE, payload: { corteId, moldeId, changes } }),
        addPedidoOnline: (data) =>
            dispatch({ type: ACTION_TYPES.ADD_PEDIDO_ONLINE, payload: data }),
        updatePedidoOnlineStatus: (pedidoId, newEstado) =>
            dispatch({ type: ACTION_TYPES.UPDATE_PEDIDO_ONLINE_STATUS, payload: { pedidoId, newEstado } }),
        addPedidoItem: (pedidoId, item) =>
            dispatch({ type: ACTION_TYPES.ADD_PEDIDO_ITEM, payload: { pedidoId, item } }),
        updatePedidoItem: (pedidoId, itemId, changes) =>
            dispatch({ type: ACTION_TYPES.UPDATE_PEDIDO_ITEM, payload: { pedidoId, itemId, changes } }),

        // Tareas actions
        addTarea: (tarea) => dispatch({ type: ACTION_TYPES.ADD_TAREA, payload: tarea }),
        updateTarea: (id, changes) => dispatch({ type: ACTION_TYPES.UPDATE_TAREA, payload: { id, changes } }),
        deleteTarea: (id) => dispatch({ type: ACTION_TYPES.DELETE_TAREA, payload: id }),

        // POS actions
        addPosSale: async (sale) => {
            dispatch({ type: ACTION_TYPES.ADD_POS_SALE, payload: sale });

            const currentConfig = stateRef.current.config;
            // Sync stock to WooCommerce if enabled
            if (currentConfig.marketing?.wooUrl) {
                for (const item of (sale.items || [])) {
                    const product = (currentConfig.posProductos || []).find(p => p.id === item.id);
                    if (product && product.codigoInterno) {
                        try {
                            const newStock = (product.stock || 0) - item.cantidad;
                            await wooService.updateProductStock(currentConfig, product.codigoInterno, newStock);
                        } catch (err) {
                            console.error('Error syncing stock to WooCommerce:', err);
                        }
                    }
                }
            }
        },
        addPosExpense: (expense) => dispatch({ type: ACTION_TYPES.ADD_POS_EXPENSE, payload: expense }),
        performZClose: (zClose) => dispatch({ type: ACTION_TYPES.PERFORM_Z_CLOSE, payload: zClose }),
        updatePosSettings: (settings) => dispatch({ type: ACTION_TYPES.UPDATE_POS_SETTINGS, payload: settings }),
        addPosProduct: (product) => dispatch({ type: ACTION_TYPES.ADD_POS_PRODUCT, payload: product }),
        updatePosProduct: (id, changes) => dispatch({ type: ACTION_TYPES.UPDATE_POS_PRODUCT, payload: { id, changes } }),
        deletePosProduct: (id) => dispatch({ type: ACTION_TYPES.DELETE_POS_PRODUCT, payload: id }),
        importPosProducts: (products) => dispatch({ type: ACTION_TYPES.IMPORT_POS_PRODUCTS, payload: products }),

        fetchWooOrders: async () => {
            const currentConfig = stateRef.current.config;
            try {
                const orders = await wooService.fetchOrders(currentConfig);
                const mapped = orders.map(o => ({
                    id: generateId(),
                    wooId: o.id,
                    cliente: `${o.billing.first_name} ${o.billing.last_name}`,
                    monto: parseFloat(o.total),
                    metodoPago: o.payment_method_title,
                    envio: o.shipping_lines[0]?.method_title || 'N/A',
                    estado: o.status === 'processing' ? 'Pendiente' : o.status,
                    fecha: o.date_created,
                    items: o.line_items.map(li => ({
                        id: generateId(),
                        detalle: li.name,
                        cantidad: li.quantity,
                        precio: parseFloat(li.price)
                    }))
                }));
                dispatch({ type: ACTION_TYPES.IMPORT_WOO_ORDERS, payload: mapped });
                return mapped.length;
            } catch (err) {
                console.error('Error fetching WooCommerce orders:', err);
                throw err;
            }
        },

        fetchWooProducts: async () => {
            const currentConfig = stateRef.current.config;
            try {
                const products = await wooService.fetchProducts(currentConfig);
                const mapped = products.map(p => {
                    const price = parseWooPrice(
                        p.price,
                        p.sale_price,
                        p.regular_price,
                        p.prices?.price,
                        p.prices?.sale_price,
                        p.prices?.regular_price
                    );
                    const regularPrice = parseWooPrice(p.regular_price, p.prices?.regular_price, price);
                    const salePrice = parseWooPrice(p.sale_price, p.prices?.sale_price, price);
                    const displayPrice = salePrice || price || regularPrice;

                    return {
                        id: generateId(),
                        wooId: p.id,
                        codigoInterno: p.sku || '',
                        detalleCorto: p.name || '',
                        detalleLargo: p.short_description?.replace(/<[^>]*>?/gm, '') || '',
                        precioVentaL1: displayPrice,
                        precioVentaL2: regularPrice || displayPrice,
                        precioVentaL3: regularPrice || displayPrice,
                        precioVentaL4: regularPrice || displayPrice,
                        precioVentaL5: regularPrice || displayPrice,
                        precioVentaWeb: displayPrice,
                        stock: p.manage_stock ? (p.stock_quantity || 0) : 999,
                        categoria: p.categories[0]?.name || '',
                        activo: p.status === 'publish',
                        moneda: 'PESOS',
                        proveedor: 'WooCommerce',
                        imagenes: p.images?.map(img => ({ id: img.id, url: img.src })) || [],
                        dimensiones: p.dimensions || {},
                        precioCosto: 0,
                        alertaStockMinimo: 0
                    };
                });
                dispatch({ type: ACTION_TYPES.IMPORT_WOO_PRODUCTS, payload: mapped });
                return mapped.length;
            } catch (err) {
                console.error('Error fetching WooCommerce products:', err);
                throw err;
            }
        },

        fetchWooAnalytics: async () => {
            const currentConfig = stateRef.current.config;
            try {
                const topProducts = await wooService.fetchTopProducts(currentConfig);
                const mapped = topProducts.map(tp => ({
                    productId: tp.product_id,
                    productName: tp.extended_info?.name || 'Producto Desconocido',
                    sku: tp.extended_info?.sku || 'N/A',
                    itemsSold: tp.items_sold,
                    netRevenue: tp.net_revenue,
                    ordersCount: tp.orders_count
                }));
                dispatch({ type: ACTION_TYPES.SET_WOO_ANALYTICS_DATA, payload: mapped });
                return mapped.length;
            } catch (err) {
                // Not totally failing if endpoint doesn't exist, we can handle it in UI
                console.error('Error fetching WooCommerce analytics (might not be installed):', err);
                throw err;
            }
        },

        fetchMetaInsights: async () => {
            const currentConfig = stateRef.current.config;
            try {
                const insights = await metaService.fetchAdInsights(currentConfig);
                dispatch({ type: ACTION_TYPES.SET_META_ADS_DATA, payload: insights });
                return insights;
            } catch (err) {
                console.error('Error fetching Meta Ads insights:', err);
                throw err;
            }
        },

        // Clientes actions
        addCliente: (cliente) => dispatch({ type: ACTION_TYPES.ADD_CLIENTE, payload: cliente }),
        updateCliente: (id, changes) => dispatch({ type: ACTION_TYPES.UPDATE_CLIENTE, payload: { id, changes } }),
        deleteCliente: (id) => dispatch({ type: ACTION_TYPES.DELETE_CLIENTE, payload: id }),
        setMarketingCache: (cache) => dispatch({ type: ACTION_TYPES.SET_MARKETING_CACHE, payload: cache }),
        setPaginaWebCache: (cache) => dispatch({ type: ACTION_TYPES.SET_PAGINA_WEB_CACHE, payload: cache }),
        saveMercaderiaConteos: (conteos) => dispatch({ type: ACTION_TYPES.SAVE_MERCADERIA_CONTEOS, payload: conteos }),

        // Reservas de Ticket
        saveReservation: (reserva) => dispatch({ type: ACTION_TYPES.SAVE_RESERVATION, payload: reserva }),
        deleteReservation: (id) => dispatch({ type: ACTION_TYPES.DELETE_RESERVATION, payload: id }),

        exportBackupNow: () => downloadBackupJSON(stateRef.current),
        setData: (data) => dispatch({ type: ACTION_TYPES.SET_DATA, payload: data }),
    }), []);

    if (!state) return null;

    return (
        <DataContext.Provider value={{ state, syncStatus, ...actions() }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData debe usarse dentro de un DataProvider');
    }
    return context;
}

export default DataContext;
