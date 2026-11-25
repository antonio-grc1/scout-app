import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { api } from '../api/client';
import { PDF_ASSETS } from '../services/pdfAssets';
import { descargarPdfBlob, sanitizarTextoWinAnsi } from '../services/pdfGenerator';
import { useToastStore } from '../store/toastStore';
import {
  formatearFecha,
  formatearMoneda,
  METODO_PAGO_LABELS,
  traducirErrorAmigable,
} from './formatters';

const NOMBRE_GRUPO = 'Grupo Scout N° 196 "Juan XXIII"';
const REF_SALDO_A_FAVOR = 'APLICACION_SALDO_A_FAVOR';

interface PersonaRecibo {
  nombre: string;
  apellido: string;
  dni?: string;
}

/** Respuesta de GET /tesoreria/pagos/:id/recibo */
interface DatosRecibo {
  id: number;
  fechaPago: string;
  montoTotal: string | number;
  metodoPago: string;
  referenciaComprobante: string | null;
  observaciones: string | null;
  usuario: PersonaRecibo | null;
  registradoPor: PersonaRecibo | null;
  imputaciones: Array<{
    montoImputado: string | number;
    cargo: { concepto: { nombre: string } | null; usuario: PersonaRecibo | null } | null;
  }>;
}

const MARGEN = 50;
const ANCHO_A4 = 595.28;
const ALTO_A4 = 841.89;
const GRIS = rgb(0.42, 0.42, 0.45);
const LINEA = rgb(0.82, 0.82, 0.84);

/** Recorta el texto con "..." para que entre en el ancho indicado. */
function ajustar(texto: string, font: PDFFont, size: number, maxAncho: number): string {
  if (font.widthOfTextAtSize(texto, size) <= maxAncho) return texto;
  let recorte = texto;
  while (recorte.length > 1 && font.widthOfTextAtSize(`${recorte}...`, size) > maxAncho) {
    recorte = recorte.slice(0, -1);
  }
  return `${recorte.trimEnd()}...`;
}

const nombreCompleto = (p: PersonaRecibo | null | undefined) =>
  p ? `${p.apellido}, ${p.nombre}` : '';

export async function generarReciboPagoPdf(datos: DatosRecibo): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Recibo N° ${String(datos.id).padStart(6, '0')}`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const txt = (t: unknown) => sanitizarTextoWinAnsi(t, (c) => (regular.encodeText(c), true));

  let page: PDFPage = doc.addPage([ANCHO_A4, ALTO_A4]);
  const escribir = (
    t: string,
    x: number,
    y: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; alinearDerecha?: boolean } = {},
  ) => {
    const font = opts.bold ? negrita : regular;
    const size = opts.size ?? 11;
    const limpio = txt(t);
    const xFinal = opts.alinearDerecha ? x - font.widthOfTextAtSize(limpio, size) : x;
    page.drawText(limpio, { x: xFinal, y, size, font, color: opts.color ?? rgb(0.1, 0.1, 0.12) });
  };
  const linea = (y: number) =>
    page.drawLine({
      start: { x: MARGEN, y },
      end: { x: ANCHO_A4 - MARGEN, y },
      thickness: 0.8,
      color: LINEA,
    });

  // Encabezado: logo + grupo a la izquierda, número y fecha a la derecha
  let y = ALTO_A4 - MARGEN;
  try {
    const logo = await doc.embedPng(PDF_ASSETS.logoJuanXXIII);
    const alto = 52;
    const ancho = (logo.width / logo.height) * alto;
    page.drawImage(logo, { x: MARGEN, y: y - alto, width: ancho, height: alto });
  } catch {
    // Sin logo el recibo sigue siendo válido
  }
  const derecha = ANCHO_A4 - MARGEN;
  escribir('RECIBO', derecha, y - 18, { size: 22, bold: true, alinearDerecha: true });
  escribir(`N° ${String(datos.id).padStart(6, '0')}`, derecha, y - 36, {
    size: 12,
    bold: true,
    alinearDerecha: true,
  });
  escribir(`Fecha: ${formatearFecha(datos.fechaPago)}`, derecha, y - 52, { size: 11, alinearDerecha: true });
  y -= 72;
  escribir(NOMBRE_GRUPO, MARGEN, y, { size: 12, bold: true });
  y -= 14;
  linea(y);

  // Datos del pago
  const montoTotal = Number(datos.montoTotal || 0);
  y -= 28;
  const titular = datos.usuario
    ? `${nombreCompleto(datos.usuario)}${datos.usuario.dni ? ` - DNI ${datos.usuario.dni}` : ''}`
    : '-';
  escribir('Recibimos de:', MARGEN, y, { color: GRIS });
  escribir(ajustar(txt(titular), negrita, 12, 380), MARGEN + 95, y, { size: 12, bold: true });
  y -= 22;
  escribir('La suma de:', MARGEN, y, { color: GRIS });
  escribir(formatearMoneda(montoTotal), MARGEN + 95, y, { size: 12, bold: true });

  // Detalle: concepto, integrante e importe
  y -= 36;
  const colIntegrante = MARGEN + 270;
  escribir('EN CONCEPTO DE', MARGEN, y, { size: 9, bold: true, color: GRIS });
  escribir('INTEGRANTE', colIntegrante, y, { size: 9, bold: true, color: GRIS });
  escribir('IMPORTE', derecha, y, { size: 9, bold: true, color: GRIS, alinearDerecha: true });
  y -= 8;
  linea(y);

  const filas = datos.imputaciones.map((imp) => ({
    concepto: imp.cargo?.concepto?.nombre || 'Cuota',
    integrante: nombreCompleto(imp.cargo?.usuario),
    importe: Number(imp.montoImputado || 0),
  }));
  const imputado = filas.reduce((acc, f) => acc + f.importe, 0);
  const excedente = Math.round((montoTotal - imputado) * 100) / 100;
  if (excedente > 0) {
    filas.push({ concepto: 'Saldo a favor de la cuenta', integrante: '', importe: excedente });
  }

  for (const f of filas) {
    if (y < MARGEN + 160) {
      page = doc.addPage([ANCHO_A4, ALTO_A4]);
      y = ALTO_A4 - MARGEN;
    }
    y -= 20;
    escribir(ajustar(txt(f.concepto), regular, 11, colIntegrante - MARGEN - 12), MARGEN, y);
    escribir(ajustar(txt(f.integrante), regular, 11, derecha - colIntegrante - 90), colIntegrante, y);
    escribir(formatearMoneda(f.importe), derecha, y, { alinearDerecha: true });
    y -= 8;
    linea(y);
  }
  y -= 22;
  escribir('TOTAL', colIntegrante, y, { bold: true });
  escribir(formatearMoneda(montoTotal), derecha, y, { size: 13, bold: true, alinearDerecha: true });

  // Medio de pago, referencia y observaciones
  const esSaldo = datos.referenciaComprobante === REF_SALDO_A_FAVOR;
  const medio = esSaldo ? 'Saldo a favor' : METODO_PAGO_LABELS[datos.metodoPago] || datos.metodoPago;
  y -= 36;
  escribir('Medio de pago:', MARGEN, y, { color: GRIS });
  escribir(medio, MARGEN + 95, y, { bold: true });
  if (datos.referenciaComprobante && !esSaldo) {
    y -= 18;
    escribir('Comprobante:', MARGEN, y, { color: GRIS });
    escribir(ajustar(txt(datos.referenciaComprobante), regular, 11, 380), MARGEN + 95, y);
  }
  if (datos.observaciones) {
    y -= 18;
    escribir('Observaciones:', MARGEN, y, { color: GRIS });
    escribir(ajustar(txt(datos.observaciones), regular, 11, 380), MARGEN + 95, y);
  }
  if (datos.registradoPor) {
    y -= 18;
    escribir('Registró:', MARGEN, y, { color: GRIS });
    escribir(`${datos.registradoPor.nombre} ${datos.registradoPor.apellido}`, MARGEN + 95, y);
  }

  // Pie
  escribir(
    `Documento no válido como factura. Emitido el ${formatearFecha(new Date().toISOString())} desde el sistema de gestión del grupo.`,
    MARGEN,
    MARGEN - 10,
    { size: 8.5, color: GRIS },
  );

  return doc.save();
}

/** Busca los datos del pago, arma el recibo y lo descarga (avisa con un toast si falla). */
export async function descargarReciboPago(pagoId: number): Promise<void> {
  try {
    const { data } = await api.get<DatosRecibo>(`/tesoreria/pagos/${pagoId}/recibo`);
    const bytes = await generarReciboPagoPdf(data);
    const apellido = (data.usuario?.apellido || 'Pago')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    descargarPdfBlob(bytes, `Recibo_${String(data.id).padStart(6, '0')}_${apellido}.pdf`);
  } catch (err) {
    useToastStore
      .getState()
      .mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el recibo.'), 'error');
  }
}

/** Aviso de cobro registrado con el botón para descargar el recibo. */
export function avisarCobroConRecibo(mensaje: string, pagoId: number | undefined): void {
  const { mostrarToast, mostrarToastAccion } = useToastStore.getState();
  if (!pagoId) {
    mostrarToast(mensaje);
    return;
  }
  mostrarToastAccion(mensaje, 'Descargar recibo', () => descargarReciboPago(pagoId), 10000);
}
