import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Trash2, Printer, CreditCard, DollarSign, Plus, Minus, PackagePlus } from 'lucide-react';
import { useData } from '../../store/DataContext';
import { useAuth } from '../../store/AuthContext';
import { generateId } from '../../utils/helpers';
import './PosCaja.css';

const SALES_CHANNELS = ['LOCAL', 'PAGINA WEB', 'WHATSAPP', 'MODATEX', 'DISTRITO', 'CHLOE', 'LUIS'];

const getChannelPricing = (product, channel) => {
    switch (channel) {
        case 'PAGINA WEB':
            return {
                listKey: 'precioVentaWeb',
                listLabel: 'WEB',
                price: Number(product.precioVentaWeb || product.precioVentaL1 || 0)
            };
        case 'MODATEX':
        case 'DISTRITO':
            return {
                listKey: 'precioVentaL2',
                listLabel: 'LISTA 2',
                price: Number(product.precioVentaL2 || product.precioVentaL1 || 0)
            };
        case 'CHLOE':
            return {
                listKey: 'precioVentaL3',
                listLabel: 'LISTA 3',
                price: Number(product.precioVentaL3 || product.precioVentaL2 || product.precioVentaL1 || 0)
            };
        case 'LUIS':
            return {
                listKey: 'precioVentaL4',
                listLabel: 'LISTA 4',
                price: Number(product.precioVentaL4 || product.precioVentaL2 || product.precioVentaL1 || 0)
            };
        case 'WHATSAPP':
        case 'LOCAL':
        default:
            return {
                listKey: 'precioVentaL1',
                listLabel: 'LISTA 1',
                price: Number(product.precioVentaL1 || 0)
            };
    }
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMoney = (value) => Number(value || 0).toFixed(2);

const buildTicketHtml = (ticketData) => {
    if (!ticketData) return '';

    const {
        nroComprobante = '0000',
        fecha = new Date().toISOString(),
        cliente = 'Cons. Final',
        items = [],
        subtotal = 0,
        descuento = 0,
        total = 0,
        pago = 0,
        vuelto = 0,
        vendedor = 'Local',
        canalVenta = 'LOCAL',
        notas = ''
    } = ticketData;

    const totalProductos = items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    const fechaFormateada = new Date(fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    const itemsHtml = items.map((item) => `
        <div class="ticket-item-row">
            <div class="item-name">${escapeHtml(item.codigoInterno)} - ${escapeHtml(item.detalleCorto)}</div>
            <div class="item-details">
                <span>${escapeHtml(item.cantidad)} / $${formatMoney(item.precioOriginal)} / $${formatMoney(item.precioUnitario)} / ${escapeHtml(item.descuentoPorcentaje || 0)}%</span>
                <span>$${formatMoney(item.importe)}</span>
            </div>
        </div>
    `).join('');

    return `<!doctype html>
<html lang="es">
<head>
    <meta charset="UTF-8" />
    <title>Ticket ${escapeHtml(nroComprobante)}</title>
    <style>
        @page { size: 80mm auto; margin: 0; }
        html, body {
            width: 80mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            overflow: visible;
            font-family: "Courier New", Courier, monospace;
            font-size: 10px;
            line-height: 1.1;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .thermal-ticket {
            box-sizing: border-box;
            width: 76mm;
            padding: 2mm 2mm 6mm;
        }
        .ticket-header h2 {
            text-align: center;
            font-size: 17px;
            margin: 2px 0 4px;
            letter-spacing: 1px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .ticket-header p, .ticket-footer p { margin: 2px 0; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .ticket-meta, .ticket-summary, .item-details, .ticket-col-headers {
            display: flex;
            justify-content: space-between;
            gap: 6px;
        }
        .ticket-meta, .ticket-summary { margin: 1px 0; }
        .ticket-col-headers {
            font-weight: bold;
            border-bottom: 1px solid #000;
            padding-bottom: 2px;
            margin-top: 2px;
        }
        .ticket-col-headers span:first-child { width: 100%; }
        .ticket-col-headers span:last-child { width: 62px; text-align: right; flex-shrink: 0; }
        .ticket-items { margin: 4px 0; }
        .ticket-item-row {
            margin-bottom: 4px;
            padding-bottom: 2px;
            border-bottom: 0.5px solid #ddd;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .item-name { font-weight: bold; word-break: break-word; margin-bottom: 1px; }
        .item-details span:first-child { flex: 1; min-width: 0; word-break: break-word; }
        .item-details span:last-child { flex-shrink: 0; text-align: right; }
        .grand-total {
            font-size: 13px;
            font-weight: bold;
            border-top: 1px double #000;
            padding-top: 3px;
            margin-top: 4px;
        }
        .center { text-align: center; }
        .strong { font-weight: bold; }
    </style>
</head>
<body>
    <div class="thermal-ticket">
        <div class="ticket-header">
            <h2>CELAVIE</h2>
            <p>Cuenca 544 - Flores</p>
            <p>Telefono: (54) 11.2726.0713</p>
            <div class="divider"></div>
            <div class="ticket-meta">
                <span>COMPROBANTE INTERNO</span>
                <span>N: ${escapeHtml(nroComprobante)}</span>
            </div>
            <div class="ticket-meta">
                <span>${escapeHtml(fechaFormateada)}</span>
                <span>Vendedor: ${escapeHtml(vendedor)}</span>
            </div>
            <div class="ticket-meta">
                <span>Canal</span>
                <span>${escapeHtml(canalVenta)}</span>
            </div>
            <div class="divider"></div>
            <p>${escapeHtml(cliente)}</p>
            ${notas ? `<p class="strong">Nota: ${escapeHtml(notas)}</p>` : ''}
            <div class="divider"></div>
            <div class="ticket-col-headers">
                <span>COD - DESCRIPCION</span>
                <span>IMPORTE</span>
            </div>
            <p class="strong">CANT. / P.LIST / P.DESC / DESC %</p>
            <div class="divider"></div>
        </div>
        <div class="ticket-items">${itemsHtml}</div>
        <div class="ticket-footer">
            <div class="divider"></div>
            <div class="ticket-summary">
                <span>Cantidad Productos</span>
                <span>${escapeHtml(totalProductos)}</span>
            </div>
            <div class="divider"></div>
            <div class="ticket-summary">
                <span>Subtotal</span>
                <span>$${formatMoney(subtotal)}</span>
            </div>
            <div class="ticket-summary">
                <span>Subtotal con Descuentos</span>
                <span>$${formatMoney(subtotal - descuento)}</span>
            </div>
            <div class="divider"></div>
            <div class="ticket-summary grand-total">
                <span>Total Final</span>
                <span>$${formatMoney(total)}</span>
            </div>
            <div class="ticket-summary">
                <span>Pago</span>
                <span>$${formatMoney(pago)}</span>
            </div>
            <div class="ticket-summary">
                <span>Su Vuelto</span>
                <span>$${formatMoney(vuelto)}</span>
            </div>
            <br />
            <p class="center strong">COMPROBANTE NO VALIDO COMO FACTURA</p>
            <p class="center">CAMBIOS UNICAMENTE POR FALLA</p>
        </div>
    </div>
</body>
</html>`;
};

export default function PosCaja({ onOpenCatalog }) {
    const { state, addPosSale } = useData();
    const { user } = useAuth();
    const productos = state.config.posProductos || [];
    const ventasCount = (state.config.posVentas || []).length;

    const [search, setSearch] = useState('');
    const [cart, setCart] = useState([]);
    const [cliente, setCliente] = useState('Cons. Final');
    const [canalVenta, setCanalVenta] = useState('LOCAL');
    const [notasDePedido, setNotasDePedido] = useState('');
    const [descuentoRef, setDescuentoRef] = useState(0);
    const [descuentoGlobal, setDescuentoGlobal] = useState(0);
    const [mostrarModalCobro, setMostrarModalCobro] = useState(false);
    const [pagoRecibido, setPagoRecibido] = useState('');

    const [ultimoTicket, setUltimoTicket] = useState(null);
    const searchInputRef = useRef(null);
    const printFrameRef = useRef(null);

    // Auto-focus search on load
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    // Active products for search result auto-complete
    const activeProducts = useMemo(() => productos.filter(p => p.activo), [productos]);
    const searchResults = useMemo(() => {
        if (!search.trim()) return [];
        const query = search.toLowerCase();
        return activeProducts.filter(p =>
            (p.articuloVenta || p.codigoInterno).toLowerCase().includes(query) ||
            (p.articuloFabrica || '').toLowerCase().includes(query) ||
            (p.codigoBarras && p.codigoBarras.toLowerCase().includes(query)) ||
            p.detalleCorto.toLowerCase().includes(query)
        ).slice(0, 5);
    }, [search, activeProducts]);

    // Derived Totals
    const subtotal = cart.reduce((acc, item) => acc + (item.precioOriginal * item.cantidad), 0);
    const totalDescuentosItem = cart.reduce((acc, item) => {
        return acc + ((item.precioOriginal - item.precioUnitario) * item.cantidad);
    }, 0);

    // Apply global discount
    const totalFinal = Math.max(0, subtotal - totalDescuentosItem - descuentoGlobal);

    const handleAddToCart = (product) => {
        const pricing = getChannelPricing(product, canalVenta);
        setCart(prev => {
            const existing = prev.find(i => i.id === product.id);
            if (existing) {
                return prev.map(i =>
                    i.id === product.id ? { ...i, cantidad: i.cantidad + 1, importe: (i.cantidad + 1) * i.precioUnitario } : i
                );
            }
            return [...prev, {
                id: product.id,
                codigoInterno: product.articuloVenta || product.codigoInterno,
                articuloVenta: product.articuloVenta || product.codigoInterno,
                articuloFabrica: product.articuloFabrica || '',
                detalleCorto: product.detalleCorto,
                precioOriginal: pricing.price,
                precioUnitario: pricing.price,
                listaPrecio: pricing.listLabel,
                canalVenta,
                descuentoPorcentaje: 0,
                cantidad: 1,
                importe: pricing.price
            }];
        });
        setSearch('');
        searchInputRef.current?.focus();
    };

    useEffect(() => {
        setCart((prev) => prev.map((item) => {
            const product = productos.find((prod) => prod.id === item.id);
            if (!product) return item;
            const pricing = getChannelPricing(product, canalVenta);
            const newBasePrice = pricing.price;
            const discountedPrice = newBasePrice * (1 - ((item.descuentoPorcentaje || 0) / 100));
            return {
                ...item,
                precioOriginal: newBasePrice,
                precioUnitario: discountedPrice,
                listaPrecio: pricing.listLabel,
                canalVenta,
                importe: item.cantidad * discountedPrice
            };
        }));
    }, [canalVenta, productos]);

    const handleUpdateQuantity = (id, delta) => {
        setCart(prev => prev.map(i => {
            if (i.id === id) {
                const newQt = Math.max(1, i.cantidad + delta);
                return { ...i, cantidad: newQt, importe: newQt * i.precioUnitario };
            }
            return i;
        }));
    };

    const handleUpdateQuantityDirect = (id, newQt) => {
        let qt = Number(newQt);
        if (isNaN(qt) || qt < 1) qt = 1;

        setCart(prev => prev.map(i => {
            if (i.id === id) {
                return { ...i, cantidad: qt, importe: qt * i.precioUnitario };
            }
            return i;
        }));
    };

    const handleUpdateItemDiscount = (id, percentStr) => {
        const percent = Math.min(100, Math.max(0, Number(percentStr) || 0));
        setCart(prev => prev.map(i => {
            if (i.id === id) {
                const newPrice = i.precioOriginal * (1 - (percent / 100));
                return {
                    ...i,
                    descuentoPorcentaje: percent,
                    precioUnitario: newPrice,
                    importe: i.cantidad * newPrice
                };
            }
            return i;
        }));
    };

    const handleRemoveFromCart = (id) => {
        setCart(prev => prev.filter(i => i.id !== id));
    };

    const clearCaja = () => {
        setCart([]);
        setDescuentoGlobal(0);
        setSearch('');
        setCliente('Cons. Final');
        setCanalVenta('LOCAL');
        setNotasDePedido('');
    };

    // --- Cobranza ---
    const handleCobrar = () => {
        if (cart.length === 0) return;
        setPagoRecibido(totalFinal.toString());
        setMostrarModalCobro(true);
    };

    const confirmarVenta = () => {
        const pago = Number(pagoRecibido) || totalFinal;
        const vuelto = pago > totalFinal ? pago - totalFinal : 0;
        const nro = (ventasCount + 27000).toString(); // Simulating invoice numbering mapping user's screenshot

        const ticketInfo = {
            id: generateId(),
            nroComprobante: nro,
            fecha: new Date().toISOString(),
            vendedor: user.name,
            cliente: cliente || 'Cons. Final',
            canalVenta,
            notas: notasDePedido || '',
            items: cart,
            subtotal,
            descuento: totalDescuentosItem + descuentoGlobal,
            total: totalFinal,
            pago,
            vuelto: vuelto > 0 ? vuelto : 0
        };

        addPosSale(ticketInfo);
        setUltimoTicket(ticketInfo);
        setMostrarModalCobro(false);
        clearCaja();

        // Disparar Impresión Automática
        setTimeout(() => triggerPrint(ticketInfo), 250);
    };

    const triggerPrint = (ticketData = ultimoTicket) => {
        if (!ticketData) return;

        if (printFrameRef.current) {
            printFrameRef.current.remove();
            printFrameRef.current = null;
        }

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(iframe);
        printFrameRef.current = iframe;

        const printDocument = iframe.contentWindow?.document;
        if (!printDocument) {
            iframe.remove();
            printFrameRef.current = null;
            return;
        }

        printDocument.open();
        printDocument.write(buildTicketHtml(ticketData));
        printDocument.close();

        const printWindow = iframe.contentWindow;
        if (!printWindow) return;

        const cleanup = () => {
            setTimeout(() => {
                iframe.remove();
                if (printFrameRef.current === iframe) {
                    printFrameRef.current = null;
                }
            }, 800);
        };

        iframe.onload = () => {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                cleanup();
            }, 350);
        };
    };

    useEffect(() => {
        const handleShortcut = (event) => {
            if (event.key !== 'F6') return;
            event.preventDefault();

            if (mostrarModalCobro) {
                confirmarVenta();
                return;
            }

            if (cart.length > 0) {
                handleCobrar();
            }
        };

        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, [mostrarModalCobro, cart.length, pagoRecibido, totalFinal, cart, cliente, canalVenta, notasDePedido, subtotal, totalDescuentosItem, descuentoGlobal, ventasCount, user.name]);

    // Tecla rápida F6 para cobranza / confirmar venta
    // Escuchar Enter en buscador si hay 1 solo resultado
    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter' && searchResults.length === 1) {
            handleAddToCart(searchResults[0]);
        }
    };

    return (
        <div className="pos-caja">
            <div className="pos-caja-main">
                <div className="pos-caja-search" style={{ position: 'relative' }}>
                    <div className="pos-search-input-wrapper">
                        <Search size={20} color="var(--text-muted)" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar por art. local, fabrica o detalle..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                    </div>
                    {searchResults.length > 0 && (
                        <div className="pos-search-results">
                            {searchResults.map(p => (
                                <div key={p.id} className="pos-search-item" onClick={() => handleAddToCart(p)}>
                                    <span><strong>{p.articuloVenta || p.codigoInterno}</strong>{p.articuloFabrica ? ` / Fab ${p.articuloFabrica}` : ''} - {p.detalleCorto}</span>
                                    <span>${getChannelPricing(p, canalVenta).price}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="pos-caja-cart">
                    <table className="pos-cart-table">
                        <thead>
                            <tr>
                                <th style={{ width: '60px' }}>Cant.</th>
                                <th>Cod. / Detalle</th>
                                <th style={{ width: '120px' }}>Pr. Lista</th>
                                <th style={{ width: '80px' }}>Desc %</th>
                                <th style={{ width: '120px', textAlign: 'right' }}>Importe</th>
                                <th style={{ width: '50px', textAlign: 'center' }}><Trash2 size={16} /></th>
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <div className="qty-control">
                                            <button className="qty-btn" onClick={() => handleUpdateQuantity(item.id, -1)}><Minus size={12} /></button>
                                            <input
                                                type="number"
                                                value={item.cantidad}
                                                onChange={(e) => handleUpdateQuantityDirect(item.id, e.target.value)}
                                                style={{ width: '45px', textAlign: 'center', fontWeight: 'bold', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '2px' }}
                                                min="1"
                                            />
                                            <button className="qty-btn" onClick={() => handleUpdateQuantity(item.id, 1)}><Plus size={12} /></button>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 'var(--fw-semibold)' }}>{item.articuloVenta || item.codigoInterno}</div>
                                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{item.detalleCorto}</div>
                                        {item.articuloFabrica && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Fab: {item.articuloFabrica}</div>}
                                    </td>
                                    <td>
                                        <div>${item.precioOriginal}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.listaPrecio || 'LISTA 1'}</div>
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={item.descuentoPorcentaje || ''}
                                            onChange={e => handleUpdateItemDiscount(item.id, e.target.value)}
                                            style={{ width: '40px', padding: '2px 4px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                        />%
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${item.importe.toFixed(2)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button className="btn btn-ghost btn-danger btn-sm" style={{ padding: 0 }} onClick={() => handleRemoveFromCart(item.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Zona inferior de Descuentos extra y Cliente */}
                <div style={{ display: 'flex', gap: 16, background: 'var(--bg-card)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Descuento Global $:</span>
                        <input
                            type="number"
                            className="form-input"
                            style={{ width: 100 }}
                            value={descuentoGlobal || ''}
                            onChange={(e) => setDescuentoGlobal(Math.max(0, Number(e.target.value)))}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 'min-content' }}>
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Cliente:</span>
                        <input
                            type="text"
                            className="form-input"
                            style={{ width: '200px' }}
                            value={cliente}
                            onChange={(e) => setCliente(e.target.value)}
                            placeholder="Ej: Consumidor Final, Juan Pérez..."
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Canal:</span>
                        <select
                            className="form-input"
                            style={{ width: 180 }}
                            value={canalVenta}
                            onChange={(e) => setCanalVenta(e.target.value)}
                        >
                            {SALES_CHANNELS.map((channel) => (
                                <option key={channel} value={channel}>{channel}</option>
                            ))}
                        </select>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {canalVenta === 'PAGINA WEB'
                                ? 'Usa precio web'
                                : canalVenta === 'MODATEX' || canalVenta === 'DISTRITO'
                                ? 'Usa Lista 2'
                                : canalVenta === 'CHLOE'
                                ? 'Usa Lista 3'
                                : canalVenta === 'LUIS'
                                ? 'Usa Lista 4'
                                : 'Usa Lista 1'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 2, minWidth: '100%' }}>
                        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Recordatorio/Fecha:</span>
                        <input
                            type="text"
                            className="form-input"
                            style={{ flex: 1 }}
                            value={notasDePedido}
                            onChange={(e) => setNotasDePedido(e.target.value)}
                            placeholder="Ej: Retira el martes a la tarde..."
                        />
                    </div>
                </div>
            </div>

            <div className="pos-caja-side">
                <div className="pos-caja-totals">
                    <div className="pos-total-row">
                        <span>Prendas Totales:</span>
                        <span>{cart.reduce((a, c) => a + c.cantidad, 0)}</span>
                    </div>
                    <div className="pos-total-row">
                        <span>Subtotal:</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="pos-total-row" style={{ color: 'var(--danger)' }}>
                        <span>Descuentos:</span>
                        <span>-${(totalDescuentosItem + descuentoGlobal).toFixed(2)}</span>
                    </div>
                    <div className="pos-total-row grand-total">
                        <span>Total Final:</span>
                        <span>${totalFinal.toFixed(2)}</span>
                    </div>
                </div>

                <div className="pos-caja-numpad">
                    <button className="pos-action-btn primary" onClick={handleCobrar} disabled={cart.length === 0}>
                        <DollarSign size={24} /> Cobranza [F6]
                    </button>

                    <button className="pos-action-btn pos-action-btn-link" onClick={() => onOpenCatalog?.()}>
                        <PackagePlus size={22} /> Agregar Artículo
                    </button>

                    <button className="pos-action-btn" onClick={() => clearCaja()}>
                        <Trash2 size={24} /> Limpiar Caja
                    </button>

                    <button className="pos-action-btn" onClick={() => alert("Función en desarrollo para MVP")}>
                        <CreditCard size={24} /> Seña / Reserva
                    </button>

                    {ultimoTicket && (
                        <button className="pos-action-btn" onClick={triggerPrint} style={{ gridColumn: '1 / -1', background: 'var(--warning)', borderColor: 'var(--warning)', color: 'black' }}>
                            <Printer size={20} /> Reimprimir Últ. Ticket
                        </button>
                    )}
                </div>
            </div>

            {/* Modal de Cobro */}
            {mostrarModalCobro && (
                <div className="pos-modal-overlay pos-caja-payment-modal">
                    <div className="pos-modal">
                        <div className="pos-modal-header" style={{ background: 'var(--accent)', color: 'white' }}>
                            <h3 style={{ margin: 0 }}>Cerrar Ticket</h3>
                            <button className="btn btn-ghost" style={{ color: 'white' }} onClick={() => setMostrarModalCobro(false)}>✕</button>
                        </div>
                        <div className="pos-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>A Cobrar</div>
                                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--text-primary)' }}>${totalFinal.toFixed(2)}</div>
                            </div>

                            <div className="form-group">
                                <label>Monto Recibido</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    style={{ fontSize: '24px', padding: 12 }}
                                    value={pagoRecibido}
                                    onChange={(e) => setPagoRecibido(e.target.value)}
                                />
                            </div>

                            {(Number(pagoRecibido) - totalFinal) > 0 && (
                                <div style={{ textAlign: 'center', background: 'rgba(34, 197, 94, 0.1)', padding: 16, borderRadius: 8 }}>
                                    <div style={{ fontSize: 'var(--fs-sm)', color: '#22c55e' }}>Vuelto a entregar</div>
                                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>
                                        ${(Number(pagoRecibido) - totalFinal).toFixed(2)}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="pos-modal-footer">
                            <button className="btn btn-secondary" onClick={() => setMostrarModalCobro(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={confirmarVenta}>Confirmar E Imprimir [F6]</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
