// Initial data for Yuliya production cost sheet (app-data/yuliya)
// Field names match DEFAULT_ROW in YuliyaPage.jsx
// costoReal, precioReal, porcTela are computed — not stored

const makeId = (i) => `yuliya-seed-${i}`;

const YULIYA_INITIAL_DATA = [
    {
        id: makeId(0),
        articuloFabrica: '2021',
        articuloLocal: '6002',
        descripcion: 'BASICA M/L/XL',
        tela: 'modal soft',
        cotizacion: 1500,
        tallerPrueba: 1200,
        porcGanancia: 0.7,
        precioLuis: 5000,
        precioLocal: 5900,
        precioChloe: 3600,
        talleres: 'ANNA',
        precioTallerReal: 1000,
        nCorte: '1',
        cantidadPrenda: 486,
        fechaCorte: '2026-02-02',
        precioTelaXMetro: 4.9,
        kilajeMetroTotal: 458.4,
        rollos: 19,
        accesorios: 0,
        accesorios2: 0,
    },
    {
        id: makeId(1),
        articuloFabrica: '2412',
        articuloLocal: '6004',
        descripcion: 'BASICA V M/L/XL',
        tela: 'modal soft',
        cotizacion: 1500,
        tallerPrueba: 1500,
        porcGanancia: 0.7,
        precioLuis: 5000,
        precioLocal: 6100,
        precioChloe: 3700,
        talleres: 'JOSE',
        precioTallerReal: 1000,
        nCorte: '1',
        cantidadPrenda: 486,
        fechaCorte: '2026-02-02',
        precioTelaXMetro: 4.9,
        kilajeMetroTotal: 458.4,
        rollos: 19,
        accesorios: 0,
        accesorios2: 0,
    },
    // TODO: add remaining 71 rows here
];

export default YULIYA_INITIAL_DATA;
