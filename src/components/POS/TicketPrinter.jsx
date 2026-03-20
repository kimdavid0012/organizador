import React, { forwardRef, useEffect } from 'react';
import { isTodayOrOverdue } from '../../utils/helpers';
import './TicketPrinter.css';

const TicketPrinter = forwardRef(({ ticketData }, ref) => {
    if (!ticketData) return null;

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
        notas = ''
    } = ticketData;

    return (
        <div className="thermal-ticket-container">
            <div ref={ref} className="thermal-ticket">
                <div className="ticket-header">
                    <h2>Celavie</h2>
                    <p>Cuenca 544 - Flores</p>
                    <p>Telefono: (54) 11.2726.0713</p>
                    <p>----------------------------------------</p>
                    <div className="ticket-meta">
                        <span>COMPROBANTE INTERNO</span>
                        <span>N: {nroComprobante}</span>
                    </div>
                    <div className="ticket-meta">
                        <span>{new Date(fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        <span>Vendedor: {vendedor}</span>
                    </div>
                    <p>----------------------------------------</p>
                    <p>{cliente}</p>
                    {notas && <p style={{ fontWeight: 'bold' }}>Nota: {notas}</p>}
                    <p>----------------------------------------</p>
                    <div className="ticket-col-headers">
                        <span>COD - DESCRIPCION</span>
                        <span>CANT./P.LIST/P.DESC/DESC %</span>
                        <span style={{ textAlign: 'right' }}>IMPORTE</span>
                    </div>
                    <p>----------------------------------------</p>
                </div>

                <div className="ticket-items">
                    {items.map((item, idx) => (
                        <div key={idx} className="ticket-item-row">
                            <div className="item-name">{item.codigoInterno} - {item.detalleCorto}</div>
                            <div className="item-details">
                                <span>{item.cantidad} / ${item.precioOriginal} / ${item.precioUnitario} / {item.descuentoPorcentaje}%</span>
                                <span style={{ textAlign: 'right' }}>${item.importe}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="ticket-footer">
                    <p>----------------------------------------</p>
                    <div className="ticket-summary">
                        <span>Cantidad Productos</span>
                        <span>{items.reduce((acc, i) => acc + i.cantidad, 0)}</span>
                    </div>
                    <p>----------------------------------------</p>
                    <div className="ticket-summary">
                        <span>Subtotal</span>
                        <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="ticket-summary">
                        <span>Subtotal con Descuentos</span>
                        <span>${(subtotal - descuento).toFixed(2)}</span>
                    </div>
                    <p>----------------------------------------</p>
                    <div className="ticket-summary grand-total">
                        <span>Total Final</span>
                        <span>${total.toFixed(2)}</span>
                    </div>
                    <div className="ticket-summary">
                        <span>Pago</span>
                        <span>${pago.toFixed(2)}</span>
                    </div>
                    <div className="ticket-summary">
                        <span>Su Vuelto</span>
                        <span>${vuelto.toFixed(2)}</span>
                    </div>
                    <br />
                    <p style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>COMPROBANTE NO VÁLIDO COMO FACTURA</p>
                    <br />
                    <p style={{ textAlign: 'center', fontSize: '11px' }}>CAMBIOS UNICAMENTE SOLO POR FALLA</p>
                    <br />
                </div>
            </div>
        </div>
    );
});

export default TicketPrinter;
