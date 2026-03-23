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
        @page { size: 58mm auto; margin: 0; }
        html, body {
            width: 58mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            overflow: visible;
            font-family: "Courier New", Courier, monospace;
            font-size: 9px;
            line-height: 1.1;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .thermal-ticket {
            box-sizing: border-box;
            width: 54mm;
            padding: 1.5mm 1.5mm 5mm;
        }
        .ticket-header h2 {
            text-align: center;
            font-size: 15px;
            margin: 2px 0 4px;
            letter-spacing: 0.5px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .ticket-header p, .ticket-footer p { margin: 2px 0; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .ticket-meta, .ticket-summary, .item-details, .ticket-col-headers {
            display: flex;
            justify-content: space-between;
            gap: 4px;
        }
        .ticket-meta, .ticket-summary { margin: 1px 0; }
        .ticket-col-headers {
            font-weight: bold;
            border-bottom: 1px solid #000;
            padding-bottom: 2px;
            margin-top: 2px;
        }
        .ticket-col-headers span:first-child { width: 100%; }
        .ticket-col-headers span:last-child { width: 48px; text-align: right; flex-shrink: 0; }
        .ticket-items { margin: 4px 0; }
        .ticket-item-row {
            margin-bottom: 4px;
            padding-bottom: 2px;
            border-bottom: 0.5px solid #ddd;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .item-name {
            font-weight: bold;
            word-break: break-word;
            margin-bottom: 1px;
            overflow-wrap: anywhere;
        }
        .item-details span:first-child {
            flex: 1;
            min-width: 0;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        .item-details span:last-child {
            flex-shrink: 0;
            text-align: right;
            width: 48px;
        }
        .grand-total {
            font-size: 12px;
            font-weight: bold;
            border-top: 1px double #000;
            padding-top: 3px;
            margin-top: 4px;
        }
        .center { text-align: center; }
        .strong { font-weight: bold; }
        .ticket-meta span:last-child,
        .ticket-summary span:last-child {
            flex-shrink: 0;
            text-align: right;
            max-width: 48%;
        }
        .ticket-meta span:first-child,
        .ticket-summary span:first-child {
            min-width: 0;
            overflow-wrap: anywhere;
        }
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

export const printThermalTicket = (ticketData, existingFrameRef = null) => {
    if (!ticketData || typeof document === 'undefined') return null;

    if (existingFrameRef?.current) {
        existingFrameRef.current.remove();
        existingFrameRef.current = null;
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

    if (existingFrameRef) {
        existingFrameRef.current = iframe;
    }

    const printDocument = iframe.contentWindow?.document;
    if (!printDocument) {
        iframe.remove();
        if (existingFrameRef) existingFrameRef.current = null;
        return null;
    }

    printDocument.open();
    printDocument.write(buildTicketHtml(ticketData));
    printDocument.close();

    const printWindow = iframe.contentWindow;
    if (!printWindow) return null;

    const cleanup = () => {
        setTimeout(() => {
            iframe.remove();
            if (existingFrameRef?.current === iframe) {
                existingFrameRef.current = null;
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

    return iframe;
};
