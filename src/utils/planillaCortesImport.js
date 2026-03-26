const normalizeText = (value) => (value || '').toString().replace(/\u00a0/g, ' ').trim();
const normalizeComparable = (value) => normalizeText(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');

const parseNumber = (value) => {
    if (typeof value === 'number') return value;
    const normalized = normalizeText(value);
    if (!normalized) return 0;
    const cleaned = normalized
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const pad = (value) => value.toString().padStart(2, '0');

const toDateInputValue = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDate = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return toDateInputValue(value);
    }

    const normalized = normalizeText(value);
    const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (slashMatch) {
        let [, first, second, year] = slashMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        let day = Number(first);
        let month = Number(second);

        if (Number(first) <= 12 && Number(second) > 12) {
            day = Number(second);
            month = Number(first);
        }

        return `${fullYear}-${pad(month)}-${pad(day)}`;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : toDateInputValue(date);
};

const extractCorteNumber = (row = []) => {
    for (const cell of row) {
        if (cell instanceof Date) continue;
        if (typeof cell === 'number' && cell >= 1 && cell < 100000) {
            return String(Math.trunc(cell));
        }

        const normalized = normalizeText(cell);
        if (!normalized) continue;
        const corteMatch = normalized.match(/CORTE\s*#?\s*(\d{1,5})/i);
        if (corteMatch) return corteMatch[1];

        if (/^\d{1,5}$/.test(normalized)) return normalized;
    }
    return '';
};

const isHeaderRow = (row = [], nextRow = []) => {
    const firstCell = normalizeText(row[0]);
    if (!firstCell) return false;

    const comparable = normalizeComparable(firstCell);
    if (!comparable || comparable === 'TOTAL' || comparable === 'COLORES' || comparable.startsWith('COLUMN')) {
        return false;
    }

    const nextComparable = nextRow.map((cell) => normalizeComparable(cell));
    const hasDetailsHeader = nextComparable.some((value) =>
        value === 'COLORES'
        || value.startsWith('COLUMN')
        || value.includes('KILO')
        || value.includes('CANTIDAD')
        || value.includes('ROLLO')
    );

    if (!hasDetailsHeader) return false;

    const corteNumero = extractCorteNumber(row);
    const fecha = row.some((cell) => Boolean(parseDate(cell)));
    return Boolean(corteNumero || fecha);
};

const detectColumnIndexes = (row = []) => {
    const headers = row.map((cell) => normalizeComparable(cell));
    const colorIndex = headers.findIndex((value) => value === 'COLORES' || value.startsWith('COLUMN1'));
    const kiloIndex = headers.findIndex((value) => value.includes('KILO') || value === 'KG');
    const cantidadIndex = headers.findIndex((value) => value.includes('CANTIDAD'));
    const rolloIndex = headers.findIndex((value) => value.includes('ROLLO'));

    return {
        colorIndex: colorIndex >= 0 ? colorIndex : 0,
        kiloIndex: kiloIndex >= 0 ? kiloIndex : 1,
        cantidadIndex: cantidadIndex >= 0 ? cantidadIndex : 2,
        rolloIndex: rolloIndex >= 0 ? rolloIndex : Math.max(cantidadIndex >= 0 ? cantidadIndex + 1 : 3, 3)
    };
};

const buildPlanillaBatchId = (fileName) => {
    const normalized = normalizeText(fileName).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `planilla-cortes-${normalized || 'import'}`;
};

export const parsePlanillaCortesWorkbook = (workbook, xlsxUtils, fileName = 'PLANILLA CORTE.xlsx') => {
    const batchId = buildPlanillaBatchId(fileName);
    const blocks = [];

    workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsxUtils?.sheet_to_json
            ? xlsxUtils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
            : [];
        const cortador = normalizeText(sheetName)
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex] || [];
            const nextRow = rows[rowIndex + 1] || [];

            if (!isHeaderRow(row, nextRow)) continue;

            const telaNombre = normalizeText(row[0]) || 'Sin tela';
            const corteNumero = extractCorteNumber(row);
            const fecha = row.map((cell) => parseDate(cell)).find(Boolean) || '';
            const { colorIndex, kiloIndex, cantidadIndex, rolloIndex } = detectColumnIndexes(nextRow);

            const detalles = [];
            let cursor = rowIndex + 2;

            while (cursor < rows.length) {
                const detailRow = rows[cursor] || [];
                const nextDetailRow = rows[cursor + 1] || [];
                const firstCell = normalizeText(detailRow[0]);
                const firstComparable = normalizeComparable(firstCell);

                if (!detailRow.some((cell) => normalizeText(cell))) {
                    if (isHeaderRow(nextDetailRow, rows[cursor + 2] || [])) break;
                    cursor += 1;
                    continue;
                }

                if (firstComparable === 'TOTAL') break;
                if (isHeaderRow(detailRow, nextDetailRow)) break;

                const color = normalizeText(detailRow[colorIndex] ?? detailRow[0]);
                const kilos = parseNumber(detailRow[kiloIndex] ?? detailRow[1]);
                const cantidadPrendas = parseNumber(detailRow[cantidadIndex] ?? detailRow[2]);
                const rollos = Math.max(1, parseNumber(detailRow[rolloIndex] ?? detailRow[3]) || 1);

                if (color && (kilos || cantidadPrendas || rollos)) {
                    detalles.push({
                        color,
                        kilos,
                        cantidadPrendas,
                        rollos
                    });
                }

                cursor += 1;
            }

            const comparableTela = normalizeComparable(telaNombre);
            const blockKey = [
                batchId,
                normalizeComparable(sheetName),
                corteNumero || 'SIN-CORTE',
                fecha || 'SIN-FECHA',
                comparableTela || 'SIN-TELA'
            ].join('|');

            if (detalles.length > 0) {
                blocks.push({
                    blockKey,
                    batchId,
                    sheetName,
                    cortador,
                    corteNumero,
                    fecha,
                    telaNombre,
                    comparableTela,
                    detalles,
                    totalKilos: detalles.reduce((acc, item) => acc + Number(item.kilos || 0), 0),
                    totalPrendas: detalles.reduce((acc, item) => acc + Number(item.cantidadPrendas || 0), 0),
                    totalRollos: detalles.reduce((acc, item) => acc + Number(item.rollos || 0), 0)
                });
            }

            rowIndex = cursor;
        }
    });

    return { batchId, fileName, blocks };
};

const matchTelaByName = (telas = [], comparableTela = '') => {
    if (!comparableTela) return null;
    const exact = telas.find((tela) => normalizeComparable(tela.nombre) === comparableTela);
    if (exact) return exact;

    return telas.find((tela) => {
        const key = normalizeComparable(tela.nombre);
        return key && (key.includes(comparableTela) || comparableTela.includes(key));
    }) || null;
};

const matchColor = (tela = {}, colorName = '') => {
    const comparableColor = normalizeComparable(colorName);
    if (!comparableColor) return null;
    return (tela.coloresStock || []).find((item) => {
        const key = normalizeComparable(item.nombre);
        return key && (key === comparableColor || key.includes(comparableColor) || comparableColor.includes(key));
    }) || null;
};

const extractCorteNumberFromName = (value = '') => {
    const match = normalizeText(value).match(/(\d{1,5})/);
    return match ? match[1] : '';
};

export const mergePlanillaCortesIntoState = (state, parsedBatch, generateId) => {
    const existingPlanillas = Array.isArray(state.config?.planillasCortes) ? state.config.planillasCortes : [];
    const nextPlanillas = existingPlanillas.filter((item) => item.batchId !== parsedBatch.batchId);
    const nextCortes = Array.isArray(state.config?.cortes) ? state.config.cortes.map((corte) => ({ ...corte, consumos: [...(corte.consumos || [])] })) : [];
    const blockKeys = new Set(parsedBatch.blocks.map((block) => block.blockKey));
    const importedCutIds = new Set();
    const nextCortadores = new Set(Array.isArray(state.config?.cortadores) ? state.config.cortadores : []);

    parsedBatch.blocks.forEach((block) => {
        let corte = null;

        if (block.corteNumero) {
            corte = nextCortes.find((item) => extractCorteNumberFromName(item.nombre) === block.corteNumero);
        }

        if (!corte) {
            corte = nextCortes.find((item) => (item.planillaBlockKeys || []).includes(block.blockKey));
        }

        if (!corte) {
            corte = {
                id: generateId(),
                nombre: block.corteNumero ? `Corte #${block.corteNumero}` : `Planilla ${block.sheetName} ${block.fecha || ''}`.trim(),
                fecha: block.fecha || new Date().toISOString().slice(0, 10),
                moldeIds: [],
                moldesData: [],
                consumos: [],
                planillaBlockKeys: []
            };
            nextCortes.unshift(corte);
        }

        corte.fecha = block.fecha || corte.fecha;
        corte.cortadorPlanilla = block.cortador;
        corte.planillaBlockKeys = Array.from(new Set([...(corte.planillaBlockKeys || []), block.blockKey]));
        corte.consumos = (corte.consumos || []).filter((consumo) => consumo.planillaBlockKey !== block.blockKey);

        const matchedTela = matchTelaByName(state.telas || [], block.comparableTela);
        const detalles = block.detalles.map((detail) => {
            const matchedColor = matchedTela ? matchColor(matchedTela, detail.color) : null;
            return {
                id: generateId(),
                source: 'planilla-cortes',
                planillaBatchId: parsedBatch.batchId,
                planillaBlockKey: block.blockKey,
                cortador: block.cortador,
                numeroCorte: block.corteNumero,
                fecha: block.fecha,
                telaId: matchedTela?.id || '',
                telaNombreImportado: block.telaNombre,
                colorHex: matchedColor?.hex || '',
                colorNombre: detail.color,
                cantidad: Number(detail.kilos || 0),
                kilos: Number(detail.kilos || 0),
                cantidadPrendas: Number(detail.cantidadPrendas || 0),
                rollos: Number(detail.rollos || 0)
            };
        });

        corte.consumos.push(...detalles);

        if (Array.isArray(corte.moldesData) && corte.moldesData.length > 0) {
            corte.moldesData = corte.moldesData.map((item) => ({
                ...item,
                cortadorAsignado: item.cortadorAsignado || block.cortador
            }));
        }

        importedCutIds.add(corte.id);
        nextCortadores.add(block.cortador);
        nextPlanillas.push({
            id: generateId(),
            ...block,
            importedAt: new Date().toISOString(),
            corteId: corte.id,
            telaId: matchedTela?.id || ''
        });
    });

    nextCortes.forEach((corte) => {
        if (!blockKeys.size) return;
        corte.consumos = (corte.consumos || []).filter((consumo) => consumo.planillaBatchId !== parsedBatch.batchId || blockKeys.has(consumo.planillaBlockKey));
    });

    return {
        ...state,
        config: {
            ...state.config,
            cortes: nextCortes,
            cortadores: Array.from(nextCortadores).filter(Boolean),
            planillasCortes: nextPlanillas.sort((left, right) => (right.fecha || '').localeCompare(left.fecha || ''))
        }
    };
};
