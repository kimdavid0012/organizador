const normalizeText = (value) => (value || '').toString().replace(/\u00a0/g, ' ').trim();
const normalizeComparable = (value) => normalizeText(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');

const TELA_ALIAS_GROUPS = [
    ['LANILLAMELOW', 'MELLOW', 'MELOW', 'LANILLAMELLOW'],
    ['LANILLASWETER', 'LANILLASWEATER', 'SWETER', 'SWEATER'],
    ['FRIZADO', 'FRISADO'],
    ['MODALGAMUSADO', 'MODALGAMUSA', 'GAMUSADO'],
    ['MODALSOFT', 'MODALSOFT '],
    ['SUPERSOFT', 'SUPERSOFT '],
    ['KERRYBRUSH', 'KERYBRUSH'],
];

const COLOR_ALIAS_GROUPS = [
    ['OFF', 'OFFWHITE', 'OFFWHITE ', 'OFFWHITEE'],
    ['VISON', 'VISON'],
    ['TOSTADO', 'TOASTADO'],
    ['CHOCO', 'CHOCOLATE'],
    ['BEIGE', 'BEISH'],
    ['BORDO', 'BORDEAUX'],
    ['BLANCO', 'WHITE'],
    ['NEGRO', 'BLACK'],
    ['GRIS', 'GRAY', 'GREY'],
];

const expandAliases = (comparableValue, groups) => {
    const values = new Set([comparableValue]);
    groups.forEach((group) => {
        const normalizedGroup = group.map((item) => normalizeComparable(item));
        if (normalizedGroup.includes(comparableValue)) {
            normalizedGroup.forEach((item) => values.add(item));
        }
    });
    return Array.from(values).filter(Boolean);
};

const getTelaComparableKeys = (tela = {}) => {
    const candidates = [
        tela.nombre,
        tela.tipoTela,
        tela.descripcion,
        tela.detalle,
        tela.alias,
        tela.aliases
    ].flatMap((value) => Array.isArray(value) ? value : [value]);

    const keys = new Set();
    candidates.forEach((value) => {
        const comparable = normalizeComparable(value);
        if (!comparable) return;
        expandAliases(comparable, TELA_ALIAS_GROUPS).forEach((item) => keys.add(item));
    });
    return Array.from(keys);
};

const getColorComparableKeys = (color = {}) => {
    const candidates = [
        color.nombre,
        color.color,
        color.alias,
        color.aliases,
        color.hex
    ].flatMap((value) => Array.isArray(value) ? value : [value]);

    const keys = new Set();
    candidates.forEach((value) => {
        const comparable = normalizeComparable(value);
        if (!comparable) return;
        expandAliases(comparable, COLOR_ALIAS_GROUPS).forEach((item) => keys.add(item));
    });
    return Array.from(keys);
};

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

const looksLikeDateString = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    if (/CORTE|COLUMN|TOTAL/i.test(normalized)) return false;
    return /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.test(normalized)
        || /[A-Z]{3,}/i.test(normalized);
};

const parseDate = (value, { preferMonthFirst = false } = {}) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return toDateInputValue(value);
    }

    if (typeof value === 'number') return '';

    const normalized = normalizeText(value);
    const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (slashMatch) {
        let [, first, second, year] = slashMatch;
        const fullYear = year.length === 2 ? `20${year}` : year;
        const firstNumber = Number(first);
        const secondNumber = Number(second);
        let day = firstNumber;
        let month = secondNumber;

        if (firstNumber <= 12 && secondNumber > 12) {
            month = firstNumber;
            day = secondNumber;
        } else if (firstNumber > 12 && secondNumber <= 12) {
            day = firstNumber;
            month = secondNumber;
        } else if (firstNumber <= 12 && secondNumber <= 12 && preferMonthFirst) {
            month = firstNumber;
            day = secondNumber;
        }

        return `${fullYear}-${pad(month)}-${pad(day)}`;
    }

    if (!looksLikeDateString(normalized)) return '';
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
    const fecha = row.some((cell) => Boolean(parseDate(cell, { preferMonthFirst: true })));
    return Boolean(corteNumero || fecha);
};

const extractTelaNombre = (row = []) => {
    const corteNumero = extractCorteNumber(row);
    const candidates = row
        .map((cell) => normalizeText(cell))
        .filter(Boolean)
        .filter((cell) => !/^CORTE\s*#?\s*\d{1,5}$/i.test(cell))
        .filter((cell) => !parseDate(cell, { preferMonthFirst: true }));

    if (candidates.length === 0) return '';
    if (corteNumero && /^CORTE/i.test(normalizeText(row[0])) && candidates[0] === normalizeText(row[0])) {
        return candidates[1] || candidates[0];
    }
    return candidates[0];
};

const detectColumnIndexes = (row = [], sampleRows = []) => {
    const headers = row.map((cell) => normalizeComparable(cell));
    const colorIndex = headers.findIndex((value) => value === 'COLORES' || value.startsWith('COLUMN1') || value === 'COLOR' || value === 'COLORES');
    const kiloIndex = headers.findIndex((value) => value.includes('KILO') || value === 'KG' || value === 'KILOS');
    const capaIndex = headers.findIndex((value) => value === 'CAPA' || value === 'CAPAS' || value === 'CARA' || value === 'CARA1');
    const activeIndexes = row
        .map((_, index) => index)
        .filter((index) => sampleRows.some((sampleRow) => normalizeText(sampleRow[index]) !== ''));
    const explicitCantidadIndexes = headers
        .map((value, index) => ({ value, index }))
        .filter(({ value }) => value.includes('CANTIDAD'))
        .map(({ index }) => index);
    const articleCantidadIndexes = headers
        .map((value, index) => ({ value, index }))
        .filter(({ value, index }) => /^\d{3,5}$/.test(value) && index !== colorIndex && index !== kiloIndex)
        .map(({ index }) => index);
    let rolloIndex = headers.findIndex((value) => value.includes('ROLLO'));
    const numericIndexes = activeIndexes.filter((index) => index !== colorIndex && index !== kiloIndex);

    let cantidadIndexes = (explicitCantidadIndexes.length > 0 ? explicitCantidadIndexes : articleCantidadIndexes)
        .filter((index) => activeIndexes.includes(index));

    if (rolloIndex >= 0 && !activeIndexes.includes(rolloIndex)) {
        rolloIndex = -1;
    }

    if (cantidadIndexes.length > 0 && rolloIndex < 0) {
        const trailingIndexes = numericIndexes.filter((index) => index > Math.max(...cantidadIndexes) && index !== capaIndex);
        if (trailingIndexes.length === 1) {
            rolloIndex = trailingIndexes[0];
        }
    }

    if (cantidadIndexes.length === 0) {
        if (rolloIndex >= 0) {
            cantidadIndexes = numericIndexes.filter((index) => index !== rolloIndex && index !== capaIndex);
            if (cantidadIndexes.length > 1) cantidadIndexes = [cantidadIndexes[cantidadIndexes.length - 1]];
        } else {
            const fallbackIndexes = numericIndexes.filter((index) => index !== capaIndex);
            if (fallbackIndexes.length >= 2) {
                rolloIndex = fallbackIndexes[fallbackIndexes.length - 1];
                cantidadIndexes = [fallbackIndexes[fallbackIndexes.length - 2]];
            } else if (fallbackIndexes.length === 1) {
                cantidadIndexes = [fallbackIndexes[0]];
                rolloIndex = -1;
            }
        }
    }

    return {
        colorIndex: colorIndex >= 0 ? colorIndex : 0,
        kiloIndex: kiloIndex >= 0 ? kiloIndex : 1,
        capaIndex,
        cantidadIndexes,
        rolloIndex
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
            ? xlsxUtils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
            : [];
        const cortador = normalizeText(sheetName)
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex] || [];
            const nextRow = rows[rowIndex + 1] || [];

            if (!isHeaderRow(row, nextRow)) continue;

            const telaNombre = extractTelaNombre(row) || 'Sin tela';
            const corteNumero = extractCorteNumber(row);
            const fecha = row.map((cell) => parseDate(cell, { preferMonthFirst: true })).find(Boolean) || '';
            const sampleRows = [];
            let previewCursor = rowIndex + 2;
            while (previewCursor < rows.length && sampleRows.length < 4) {
                const sampleRow = rows[previewCursor] || [];
                if (!sampleRow.some((cell) => normalizeText(cell))) break;
                if (normalizeComparable(sampleRow[0]) === 'TOTAL') break;
                if (isHeaderRow(sampleRow, rows[previewCursor + 1] || [])) break;
                sampleRows.push(sampleRow);
                previewCursor += 1;
            }

            const { colorIndex, kiloIndex, cantidadIndexes, rolloIndex } = detectColumnIndexes(nextRow, sampleRows);

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
                const cantidadPrendas = (cantidadIndexes || [])
                    .reduce((acc, index) => acc + parseNumber(detailRow[index]), 0);
                const rawRollo = rolloIndex >= 0 ? parseNumber(detailRow[rolloIndex]) : 0;
                const rollos = rolloIndex >= 0
                    ? Math.max(0, rawRollo)
                    : (color && (kilos || cantidadPrendas) ? 1 : 0);

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

            rowIndex = Math.max(rowIndex, cursor - 1);
        }
    });

    return { batchId, fileName, blocks };
};

const matchTelaByName = (telas = [], comparableTela = '') => {
    if (!comparableTela) return null;
    const requestedKeys = expandAliases(comparableTela, TELA_ALIAS_GROUPS);
    const exact = telas.find((tela) => {
        const telaKeys = getTelaComparableKeys(tela);
        return requestedKeys.some((key) => telaKeys.includes(key));
    });
    if (exact) return exact;

    return telas.find((tela) => {
        const telaKeys = getTelaComparableKeys(tela);
        return telaKeys.some((key) => requestedKeys.some((requested) => key.includes(requested) || requested.includes(key)));
    }) || null;
};

const matchColor = (tela = {}, colorName = '') => {
    const comparableColor = normalizeComparable(colorName);
    if (!comparableColor) return null;
    const requestedKeys = expandAliases(comparableColor, COLOR_ALIAS_GROUPS);
    return (tela.coloresStock || []).find((item) => {
        const itemKeys = getColorComparableKeys(item);
        return itemKeys.some((key) => requestedKeys.some((requested) => key === requested || key.includes(requested) || requested.includes(key)));
    }) || null;
};

const extractCorteNumberFromName = (value = '') => {
    const match = normalizeText(value).match(/(\d{1,5})/);
    return match ? match[1] : '';
};

export const mergePlanillaCortesIntoState = (state, parsedBatch, generateId) => {
    const existingPlanillas = Array.isArray(state.config?.planillasCortes) ? state.config.planillasCortes : [];
    const nextPlanillas = existingPlanillas.filter((item) => item.batchId !== parsedBatch.batchId);
    const nextCortes = Array.isArray(state.config?.cortes)
        ? state.config.cortes
            .filter((corte) => {
                const blockKeys = Array.isArray(corte?.planillaBlockKeys) ? corte.planillaBlockKeys : [];
                const allFromSameBatch = blockKeys.length > 0 && blockKeys.every((key) => key.startsWith(`${parsedBatch.batchId}|`));
                const isPlanillaOnly = (!corte?.moldeIds || corte.moldeIds.length === 0) && (!corte?.moldesData || corte.moldesData.length === 0);
                return !(allFromSameBatch && isPlanillaOnly);
            })
            .map((corte) => ({ ...corte, consumos: [...(corte.consumos || [])] }))
        : [];
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
