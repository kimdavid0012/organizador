const IMPORT_BATCH_ID = 'febrero-2026-libro2';

const RAW_FEBRUARY_2026_PAYMENTS = `
B|2026-02-02|mara betsabe|80350
B|2026-02-02|rodriguez lidida|235500
B|2026-02-03|balcarce juliana|184800
B|2026-02-04|patricia e montes|122600
B|2026-02-04|luciana ethel|181000
B|2026-02-04|alejandra yamila|105600
B|2026-02-05|rocio anahi|100700
B|2026-02-06|mariela andrea|547200
B|2026-02-06|luz melany|187500
B|2026-02-06|monica susana|90750
B|2026-02-06|celia|5000000
B|2026-02-06|casual mendoza|250000
B|2026-02-06|sebastian matias daniela bulay|250000
B|2026-02-07|De rios,gladys graciela|80300
B|2026-02-09|erica viviana|238000
B|2026-02-11|mariana beatriz|71000
B|2026-02-12|nancy soledad|101200
B|2026-02-18|tiago|200000
B|2026-02-18|casual mendoza|200000
B|2026-02-18|sebastian matias|200000
B|2026-02-18|belynki alejandra|100005
B|2026-02-18|ivana mabel|127000
B|2026-02-18|maria laura|84500
B|2026-02-18|nadia micaela|95500
B|2026-02-19|lara maria mainetti|106000
B|2026-02-19|mariana ragghianti|248000
B|2026-02-19|rocio ayelen hernandez|394000
B|2026-02-19|schlishting,rosa maria|114500
B|2026-02-19|belen rinaldi|116400
B|2026-02-20|jacquelin micol|272500
B|2026-02-20|edit estela|64000
B|2026-02-20|deposito|112000
B|2026-02-20|marilin soledad|177500
B|2026-02-21|vegamonte, eliane|150260
B|2026-01-23|mondino/silvia este|260000
B|2026-01-23|quinteros/tourn camila|70300
B|2026-02-24|enrique|100000
B|2026-02-24|vallejos carlos|493500
B|2026-02-24|camila del valle|73700
B|2026-02-25|carla andrea|191760
B|2026-02-26|Kavra sa|1075445
B|2026-02-26|camila ayelin bargas|112200
B|2026-02-26|miriam dels cardenas|95500
B|2026-02-27|claudia natalia|168200
B|2026-02-27|scalbi victoria|74300
M|2026-02-02||39600
M|2026-02-03||14850
M|2026-02-04||19800
M|2026-02-04||9900
M|2026-02-04||9900
M|2026-02-06||25300
M|2026-02-06||16500
M|2026-02-06||17600
M|2026-02-06||11000
M|2026-02-06||20900
M|2026-02-07||12100
M|2026-02-07||11000
M|2026-02-07||15400
M|2026-02-07||4400
M|2026-02-07||17600
M|2026-02-07||17600
M|2026-02-07||53900
M|2026-02-07||70400
M|2026-02-07||9900
M|2026-02-07||9900
M|2026-02-07||11000
M|2026-02-07||8800
M|2026-02-09||28600
M|2026-02-09||9900
M|2026-02-10||9900
M|2026-02-10||28600
M|2026-02-10||8000
M|2026-02-11||23100
M|2026-02-12||6600
M|2026-02-12||52800
M|2026-02-12||53900
M|2026-02-12||16500
M|2026-02-12||15400
M|2026-02-13||36300
M|2026-02-13||13200
M|2026-02-13||14300
M|2026-02-13||19800
M|2026-02-13||9900
M|2026-02-14||28000
M|2026-02-14||9900
M|2026-02-14||20900
M|2026-02-14||9900
M|2026-02-14||4400
M|2026-02-14||23100
M|2026-02-14||22000
M|2026-02-14||18700
M|2026-02-14||12100
M|2026-02-14||4400
M|2026-02-14||3300
M|2026-02-14||9900
M|2026-02-14||11000
M|2026-02-14||48400
M|2026-02-18||29700
M|2026-02-18||55000
M|2026-02-18||19800
M|2026-02-19||17600
M|2026-02-19||26400
M|2026-02-20||25300
M|2026-02-20||39500
M|2026-02-20||14300
M|2026-02-20||9900
M|2026-02-21||42900
M|2026-02-21||25300
M|2026-02-21||37400
M|2026-02-21||12100
M|2026-02-21||8800
M|2026-02-24||104500
M|2026-02-24||49500
M|2026-02-25||19800
M|2026-02-25||6600
M|2026-02-25||87450
M|2026-02-25||21560
M|2026-02-26||17490
M|2026-02-27||17050
M|2026-02-28||19800
M|2026-02-28||5280
M|2026-02-28||13200
`.trim();

const parsedEntries = RAW_FEBRUARY_2026_PAYMENTS.split('\n').map((line, index) => {
    const [methodCode, fecha, cliente, monto] = line.split('|');
    const metodo = methodCode === 'B' ? 'Banco' : 'Mercado Pago';

    return {
        id: `${IMPORT_BATCH_ID}-${index + 1}`,
        fecha,
        cliente,
        metodo,
        monto: Number(monto),
        batchId: IMPORT_BATCH_ID,
        source: 'Libro2.xlsx',
        importedAt: '2026-03-20T00:00:00.000Z'
    };
});

const bankTotal = parsedEntries
    .filter((entry) => entry.metodo === 'Banco')
    .reduce((acc, entry) => acc + entry.monto, 0);

const mercadoPagoTotal = parsedEntries
    .filter((entry) => entry.metodo === 'Mercado Pago')
    .reduce((acc, entry) => acc + entry.monto, 0);

export const FEBRUARY_2026_BANK_PAYMENTS_IMPORT = {
    batchId: IMPORT_BATCH_ID,
    sourceName: 'Libro2.xlsx - Febrero 2026',
    entries: parsedEntries,
    totals: {
        banco: bankTotal,
        mercadoPago: mercadoPagoTotal,
        combined: bankTotal + mercadoPagoTotal,
        count: parsedEntries.length
    }
};
