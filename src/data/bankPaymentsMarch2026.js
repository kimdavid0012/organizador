const IMPORT_BATCH_ID = 'marzo-2026-libro3';

const RAW_MARCH_2026_PAYMENTS = `
B|2026-03-02|sebastian matias staffola|200000
B|2026-03-02|serber/daniel|261400
B|2026-03-02|claudia rita alaniz|200000
B|2026-03-03|espinoza yamila|73000
B|2026-03-04|yesica martinez|182400
B|2026-03-04|micaela ailen|99060
B|2026-03-05|diz andrea|60400
B|2026-03-05|paula raquel|79790
B|2026-03-06|agustina aloy|66400
B|2026-03-06|deposito|614700
B|2026-03-06|sandra liberto|300000
B|2026-03-06|agustina ajusta|385050
B|2026-03-09|antonela yanina|258500
B|2026-03-09|estefania gisela|395360
B|2026-03-09|marcela alejandra|312000
B|2026-03-09|miryan alejandra|484400
B|2026-03-09|soto mikaela|84600
B|2026-03-09|vallejos carlos|681600
B|2026-03-10|agustina|137020
B|2026-03-10|gertge|143930
B|2026-03-11|camila susana silva|40000
B|2026-03-11|rejon, camila|179100
B|2026-03-11|gisel rosario gonzalez|573800
B|2026-03-12|delia cristina|161860
B|2026-03-13|valeria lorena|59200
B|2026-03-14|claudia natalia|190900
B|2026-03-16|De claudia rita alaniz|200000
B|2026-03-16|sebastian matias staff|150000
B|2026-03-16|sandra karina barrenec|124700
B|2026-03-16|ana josefina cerda dia|146760
B|2026-03-16|Sucati|18803400
B|2026-03-16||148000
B|2026-03-17|agostina ayelen rojas|124100
B|2026-03-18|pendino julieta|243100
B|2026-03-18|erica elizabeth|99000
B|2026-03-18|erica elizabeth|12000
B|2026-03-18|valentino jonas|3800
B|2026-03-19|barbara anabella saave|169340
B|2026-03-19|agustina justa fernandez|309450
B|2026-03-19|rebeca paola mescher|139420
B|2026-03-19|ariel fernando yanque|368700
B|2026-03-20|jurkowski/jessica|114000
B|2026-03-20|De las meidales srl|200000
B|2026-03-20|priscila nobile|160330
B|2026-03-20|sandra liberto|300000
B|2026-03-20|deposito|252000
M|2026-03-03||16500
M|2026-03-04||41250
M|2026-03-05||21450
M|2026-03-05||23000
M|2026-03-06||17600
M|2026-03-07||13200
M|2026-03-12||11000
M|2026-03-13||17600
M|2026-03-13||15000
M|2026-03-14||6050
M|2026-03-14||17600
M|2026-03-14||12100
M|2026-03-14||12100
M|2026-03-14||11000
M|2026-03-14||46310
M|2026-03-18||12100
M|2026-03-20||24750
`.trim();

const parsedEntries = RAW_MARCH_2026_PAYMENTS.split('\n').map((line, index) => {
    const [methodCode, fecha, cliente, monto] = line.split('|');
    const metodo = methodCode === 'B' ? 'Banco' : 'Mercado Pago';

    return {
        id: `${IMPORT_BATCH_ID}-${index + 1}`,
        fecha,
        cliente,
        metodo,
        monto: Number(monto),
        batchId: IMPORT_BATCH_ID,
        source: 'Libro3.xlsx',
        importedAt: '2026-03-20T00:00:00.000Z'
    };
});

const bankTotal = parsedEntries
    .filter((entry) => entry.metodo === 'Banco')
    .reduce((acc, entry) => acc + entry.monto, 0);

const mercadoPagoTotal = parsedEntries
    .filter((entry) => entry.metodo === 'Mercado Pago')
    .reduce((acc, entry) => acc + entry.monto, 0);

export const MARCH_2026_BANK_PAYMENTS_IMPORT = {
    batchId: IMPORT_BATCH_ID,
    monthLabel: 'Marzo 2026',
    sourceName: 'Libro3.xlsx - Marzo 2026',
    entries: parsedEntries,
    totals: {
        banco: bankTotal,
        mercadoPago: mercadoPagoTotal,
        combined: bankTotal + mercadoPagoTotal,
        count: parsedEntries.length
    }
};
