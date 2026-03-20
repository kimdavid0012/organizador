import Papa from 'papaparse';

export const exportMoldesCSV = (moldes, telas) => {
    const telaMap = {};
    telas.forEach(t => { telaMap[t.id] = t.nombre; });

    const data = moldes.map(m => ({
        Nombre: m.nombre,
        Código: m.codigo || '',
        Categoría: m.categoria || '',
        Talles: m.talles || '',
        Estado: m.estado || '',
        Prioridad: m.prioridad || '',
        Temporada: m.temporada || '',
        Responsable: m.responsable || '',
        'Fecha Objetivo': m.fechaObjetivo || '',
        Observaciones: m.observaciones || '',
        'Telas Compatibles': (m.telasIds || []).map(id => telaMap[id] || id).join('; '),
        'Checklist': (m.checklist || []).map(c => `${c.completado ? '✓' : '○'} ${c.texto}`).join('; ')
    }));

    const csv = Papa.unparse(data);
    downloadCSV(csv, 'moldes_export.csv');
};

export const exportTelasCSV = (telas) => {
    const data = telas.map(t => ({
        Nombre: t.nombre,
        Color: t.color || '',
        Composición: t.composicion || '',
        Proveedor: t.proveedor || '',
        Notas: t.notas || ''
    }));

    const csv = Papa.unparse(data);
    downloadCSV(csv, 'telas_export.csv');
};

const downloadCSV = (csvContent, filename) => {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
};

export const parseCSV = (file) => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    reject(new Error(`Errores al leer CSV: ${results.errors.map(e => e.message).join(', ')}`));
                } else {
                    resolve(results.data);
                }
            },
            error: (err) => reject(err)
        });
    });
};

export const importMoldesFromCSV = (data, telas, existingColumnas) => {
    const { generateId } = require('./helpers');
    // This will be handled in DataContext
    return data;
};
