import React, { useMemo, useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Minimize2, Maximize2, Mic, MicOff } from 'lucide-react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import { useI18n } from '../store/I18nContext';
import { generateId } from '../utils/helpers';

const DEFAULT_GREETING = {
    es: 'Hola, soy CELA IA. Te guío dentro del sistema y también puedo hacer acciones por vos. Pedime ayuda con cortes, talleres, pedidos online, clientes, telas, POS, banco/MP, mesan o conteo de mercadería.',
    ru: 'Привет, я CELA IA. Я могу объяснить, как usar el sistema, и también ejecutar acciones por vos dentro de la app.',
    ko: '안녕하세요, CELA IA입니다. 시스템에서 무엇을 해야 하는지 안내하고, 필요하면 앱 안에서 작업도 실행할 수 있어요.'
};

const ADMIN_ASSISTANT_ACTIONS = new Set(['addMolde', 'addCliente', 'addTarea', 'addTela', 'addPosProduct', 'addCorte', 'addExpense', 'updateConfig']);
const NADIA_ASSISTANT_ACTIONS = new Set(['addCliente', 'addTarea']);
const NADIA_EMAIL = 'nadia@celavie.com';
const DEFAULT_EMPLOYEES = [
    { id: 'emp-nadia', nombre: 'Nadia', puesto: 'Encargada' },
    { id: 'emp-juan', nombre: 'Juan', puesto: 'Pedidos Online' },
    { id: 'emp-naara', nombre: 'Naara', puesto: 'Deposito' },
    { id: 'emp-rocio', nombre: 'Rocio', puesto: 'Fotos y Atencion' }
];

const getNormalizedEmail = (user) => (user?.email || '').toLowerCase().trim();

const canAccessAssistant = (user, originalAdmin) => {
    const email = getNormalizedEmail(user);
    return user?.role === 'admin' || Boolean(originalAdmin) || email === NADIA_EMAIL;
};

const getAllowedAssistantActions = (user, state) => {
    const email = getNormalizedEmail(user);
    if (user?.role === 'admin') return new Set(ADMIN_ASSISTANT_ACTIONS);
    if (email === NADIA_EMAIL || user?.name === 'Nadia') {
        const actions = new Set(NADIA_ASSISTANT_ACTIONS);
        if (state?.config?.posPermissions?.encargadaCanAddExpenses) {
            actions.add('addExpense');
        }
        return actions;
    }
    return new Set();
};

const normalizeText = (value) => (value || '').toString().trim();
const normalizeComparable = (value) => normalizeText(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
const normalizePhone = (value) => normalizeText(value).replace(/\D/g, '');
const toNumber = (value) => Number.parseFloat(value || 0) || 0;
const parseDateValue = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const raw = value.toString().trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const date = new Date(`${raw}T12:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(raw)) {
        const [datePart] = raw.split(/\s+/);
        const [day, month, year] = datePart.split('/');
        const normalizedYear = year?.length === 2 ? `20${year}` : year;
        const date = new Date(`${normalizedYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildEmployeeSnapshot = (config = {}) => {
    const mergedEmployees = new Map();
    [...DEFAULT_EMPLOYEES, ...(Array.isArray(config.empleados) ? config.empleados : [])].forEach((employee) => {
        const key = normalizeComparable(employee.nombre || employee.id);
        if (!key) return;
        mergedEmployees.set(key, {
            ...(mergedEmployees.get(key) || {}),
            ...employee
        });
    });

    const asistencia = Array.isArray(config.asistencia) ? config.asistencia : [];
    const sortedAttendance = [...asistencia].sort((a, b) => {
        const left = parseDateValue(a?.fecha)?.getTime() || 0;
        const right = parseDateValue(b?.fecha)?.getTime() || 0;
        return right - left;
    });

    return Array.from(mergedEmployees.values()).map((employee) => {
        const latestDay = sortedAttendance.find((day) => Array.isArray(day.registros) && day.registros.some((item) => item.empleadoId === employee.id));
        const latestEntry = latestDay?.registros?.find((item) => item.empleadoId === employee.id) || null;
        const lastLateDay = sortedAttendance.find((day) => Array.isArray(day.registros) && day.registros.some((item) => (
            item.empleadoId === employee.id &&
            (normalizeText(item.estado).toLowerCase() === 'tarde' || normalizeText(item.horaLlegada) > '08:00')
        )));
        const lastLateEntry = lastLateDay?.registros?.find((item) => item.empleadoId === employee.id) || null;

        return {
            nombre: normalizeText(employee.nombre) || 'Sin nombre',
            puesto: normalizeText(employee.puesto) || 'General',
            ultimaAsistenciaFecha: latestDay?.fecha || '',
            ultimoEstado: normalizeText(latestEntry?.estado) || 'sin registro',
            ultimaHoraLlegada: normalizeText(latestEntry?.horaLlegada) || '',
            seRetiroTempranoUltimaVez: Boolean(latestEntry?.retiroTemprano),
            llegoTardeUltimaVez: normalizeText(latestEntry?.estado).toLowerCase() === 'tarde' || normalizeText(latestEntry?.horaLlegada) > '08:00',
            ultimaTardanzaFecha: lastLateDay?.fecha || '',
            ultimaTardanzaHora: normalizeText(lastLateEntry?.horaLlegada) || ''
        };
    });
};

const buildClientInsightSnapshot = (clientes = [], sales = [], pedidosOnline = []) => {
    const clientInsights = new Map();

    const ensureClientInsight = (payload = {}) => {
        const nombre = normalizeText(payload.nombre || payload.email || payload.telefono || 'Cliente sin nombre');
        const primaryKey = [
            normalizeComparable(payload.id),
            normalizeComparable(payload.wooId),
            normalizePhone(payload.telefono),
            normalizeComparable(payload.email),
            normalizeComparable(nombre)
        ].find(Boolean) || nombre;

        if (!clientInsights.has(primaryKey)) {
            clientInsights.set(primaryKey, {
                id: payload.id || '',
                wooId: payload.wooId || '',
                nombre,
                telefono: normalizeText(payload.telefono || ''),
                email: normalizeText(payload.email || ''),
                ultimaCompraPOS: '',
                ultimoPedidoOnline: '',
                ultimaActividad: '',
                origenUltimaActividad: '',
                totalGastadoPOS: 0,
                comprasPOS: 0,
                pedidosOnlineCantidad: 0,
                totalOnline: 0
            });
        }

        const current = clientInsights.get(primaryKey);
        current.id = current.id || payload.id || '';
        current.wooId = current.wooId || payload.wooId || '';
        current.telefono = current.telefono || normalizeText(payload.telefono || '');
        current.email = current.email || normalizeText(payload.email || '');
        current.nombre = current.nombre || nombre;
        return current;
    };

    const findClientInsight = (payload = {}) => {
        const candidateKeys = [
            normalizeComparable(payload.id),
            normalizeComparable(payload.wooId),
            normalizePhone(payload.telefono),
            normalizeComparable(payload.email),
            normalizeComparable(payload.nombre)
        ].filter(Boolean);

        for (const [key, insight] of clientInsights.entries()) {
            if (candidateKeys.includes(key)) {
                return insight;
            }
            if (candidateKeys.some((candidate) => (
                candidate &&
                (
                    candidate === normalizeComparable(insight.id) ||
                    candidate === normalizeComparable(insight.wooId) ||
                    candidate === normalizePhone(insight.telefono) ||
                    candidate === normalizeComparable(insight.email) ||
                    candidate === normalizeComparable(insight.nombre)
                )
            ))) {
                return insight;
            }
        }

        return ensureClientInsight(payload);
    };

    clientes.forEach((cliente) => {
        ensureClientInsight({
            id: cliente.id,
            wooId: cliente.wooId,
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            email: cliente.email
        });
    });

    sales.forEach((sale) => {
        const saleDate = sale.fecha || sale.createdAt || sale.date || '';
        const client = findClientInsight({
            id: sale.clienteId,
            wooId: sale.wooCustomerId || sale.clienteWooId || sale.cliente?.wooId,
            nombre: sale.clienteNombre || sale.nombreCliente || sale.cliente?.nombre || sale.cliente,
            telefono: sale.clienteTelefono || sale.telefonoCliente || sale.cliente?.telefono,
            email: sale.cliente?.email
        });

        client.totalGastadoPOS += toNumber(sale.totalFinal || sale.total);
        client.comprasPOS += 1;

        const saleParsed = parseDateValue(saleDate);
        const currentPosParsed = parseDateValue(client.ultimaCompraPOS);
        if (saleParsed && (!currentPosParsed || saleParsed > currentPosParsed)) {
            client.ultimaCompraPOS = saleDate;
        }

        const currentActivityParsed = parseDateValue(client.ultimaActividad);
        if (saleParsed && (!currentActivityParsed || saleParsed > currentActivityParsed)) {
            client.ultimaActividad = saleDate;
            client.origenUltimaActividad = 'POS';
        }
    });

    pedidosOnline.forEach((pedido) => {
        const orderDate = pedido.fecha || pedido.date_created || pedido.createdAt || '';
        const client = findClientInsight({
            wooId: pedido.customer_id || pedido.wooCustomerId,
            nombre: pedido.clienteNombre ||
                `${pedido.billing?.first_name || ''} ${pedido.billing?.last_name || ''}`.trim() ||
                `${pedido.shipping?.first_name || ''} ${pedido.shipping?.last_name || ''}`.trim() ||
                pedido.email,
            telefono: pedido.telefono || pedido.billing?.phone || pedido.shipping?.phone,
            email: pedido.email || pedido.billing?.email
        });

        client.pedidosOnlineCantidad += 1;
        client.totalOnline += toNumber(pedido.total || pedido.totalAmount);

        const orderParsed = parseDateValue(orderDate);
        const currentOnlineParsed = parseDateValue(client.ultimoPedidoOnline);
        if (orderParsed && (!currentOnlineParsed || orderParsed > currentOnlineParsed)) {
            client.ultimoPedidoOnline = orderDate;
        }

        const currentActivityParsed = parseDateValue(client.ultimaActividad);
        if (orderParsed && (!currentActivityParsed || orderParsed > currentActivityParsed)) {
            client.ultimaActividad = orderDate;
            client.origenUltimaActividad = 'WooCommerce';
        }
    });

    return Array.from(clientInsights.values())
        .map((client) => ({
            nombre: client.nombre,
            telefono: client.telefono,
            email: client.email,
            ultimaCompraPOS: client.ultimaCompraPOS,
            ultimoPedidoOnline: client.ultimoPedidoOnline,
            ultimaActividad: client.ultimaActividad,
            origenUltimaActividad: client.origenUltimaActividad,
            comprasPOS: client.comprasPOS,
            pedidosOnlineCantidad: client.pedidosOnlineCantidad,
            totalGastadoPOS: client.totalGastadoPOS,
            totalOnline: client.totalOnline
        }))
        .sort((a, b) => (parseDateValue(b.ultimaActividad)?.getTime() || 0) - (parseDateValue(a.ultimaActividad)?.getTime() || 0));
};

const collectAssistantSales = (config = {}) => {
    const currentSales = Array.isArray(config?.posVentas) ? config.posVentas : [];
    const closedSales = (Array.isArray(config?.posCerradoZ) ? config.posCerradoZ : [])
        .flatMap((close) => Array.isArray(close?.detalleVentas) ? close.detalleVentas : []);
    return [...currentSales, ...closedSales];
};

const buildAssistantSnapshot = (state) => {
    const config = state?.config || {};
    const products = Array.isArray(config.posProductos) ? config.posProductos : [];
    const clientes = Array.isArray(config.clientes) ? config.clientes : [];
    const bankPayments = Array.isArray(config.bankPayments) ? config.bankPayments : [];
    const mesanSales = Array.isArray(config.mesanVentasDiarias) ? config.mesanVentasDiarias : [];
    const mesanMovements = Array.isArray(config.mesanMovimientos) ? config.mesanMovimientos : [];
    const cortes = Array.isArray(config.cortes) ? config.cortes : [];
    const conteos = Array.isArray(config.mercaderiaConteos) ? config.mercaderiaConteos : [];
    const pedidosOnline = Array.isArray(config.pedidosOnline) ? config.pedidosOnline : [];
    const allSales = collectAssistantSales(config);
    const employees = buildEmployeeSnapshot(config);
    const clientInsights = buildClientInsightSnapshot(clientes, allSales, pedidosOnline);

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const salesByClient = new Map();
    const salesByProduct = new Map();
    const salesByChannel = new Map();

    allSales.forEach((sale) => {
        const total = toNumber(sale.totalFinal || sale.total);
        const saleDate = sale.fecha ? new Date(sale.fecha) : null;
        const clientName = normalizeText(
            sale.clienteNombre ||
            sale.nombreCliente ||
            sale.cliente?.nombre ||
            sale.cliente ||
            'Consumidor final'
        ) || 'Consumidor final';
        const clientKey = normalizeComparable(clientName) || clientName;
        const channel = normalizeText(sale.canalVenta || 'LOCAL') || 'LOCAL';

        const currentClient = salesByClient.get(clientKey) || {
            nombre: clientName,
            totalGastado: 0,
            compras: 0,
            ultimaCompra: ''
        };
        currentClient.totalGastado += total;
        currentClient.compras += 1;
        currentClient.ultimaCompra = currentClient.ultimaCompra && currentClient.ultimaCompra > (sale.fecha || '')
            ? currentClient.ultimaCompra
            : (sale.fecha || '');
        salesByClient.set(clientKey, currentClient);
        salesByChannel.set(channel, (salesByChannel.get(channel) || 0) + total);

        (Array.isArray(sale.items) ? sale.items : []).forEach((item) => {
            const key = normalizeComparable(item.codigoInterno || item.detalleCorto || item.id);
            if (!key) return;
            const current = salesByProduct.get(key) || {
                codigoInterno: normalizeText(item.codigoInterno),
                detalleCorto: normalizeText(item.detalleCorto) || 'Sin nombre',
                unidadesVendidas: 0,
                unidades30d: 0,
                facturacion: 0
            };
            const units = toNumber(item.cantidad || 0);
            current.unidadesVendidas += units;
            current.facturacion += toNumber(item.importe || (item.precioUnitario || item.precioOriginal || 0) * units);
            if (saleDate && !Number.isNaN(saleDate.getTime()) && saleDate >= last30Days) {
                current.unidades30d += units;
            }
            salesByProduct.set(key, current);
        });
    });

    const mesanCash = mesanSales.reduce((acc, item) => acc + toNumber(item.monto || item.efectivo || 0), 0);
    const bancoIncome = bankPayments.filter((entry) => entry.metodo === 'Banco').reduce((acc, entry) => acc + toNumber(entry.monto || 0), 0);
    const mercadoPagoIncome = bankPayments.filter((entry) => entry.metodo === 'Mercado Pago').reduce((acc, entry) => acc + toNumber(entry.monto || 0), 0);
    const totalIncome = mesanCash + bancoIncome + mercadoPagoIncome;
    const mesanExpenses = mesanMovements.reduce((acc, item) => {
        const amount = toNumber(item.monto || 0);
        return (item.moneda || 'ARS') === 'ARS' && amount < 0 ? acc + Math.abs(amount) : acc;
    }, 0);

    const topClients = Array.from(salesByClient.values())
        .sort((a, b) => b.totalGastado - a.totalGastado)
        .slice(0, 8);

    const topProducts = Array.from(salesByProduct.values())
        .sort((a, b) => b.facturacion - a.facturacion)
        .slice(0, 8);

    const lowStockProducts = products
        .filter((product) => toNumber(product.stock || 0) <= toNumber(product.alertaStockMinimo || 0))
        .slice(0, 12)
        .map((product) => ({
            codigoInterno: product.codigoInterno,
            detalleCorto: product.detalleCorto,
            stock: toNumber(product.stock || 0),
            alertaStockMinimo: toNumber(product.alertaStockMinimo || 0)
        }));

    const productionSuggestions = products
        .map((product) => {
            const key = normalizeComparable(product.codigoInterno || product.detalleCorto);
            const perf = salesByProduct.get(key);
            return {
                codigoInterno: product.codigoInterno,
                detalleCorto: product.detalleCorto,
                stock: toNumber(product.stock || 0),
                ventas30d: perf?.unidades30d || 0
            };
        })
        .filter((item) => item.ventas30d > 0)
        .sort((a, b) => (b.ventas30d - a.ventas30d) || (a.stock - b.stock))
        .slice(0, 12);

    const onlineReady = pedidosOnline.filter((pedido) => pedido.estado === 'listo').length;
    const onlinePending = pedidosOnline.filter((pedido) => pedido.estado !== 'listo').length;
    const pendingWorkshopArticles = cortes.reduce((acc, corte) => (
        acc + (Array.isArray(corte.moldesData) ? corte.moldesData : [])
            .filter((item) => normalizeText(item.tallerAsignado || item.taller) && !normalizeText(item.estadoTaller || '').toLowerCase().includes('ingres'))
            .length
    ), 0);

    return {
        financial: {
            mesanCashIncomeARS: mesanCash,
            bancoIncomeARS: bancoIncome,
            mercadoPagoIncomeARS: mercadoPagoIncome,
            totalIncomeARS: totalIncome,
            mesanExpensesARS: mesanExpenses
        },
        commercial: {
            totalClientes: clientes.length,
            topClients,
            recentClientActivity: clientInsights,
            salesByChannel: Array.from(salesByChannel.entries())
                .map(([canal, total]) => ({ canal, total }))
                .sort((a, b) => b.total - a.total)
        },
        people: {
            totalEmpleados: employees.length,
            employees
        },
        inventory: {
            totalProducts: products.length,
            lowStockProducts,
            topProducts,
            productionSuggestions
        },
        operations: {
            cortes: cortes.length,
            pendingWorkshopArticles,
            conteosMercaderia: conteos.length,
            pedidosOnlineListos: onlineReady,
            pedidosOnlinePendientes: onlinePending
        },
        ventasFisicas: (() => {
            const ventas = Array.isArray(config.mesanVentasDiarias) ? config.mesanVentasDiarias : [];
            const hoy = new Date().toISOString().slice(0,10);
            const ventaHoy = ventas.find(v => v.fecha === hoy);
            const ultimas7 = ventas.filter(v => v.fecha && (Date.now() - new Date(v.fecha).getTime()) < 7*24*60*60*1000);
            return {
                source: 'DOMO vía Mesan',
                hoy: Number(ventaHoy?.monto || ventaHoy?.efectivo || 0),
                ultimos7dias: ultimas7.reduce((s,v) => s + Number(v.monto || v.efectivo || 0), 0),
                diasConDatos: ventas.filter(v => Number(v.monto || v.efectivo || 0) > 0).length
            };
        })(),
        ultimosReportesAI: (() => {
            const cache = config.agentsCache || {};
            const resumen = {};
            if (cache.analyst?.content) resumen.analista = cache.analyst.content.substring(0, 500);
            if (cache.master?.content) resumen.ceo = cache.master.content.substring(0, 500);
            if (cache.master?.tasks) resumen.tareasDelCEO = cache.master.tasks.map(t => t.title + ' → ' + t.assignee).join(', ');
            return resumen;
        })()
    };
};

const buildFullDashboardContext = (state) => {
    const config = state?.config || {};
    const sections = [];

    // 1. Products & Stock summary
    const products = Array.isArray(config.posProductos) ? config.posProductos : [];
    const activeProducts = products.filter(p => p.activo);
    const lowStock = products.filter(p => p.stock <= (p.alertaStockMinimo || 0) && p.stock !== 999);
    const stockByArticle = products
        .filter(p => p.stock !== 999 && p.stock > 0)
        .map(p => `${p.articuloVenta || p.codigoInterno}: ${p.stock} un`)
        .join(', ');
    sections.push(`STOCK ACTUAL: ${activeProducts.length} artículos activos. Stock total: ${products.reduce((s, p) => s + (p.stock === 999 ? 0 : (p.stock || 0)), 0)} unidades. Bajo stock: ${lowStock.length}. Detalle: ${stockByArticle.slice(0, 1500)}`);

    // 2. Online orders summary
    const pedidos = Array.isArray(config.pedidosOnline) ? config.pedidosOnline : [];
    const pendientes = pedidos.filter(p => p.estado === 'pendiente');
    const listos = pedidos.filter(p => p.estado === 'listo');
    const bySource = {};
    pedidos.forEach(p => { bySource[p.origen || 'Sin origen'] = (bySource[p.origen || 'Sin origen'] || 0) + 1; });
    const sourceBreakdown = Object.entries(bySource).map(([k, v]) => `${k}: ${v}`).join(', ');
    const totalRevenue = pedidos.reduce((s, p) => s + Number(p.monto || 0), 0);
    const biggestOrder = [...pedidos].sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0))[0];
    sections.push(`PEDIDOS ONLINE: ${pedidos.length} total (${pendientes.length} pendientes, ${listos.length} listos). Por origen: ${sourceBreakdown}. Facturación total: $${totalRevenue.toLocaleString('es-AR')}. Pedido más grande: ${biggestOrder ? `${biggestOrder.cliente || biggestOrder.clienteNombre || 'N/A'} $${Number(biggestOrder.monto || 0).toLocaleString('es-AR')}` : 'N/A'}`);

    // 3. POS Sales
    const ventas = Array.isArray(config.posVentas) ? config.posVentas : [];
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const ventasHoy = ventas.filter(v => (v.fecha || '').slice(0, 10) === today);
    const totalVentasHoy = ventasHoy.reduce((s, v) => s + Number(v.total || v.totalFinal || 0), 0);
    const totalVentasMes = ventas.filter(v => (v.fecha || '').slice(0, 7) === thisMonth).reduce((s, v) => s + Number(v.total || v.totalFinal || 0), 0);
    sections.push(`VENTAS POS: ${ventas.length} ventas totales. Hoy: ${ventasHoy.length} ventas ($${totalVentasHoy.toLocaleString('es-AR')}). Este mes: $${totalVentasMes.toLocaleString('es-AR')}`);

    // 4. Clients
    const clientes = Array.isArray(config.clientes) ? config.clientes : [];
    sections.push(`CLIENTES: ${clientes.length} registrados`);

    // 5. Bank payments
    const bankPayments = Array.isArray(config.bankPayments) ? config.bankPayments : [];
    const thisMonthBank = bankPayments.filter(b => (b.fecha || '').slice(0, 7) === thisMonth);
    const totalBankThisMonth = thisMonthBank.reduce((s, b) => s + Number(b.monto || 0), 0);
    sections.push(`BANCO Y MP: ${bankPayments.length} movimientos totales. Este mes: $${totalBankThisMonth.toLocaleString('es-AR')}`);

    // 6. MESAN
    const mesanMov = Array.isArray(config.mesanMovimientos) ? config.mesanMovimientos : [];
    const mesanVentas = Array.isArray(config.mesanVentasDiarias) ? config.mesanVentasDiarias : [];
    sections.push(`MESAN: ${mesanMov.length} movimientos, ${mesanVentas.length} días con ventas registradas`);

    // 7. Mercaderia conteos
    const conteos = Array.isArray(config.mercaderiaConteos) ? config.mercaderiaConteos : [];
    sections.push(`CONTEO MERCADERÍA: ${conteos.length} registros de conteo`);

    // 8. Agent results
    const agentsCache = config.agentsCache || {};
    const agentSummaries = Object.entries(agentsCache)
        .filter(([, v]) => v?.result || v?.content)
        .map(([k, v]) => `${k}: ${((v.result || v.content) || '').slice(0, 400)}`)
        .join('\n');
    if (agentSummaries) {
        sections.push(`ÚLTIMOS REPORTES DE AGENTES AI:\n${agentSummaries.slice(0, 1500)}`);
    }

    // Truncate total to ~4000 chars
    let result = sections.join('\n\n');
    if (result.length > 4000) {
        result = result.slice(0, 3997) + '...';
    }
    return result;
};

const buildSystemPrompt = ({ lang, user, state, allowedActionList, isNadiaProfile, dashboardSnapshot }) => `Sos "CELA IA", la asistente interna del sistema CELAVIE.

IDIOMA:
- Respondé siempre en el idioma del usuario.
- Si el usuario escribe en español, respondé en español rioplatense claro y práctico.
- Si el usuario escribe en ruso o coreano, respondé en ese idioma.
- Si dudás, usá el idioma actual de la interfaz: ${lang}.

ROL PRINCIPAL:
- No sos solo un chatbot: sos una guía experta del sistema con acceso completo a todos los datos del negocio en tiempo real.
- Tenés que operar como un "Jarvis" del negocio: entender lo que está pasando en el dashboard, absorber los datos actuales y responder en base a esos datos.
- Podés responder preguntas sobre stock, ventas, pedidos, clientes, gastos, marketing y las recomendaciones de los agentes AI.
- Cuando te pregunten por un artículo (ej: "6300"), buscá en los datos de stock por codigoInterno o articuloVenta.
- Cuando te pregunten por ventas, usá los datos de POS y pedidos online.
- Cuando te pregunten por pedidos por origen (ej: "Instagram"), usá el desglose por origen de los pedidos online.
- Tenés que orientar a cada usuario sobre qué pantalla usar, qué paso sigue y qué dato falta.
- Antes de ejecutar cambios, explicá brevemente qué vas a hacer si eso ayuda a evitar errores.
- Cuando te pidan una acción concreta, ejecutala usando etiquetas <action>JSON</action>.
- Si falta un dato menor, asumilo razonablemente y decilo.
- Si falta un dato crítico, pedilo en una sola pregunta breve.

COMO GUIAR:
- Explicá el flujo correcto dentro del sistema, no teoría general.
- Priorizá pasos prácticos y ordenados.
- Si el usuario está en una sección equivocada, redirigilo a la sección correcta.
- Si conviene revisar otra sección vinculada, mencionála.
- Cuando detectes un posible error operativo, avisalo con claridad.

SECCIONES DEL SISTEMA QUE CONOCÉS:
- Tareas: seguimiento general de pendientes.
- Moldes: biblioteca de moldes, imágenes, checklist, datos de prenda.
- Telas: catálogo, stock, rollos, pagos a textileras y fallados.
- Cortes: alta de cortes, asignación de cortador y taller, costos y cantidades.
- Cortadores: seguimiento por cortador y pagos.
- Talleres: seguimiento por taller, tiempos de entrega, ingresos desde Conteo Mercadería y ranking.
- Pedidos Online: pedidos de WooCommerce, estados, comentarios de Juan, chequeo de Nadia y fotos de artículos.
- Clientes: búsqueda, CUIT, teléfono, historial.
- Punto de Venta: ventas, gastos, cierre Z, ticket, señas y reservas.
- Conteo Mercadería: ingreso real de mercadería, fecha, corte, taller, cantidades, chequeo y fallados.
- Fotos: tareas de fotos por artículo para web e Instagram.
- Mesan: gastos diarios, ventas del día, importes de banco/MP/USD/AI y saldo acumulado.
- Banco y Mercado Pago: ingresos por día, por mes y por método.
- Configuración: credenciales, tema, idioma, IA y backup.

REGLAS OPERATIVAS IMPORTANTES:
- Talleres depende de Cortes + Conteo Mercadería. Si preguntan por ranking o tiempos, explicá que el ingreso real lo define Conteo Mercadería.
- Pedidos Online puede depender de pedidos, artículos POS y datos de WooCommerce.
- Clientes puede cruzarse con ventas POS.
- Mesan y Banco/MP son módulos distintos: no mezclar gastos de Mesan con ingresos bancarios salvo que el usuario lo pida explícitamente.
- Para preguntas comerciales y financieras, usá los datos del snapshot operativo inyectado abajo como fuente principal.
- Si te preguntan "qué cliente compró más", "cuánto stock queda", "si conviene producir", "qué canal rindió más" o "qué pasó este mes", respondé con los datos del snapshot y explicá el criterio.
- No inventes datos existentes si no están en el contexto.

- Si preguntan por empleados, usÃ¡ people.employees y respondÃ© con fecha exacta de Ãºltima asistencia, hora de llegada, si llegÃ³ tarde y si se retirÃ³ temprano.
- Si preguntan por clientes, usÃ¡ commercial.recentClientActivity y respondÃ© con fecha exacta de Ãºltima compra POS, Ãºltimo pedido online y Ãºltima actividad conocida.

PERMISOS DEL USUARIO ACTUAL:
- Usuario actual: ${user?.name || 'Sin nombre'} (${user?.role || 'sin rol'}).
- Acciones que podés ejecutar en este perfil: ${allowedActionList || 'ninguna'}.
${isNadiaProfile ? '- Este perfil es Nadia. Podés guiarla dentro de POS, pedidos, clientes, talleres, empleados, página web y conteo de mercadería, pero no debés modificar configuración sensible, finanzas de admin, telas, banco/MP, mesan ni acciones de administración general.' : ''}
- Si el usuario pide algo fuera de sus permisos, explicá qué tendría que hacer un admin o a qué sección pedir acceso, pero no ejecutes la acción.

ACCIONES DISPONIBLES:
1. Crear molde/artículo:
<action>{"type":"addMolde","data":{"nombre":"Remera Básica","codigo":"6002","categoria":"Remera","consumoTela":4.9,"porcentajeTela":23}}</action>

2. Crear cliente:
<action>{"type":"addCliente","data":{"nombre":"Juan Pérez","telefono":"1155554444","provincia":"Córdoba","email":"juan@mail.com","cuit":"20123456789"}}</action>

3. Crear tarea:
<action>{"type":"addTarea","data":{"nombre":"Comprar hilo","descripcion":"Hilo negro para remeras"}}</action>

4. Crear tela:
<action>{"type":"addTela","data":{"nombre":"Modal Soft","precioPorUnidad":4.9,"moneda":"USD","descripcion":"Tela suave"}}</action>

5. Agregar producto POS:
<action>{"type":"addPosProduct","data":{"detalleCorto":"Remera Básica","codigoInterno":"6002","precioVentaL1":5900,"stock":100}}</action>

6. Crear corte:
<action>{"type":"addCorte","data":{"nombre":"Corte #10","fecha":"2026-03-19","articulos":[{"nombre":"Remera Básica","codigo":"6002","tela":"Modal Soft","cantidad":486,"costoTaller":1500,"cortador":"Luis","taller":"Jose Luis","precioVenta":5900}]}}</action>

7. Agregar gasto POS:
<action>{"type":"addExpense","data":{"concepto":"Luz","monto":15000,"tipo":"PROVEEDOR"}}</action>

8. Actualizar configuración:
<action>{"type":"updateConfig","data":{"cotizacionUSD":1500}}</action>

FORMA DE RESPONDER:
- Si el usuario solo pregunta cómo hacer algo, respondé con pasos concretos dentro del sistema.
- Si el usuario hace preguntas analíticas, respondé como analista del negocio usando cifras y rankings del sistema.
- Si el usuario pregunta por conveniencia de producir un artículo, evaluá ventas recientes, stock actual y pendientes operativos antes de responder.
- Si el usuario quiere que lo hagas, además de explicarlo ejecutá la acción.
- Si ejecutás acciones, después resumí en una o dos líneas lo que hiciste.
- Podés ejecutar varias acciones en una misma respuesta.

CONTEXTO ACTUAL:
- Usuario logueado: ${user?.name || 'Sin nombre'} (${user?.email || 'sin email'}) rol ${user?.role || 'sin rol'}
- Moldes: ${state.moldes?.length || 0}
- Telas: ${state.telas?.length || 0}
- Cortes: ${state.config?.cortes?.length || 0}
- Clientes: ${state.config?.clientes?.length || 0}
- Productos POS: ${state.config?.posProductos?.length || 0}
- Talleres: ${(state.config?.talleres || []).join(', ') || 'sin talleres'}
- Secciones útiles según el rol: guiá al usuario dentro de lo que puede ver, pero si pregunta por algo de admin podés explicarlo igual.

GUÍA ESPECÍFICA POR PERSONA DEL EQUIPO:
Cuando hables con alguien del equipo, explicale EXACTAMENTE dónde ir y qué botón tocar. No asumas que saben navegar el sistema.

NADIA (Encargada):
- POS: Menú izquierdo → "Punta de Venta" → Caja Principal. Para recargo poner -10 en Desc%. Descuento global en % abajo.
- Pedidos: Menú → "Pedidos Online". Puede cambiar estado y dejar comentarios.
- Clientes: Menú → "Clientes". Buscar por nombre, ver historial, editar datos.
- Conteo: Menú → "Conteo Mercadería". Cargar mercadería que llega del taller.
- Banco: Menú → "Banco y MP". Ver pagos recibidos por transferencia o MP.
- Saldo: Menú → "Saldo". Ver deudas de clientes mayoristas.

NAARA (Depósito):
- Conteo: Menú → "Conteo Mercadería". Cargar cantidad real de prendas que llegan. Seleccionar corte, taller, poner cantidades.
- Talleres: Menú → "Talleres". Ver qué cortes están en cada taller y tiempos de entrega.
- Si no ve datos, puede ser problema de sincronización. Ir a Configuración → "Migrar datos locales a la nube".

JUAN (Pedidos Online):
- Pedidos: Menú → "Pedidos Online". Ver pedidos web, marcar estados, agregar comentarios de envío.
- Conteo: Menú → "Conteo Mercadería". Verificar stock disponible para despachar.

ROCÍO (Fotos):
- Fotos: Menú → "Fotos". Ver lista de artículos que necesitan fotos. Marcar como completado.
- Instagram: Menú → "Instagram Post". Planificar grid, subir fotos a cada slot del 1 al 9.

DAVID (Admin):
- Todo: Acceso completo. Puede usar Agentes AI → "CEO — Ejecutar Todos" para reporte diario completo.
- Telas: Ver inventario, deudas por textilera, saldo verano.
- Mesan: Cargar ventas diarias del DOMO.
- Configuración: API keys, credenciales WooCommerce, Meta, Claude.

REPORTES DE AGENTES AI:
Los agentes AI generan reportes automáticos. Si el usuario pregunta sobre un reporte o quiere entender qué dice, explicale en simple:
- "El Analista" = resumen del día con ventas, publicidad y alertas
- "Trend Scout" = qué tendencias de moda hay y cómo aprovecharlas
- "Content Creator" = plan de contenido semanal para Instagram/TikTok
- "Estratega" = recomendaciones de negocio priorizadas
- "Growth Hacker" = experimentos para crecer más rápido
- "Paid Media" = optimización de campañas de Meta Ads (Facebook/Instagram)
- "Pricing" = análisis de precios y márgenes
- "Inventario" = forecast de demanda y qué producir
- "WhatsApp Sales" = mensajes de venta listos para copiar
- "SEO" = mejoras para la web celavie.com.ar
- "Competencia" = qué hacen los competidores
- "Finanzas" = P&L, cash flow, proyecciones
- "CRM" = comunicación con clientes, templates de email
- "Proveedores" = deudas con textileras, plan de pagos
- "Clientes" = retención, clientes en riesgo, VIP
- "Cash Flow" = flujo de caja diario, cobros urgentes
- "CEO" = decisiones del día, tareas asignadas al equipo
Si el usuario no entiende un término de marketing (ROAS, CTR, CPC, etc), explicalo en criollo simple.

DATOS ACTUALES DEL NEGOCIO (resumen legible):
${buildFullDashboardContext(state)}

SNAPSHOT OPERATIVO DETALLADO:
${JSON.stringify(dashboardSnapshot, null, 2)}

ÚLTIMOS REPORTES DE AGENTES AI (agentsCache):
${(() => {
    const cache = state?.config?.agentsCache || {};
    const agents = ['analyst', 'master', 'trendScout', 'contentCreator', 'paidMedia', 'pricing', 'inventory', 'whatsappSales', 'seo', 'competitor', 'finanzas', 'crm', 'proveedores', 'clientes', 'cashFlow'];
    const summaries = agents
        .filter(key => cache[key]?.content)
        .map(key => `[${key.toUpperCase()}]: ${String(cache[key].content).substring(0, 400)}`);
    return summaries.length > 0 ? summaries.join('\n\n') : 'Sin reportes de agentes disponibles aún.';
})()}
`;

export default function AIAssistant() {
    const { state, addMolde, addTela, addCliente, addTarea, addPosProduct, updateConfig, addPosExpense } = useData();
    const { user, originalAdmin } = useAuth();
    const { lang } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [apiKey, setApiKey] = useState(state.config?.marketing?.claudeKey || state.config?.marketing?.openaiKey || '');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const recognitionRef = useRef(null);
    const [isListening, setIsListening] = useState(false);

    const normalizedEmail = getNormalizedEmail(user);
    const assistantVisible = canAccessAssistant(user, originalAdmin);
    const allowedAssistantActions = useMemo(() => getAllowedAssistantActions(user, state), [user, state]);
    const dashboardSnapshot = useMemo(() => buildAssistantSnapshot(state), [state]);
    const allowedActionList = allowedAssistantActions.size ? Array.from(allowedAssistantActions).join(', ') : 'ninguna';
    const systemPrompt = useMemo(() => buildSystemPrompt({
        lang,
        user,
        state,
        allowedActionList,
        isNadiaProfile: normalizedEmail === NADIA_EMAIL || user?.name === 'Nadia',
        dashboardSnapshot
    }), [lang, user, state, allowedActionList, normalizedEmail, dashboardSnapshot]);

    // Detect UI language for speech recognition
    const getLangCode = () => {
        const langMap = { es: 'es-AR', en: 'en-US', ko: 'ko-KR', ru: 'ru-RU' };
        return langMap[lang] || 'es-AR';
    };

    useEffect(() => {
        setMessages((prev) => {
            if (prev.length > 0) return prev;
            return [{ role: 'assistant', content: DEFAULT_GREETING[lang] || DEFAULT_GREETING.es }];
        });
    }, [lang]);

    // Speech Recognition setup
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.lang = getLangCode();
            recognition.continuous = false;
            recognition.interimResults = true;
            
            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                setInput(transcript);
                
                // Si es resultado final, enviar automáticamente
                if (event.results[event.results.length - 1].isFinal) {
                    setIsListening(false);
                    // Pequeño delay para que el usuario vea lo que dijo
                    setTimeout(() => {
                        const finalText = transcript.trim();
                        if (finalText) {
                            setInput(finalText);
                            // Trigger send
                            handleSendFromVoice(finalText);
                        }
                    }, 500);
                }
            };
            
            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
                if (event.error === 'not-allowed') {
                    alert('⚠️ Necesitás permitir acceso al micrófono para usar voz.');
                }
            };
            
            recognition.onend = () => {
                setIsListening(false);
            };
            
            recognitionRef.current = recognition;
        }
    }, []);

    const toggleVoice = () => {
        if (!recognitionRef.current) {
            alert('Tu navegador no soporta reconocimiento de voz. Probá con Chrome.');
            return;
        }
        
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setInput('');
            // Update language before starting
            recognitionRef.current.lang = getLangCode();
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    // Speak response using TTS
    const speakResponse = (text) => {
        if (!window.speechSynthesis) return;
        // Clean markdown and action tags
        const cleanText = text
            .replace(/<action>[\s\S]*?<\/action>/g, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/[✅❌⚠️🔴💡🎯📊🤖]/g, '')
            .trim();
        if (!cleanText) return;
        
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = getLangCode();
        utterance.rate = 1.1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
    };

    const handleSendFromVoice = async (text) => {
        if (!text.trim() || loading) return;
        if (!apiKey) {
            setMessages(prev => [...prev, 
                { role: 'user', content: text },
                { role: 'assistant', content: '⚠️ Necesitás configurar la API Key de OpenAI en Configuración.' }
            ]);
            return;
        }
        // Reuse the same logic as handleSend but with the voice text
        setInput('');
        await sendMessage(text);
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const key = state.config?.marketing?.claudeKey || state.config?.marketing?.openaiKey;
        if (key) setApiKey(key);
    }, [state.config?.marketing?.claudeKey, state.config?.marketing?.openaiKey]);

    const executeAction = (actionStr) => {
        try {
            const action = JSON.parse(actionStr);
            if (!allowedAssistantActions.has(action.type)) {
                return '⚠️ En este perfil no puedo ejecutar esa acción. Puedo guiarte, pero esa operación queda reservada según los permisos del usuario.';
            }
            switch (action.type) {
                case 'addMolde':
                    addMolde({ id: generateId(), estado: 'por-hacer', imagenes: [], checklist: [], ...action.data, createdAt: new Date().toISOString() });
                    return `✅ Molde "${action.data.nombre}" creado exitosamente.`;
                case 'addCliente':
                    addCliente({ id: generateId(), ...action.data });
                    return `✅ Cliente "${action.data.nombre}" agregado exitosamente.`;
                case 'addTarea':
                    addTarea({ id: generateId(), estado: 'por-hacer', ...action.data });
                    return `✅ Tarea "${action.data.nombre}" creada exitosamente.`;
                case 'addTela':
                    addTela({ id: generateId(), color: '', descripcion: '', ...action.data });
                    return `✅ Tela "${action.data.nombre}" agregada al catálogo.`;
                case 'addPosProduct':
                    addPosProduct({ id: generateId(), codigoInterno: action.data.codigoInterno || generateId().slice(0, 6).toUpperCase(), activo: true, ...action.data });
                    return `✅ Producto "${action.data.detalleCorto}" cargado en el POS.`;
                case 'addCorte': {
                    const corteId = generateId();
                    const articulos = action.data.articulos || [];
                    const moldeIds = [];
                    const moldesData = [];
                    
                    articulos.forEach(art => {
                        const moldeId = generateId();
                        // Crear el molde si tiene nombre
                        if (art.nombre) {
                            addMolde({
                                id: moldeId,
                                nombre: art.nombre,
                                codigo: art.codigo || '',
                                estado: 'por-hacer',
                                imagenes: [],
                                checklist: [],
                                consumoTela: art.consumoTela || 0,
                                cantidadCorte: art.cantidad || 0,
                                costoTaller: art.costoTaller || 0,
                                precioLocal: art.precioVenta || 0,
                                createdAt: new Date().toISOString()
                            });
                        }
                        // Buscar si ya existe la tela y crearla si no
                        if (art.tela) {
                            const existingTela = state.telas?.find(t => t.nombre?.toLowerCase() === art.tela.toLowerCase());
                            if (!existingTela) {
                                addTela({ id: generateId(), nombre: art.tela, precioPorUnidad: 0, moneda: 'USD', color: '', descripcion: '' });
                            }
                        }
                        moldeIds.push(moldeId);
                        moldesData.push({
                            id: moldeId,
                            cantidad: art.cantidad || 0,
                            costoTaller: art.costoTaller || 0,
                            costoCortador: art.costoCortador || 0,
                            tallerAsignado: art.taller || '',
                            cortadorAsignado: art.cortador || '',
                            precioLocal: art.precioVenta || 0,
                            pagadoCortador: false,
                            pagadoTaller: false,
                            prendasFalladas: 0,
                            rollosCorte: 0,
                            kilajeTotal: 0,
                            notas: ''
                        });
                    });
                    
                    const cortes = state.config?.cortes || [];
                    updateConfig({
                        cortes: [...cortes, {
                            id: corteId,
                            nombre: action.data.nombre || `Corte ${cortes.length + 1}`,
                            fecha: action.data.fecha || new Date().toISOString().split('T')[0],
                            moldeIds,
                            moldesData
                        }]
                    });
                    return `✅ Corte "${action.data.nombre || 'Nuevo'}" creado con ${articulos.length} artículo(s).`;
                }
                case 'addExpense': {
                    if (addPosExpense) {
                        addPosExpense({
                            id: generateId(),
                            fecha: new Date().toISOString(),
                            concepto: action.data.concepto || 'Gasto',
                            monto: action.data.monto || 0,
                            tipo: action.data.tipo || 'RETIRO',
                            responsable: 'CELA IA'
                        });
                    }
                    return `✅ Gasto "$${action.data.monto}" registrado: ${action.data.concepto}.`;
                }
                case 'updateConfig':
                    updateConfig(action.data);
                    return `✅ Configuración actualizada: ${Object.keys(action.data).join(', ')}.`;
                default:
                    return `⚠️ Acción "${action.type}" no reconocida. Acciones: addMolde, addCliente, addTarea, addTela, addPosProduct, addCorte, addExpense, updateConfig.`;
            }
        } catch (err) {
            console.error('Error ejecutando acción:', err, actionStr);
            return `❌ Error al ejecutar: ${err.message}`;
        }
    };

    const processResponse = (text) => {
        const actionRegex = /<action>([\s\S]*?)<\/action>/g;
        let match;
        const results = [];
        while ((match = actionRegex.exec(text)) !== null) {
            results.push(executeAction(match[1]));
        }
        // Clean text from action tags for display
        const cleanText = text.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
        return { cleanText, actionResults: results };
    };

    const sendMessage = async (text) => {
        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const apiMessages = [
                { role: 'system', content: systemPrompt },
                ...messages.filter(m => m.role !== 'system').slice(-10).map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: text }
            ];

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    system: systemPrompt,
                    messages: apiMessages.filter(m => m.role !== 'system'),
                    max_tokens: 1500,
                    temperature: 0.4
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error?.message || 'Error de Claude');
            }

            const data = await response.json();
            const assistantText = data.content?.[0]?.text || 'No pude generar una respuesta.';

            const { cleanText, actionResults } = processResponse(assistantText);
            let finalText = cleanText;
            if (actionResults.length > 0) {
                finalText += '\n\n' + actionResults.join('\n');
            }

            setMessages(prev => [...prev, { role: 'assistant', content: finalText }]);
            
            // Si se usó voz, leer la respuesta en voz alta
            if (isListening || recognitionRef.current) {
                speakResponse(finalText);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${err.message}` }]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        if (!apiKey) {
            setMessages(prev => [...prev, 
                { role: 'user', content: input },
                { role: 'assistant', content: '⚠️ Necesitás configurar la API Key de OpenAI en **Configuración > Asistente IA** para que yo pueda funcionar.' }
            ]);
            setInput('');
            return;
        }
        const text = input;
        setInput('');
        await sendMessage(text);
    };

    if (!assistantVisible) {
        return null;
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), #22c55e)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(20, 184, 166, 0.35)',
                    transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                <MessageCircle size={24} color="white" />
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            width: isMinimized ? 300 : 380, 
            height: isMinimized ? 48 : 520,
            borderRadius: 16,
            background: 'var(--bg-card, #1a1a2e)',
            border: '1px solid rgba(20, 184, 166, 0.28)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', transition: 'all 0.3s ease'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(135deg, var(--accent), #22c55e)',
                cursor: 'pointer'
            }} onClick={() => isMinimized && setIsMinimized(false)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white' }}>
                    <Bot size={20} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>CELA IA</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>Asistente</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 4 }}>
                        {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 4 }}>
                        <X size={14} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div style={{
                        flex: 1, overflowY: 'auto', padding: 12,
                        display: 'flex', flexDirection: 'column', gap: 8
                    }}>
                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 8,
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                            }}>
                                {msg.role === 'assistant' && (
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                        background: 'rgba(20, 184, 166, 0.18)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Bot size={14} color="var(--accent)" />
                                    </div>
                                )}
                                <div style={{
                                    maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                                    fontSize: 13, lineHeight: 1.5,
                                    background: msg.role === 'user' ? 'rgba(20, 184, 166, 0.22)' : 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-primary, #e0e0e0)',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    background: 'rgba(20, 184, 166, 0.18)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Bot size={14} color="var(--accent)" />
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    Pensando...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div style={{
                        padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex', gap: 8, alignItems: 'center'
                    }}>
                        <button
                            onClick={toggleVoice}
                            style={{
                                padding: '8px', borderRadius: 8, flexShrink: 0,
                                background: isListening ? 'rgba(239, 68, 68, 0.8)' : 'rgba(255,255,255,0.05)',
                                border: isListening ? '2px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer', color: isListening ? 'white' : 'var(--text-muted, #999)',
                                display: 'flex', alignItems: 'center',
                                animation: isListening ? 'pulse 1.5s infinite' : 'none'
                            }}
                            title={isListening ? 'Detener grabación' : 'Hablar por voz'}
                        >
                            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                        </button>
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                            placeholder={isListening ? '🎤 Escuchando...' : 'Escribí o hablá...'}
                            style={{
                                flex: 1, padding: '8px 12px', borderRadius: 8,
                                background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                                border: isListening ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--text-primary, #e0e0e0)',
                                fontSize: 13, outline: 'none'
                            }}
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            style={{
                                padding: '8px 12px', borderRadius: 8,
                                background: loading ? 'rgba(20, 184, 166, 0.3)' : 'rgba(20, 184, 166, 0.85)',
                                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                color: 'white', display: 'flex', alignItems: 'center'
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <style>{`
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.6; }
                        }
                    `}</style>
                </>
            )}
        </div>
    );
}
