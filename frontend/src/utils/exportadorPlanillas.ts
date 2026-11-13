export interface ColumnaExportacion<T> {
  header: string;
  clave?: keyof T | string;
  ancho?: number;
  formatear?: (fila: T) => string | number;
}

export interface FilaResumen {
  etiqueta: string;
  valor: string | number;
}

export interface OpcionesExportacion<T> {
  nombreArchivo: string; // Sin extensión
  nombreHoja?: string;
  columnas: ColumnaExportacion<T>[];
  filas: T[];
  resumenSuperior?: FilaResumen[];
  resumenInferior?: FilaResumen[];
}

const FORMULA_PREFIX_REGEX = /^[\t\r=+\-@]/;

/**
 * Neutraliza fórmulas DDE/CSV/Excel en valores de texto anteponiendo un apóstrofo (').
 * Mantiene intactos los valores numéricos nativos en hojas .xlsx.
 */
export function sanitizarCeldaPlanilla(valor: unknown): string | number {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return valor;
  const str = String(valor);
  if (FORMULA_PREFIX_REGEX.test(str)) {
    return `'${str}`;
  }
  return str;
}

function escaparValorCSV(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const str = String(sanitizarCeldaPlanilla(valor));
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function descargarBlob(blob: Blob, nombreCompleto: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.setAttribute('download', nombreCompleto);
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

function obtenerValorCelda<T>(col: ColumnaExportacion<T>, fila: T): string | number {
  if (col.formatear) {
    return sanitizarCeldaPlanilla(col.formatear(fila));
  }
  if (col.clave) {
    const v = (fila as Record<string, unknown>)[col.clave as string];
    return sanitizarCeldaPlanilla(v);
  }
  return '';
}

/**
 * Exporta un conjunto de datos a formato CSV (delimitado por punto y coma, UTF-8 con BOM para Excel).
 */
export function exportarACSV<T>(opciones: OpcionesExportacion<T>): void {
  const lineas: string[] = [];

  // Resumen superior opcional (ej: datos de la cuenta o fecha)
  if (opciones.resumenSuperior && opciones.resumenSuperior.length > 0) {
    for (const r of opciones.resumenSuperior) {
      lineas.push(`${escaparValorCSV(r.etiqueta)};${escaparValorCSV(r.valor)}`);
    }
    lineas.push(''); // Línea en blanco separadora
  }

  // Encabezados
  const encabezados = opciones.columnas.map((col) => escaparValorCSV(col.header)).join(';');
  lineas.push(encabezados);

  // Filas
  for (const fila of opciones.filas) {
    const filaCsv = opciones.columnas
      .map((col) => escaparValorCSV(obtenerValorCelda(col, fila)))
      .join(';');
    lineas.push(filaCsv);
  }

  // Resumen inferior opcional (ej: totales o saldo final)
  if (opciones.resumenInferior && opciones.resumenInferior.length > 0) {
    lineas.push('');
    for (const r of opciones.resumenInferior) {
      lineas.push(`${escaparValorCSV(r.etiqueta)};${escaparValorCSV(r.valor)}`);
    }
  }

  const contenido = '\uFEFF' + lineas.join('\r\n');
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  descargarBlob(blob, `${opciones.nombreArchivo}.csv`);
}

/**
 * Exporta un conjunto de datos a formato Excel (.xlsx) con anchos de columna y formato limpio.
 * Carga 'xlsx' bajo demanda (dynamic import) para no sobrecargar el bundle principal.
 */
export async function exportarAExcel<T>(opciones: OpcionesExportacion<T>): Promise<void> {
  const XLSX = await import('xlsx');

  const matrizDatos: (string | number)[][] = [];

  // Resumen superior
  if (opciones.resumenSuperior && opciones.resumenSuperior.length > 0) {
    for (const r of opciones.resumenSuperior) {
      matrizDatos.push([sanitizarCeldaPlanilla(r.etiqueta), sanitizarCeldaPlanilla(r.valor)]);
    }
    matrizDatos.push([]); // Fila vacía
  }

  // Encabezados
  matrizDatos.push(opciones.columnas.map((c) => sanitizarCeldaPlanilla(c.header)));

  // Filas
  for (const fila of opciones.filas) {
    matrizDatos.push(opciones.columnas.map((col) => obtenerValorCelda(col, fila)));
  }

  // Resumen inferior
  if (opciones.resumenInferior && opciones.resumenInferior.length > 0) {
    matrizDatos.push([]);
    for (const r of opciones.resumenInferior) {
      matrizDatos.push([sanitizarCeldaPlanilla(r.etiqueta), sanitizarCeldaPlanilla(r.valor)]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(matrizDatos);

  // Asignar anchos de columna recomendados
  const colWidths = opciones.columnas.map((col) => {
    if (col.ancho) return { wch: col.ancho };
    const longitudHeader = col.header.length;
    return { wch: Math.max(longitudHeader + 4, 12) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  const nombreHoja = (opciones.nombreHoja || 'Datos').substring(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja);

  XLSX.writeFile(wb, `${opciones.nombreArchivo}.xlsx`);
}
