const normalizeText = (value) => (value || '').toString().trim();

const toTimestamp = (value) => {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const buildTicketKey = (ticket = {}) => {
    if (ticket.id) return `id:${ticket.id}`;
    return [
        normalizeText(ticket.nroComprobante),
        normalizeText(ticket.fecha),
        normalizeText(ticket.vendedor),
        Number(ticket.total || 0)
    ].join('|');
};

export const buildPosTicketHistory = (config = {}) => {
    const currentSales = Array.isArray(config.posVentas) ? config.posVentas : [];
    const archivedSales = (Array.isArray(config.posCerradoZ) ? config.posCerradoZ : [])
        .flatMap((entry) => Array.isArray(entry?.detalleVentas) ? entry.detalleVentas : []);
    const dedicatedHistory = Array.isArray(config.posHistorialTickets) ? config.posHistorialTickets : [];

    const merged = [...currentSales, ...archivedSales, ...dedicatedHistory];
    const deduped = new Map();

    merged.forEach((ticket) => {
        if (!ticket) return;
        const key = buildTicketKey(ticket);
        const current = deduped.get(key);
        if (!current || toTimestamp(ticket.fecha) > toTimestamp(current.fecha)) {
            deduped.set(key, ticket);
        }
    });

    return Array.from(deduped.values()).sort((left, right) => toTimestamp(right.fecha) - toTimestamp(left.fecha));
};
