const IMPORT_BATCH_ID = 'enero-2026-libro1';

const RAW_JANUARY_2026_PAYMENTS = `
B|2026-01-05|santucho noelia|118400
B|2026-01-05|guerrero maria|336600
B|2026-01-05|sucati|1400696
B|2026-01-06|monica elizabet|227500
B|2026-01-06|cornejo migue|253500
B|2026-01-07|garmendia Evangelina|196500
B|2026-01-07|LAURA ANDREA DELGADO|116900
B|2026-01-07|ana constanza|107800
B|2026-01-07|daniela bulay|300000
B|2026-01-08|fatima daniela|106500
B|2026-01-09|adrian claudio|70450
B|2026-01-09|tiago|100000
B|2026-01-09|andrea goldfather|320840
B|2026-01-09|marcela alejandra|460000
B|2026-01-09|camila villanueva|191700
B|2026-01-09|camila agustina|176200
B|2026-01-09|sergio edgardo|331100
B|2026-01-12|luciana|350000
B|2026-01-12|yesica adriana farias mendez|172500
B|2026-01-12|lourdes maria yamile casazza|100200
B|2026-01-12|flora yolanda colombo|217100
B|2026-01-12|sucati|1600588
B|2026-01-13|acosta silvia|137500
B|2026-01-13|dora alicia|272500
B|2026-01-13|sambueza|131500
B|2026-01-13|miriam dels|121300
B|2026-01-14|celia|4000000
B|2026-01-14|yanina soledad|137500
B|2026-01-14|antonela yanina|180000
B|2026-01-14|stella maris|124500
B|2026-01-15|ELISABET ESTE|26000
B|2026-01-15|roxana pamela|121400
B|2026-01-15|sebastian|500000
B|2026-01-16|soledad fuentes|179000
B|2026-01-16|casual|400000
B|2026-01-19|ornella gherdo|275000
B|2026-01-19|vanessa peralta gissel|221500
B|2026-01-19|marcela corrado alejandra|80000
B|2026-01-19|adriana valeria barragan|160000
B|2026-01-19|sandra|500000
B|2026-01-19|paula vanina francisca|160000
B|2026-01-19|julia casares acosta|14000
B|2026-01-19|laura coniglio|192000
B|2026-01-19|sepulveda barbara|167500
B|2026-01-19|fanfliet daniel graciela fontanillo|123500
B|2026-01-20|julieta ayelen|210000
B|2026-01-20|victor guillermo|396500
B|2026-01-21|romina estefania|76000
B|2026-01-21|fabiola garcia sol games|169400
B|2026-01-22|maria belen|67200
B|2026-01-22|besombes ayelen|186500
B|2026-01-22|shodoka sebastian|822500
B|2026-01-22|lara agustina ramos|121500
B|2026-01-22|cynthia romina guy|190800
B|2026-01-22|grecia galiano|200000
B|2026-01-23|monica desiree gaston|108500
B|2026-01-23|mariana|1134000
B|2026-01-26|garmendia Evangelina|155000
B|2026-01-26|sergio alejandro casual|250000
B|2026-01-27|munoz|131500
B|2026-01-27|sandra|396800
B|2026-01-28|hoz stefani aile|158200
B|2026-01-29|daian malen|116050
B|2026-01-29|melisa paola|205000
B|2026-01-30|lorena silvana|420000
B|2026-01-30|erica emilse|76450
B|2026-01-30|ezequiel dario|211500
B|2026-01-30|nancy jaquelin|79500
B|2026-01-30|nancy jaquelin|7950
B|2026-01-31|claudia natalia virgol|176000
M|2026-01-02||41250
M|2026-01-02||4400
M|2026-01-02||19800
M|2026-01-02||12100
M|2026-01-03||60500
M|2026-01-03||13200
M|2026-01-03||28600
M|2026-01-03||61600
M|2026-01-03||16500
M|2026-01-03||13200
M|2026-01-03||24200
M|2026-01-05||11000
M|2026-01-06||37400
M|2026-01-06||19800
M|2026-01-06||4400
M|2026-01-06||14300
M|2026-01-06||16500
M|2026-01-06||22000
M|2026-01-06||13200
M|2026-01-06||20900
M|2026-01-07||68200
M|2026-01-08||18700
M|2026-01-08||61600
M|2026-01-08||29150
M|2026-01-08||52250
M|2026-01-09||15400
M|2026-01-09||33000
M|2026-01-09||85800
M|2026-01-09||16500
M|2026-01-10||15400
M|2026-01-10||6600
M|2026-01-10||28050
M|2026-01-10||34100
M|2026-01-10||19800
M|2026-01-10||5500
M|2026-01-12||15400
M|2026-01-12||5500
M|2026-01-13||15400
M|2026-01-13||37400
M|2026-01-14||15950
M|2026-01-15||23100
M|2026-01-15||29700
M|2026-01-15||20900
M|2026-01-16||8800
M|2026-01-16||40700
M|2026-01-16||48400
M|2026-01-17||11000
M|2026-01-17||11000
M|2026-01-17||16500
M|2026-01-17||3300
M|2026-01-17||8800
M|2026-01-17||19800
M|2026-01-19||17600
M|2026-01-20||18700
M|2026-01-21||20900
M|2026-01-21||79200
M|2026-01-21||1000
M|2026-01-22||22000
M|2026-01-22||16500
M|2026-01-22||13200
M|2026-01-23||23100
M|2026-01-24||15400
M|2026-01-24||15400
M|2026-01-24||29700
M|2026-01-24||11000
M|2026-01-26||28600
M|2026-01-26||66000
M|2026-01-27||26400
M|2026-01-27||78100
M|2026-01-27||15400
M|2026-01-27||22000
M|2026-01-28||67100
M|2026-01-29||23100
M|2026-01-29||22000
M|2026-01-29||162800
M|2026-01-30||35200
M|2026-01-31||12100
M|2026-01-31||75350
M|2026-01-31||4400
M|2026-01-31||36300
M|2026-01-31||17600
M|2026-01-31||8250
`.trim();

const parsedEntries = RAW_JANUARY_2026_PAYMENTS.split('\n').map((line, index) => {
    const [methodCode, fecha, cliente, monto] = line.split('|');
    const metodo = methodCode === 'B' ? 'Banco' : 'Mercado Pago';

    return {
        id: `${IMPORT_BATCH_ID}-${index + 1}`,
        fecha,
        cliente,
        metodo,
        monto: Number(monto),
        batchId: IMPORT_BATCH_ID,
        source: 'Libro1.xlsx',
        importedAt: '2026-03-20T00:00:00.000Z'
    };
});

const bankTotal = parsedEntries
    .filter((entry) => entry.metodo === 'Banco')
    .reduce((acc, entry) => acc + entry.monto, 0);

const mercadoPagoTotal = parsedEntries
    .filter((entry) => entry.metodo === 'Mercado Pago')
    .reduce((acc, entry) => acc + entry.monto, 0);

export const JANUARY_2026_BANK_PAYMENTS_IMPORT = {
    batchId: IMPORT_BATCH_ID,
    sourceName: 'Libro1.xlsx - Enero 2026',
    entries: parsedEntries,
    totals: {
        banco: bankTotal,
        mercadoPago: mercadoPagoTotal,
        combined: bankTotal + mercadoPagoTotal,
        count: parsedEntries.length
    }
};
