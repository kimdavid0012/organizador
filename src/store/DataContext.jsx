import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db, firestoreOfflineReady } from './firebase';
import { saveAppDataLocally, initSyncManager } from '../utils/syncManager';
import {
    DEFAULT_DATA,
    loadDataFromLocal,
    loadDataFromIndexedDb,
    loadLatestBackupFromLocal,
    loadProtectedSessionSnapshot,
    loadProtectedSessionSnapshotFromIndexedDb,
    loadPendingLocalChangesFlag,
    saveDataToLocal,
    saveProtectedSessionSnapshot,
    setPendingLocalChangesFlag,
    normalizeData,
    downloadBackupJSON,
    mergeDataPreservingRicherSections
} from './storage';
import { generateId } from '../utils/helpers';
import { wooService } from '../utils/wooService';
import { metaService } from '../utils/metaService';
import { ARTICLE_CODE_PAIRS } from '../data/articleCodePairs';
import YULIYA_INITIAL_DATA from '../data/yuliyaInitialData';

const DataContext = createContext(null);

const normalizeProductCode = (value) => (value || '').toString().trim().toUpperCase();

const normalizeText = (value) => (value || '').toString().trim();
const normalizeComparable = (value) => normalizeText(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
const normalizeArticleCodeKey = (value) => normalizeComparable(value).replace(/^ART(?=\d)/, '');

const ARTICLE_CODE_ALIAS_MAP = ARTICLE_CODE_PAIRS.reduce((map, pair) => {
    const factoryKey = normalizeArticleCodeKey(pair.factory);
    const localKey = normalizeArticleCodeKey(pair.local);
    if (!factoryKey || !localKey) return map;

    if (!map.has(factoryKey)) map.set(factoryKey, new Set());
    if (!map.has(localKey)) map.set(localKey, new Set());

    map.get(factoryKey).add(localKey);
    map.get(localKey).add(factoryKey);
    return map;
}, new Map());

const LOCAL_ARTICLE_KEYS = new Set(
    ARTICLE_CODE_PAIRS
        .map((pair) => normalizeArticleCodeKey(pair.local))
        .filter(Boolean)
);

const countEntries = (value) => Array.isArray(value) ? value.length : 0;

const getCriticalCounts = (data) => ({
    moldes: countEntries(data?.moldes),
    telas: countEntries(data?.telas),
    tareas: countEntries(data?.tareas),
    cortes: countEntries(data?.config?.cortes),
    talleres: countEntries(data?.config?.talleres),
    cortadores: countEntries(data?.config?.cortadores),
    empleados: countEntries(data?.config?.empleados),
    asistencia: countEntries(data?.config?.asistencia),
    pedidosOnline: countEntries(data?.config?.pedidosOnline),
    mercaderiaConteos: countEntries(data?.config?.mercaderiaConteos),
    fotoTasks: countEntries(data?.config?.fotoTasks),
    posProductos: countEntries(data?.config?.posProductos),
    posVentas: countEntries(data?.config?.posVentas),
    posHistorialTickets: countEntries(data?.config?.posHistorialTickets),
    bankPayments: countEntries(data?.config?.bankPayments),
    fabricPayments: countEntries(data?.config?.fabricPayments),
    clientes: countEntries(data?.config?.clientes),
    planillasCortes: countEntries(data?.config?.planillasCortes),
    saldoMovimientos: countEntries(data?.config?.saldoMovimientos)
});

const hasRicherLocalData = (localData, remoteData) => {
    const localCounts = getCriticalCounts(localData);
    const remoteCounts = getCriticalCounts(remoteData);

    return Object.keys(localCounts).some((key) => localCounts[key] > remoteCounts[key]);
};

const getSyncRevision = (data) => Number(data?.config?.syncMeta?.revision || 0);

const stampStateForPersistence = (data, revision, source = 'local') => normalizeData({
    ...data,
    config: {
        ...(data?.config || {}),
        syncMeta: {
            revision,
            updatedAt: new Date().toISOString(),
            source
        }
    }
});

const sanitizeStockBreakdown = (entries = []) =>
    entries
        .map((entry) => ({
            articuloFabrica: normalizeProductCode(entry.articuloFabrica),
            articuloVenta: normalizeProductCode(entry.articuloVenta),
            tipoTela: normalizeText(entry.tipoTela),
            color: normalizeText(entry.color),
            numeroCorte: normalizeText(entry.numeroCorte),
            taller: normalizeText(entry.taller),
            fechaIngreso: normalizeText(entry.fechaIngreso),
            cantidadOriginal: Number.parseInt(entry.cantidadOriginal || 0, 10) || 0,
            cantidadContada: Number.parseInt(entry.cantidadContada || 0, 10) || 0,
            cantidadEllos: Number.parseInt(entry.cantidadEllos || 0, 10) || 0,
            fallado: Number.parseInt(entry.fallado || 0, 10) || 0,
            trajoMuestra: Boolean(entry.trajoMuestra)
        }))
        .filter((entry) => entry.articuloFabrica || entry.articuloVenta || entry.tipoTela || entry.color || entry.numeroCorte || entry.taller || entry.cantidadOriginal || entry.cantidadContada || entry.cantidadEllos || entry.fallado);

const PROTECTED_PRODUCT_FIELDS = new Set([
    'stock', 'stockPorColor', 'articuloVenta', 'articuloFabrica',
    'precioCosto', 'precioVentaL1', 'precioVentaL2', 'precioVentaL3',
    'precioVentaL4', 'precioVentaL5', 'precioVentaWeb',
    'alertaStockMinimo', 'mercaderiaConteos',
    'detalleCorto', 'tela', 'nombre'
]);

const hasValue = (value) => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'number') return value !== 0;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
};

const upsertPosProducts = (existingProducts = [], incomingProducts = [], options = {}) => {
    const { forceOverwrite = false } = options;
    const merged = [...existingProducts];

    let newCount = 0;
    let preservedCount = 0;

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
            if (forceOverwrite) {
                merged[index] = { ...merged[index], ...normalizedIncoming };
            } else {
                // Smart merge: only fill empty fields, never overwrite existing values
                const existing = merged[index];
                const safeMerged = { ...existing };
                Object.keys(normalizedIncoming).forEach((key) => {
                    if (key === 'id') return; // never overwrite id
                    if (PROTECTED_PRODUCT_FIELDS.has(key) && hasValue(existing[key])) return;
                    if (!hasValue(existing[key]) && hasValue(normalizedIncoming[key])) {
                        safeMerged[key] = normalizedIncoming[key];
                    }
                });
                // Always sync wooId so we maintain the link
                if (normalizedIncoming.wooId) safeMerged.wooId = normalizedIncoming.wooId;
                merged[index] = safeMerged;
            }
            preservedCount++;
        } else {
            // Guard: skip entries with clearly invalid/truncated codes.
            // Valid product codes in this system are 4-digit numeric (4xxx/5xxx/6xxx)
            // or alphanumeric. Pure-numeric codes shorter than 4 chars with no
            // articuloVenta are artifacts of corrupted sync data (e.g. "6", "62", "620").
            const ci = (normalizedIncoming.codigoInterno || '').trim();
            const av = (normalizedIncoming.articuloVenta || '').trim();
            if (!av && /^\d+$/.test(ci) && ci.length < 4) {
                console.warn('[upsertPosProducts] Skipping product with truncated code:', ci, normalizedIncoming.detalleCorto || '');
                return;
            }
            merged.push(normalizedIncoming);
            newCount++;
        }
    });

    merged._syncStats = { newCount, preservedCount };
    return merged;
};

const buildProductCodeKeys = (value) => {
    const normalized = normalizeComparable(value);
    const articleKey = normalizeArticleCodeKey(value);
    const keys = new Set([normalized, articleKey].filter(Boolean));

    Array.from(keys).forEach((key) => {
        const aliases = ARTICLE_CODE_ALIAS_MAP.get(key);
        if (!aliases) return;
        aliases.forEach((alias) => keys.add(alias));
    });

    return keys;
};

const countMeaningfulProductFields = (product) => (
    [
        product?.codigoInterno,
        product?.codigoBarras,
        product?.detalleCorto,
        product?.detalleLargo,
        product?.proveedor,
        product?.wooId,
        product?.precioCosto,
        product?.precioVentaL1,
        product?.precioVentaL2,
        product?.precioVentaL3,
        product?.precioVentaL4,
        product?.precioVentaL5,
        product?.precioVentaWeb,
        Array.isArray(product?.imagenes) ? product.imagenes.length : 0,
        Array.isArray(product?.stockPorColor) ? product.stockPorColor.length : 0
    ]
        .filter((value) => {
            if (Array.isArray(value)) return value.length > 0;
            if (typeof value === 'number') return value > 0;
            return Boolean(normalizeText(value));
        })
        .length
);

const scorePosProductRecord = (product) => {
    const stock = Number(product?.stock || 0);
    const codeKeys = buildProductCodeKeys(product?.codigoInterno);
    let score = 0;

    if (stock !== 999) score += 500;
    if (stock > 0 && stock !== 999) score += 40;
    if (Array.isArray(product?.stockPorColor) && product.stockPorColor.length > 0) score += 90;
    if (product?.wooId) score += 40;
    if (product?.codigoBarras) score += 15;
    if (product?.activo) score += 20;
    if (codeKeys.size > 0 && Array.from(codeKeys).some((key) => LOCAL_ARTICLE_KEYS.has(key))) score += 35;
    if (
        Number(product?.precioVentaL1 || 0)
        || Number(product?.precioVentaL2 || 0)
        || Number(product?.precioVentaL3 || 0)
        || Number(product?.precioVentaWeb || 0)
    ) score += 20;

    score += countMeaningfulProductFields(product);
    return score;
};

const mergePosProductGroup = (products = []) => {
    if (products.length <= 1) return products[0];

    const sorted = [...products].sort((left, right) => scorePosProductRecord(right) - scorePosProductRecord(left));
    const merged = { ...sorted[0] };
    const realStockProducts = sorted.filter((item) => Number(item?.stock || 0) !== 999);

    sorted.slice(1).forEach((product) => {
        if (!merged.codigoInterno && product.codigoInterno) merged.codigoInterno = product.codigoInterno;
        if (!merged.codigoBarras && product.codigoBarras) merged.codigoBarras = product.codigoBarras;
        if (!merged.detalleCorto && product.detalleCorto) merged.detalleCorto = product.detalleCorto;
        if (!merged.detalleLargo && product.detalleLargo) merged.detalleLargo = product.detalleLargo;
        if (!merged.proveedor && product.proveedor) merged.proveedor = product.proveedor;
        if (!merged.wooId && product.wooId) merged.wooId = product.wooId;
        if (!merged.imagen && product.imagen) merged.imagen = product.imagen;
        if (!merged.image && product.image) merged.image = product.image;
        if (!merged.thumbnail && product.thumbnail) merged.thumbnail = product.thumbnail;
        if (!merged.imagenBibliotecaId && product.imagenBibliotecaId) merged.imagenBibliotecaId = product.imagenBibliotecaId;
        if (!merged.imagenBibliotecaThumb && product.imagenBibliotecaThumb) merged.imagenBibliotecaThumb = product.imagenBibliotecaThumb;
        if (!merged.articuloVenta && product.articuloVenta) merged.articuloVenta = product.articuloVenta;
        if (!merged.articuloFabrica && product.articuloFabrica) merged.articuloFabrica = product.articuloFabrica;

        if ((!merged.precioCosto || merged.precioCosto === 0) && Number(product.precioCosto || 0) > 0) merged.precioCosto = product.precioCosto;
        if ((!merged.precioVentaL1 || merged.precioVentaL1 === 0) && Number(product.precioVentaL1 || 0) > 0) merged.precioVentaL1 = product.precioVentaL1;
        if ((!merged.precioVentaL2 || merged.precioVentaL2 === 0) && Number(product.precioVentaL2 || 0) > 0) merged.precioVentaL2 = product.precioVentaL2;
        if ((!merged.precioVentaL3 || merged.precioVentaL3 === 0) && Number(product.precioVentaL3 || 0) > 0) merged.precioVentaL3 = product.precioVentaL3;
        if ((!merged.precioVentaL4 || merged.precioVentaL4 === 0) && Number(product.precioVentaL4 || 0) > 0) merged.precioVentaL4 = product.precioVentaL4;
        if ((!merged.precioVentaL5 || merged.precioVentaL5 === 0) && Number(product.precioVentaL5 || 0) > 0) merged.precioVentaL5 = product.precioVentaL5;
        if ((!merged.precioVentaWeb || merged.precioVentaWeb === 0) && Number(product.precioVentaWeb || 0) > 0) merged.precioVentaWeb = product.precioVentaWeb;
    });

    const mergedImages = sorted.flatMap((product) => Array.isArray(product?.imagenes) ? product.imagenes : []);
    if (mergedImages.length) {
        const seen = new Set();
        merged.imagenes = mergedImages.filter((image) => {
            const key = normalizeComparable(image?.url || image?.src || image?.data || image?.id || '');
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const mergedStockBreakdown = sorted.flatMap((product) => Array.isArray(product?.stockPorColor) ? product.stockPorColor : []);
    if (mergedStockBreakdown.length) {
        merged.stockPorColor = sanitizeStockBreakdown(mergedStockBreakdown);
    }

    if (realStockProducts.length > 0) {
        merged.stock = Math.max(...realStockProducts.map((product) => Number(product?.stock || 0)));
    }

    return merged;
};

const attachProductLibraryImages = (products = [], imageLibrary = []) => {
    const libraryByProduct = imageLibrary.reduce((map, image) => {
        const key = normalizeText(image?.productId);
        if (!key) return map;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(image);
        return map;
    }, new Map());

    return products.map((product) => {
        const productImages = libraryByProduct.get(normalizeText(product?.id)) || [];
        const coverImage = productImages.find((image) => image.id === product.imagenBibliotecaId) || productImages[0];
        if (!coverImage) return product;

        return {
            ...product,
            imagenBibliotecaId: product.imagenBibliotecaId || coverImage.id,
            imagenBibliotecaThumb: product.imagenBibliotecaThumb || coverImage.thumbDataUrl || '',
            imagenesArticulo: productImages
        };
    });
};

const dedupePosProducts = (products = []) => {
    if (!Array.isArray(products) || products.length <= 1) return Array.isArray(products) ? products : [];

    const groups = [];

    products.forEach((product) => {
        const codeKeys = buildProductCodeKeys(product?.codigoInterno);
        const detailKey = normalizeComparable(product?.detalleCorto);
        const stock = Number(product?.stock || 0);

        const match = groups.find((group) => {
            const hasCodeOverlap = Array.from(codeKeys).some((key) => group.codeKeys.has(key));
            if (hasCodeOverlap) return true;

            const sameDetailWithGhost = detailKey
                && group.detailKeys.has(detailKey)
                && (stock === 999 || group.hasGhostStock);

            return sameDetailWithGhost;
        });

        if (match) {
            match.products.push(product);
            codeKeys.forEach((key) => match.codeKeys.add(key));
            if (detailKey) match.detailKeys.add(detailKey);
            if (stock === 999) match.hasGhostStock = true;
            return;
        }

        groups.push({
            products: [product],
            codeKeys,
            detailKeys: new Set(detailKey ? [detailKey] : []),
            hasGhostStock: stock === 999
        });
    });

    return groups.map((group) => mergePosProductGroup(group.products));
};

const buildComparableFragments = (value) => {
    const raw = normalizeText(value);
    if (!raw) return [];

    const variants = new Set([raw]);
    const parts = raw
        .split(/[-,/|]/)
        .map((part) => normalizeText(part))
        .filter(Boolean);

    if (parts.length > 1) {
        variants.add(parts[0]);
        variants.add(parts.slice(0, 2).join(' '));
    }

    return Array.from(variants);
};

const buildComparableKeys = (...values) => {
    const keys = new Set();

    values.forEach((value) => {
        buildComparableFragments(value).forEach((fragment) => {
            const normalized = normalizeComparable(fragment);
            if (normalized) keys.add(normalized);

            buildProductCodeKeys(fragment).forEach((codeKey) => {
                if (codeKey) keys.add(codeKey);
            });
        });
    });

    return Array.from(keys);
};

const collectCorteArticleKeys = (molde = {}, item = {}) => buildComparableKeys(
    molde?.codigo,
    molde?.nombre,
    molde?.descripcion,
    molde?.detalleCorto,
    molde?.detalleLargo,
    item?.codigoInterno,
    item?.codigo,
    item?.articuloVenta,
    item?.articulo,
    item?.articuloFabrica,
    item?.articuloCodigo,
    item?.detalleCorto,
    item?.detalle,
    item?.descripcion,
    item?.descripcionArticulo,
    item?.nombre,
    item?.nombreArticulo,
    item?.producto,
    item?.productoNombre
);

const collectProductMatchKeys = (product = {}) => buildComparableKeys(
    product?.codigoInterno,
    product?.codigoBarras,
    product?.detalleCorto,
    product?.detalleLargo,
    product?.descripcion,
    product?.nombre
);

const collectAllSales = (config = {}) => {
    const currentSales = Array.isArray(config?.posVentas) ? config.posVentas : [];
    const closedSales = (Array.isArray(config?.posCerradoZ) ? config.posCerradoZ : [])
        .flatMap((close) => Array.isArray(close?.detalleVentas) ? close.detalleVentas : []);
    const onlineSales = (Array.isArray(config?.pedidosOnline) ? config.pedidosOnline : [])
        .filter((pedido) => pedido?.estado === 'listo')
        .map((pedido) => ({
            id: pedido.id,
            canal: 'online',
            items: Array.isArray(pedido.items) ? pedido.items.map((item) => ({
                id: item.productId || item.id,
                codigoInterno: item.codigoInterno || item.articuloVenta || item.articulo || '',
                detalleCorto: item.detalle || item.descripcion || '',
                cantidad: item.cantidad || 0
            })) : []
        }));
    return [...currentSales, ...closedSales, ...onlineSales];
};

const reconcilePosProductStocks = (products = [], moldes = [], config = {}) => {
    const nextProducts = Array.isArray(products) ? products : [];
    if (!nextProducts.length) return nextProducts;

    const moldeById = new Map((Array.isArray(moldes) ? moldes : []).map((molde) => [molde.id, molde]));
    const producedByKey = new Map();
    const soldByKey = new Map();

    (Array.isArray(config?.cortes) ? config.cortes : []).forEach((corte) => {
        (Array.isArray(corte?.moldesData) ? corte.moldesData : []).forEach((item) => {
            const molde = moldeById.get(item.id);
            const produced = Math.max(0, (Number(item?.cantidad || 0) || 0) - (Number(item?.prendasFalladas || 0) || 0));
            if (!produced) return;

            const keys = collectCorteArticleKeys(molde, item);

            keys.forEach((key) => {
                producedByKey.set(key, (producedByKey.get(key) || 0) + produced);
            });
        });
    });

    collectAllSales(config).forEach((sale) => {
        (Array.isArray(sale?.items) ? sale.items : []).forEach((item) => {
            const quantity = Number(item?.cantidad || 0) || 0;
            if (!quantity) return;

            const product = nextProducts.find((entry) => entry.id === item.id);
            const keys = buildComparableKeys(
                item?.codigoInterno,
                item?.codigo,
                item?.articuloVenta,
                item?.articulo,
                item?.detalleCorto,
                item?.detalle,
                item?.descripcion,
                product?.codigoInterno,
                product?.codigoBarras,
                product?.detalleCorto,
                product?.detalleLargo
            );

            keys.forEach((key) => {
                soldByKey.set(key, (soldByKey.get(key) || 0) + quantity);
            });
        });
    });

    return nextProducts.map((product) => {
        const keys = collectProductMatchKeys(product);
        const produced = keys.reduce((acc, key) => acc + (producedByKey.get(key) || 0), 0);

        if (!produced) return product;

        const sold = keys.reduce((acc, key) => acc + (soldByKey.get(key) || 0), 0);
        return {
            ...product,
            stock: Math.max(0, produced - sold)
        };
    });
};

const withReconciledPosProducts = (config = {}, moldes = []) => {
    const dedupedProducts = dedupePosProducts(config.posProductos || []);
    const reconciledProducts = reconcilePosProductStocks(dedupedProducts, moldes, config);
    return {
        ...config,
        posProductos: attachProductLibraryImages(reconciledProducts, config.imageLibrary || [])
    };
};

const syncMercaderiaWithProducts = (existingProducts = [], mercaderiaConteos = []) => {
    const conteos = Array.isArray(mercaderiaConteos) ? mercaderiaConteos : [];
    const groupedByCode = new Map();

    conteos.forEach((item) => {
        const code = normalizeProductCode(item.articuloVenta || item.codigoInterno || item.articulo);
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
        const articuloFabrica = normalizeProductCode(item.articuloFabrica || item.articulo);
        const articuloVenta = normalizeProductCode(item.articuloVenta || item.codigoInterno || item.articulo);
        const tipoTela = normalizeText(item.tipoTela);
        const taller = normalizeText(item.taller);
        const color = normalizeText(item.color);
        const numeroCorte = normalizeText(item.numeroCorte);
        const fechaIngreso = normalizeText(item.fechaIngreso);
        const cantidadOriginal = Number.parseInt(item.cantidadOriginal || 0, 10) || 0;
        const cantidadContada = Number.parseInt(item.cantidadContada || 0, 10) || 0;
        const cantidadEllos = Number.parseInt(item.cantidadEllos || 0, 10) || 0;
        const fallado = Number.parseInt(item.fallado || 0, 10) || 0;
        const trajoMuestra = Boolean(item.trajoMuestra);
        const stockDisponible = Math.max(0, cantidadContada - fallado);

        if (descripcion) group.detalleCorto = descripcion;
        if (taller) group.proveedor = taller;
        group.stock += stockDisponible;
        group.stockPorColor.push({
            articuloFabrica,
            articuloVenta,
            tipoTela,
            color,
            numeroCorte,
            taller,
            fechaIngreso,
            cantidadOriginal,
            cantidadContada,
            cantidadEllos,
            fallado,
            trajoMuestra,
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

// Infer WooCommerce order traffic source from order metadata
const inferWooOrderSource = (wooOrder) => {
    const via = (wooOrder.created_via || '').toLowerCase();
    if (via === 'instagram' || via === 'ig') return 'Instagram';
    if (via === 'whatsapp' || via === 'wa') return 'WhatsApp';

    const meta = wooOrder.meta_data || [];
    const getMeta = (key) => (meta.find(m => m.key === key)?.value || '').toLowerCase();

    const utmSource = getMeta('_wc_order_attribution_utm_source');
    const utmMedium = getMeta('_wc_order_attribution_utm_medium');
    const sourceType = getMeta('_wc_order_attribution_source_type');
    const referrer = getMeta('_wc_order_attribution_referrer');
    const sessionEntry = getMeta('_wc_order_attribution_session_entry');
    const origin = getMeta('_wc_order_attribution_origin');

    const allAttribution = [utmSource, utmMedium, sourceType, referrer, sessionEntry, origin].join(' ');

    if (allAttribution.includes('instagram') || allAttribution.includes('/ig') ||
        utmSource === 'ig' || utmMedium === 'ig' ||
        referrer.includes('l.instagram.com') || referrer.includes('instagram.com')) return 'Instagram';
    if (allAttribution.includes('facebook') || allAttribution.includes('fb.com') ||
        utmSource === 'fb' || referrer.includes('facebook.com') ||
        referrer.includes('l.facebook.com') || referrer.includes('lm.facebook.com')) return 'Facebook';
    if (allAttribution.includes('whatsapp') || allAttribution.includes('wa.me') ||
        referrer.includes('whatsapp.com') || referrer.includes('wa.me')) return 'WhatsApp';
    if (allAttribution.includes('google') || referrer.includes('google.com') ||
        sourceType === 'organic') return 'Google';
    if (sourceType === 'direct' || sourceType === 'typein') return 'Directo';
    if (sourceType === 'referral') return 'Referido';

    if (via === 'admin') return 'Directo';
    if (via === 'checkout') return 'Web';
    return 'Web';
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
    BULK_DELETE_POS_PRODUCTS: 'BULK_DELETE_POS_PRODUCTS',
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
            return {
                ...state,
                config: withReconciledPosProducts(nextConfig, state.moldes)
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
            const nextConfig = {
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
            };
            return {
                ...state,
                config: withReconciledPosProducts(nextConfig, state.moldes)
            };
        }

        case ACTION_TYPES.REMOVE_MOLDE_FROM_CORTE: {
            const { corteId, moldeId } = action.payload;
            const cortes = state.config.cortes || [];
            const nextConfig = {
                ...state.config,
                cortes: cortes.map(c => {
                    if (c.id === corteId) {
                        const molds = (c.moldesData || []).filter(m => m.id !== moldeId);
                        return { ...c, moldesData: molds, moldeIds: molds.map(m => m.id) };
                    }
                    return c;
                })
            };
            return {
                ...state,
                config: withReconciledPosProducts(nextConfig, state.moldes)
            };
        }

        case ACTION_TYPES.UPDATE_MOLDE_IN_CORTE: {
            const { corteId, moldeId, changes } = action.payload;
            const cortes = state.config.cortes || [];
            const nextConfig = {
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
            };
            return {
                ...state,
                config: withReconciledPosProducts(nextConfig, state.moldes)
            };
        }

        case ACTION_TYPES.ADD_PEDIDO_ONLINE: {
            const newPedido = {
                id: generateId(),
                cliente: action.payload.cliente || '',
                numeroPedido: action.payload.numeroPedido || '',
                fecha: new Date().toISOString(),
                estado: 'pendiente',
                paymentStatus: 'pendiente',
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

            const nextConfig = {
                ...state.config,
                posProductos: updatedPosProductos,
                pedidosOnline: (state.config.pedidosOnline || []).map(p =>
                    p.id === pedidoId ? { ...p, estado: newEstado } : p
                )
            };

            return {
                ...state,
                config: withReconciledPosProducts(nextConfig, state.moldes)
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
                config: withReconciledPosProducts({
                    ...state.config,
                    posVentas: [action.payload, ...(state.config.posVentas || [])],
                    posHistorialTickets: [
                        action.payload,
                        ...((state.config.posHistorialTickets || []).filter((ticket) => ticket?.id !== action.payload?.id))
                    ]
                }, state.moldes)
            };
        case ACTION_TYPES.IMPORT_WOO_PRODUCTS: {
            const existing = state.config.posProductos || [];
            const incoming = action.payload;
            const merged = upsertPosProducts(existing, incoming);
            const stats = merged._syncStats || { newCount: 0, preservedCount: 0 };
            console.log(`✅ Sync protegido: ${stats.preservedCount} productos existentes preservados (precios/stock intactos), ${stats.newCount} nuevos importados`);

            return {
                ...state,
                config: withReconciledPosProducts({
                    ...state.config,
                    posProductos: merged
                }, state.moldes)
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
                config: withReconciledPosProducts({
                    ...state.config,
                    posCerradoZ: [action.payload, ...(state.config.posCerradoZ || [])],
                    posVentas: [],
                    posGastos: []
                }, state.moldes)
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
                    posProductos: upsertPosProducts(state.config.posProductos || [], [action.payload], { forceOverwrite: true })
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
        case ACTION_TYPES.DELETE_POS_PRODUCT:
            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: (state.config.posProductos || []).filter((product) => product.id !== action.payload)
                }
            };
        case ACTION_TYPES.BULK_DELETE_POS_PRODUCTS: {
            const idsToDelete = new Set(action.payload);
            return {
                ...state,
                config: {
                    ...state.config,
                    posProductos: (state.config.posProductos || []).filter((product) => !idsToDelete.has(product.id))
                }
            };
        }
        case ACTION_TYPES.IMPORT_POS_PRODUCTS:
            return {
                ...state,
                config: withReconciledPosProducts({
                    ...state.config,
                    posProductos: upsertPosProducts(state.config.posProductos || [], action.payload, { forceOverwrite: true })
                }, state.moldes)
            };
        case ACTION_TYPES.SAVE_MERCADERIA_CONTEOS: {
            const conteos = action.payload.map((item) => ({
                articuloVenta: normalizeProductCode(item.articuloVenta),
                articuloFabrica: normalizeProductCode(item.articuloFabrica || item.articulo),
                ...item,
                codigoInterno: normalizeProductCode(item.articuloVenta) || normalizeProductCode(item.codigoInterno || item.articuloFabrica || item.articulo),
                articulo: normalizeProductCode(item.articuloFabrica || item.articulo) || normalizeProductCode(item.articuloVenta || item.codigoInterno),
                descripcion: normalizeText(item.descripcion),
                tipoTela: normalizeText(item.tipoTela),
                color: normalizeText(item.color),
                numeroCorte: normalizeText(item.numeroCorte),
                taller: normalizeText(item.taller),
                fechaIngreso: normalizeText(item.fechaIngreso),
                cantidadOriginal: Number.parseInt(item.cantidadOriginal || 0, 10) || 0,
                cantidadContada: Number.parseInt(item.cantidadContada || 0, 10) || 0,
                cantidadEllos: Number.parseInt(item.cantidadEllos || 0, 10) || 0,
                fallado: Number.parseInt(item.fallado || 0, 10) || 0,
                trajoMuestra: Boolean(item.trajoMuestra)
            }));

            const conteoDerivedProducts = Array.from(
                conteos.reduce((map, item) => {
                    const code = normalizeProductCode(item.articuloVenta || item.codigoInterno || item.articulo);
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
                        articuloFabrica: item.articuloFabrica,
                        articuloVenta: item.articuloVenta,
                        tipoTela: item.tipoTela,
                        color: item.color,
                        numeroCorte: item.numeroCorte,
                        taller: item.taller,
                        fechaIngreso: item.fechaIngreso,
                        cantidadOriginal: item.cantidadOriginal,
                        cantidadContada: item.cantidadContada,
                        cantidadEllos: item.cantidadEllos,
                        fallado: item.fallado,
                        trajoMuestra: item.trajoMuestra
                    }];
                    map.set(code, current);
                    return map;
                }, new Map()).values()
            );

            const mergedProducts = syncMercaderiaWithProducts(
                upsertPosProducts(state.config.posProductos || [], conteoDerivedProducts, { forceOverwrite: true }),
                conteos
            );
            const nextConfig = {
                ...state.config,
                mercaderiaConteos: conteos,
                posProductos: mergedProducts
            };

            return {
                ...state,
                config: withReconciledPosProducts(nextConfig, state.moldes)
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

        case ACTION_TYPES.SET_DATA: {
            const normalized = normalizeData(action.payload);
            return {
                ...normalized,
                config: withReconciledPosProducts(normalized.config, normalized.moldes)
            };
        }

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
    const [state, dispatch] = useReducer(
        dataReducer,
        null,
        () => mergeDataPreservingRicherSections(
            loadProtectedSessionSnapshot(),
            loadDataFromLocal(),
            loadLatestBackupFromLocal()
        ) || DEFAULT_DATA
    );
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
    const currentRevisionRef = useRef(getSyncRevision(state));
    const justSaved = useRef(false);
    const lastKnownCloudState = useRef(null);
    const localChangeTimestamp = useRef(0); // timestamp of last local change
    const pendingCloudSave = useRef(false);
    const pendingChangesCount = useRef(0);

    useEffect(() => {
        stateRef.current = state;
        const stateRevision = getSyncRevision(state);
        if (stateRevision > currentRevisionRef.current) {
            currentRevisionRef.current = stateRevision;
        }
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

    const mergeBestLocalState = useCallback((...extraSources) => (
        mergeDataPreservingRicherSections(
            ...extraSources,
            loadProtectedSessionSnapshot(),
            loadDataFromLocal(),
            loadLatestBackupFromLocal()
        )
    ), []);

    const mergeProtectedState = useCallback((...sources) => (
        mergeDataPreservingRicherSections(...sources.filter(Boolean)) || DEFAULT_DATA
    ), []);

    useEffect(() => {
        let cancelled = false;

        const hydrateFromIndexedDb = async () => {
            const indexedState = mergeProtectedState(
                await loadProtectedSessionSnapshotFromIndexedDb(),
                await loadDataFromIndexedDb(),
                stateRef.current
            );
            if (cancelled || !indexedState) return;

            const indexedRevision = getSyncRevision(indexedState);
            const currentRevision = getSyncRevision(stateRef.current);

            if (indexedRevision > currentRevision || hasRicherLocalData(indexedState, stateRef.current)) {
                dispatch({ type: ACTION_TYPES.SET_DATA, payload: indexedState });
                currentRevisionRef.current = indexedRevision;
                initialized.current = true;
                updateSyncStatus({
                    lastLocalSaveAt: indexedState?.config?.syncMeta?.updatedAt || new Date().toISOString(),
                    pendingChanges: loadPendingLocalChangesFlag() ? Math.max(pendingChangesCount.current, 1) : pendingChangesCount.current
                });
            }
        };

        void hydrateFromIndexedDb();

        return () => {
            cancelled = true;
        };
    }, [mergeProtectedState, updateSyncStatus]);

    useEffect(() => {
        const handleOnline = () => updateSyncStatus({ online: true, lastError: null });
        const handleOffline = () => updateSyncStatus({ online: false });

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [mergeBestLocalState, mergeProtectedState, updateSyncStatus]);

    // Init offline sync manager (additive — does not replace Firebase logic)
    useEffect(() => {
        const cleanup = initSyncManager(async (data) => {
            const { saveDataToFirestore } = await import('./storage');
            await saveDataToFirestore(data);
        });
        return cleanup;
    }, []);

    // One-time migration: seed Yuliya initial data into Firestore if not yet loaded
    // Re-triggers if Firestore has fewer than 10 rows (incomplete seed)
    useEffect(() => {
        const YULIYA_FLAG = '_yuliyaDataLoaded';

        const seedYuliya = async () => {
            try {
                const ref = doc(db, 'app-data', 'yuliya');
                const snap = await getDoc(ref);
                const existingRows = snap.exists() ? (snap.data()?.rows?.length ?? 0) : 0;
                if (!snap.exists() || existingRows < 10) {
                    await setDoc(ref, { rows: YULIYA_INITIAL_DATA });
                    console.log('[Yuliya migration] Seeded', YULIYA_INITIAL_DATA.length, 'rows into app-data/yuliya (was', existingRows, ')');
                    localStorage.removeItem(YULIYA_FLAG);
                    localStorage.setItem(YULIYA_FLAG, '1');
                } else {
                    if (!localStorage.getItem(YULIYA_FLAG)) {
                        console.log('[Yuliya migration] Already has', existingRows, 'rows — skipping seed');
                        localStorage.setItem(YULIYA_FLAG, '1');
                    }
                }
            } catch (err) {
                console.warn('[Yuliya migration] Failed:', err.message);
            }
        };

        void seedYuliya();
    }, []);

    useEffect(() => {
        const persistRecoverySnapshot = () => {
            if (!stateRef.current) return;
            const stampedState = stampStateForPersistence(
                stateRef.current,
                Math.max(currentRevisionRef.current, getSyncRevision(stateRef.current)),
                pendingCloudSave.current ? 'local-pending' : 'local'
            );
            try { saveDataToLocal(stampedState); } catch (e) { console.warn('localStorage save failed:', e.message); }
            saveProtectedSessionSnapshot(stampedState);
            setPendingLocalChangesFlag(Boolean(pendingCloudSave.current || pendingChangesCount.current > 0));
        };

        const handlePageHide = () => {
            persistRecoverySnapshot();
        };

        const handleBeforeUnload = (event) => {
            persistRecoverySnapshot();

            if (pendingCloudSave.current || pendingChangesCount.current > 0) {
                const warning = 'Hay cambios pendientes de sincronizar. Espera unos segundos antes de cerrar o actualizar.';
                event.preventDefault();
                event.returnValue = warning;
                return warning;
            }

            return undefined;
        };

        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Listen for real-time updates from Firestore (watch the config doc as primary)
    useEffect(() => {
        if (!db) {
            const localData = mergeBestLocalState();
            if (localData) {
                currentRevisionRef.current = getSyncRevision(localData);
                dispatch({ type: ACTION_TYPES.SET_DATA, payload: localData });
                initialized.current = true;
                updateSyncStatus({
                    lastLocalSaveAt: localData?.config?.syncMeta?.updatedAt || new Date().toISOString(),
                    pendingChanges: loadPendingLocalChangesFlag() ? Math.max(pendingChangesCount.current, 1) : pendingChangesCount.current
                });
            }
            updateSyncStatus({ firestoreOfflineReady: false, status: 'Modo local' });
            return undefined;
        }

        const startupLocalData = mergeBestLocalState();
        if (startupLocalData) {
            currentRevisionRef.current = getSyncRevision(startupLocalData);
            dispatch({ type: ACTION_TYPES.SET_DATA, payload: startupLocalData });
            initialized.current = true;
            updateSyncStatus({
                lastLocalSaveAt: startupLocalData?.config?.syncMeta?.updatedAt || new Date().toISOString(),
                pendingChanges: loadPendingLocalChangesFlag() ? Math.max(pendingChangesCount.current, 1) : pendingChangesCount.current
            });
        }

        // We listen to the config doc as the "trigger" — when it changes, we reload all docs
        const configRef = doc(db, 'app-data', 'config');
        const ECHO_WINDOW_MS = 5000; // Ignore echoes within 5s of our save

        const unsubscribe = onSnapshot(configRef, { includeMetadataChanges: true }, async (snap) => {
            updateSyncStatus({
                hasPendingWrites: snap.metadata.hasPendingWrites,
                pendingChanges: snap.metadata.hasPendingWrites ? Math.max(pendingChangesCount.current, 1) : 0,
                ...( !snap.metadata.hasPendingWrites && snap.exists() ? { lastCloudSaveAt: new Date().toISOString() } : {} ),
                lastError: null
            });

            // If this snapshot is our own pending write still being confirmed, skip
            if (snap.metadata.hasPendingWrites) {
                return;
            }

            // Detect echo of our own save: if we just saved and the revision matches
            // what we wrote, this is our echo — acknowledge it and move on
            if (justSaved.current) {
                const timeSinceLocalChange = Date.now() - (localChangeTimestamp.current || 0);
                const remoteRev = snap.exists() ? Number(snap.data()?.config?.syncMeta?.revision || 0) : 0;
                if (timeSinceLocalChange < ECHO_WINDOW_MS && remoteRev <= currentRevisionRef.current) {
                    // This is the echo of our own save
                    justSaved.current = false;
                    pendingCloudSave.current = false;
                    pendingChangesCount.current = 0;
                    updateSyncStatus({
                        hasPendingWrites: false,
                        pendingChanges: 0,
                        lastCloudSaveAt: new Date().toISOString(),
                        lastError: null
                    });
                    setPendingLocalChangesFlag(false);
                    console.log(`[Sync] Echo de nuestro guardado (rev ${remoteRev}) — ignorado`);
                    return;
                }
                // If revision is higher, it's a REAL remote change that arrived — don't skip!
                justSaved.current = false;
            }

            if (snap.exists()) {
                try {
                    // Load all split docs from Firebase
                    const { loadDataFromFirestore } = await import('./storage');
                    const fullData = await loadDataFromFirestore();
                    const remoteRevision = getSyncRevision(fullData);

                    // ALWAYS accept remote data — Firebase is the source of truth
                    // If we have pending local changes, merge them ON TOP of remote
                    // Remote wins for existing data; local only adds what remote doesn't have
                    lastKnownCloudState.current = fullData;

                    if (pendingCloudSave.current && stateRef.current) {
                        // We have unsaved local changes — LOCAL state wins (user just made changes)
                        // Accept remote revision number but keep local data
                        console.log(`[Sync] Cambio remoto (rev ${remoteRevision}) — pero hay cambios locales pendientes, local gana`);
                        currentRevisionRef.current = Math.max(currentRevisionRef.current, remoteRevision);
                        // Don't dispatch — keep local state, the pending save will push it to Firestore
                    } else {
                        // No pending local changes — accept remote data directly
                        console.log(`[Sync] Cambio remoto aceptado (rev ${remoteRevision})`);
                        isFromFirestore.current = true;
                        dispatch({ type: ACTION_TYPES.SET_DATA, payload: fullData });
                        saveAppDataLocally(fullData).catch(() => {});
                        currentRevisionRef.current = remoteRevision;
                        pendingChangesCount.current = 0;
                        updateSyncStatus({
                            pendingChanges: 0,
                            hasPendingWrites: false,
                            lastCloudSaveAt: new Date().toISOString(),
                            lastError: null
                        });
                        setPendingLocalChangesFlag(false);
                    }

                    initialized.current = true;
                } catch (err) {
                    console.error('Error loading split docs:', err);
                }
            } else if (!initialized.current) {
                // Check legacy single doc or localStorage
                try {
                    const { loadDataFromFirestore } = await import('./storage');
                    const data = await loadDataFromFirestore();
                    lastKnownCloudState.current = data;
                    dispatch({ type: ACTION_TYPES.SET_DATA, payload: mergeProtectedState(data, mergeBestLocalState()) });
                } catch (e) {
                    const localData = mergeBestLocalState();
                    if (localData) dispatch({ type: ACTION_TYPES.SET_DATA, payload: localData });
                }
                initialized.current = true;
            }
        }, (error) => {
            console.error('Firestore listener error:', error);
            updateSyncStatus({ lastError: error.message || 'Error de conexion con Firestore' });
            const localData = mergeBestLocalState();
            if (localData) dispatch({ type: ACTION_TYPES.SET_DATA, payload: localData });
            initialized.current = true;
        });

        return () => unsubscribe();
    }, [updateSyncStatus]);

    // Save to Firestore (debounced) when state changes from local actions
    useEffect(() => {
        if (!state || !initialized.current) return;

        if (isFromFirestore.current) {
            console.log('[DataContext] State change from Firestore — skip save');
            isFromFirestore.current = false;
            return;
        }

        console.log('[DataContext] Local state change — queuing save (rev:', currentRevisionRef.current + 1, ')');

        // SIEMPRE guardar a localStorage inmediatamente como backup
        const nextRevision = currentRevisionRef.current + 1;
        currentRevisionRef.current = nextRevision;
        // DO NOT merge with lastKnownCloudState — local state IS the source of truth after a local change
        const persistableState = stampStateForPersistence(state, nextRevision, 'local');
        try { saveDataToLocal(persistableState); } catch (localErr) { console.warn('localStorage backup failed (non-critical):', localErr.message); }
        try { saveProtectedSessionSnapshot(persistableState); } catch (snapErr) { console.warn('Session snapshot failed (non-critical):', snapErr.message); }
        saveAppDataLocally(persistableState).catch(() => {});
        localChangeTimestamp.current = Date.now();
        pendingCloudSave.current = true;
        pendingChangesCount.current += 1;
        setPendingLocalChangesFlag(true);
        updateSyncStatus({
            lastLocalSaveAt: persistableState.config?.syncMeta?.updatedAt || new Date().toISOString(),
            pendingChanges: pendingChangesCount.current,
            lastError: null
        });

        // Debounce saves to Firestore (800ms)
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(async () => {
            try {
                // Save current state AS-IS to Firestore — no merging with cloud
                const currentState = stampStateForPersistence(
                    stateRef.current,
                    currentRevisionRef.current,
                    'cloud'
                );
                const { saveDataToFirestore } = await import('./storage');
                console.log('[DataContext] Saving to Firestore — revision:', currentRevisionRef.current);
                justSaved.current = true;
                await saveDataToFirestore(currentState);
                console.log('[DataContext] Firestore save OK — revision:', currentRevisionRef.current);
                lastKnownCloudState.current = currentState;
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
                setPendingLocalChangesFlag(false);
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
                const retryState = stampStateForPersistence(
                    stateRef.current,
                    currentRevisionRef.current,
                    'cloud'
                );
                await saveDataToFirestore(retryState);
                lastKnownCloudState.current = retryState;
                pendingCloudSave.current = false;
                pendingChangesCount.current = 0;
                justSaved.current = true;
                updateSyncStatus({
                    pendingChanges: 0,
                    hasPendingWrites: false,
                    lastCloudSaveAt: new Date().toISOString(),
                    lastError: null
                });
                setPendingLocalChangesFlag(false);
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
        bulkDeletePosProducts: (ids) => dispatch({ type: ACTION_TYPES.BULK_DELETE_POS_PRODUCTS, payload: ids }),
        importPosProducts: (products) => dispatch({ type: ACTION_TYPES.IMPORT_POS_PRODUCTS, payload: products }),

        fetchWooOrders: async () => {
            const currentConfig = stateRef.current.config;
            try {
                const orders = await wooService.fetchOrders(currentConfig);
                let productImageMap = new Map();
                try {
                    const products = await wooService.fetchProducts(currentConfig);
                    productImageMap = new Map(products.map((product) => [product.id, product.images?.[0]?.src || '']));
                } catch (error) {
                    console.warn('No se pudieron cargar imagenes de WooCommerce para pedidos:', error);
                }
                const mapped = orders.map(o => ({
                    id: generateId(),
                    wooId: o.id,
                    customer_id: o.customer_id || '',
                    cliente: `${o.billing.first_name} ${o.billing.last_name}`,
                    monto: parseFloat(o.total),
                    metodoPago: o.payment_method_title,
                    envio: o.shipping_lines[0]?.method_title || 'N/A',
                    estado: o.status === 'processing' ? 'pendiente' : (o.status === 'completed' ? 'listo' : 'pendiente'),
                    paymentStatus: o.status === 'completed' ? 'aprobado' : (o.date_paid ? 'aprobado' : 'pendiente'),
                    fecha: o.date_created,
                    origen: inferWooOrderSource(o),
                    items: o.line_items.map(li => ({
                        id: generateId(),
                        productId: li.product_id || null,
                        detalle: li.name,
                        cantidad: li.quantity,
                        precio: parseFloat(li.price),
                        imagen: li.image?.src || productImageMap.get(li.product_id) || '',
                        comentario: '',
                        estado: 'ok'
                    }))
                }));
                dispatch({ type: ACTION_TYPES.IMPORT_WOO_ORDERS, payload: mapped });
                return mapped.length;
            } catch (err) {
                console.error('Error fetching WooCommerce orders:', err);
                throw err;
            }
        },

        // Re-sync order sources from WooCommerce for existing orders
        resyncOrderSources: async () => {
            const currentConfig = stateRef.current.config;
            const existingOrders = currentConfig.pedidosOnline || [];
            const wooOrders = existingOrders.filter(p => p.wooId);
            if (!wooOrders.length) return 0;

            try {
                const fetched = await wooService.fetchOrders(currentConfig);
                const byWooId = new Map(fetched.map(o => [o.id, o]));
                let updatedCount = 0;

                const updated = existingOrders.map(p => {
                    if (!p.wooId) return p;
                    const wooData = byWooId.get(p.wooId);
                    if (!wooData) return p;
                    const newOrigen = inferWooOrderSource(wooData);
                    if (newOrigen !== p.origen) {
                        updatedCount++;
                        return { ...p, origen: newOrigen };
                    }
                    return p;
                });

                if (updatedCount > 0) {
                    dispatch({ type: 'UPDATE_CONFIG', payload: { pedidosOnline: updated } });
                }
                return updatedCount;
            } catch (err) {
                console.error('Error re-syncing order sources:', err);
                throw err;
            }
        },

        // One-time price migration — April 2026
        runPriceMigration2026April: () => {
            const currentConfig = stateRef.current.config;
            if (currentConfig._priceMigration2026April) return; // Already done

            const priceUpdates = {
                '6000': { precioVentaL1: 4800, precioVentaL2: 5500 },
                '6001': { precioVentaL1: 4900, precioVentaL2: 5700 },
                '6002': { precioVentaL1: 5195, precioVentaL2: 5900 },
                '6003': { precioVentaL1: 6100, precioVentaL2: 6900 },
                '6004': { precioVentaL1: 5500, precioVentaL2: 6100 },
                '6005': { precioVentaL1: 6000, precioVentaL2: 6800 },
                '6008': { precioVentaL1: 7500, precioVentaL2: 8500 },
                '6009': { precioVentaL1: 8200, precioVentaL2: 9200 },
                '6010': { precioVentaL1: 8200, precioVentaL2: 9200 },
                '6011': { precioVentaL1: 8200, precioVentaL2: 9200 },
                '6300': { precioVentaL1: 14000, precioVentaL2: 17000 },
                '6301': { precioVentaL1: 16000, precioVentaL2: 19000 },
                '6302': { precioVentaL1: 14000, precioVentaL2: 17000 },
                '6303': { precioVentaL1: 12000, precioVentaL2: 15000 },
                '6304': { precioVentaL1: 15000, precioVentaL2: 19000 },
                '6305': { precioVentaL1: 17000, precioVentaL2: 20000 },
                '6306': { precioVentaL1: 14500, precioVentaL2: 18000 },
                '6307': { precioVentaL1: 18250, precioVentaL2: 21000 },
                '6308': { precioVentaL1: 12500, precioVentaL2: 15000 },
                '6309': { precioVentaL1: 8200, precioVentaL2: 11000 },
                '6310': { precioVentaL1: 8200, precioVentaL2: 11000 },
                '6200': { precioVentaL1: 10000, precioVentaL2: 11000 },
                '6201': { precioVentaL1: 9500, precioVentaL2: 11500 },
                '6202': { precioVentaL1: 6000, precioVentaL2: 8000 },
                '6203': { precioVentaL1: 7500, precioVentaL2: 9500 },
                '6204': { precioVentaL1: 6000, precioVentaL2: 7000 },
                '6205': { precioVentaL1: 7500, precioVentaL2: 9500 },
                '6206': { precioVentaL1: 11000, precioVentaL2: 13500 },
                '6207': { precioVentaL1: 9500, precioVentaL2: 11200 },
                '6208': { precioVentaL1: 11000, precioVentaL2: 13900 },
                '6209': { precioVentaL1: 5500, precioVentaL2: 8000 },
                '6210': { precioVentaL1: 8500, precioVentaL2: 11500 },
                '6212': { precioVentaL1: 5500, precioVentaL2: 7000 },
                '6213': { precioVentaL1: 10000, precioVentaL2: 13000 },
                '4015': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4016': { precioVentaL1: 5000, precioVentaL2: 5600 },
                '4017': { precioVentaL1: 5000, precioVentaL2: 5600 },
                '4524': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4526': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4527': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4630': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4651': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4542': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4543': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4545': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4547': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4548': { precioVentaL1: 7000, precioVentaL2: 8000 },
                '4540': { precioVentaL1: 1000, precioVentaL2: 1200 },
                '4541': { precioVentaL1: 7000, precioVentaL2: 8000 },
            };

            const products = currentConfig.posProductos || [];
            let updatedCount = 0;
            const updatedProducts = products.map(p => {
                const code = (p.articuloVenta || p.codigoInterno || '').toString().replace(/\D/g, '');
                if (priceUpdates[code]) {
                    updatedCount++;
                    return { ...p, ...priceUpdates[code] };
                }
                return p;
            });

            if (updatedCount > 0) {
                dispatch({
                    type: 'UPDATE_CONFIG',
                    payload: {
                        posProductos: updatedProducts,
                        _priceMigration2026April: true
                    }
                });
                console.log(`✅ Price migration: updated ${updatedCount} products`);
            } else {
                dispatch({ type: 'UPDATE_CONFIG', payload: { _priceMigration2026April: true } });
                console.log('Price migration: no matching products found');
            }
        },

        // Third migration — ensure ALL L2 prices are higher than L1
        runPriceMigrationL2Uniform: () => {
            const currentConfig = stateRef.current.config;
            if (currentConfig._priceMigrationL2Uniform_2026April) return;

            const products = currentConfig.posProductos || [];
            let updatedCount = 0;
            const updatedProducts = products.map(p => {
                const l1 = Number(p.precioVentaL1 || 0);
                const l2 = Number(p.precioVentaL2 || 0);
                if (l1 > 0 && l2 <= l1) {
                    updatedCount++;
                    return { ...p, precioVentaL2: Math.round(l1 * 1.15) };
                }
                return p;
            });

            if (updatedCount > 0) {
                dispatch({
                    type: 'UPDATE_CONFIG',
                    payload: {
                        posProductos: updatedProducts,
                        _priceMigrationL2Uniform_2026April: true
                    }
                });
                console.log(`✅ L2 uniform migration: fixed ${updatedCount} products where L2 ≤ L1`);
            } else {
                dispatch({ type: 'UPDATE_CONFIG', payload: { _priceMigrationL2Uniform_2026April: true } });
                console.log('L2 uniform migration: all L2 prices already above L1');
            }
        },

        // Second migration — fix L2 prices that didn't apply
        runPriceMigrationL2Fix: () => {
            const currentConfig = stateRef.current.config;
            if (currentConfig._priceMigrationL2Fix_2026April) return;

            const l2Prices = {
                '6000': 5500, '6001': 5700, '6002': 5900, '6003': 6900,
                '6004': 6100, '6005': 6800, '6008': 8500, '6009': 9200,
                '6010': 9200, '6011': 9200, '6300': 17000, '6301': 19000,
                '6302': 17000, '6303': 15000, '6304': 19000, '6305': 20000,
                '6306': 18000, '6307': 21000, '6308': 15000, '6309': 11000,
                '6310': 11000, '6200': 11000, '6201': 11500, '6202': 8000,
                '6203': 9500, '6204': 7000, '6205': 9500, '6206': 13500,
                '6207': 11200, '6208': 13900, '6209': 8000, '6210': 11500,
                '6212': 7000, '6213': 13000, '4015': 8000, '4016': 5600,
                '4017': 5600, '4524': 8000, '4526': 8000, '4527': 8000,
                '4630': 8000, '4651': 8000, '4542': 8000, '4543': 8000,
                '4545': 8000, '4547': 8000, '4548': 8000, '4540': 1200,
                '4541': 8000
            };

            const products = currentConfig.posProductos || [];
            let updatedCount = 0;
            const updatedProducts = products.map(p => {
                const code = (p.articuloVenta || p.codigoInterno || '').toString().replace(/\D/g, '');
                if (l2Prices[code] && Number(p.precioVentaL2 || 0) !== l2Prices[code]) {
                    updatedCount++;
                    return { ...p, precioVentaL2: l2Prices[code] };
                }
                return p;
            });

            if (updatedCount > 0) {
                dispatch({
                    type: 'UPDATE_CONFIG',
                    payload: {
                        posProductos: updatedProducts,
                        _priceMigrationL2Fix_2026April: true
                    }
                });
                console.log(`✅ L2 price fix migration: updated ${updatedCount} products`);
            } else {
                dispatch({ type: 'UPDATE_CONFIG', payload: { _priceMigrationL2Fix_2026April: true } });
                console.log('L2 price fix migration: all L2 prices already correct or no matches');
            }
        },

        // Third migration — force-reset ALL L2 prices for 6xxx products (overrides previous migrations)
        runPriceMigrationL2Force: () => {
            const currentConfig = stateRef.current.config;
            if (currentConfig._priceMigrationL2Force_2026April) return;

            const priceFix = {
                '6000': { precioVentaL1: 4800, precioVentaL2: 5500 },
                '6001': { precioVentaL1: 4900, precioVentaL2: 5700 },
                '6002': { precioVentaL1: 5195, precioVentaL2: 5900 },
                '6003': { precioVentaL1: 6100, precioVentaL2: 6900 },
                '6004': { precioVentaL1: 5500, precioVentaL2: 6100 },
                '6005': { precioVentaL1: 6000, precioVentaL2: 6800 },
                '6008': { precioVentaL1: 7500, precioVentaL2: 8500 },
                '6009': { precioVentaL1: 8200, precioVentaL2: 9200 },
                '6010': { precioVentaL1: 8200, precioVentaL2: 9200 },
                '6011': { precioVentaL1: 8200, precioVentaL2: 9200 },
                '6300': { precioVentaL1: 14000, precioVentaL2: 17000 },
                '6301': { precioVentaL1: 16000, precioVentaL2: 19000 },
                '6302': { precioVentaL1: 14000, precioVentaL2: 17000 },
                '6303': { precioVentaL1: 12000, precioVentaL2: 15000 },
                '6304': { precioVentaL1: 15000, precioVentaL2: 19000 },
                '6305': { precioVentaL1: 17000, precioVentaL2: 20000 },
                '6306': { precioVentaL1: 14500, precioVentaL2: 18000 },
                '6307': { precioVentaL1: 18250, precioVentaL2: 21000 },
                '6308': { precioVentaL1: 12500, precioVentaL2: 15000 },
                '6309': { precioVentaL1: 8200, precioVentaL2: 11000 },
                '6310': { precioVentaL1: 8200, precioVentaL2: 11000 },
                '6200': { precioVentaL1: 10000, precioVentaL2: 11000 },
                '6201': { precioVentaL1: 9500, precioVentaL2: 11500 },
                '6202': { precioVentaL1: 6000, precioVentaL2: 8000 },
                '6203': { precioVentaL1: 7500, precioVentaL2: 9500 },
                '6204': { precioVentaL1: 6000, precioVentaL2: 7000 },
                '6205': { precioVentaL1: 7500, precioVentaL2: 9500 },
                '6206': { precioVentaL1: 11000, precioVentaL2: 13500 },
                '6207': { precioVentaL1: 9500, precioVentaL2: 11200 },
                '6208': { precioVentaL1: 11000, precioVentaL2: 13900 },
                '6209': { precioVentaL1: 5500, precioVentaL2: 8000 },
                '6210': { precioVentaL1: 8500, precioVentaL2: 11500 },
                '6212': { precioVentaL1: 5500, precioVentaL2: 7000 },
                '6213': { precioVentaL1: 10000, precioVentaL2: 13000 },
            };

            const products = currentConfig.posProductos || [];
            let updatedCount = 0;
            const updatedProducts = products.map(p => {
                const code = (p.codigoInterno || p.articuloVenta || '').toString().trim().replace(/\D/g, '');
                const fix = priceFix[code];
                if (fix) {
                    const changed = Number(p.precioVentaL1) !== fix.precioVentaL1 || Number(p.precioVentaL2) !== fix.precioVentaL2;
                    if (changed) updatedCount++;
                    return { ...p, precioVentaL1: fix.precioVentaL1, precioVentaL2: fix.precioVentaL2 };
                }
                return p;
            });

            dispatch({
                type: 'UPDATE_CONFIG',
                payload: {
                    posProductos: updatedProducts,
                    _priceMigrationL2Force_2026April: true
                }
            });
            console.log(`✅ L2 force migration: updated ${updatedCount} products`);
        },

        // Fourth migration — fix 4xxx products where L2 was incorrectly set equal to L1
        runPriceMigrationL2Fix2: () => {
            const currentConfig = stateRef.current.config;
            if (currentConfig._priceMigrationL2Fix2_2026April) return;

            const l2Corrections = {
                '4015': 8000, '4524': 8000, '4526': 8000, '4527': 8000,
                '4630': 8000, '4651': 8000, '4542': 8000, '4543': 8000,
                '4545': 8000, '4540': 1200, '4541': 8000
            };

            const products = currentConfig.posProductos || [];
            let updatedCount = 0;
            const updatedProducts = products.map(p => {
                const code = (p.articuloVenta || p.codigoInterno || '').toString().replace(/\D/g, '');
                if (l2Corrections[code] && Number(p.precioVentaL2 || 0) !== l2Corrections[code]) {
                    updatedCount++;
                    return { ...p, precioVentaL2: l2Corrections[code] };
                }
                return p;
            });

            if (updatedCount > 0) {
                dispatch({
                    type: 'UPDATE_CONFIG',
                    payload: {
                        posProductos: updatedProducts,
                        _priceMigrationL2Fix2_2026April: true
                    }
                });
                console.log(`✅ L2 price fix2 migration: updated ${updatedCount} products with correct L2 > L1 values`);
            } else {
                dispatch({ type: 'UPDATE_CONFIG', payload: { _priceMigrationL2Fix2_2026April: true } });
                console.log('L2 price fix2 migration: all L2 prices already correct or no matches');
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
                        articuloVenta: p.sku || '',
                        articuloFabrica: '',
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
                // Pre-compute sync stats before dispatching
                const existingProducts = stateRef.current.config.posProductos || [];
                const preview = upsertPosProducts(existingProducts, mapped);
                const stats = preview._syncStats || { newCount: mapped.length, preservedCount: 0 };
                dispatch({ type: ACTION_TYPES.IMPORT_WOO_PRODUCTS, payload: mapped });
                return stats;
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

        forceSaveNow: async () => {
            if (!stateRef.current) return false;
            try {
                const { saveDataToFirestore } = await import('./storage');
                const currentState = stampStateForPersistence(
                    stateRef.current,
                    currentRevisionRef.current,
                    'cloud'
                );
                console.log('[forceSaveNow] Saving to Firestore immediately...');
                await saveDataToFirestore(currentState);
                lastKnownCloudState.current = currentState;
                pendingCloudSave.current = false;
                pendingChangesCount.current = 0;
                setPendingLocalChangesFlag(false);
                updateSyncStatus({
                    pendingChanges: 0,
                    hasPendingWrites: false,
                    lastCloudSaveAt: new Date().toISOString(),
                    lastError: null
                });
                console.log('[forceSaveNow] Firestore save OK');
                return true;
            } catch (err) {
                console.error('[forceSaveNow] Error:', err);
                updateSyncStatus({ lastError: err.message || 'Error al guardar' });
                return false;
            }
        },
        exportBackupNow: () => downloadBackupJSON(stateRef.current),
        recoverRicherLocalData: async () => {
            const beforeCounts = getCriticalCounts(stateRef.current);
            const recoveredState = mergeProtectedState(
                stateRef.current,
                await loadProtectedSessionSnapshotFromIndexedDb(),
                await loadDataFromIndexedDb(),
                mergeBestLocalState(),
                lastKnownCloudState.current
            );
            const afterCounts = getCriticalCounts(recoveredState);
            const recovered = hasRicherLocalData(recoveredState, stateRef.current)
                || getSyncRevision(recoveredState) > getSyncRevision(stateRef.current);

            if (recovered) {
                currentRevisionRef.current = Math.max(currentRevisionRef.current, getSyncRevision(recoveredState));
                localChangeTimestamp.current = Date.now();
                initialized.current = true;
                dispatch({ type: ACTION_TYPES.SET_DATA, payload: recoveredState });
            }

            return { recovered, beforeCounts, afterCounts };
        },
        setData: (data) => dispatch({ type: ACTION_TYPES.SET_DATA, payload: data }),
    }), [mergeBestLocalState, mergeProtectedState]);

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
