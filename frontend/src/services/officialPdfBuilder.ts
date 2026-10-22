import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import { PDF_ASSETS } from './pdfAssets';

export interface OfficialPdfBuilderOptions {
  blank?: boolean;
  hashVerificacion?: string;
  versionImpresion?: number;
  usuario?: {
    nombre: string;
    apellido: string;
    dni: string;
    fechaNacimiento?: string | Date;
    ramaNombre?: string;
    telefonoContacto?: string;
  };
}

function normalizeDate(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]} / ${isoMatch[2]} / ${isoMatch[1]}`;
  }
  return s;
}

function parseDateParts(val: unknown): { dia: string; mes: string; anio: string } {
  if (!val) return { dia: '....', mes: '................', anio: '........' };
  const s = String(val).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const mIdx = parseInt(isoMatch[2], 10) - 1;
    return {
      dia: isoMatch[3],
      mes: meses[mIdx] || isoMatch[2],
      anio: isoMatch[1],
    };
  }
  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    return { dia: parts[0].trim(), mes: parts[1].trim(), anio: parts[2].trim() };
  }
  return { dia: s, mes: '', anio: '' };
}

function dataUriToUint8Array(dataUri: string): Uint8Array {
  const base64 = dataUri.split(',')[1];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function buildOfficialPdf(
  rawRespuestas: Record<string, unknown> = {},
  options: OfficialPdfBuilderOptions = {},
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // Load fonts
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Load embedded high-res assets
  const logoScoutsColor = await pdfDoc.embedJpg(dataUriToUint8Array(PDF_ASSETS.logoScoutsColor));
  // Clean PNG without black box for Juan XXIII logo
  const logoJuanXXIII = await pdfDoc.embedPng(dataUriToUint8Array(PDF_ASSETS.logoJuanXXIII));
  const logoScoutsSalud = await pdfDoc.embedJpg(dataUriToUint8Array(PDF_ASSETS.logoScoutsSalud));
  const logoScoutsFooterPurple = await pdfDoc.embedJpg(dataUriToUint8Array(PDF_ASSETS.logoScoutsFooterPurple));
  const logoScoutsHeaderAuth = await pdfDoc.embedJpg(dataUriToUint8Array(PDF_ASSETS.logoScoutsHeaderAuth));

  // Generate QR Code
  const qrHash = options.hashVerificacion || (rawRespuestas.hashVerificacion as string) || 'LEGAJO-OFICIAL-2026-VERIFICADO';
  const qrDataUrl = await QRCode.toDataURL(qrHash, { margin: 1, width: 160 });
  const qrImage = await pdfDoc.embedPng(dataUriToUint8Array(qrDataUrl));

  const black = rgb(0, 0, 0);
  const labelColor = rgb(0.25, 0.25, 0.25);
  const lightGray = rgb(0.93, 0.93, 0.93);
  const blueScout = rgb(0.04, 0.44, 0.72);
  // Distinctive ink for member-filled data: Deep Navy Blue + Bold font
  const memberDataColor = rgb(0.03, 0.20, 0.52);

  // Combine raw respuestas with options.usuario
  const u = options.usuario;
  const data = { ...rawRespuestas };

  if (u) {
    if (!data.protagonista_apellido) data.protagonista_apellido = u.apellido.toUpperCase();
    if (!data.protagonista_nombre) data.protagonista_nombre = u.nombre;
    if (!data.protagonista_dni) data.protagonista_dni = u.dni;
    if (!data.protagonista_fecha_nac && u.fechaNacimiento) data.protagonista_fecha_nac = u.fechaNacimiento;
    if (!data.rama_nombre && u.ramaNombre) data.rama_nombre = u.ramaNombre;
    if (!data.protagonista_telefono && u.telefonoContacto) data.protagonista_telefono = u.telefonoContacto;
  }

  // Cascadas inteligentes de Domicilio y Teléfono para garantizar que ningún documento quede con campos vacíos
  const domProtagonista = String(
    data.protagonista_domicilio ||
    data.domicilio ||
    data.salud_domicilio ||
    data.madre_domicilio ||
    data.padre_domicilio ||
    data.tutor_domicilio ||
    ''
  );
  data.protagonista_domicilio = domProtagonista;
  data.domicilio = domProtagonista;
  data.salud_domicilio = domProtagonista;

  const telProtagonista = String(
    data.protagonista_telefono ||
    data.telefono_contacto ||
    data.telefono ||
    data.madre_telefono ||
    data.padre_telefono ||
    data.tutor_telefono ||
    data.tel_emergencia_1 ||
    u?.telefonoContacto ||
    ''
  );
  data.protagonista_telefono = telProtagonista;
  data.telefono_contacto = telProtagonista;

  // Si madre / padre / tutor convive explícitamente y su domicilio está vacío, heredar domicilio del protagonista
  if (!data.madre_domicilio && data.madre_convive === true && data.madre_nombres) data.madre_domicilio = domProtagonista;
  if (!data.padre_domicilio && data.padre_convive === true && data.padre_nombres) data.padre_domicilio = domProtagonista;
  if (!data.tutor_domicilio && data.tutor_convive === true && data.tutor_nombres) data.tutor_domicilio = domProtagonista;

  // Teléfono de emergencia principal para salud
  if (!data.tel_emergencia_1) {
    data.tel_emergencia_1 = data.madre_telefono || data.padre_telefono || telProtagonista;
  }

  // Prellenado de autorizante si se seleccionó madre/padre/tutor
  const tipoAut = (data.autorizante_tipo as string) || 'madre';
  if (tipoAut === 'madre') {
    data.autorizante_nombre = data.autorizante_nombre || data.madre_nombres || data.padre_nombres;
    data.autorizante_dni = data.autorizante_dni || data.madre_dni || data.padre_dni;
    data.autorizante_telefono = data.autorizante_telefono || data.madre_telefono || telProtagonista;
    data.autorizante_domicilio = data.autorizante_domicilio || data.madre_domicilio || domProtagonista;
    data.autorizante_caracter = data.autorizante_caracter || 'Madre';
  } else if (tipoAut === 'padre') {
    data.autorizante_nombre = data.autorizante_nombre || data.padre_nombres || data.madre_nombres;
    data.autorizante_dni = data.autorizante_dni || data.padre_dni || data.madre_dni;
    data.autorizante_telefono = data.autorizante_telefono || data.padre_telefono || telProtagonista;
    data.autorizante_domicilio = data.autorizante_domicilio || data.padre_domicilio || domProtagonista;
    data.autorizante_caracter = data.autorizante_caracter || 'Padre';
  } else if (tipoAut === 'tutor') {
    data.autorizante_nombre = data.autorizante_nombre || data.tutor_nombres;
    data.autorizante_dni = data.autorizante_dni || data.tutor_dni;
    data.autorizante_telefono = data.autorizante_telefono || data.tutor_telefono || telProtagonista;
    data.autorizante_domicilio = data.autorizante_domicilio || data.tutor_domicilio || domProtagonista;
    data.autorizante_caracter = data.autorizante_caracter || 'Tutor judicial';
  }

  // Common Header for Pages 1, 5, 6, 7
  function drawGroupHeader(page: any, title: string, subTitle = '') {
    const { width, height } = page.getSize();
    page.drawImage(logoScoutsColor, { x: 40, y: height - 70, width: 70, height: 48 });
    // Clean transparent Juan XXIII logo (no black rectangle)
    page.drawImage(logoJuanXXIII, { x: width - 120, y: height - 66, width: 80, height: 37 });

    page.drawText('Grupo Scout "Juan XXIII" Nº 196', {
      x: width / 2 - 85,
      y: height - 32,
      size: 10.5,
      font: fontBold,
      color: black,
    });
    page.drawText('Distrito 1 | Zona 22 Córdoba Norte – La Rioja', {
      x: width / 2 - 80,
      y: height - 44,
      size: 7.5,
      font: fontRegular,
      color: black,
    });
    page.drawText('Vera y zárate 3069 | Córdoba | Argentina | CP 5000', {
      x: width / 2 - 90,
      y: height - 54,
      size: 7,
      font: fontRegular,
      color: black,
    });
    page.drawText('Tel:+54 9 3516 65-9274 Franco Miani | Mail: gsjuanxxiii@gmail.com', {
      x: width / 2 - 125,
      y: height - 64,
      size: 7,
      font: fontRegular,
      color: black,
    });

    page.drawLine({
      start: { x: 40, y: height - 75 },
      end: { x: width - 40, y: height - 75 },
      thickness: 1,
      color: black,
    });

    if (title) {
      page.drawText(title, {
        x: width - 40 - fontBold.widthOfTextAtSize(title, 13),
        y: height - 95,
        size: 13,
        font: fontBold,
        color: black,
      });
    }
    if (subTitle) {
      page.drawText(subTitle, {
        x: 40,
        y: height - 115,
        size: 7.5,
        font: fontRegular,
        color: labelColor,
      });
    }
  }

  // Common Header for Pages 3 and 4 (Official SAAC Authorizations)
  function drawSaacAuthHeader(page: any, title: string) {
    const { width, height } = page.getSize();
    page.drawImage(logoScoutsHeaderAuth, { x: 35, y: height - 75, width: 95, height: 45 });
    page.drawText(title, { x: 140, y: height - 42, size: 10.5, font: fontBold, color: blueScout });
    page.drawText('Planilla Versión: 07-21', { x: 140, y: height - 54, size: 7.5, font: fontBold, color: black });
    page.drawText('www.scouts.org.ar', { x: 140, y: height - 64, size: 7.5, font: fontRegular, color: blueScout });
    page.drawLine({ start: { x: 35, y: height - 80 }, end: { x: width - 35, y: height - 80 }, thickness: 1, color: black });
  }

  // Helper for drawing styled wrapped paragraphs (mixing regular labels and bold blue member data)
  function drawStyledParagraph(
    page: any,
    spans: Array<{ text: string; bold: boolean; size?: number }>,
    startX: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
    defaultSize = 8.5,
  ): number {
    let curX = startX;
    let curY = startY;

    // Join into a sequence of styled tokens (words and spaces)
    interface StyledToken {
      text: string;
      bold: boolean;
      size: number;
      isSpace: boolean;
    }

    const tokens: StyledToken[] = [];
    spans.forEach((span) => {
      if (!span.text) return;
      const parts = span.text.match(/\S+|\s+/g);
      if (!parts) return;
      parts.forEach((p) => {
        tokens.push({
          text: p,
          bold: span.bold,
          size: span.size || defaultSize,
          isSpace: /^\s+$/.test(p),
        });
      });
    });

    // Collapse consecutive whitespace into single spaces
    const cleanTokens: StyledToken[] = [];
    for (const t of tokens) {
      if (t.isSpace) {
        if (cleanTokens.length > 0 && !cleanTokens[cleanTokens.length - 1].isSpace) {
          cleanTokens.push({ text: ' ', bold: false, size: defaultSize, isSpace: true });
        }
      } else {
        cleanTokens.push(t);
      }
    }

    for (const token of cleanTokens) {
      const font = token.bold ? fontBold : fontRegular;
      const color = token.bold ? memberDataColor : labelColor;
      const size = token.size;

      if (token.isSpace) {
        const spaceW = fontRegular.widthOfTextAtSize(' ', defaultSize);
        // Only advance if not at the start of a wrapped line
        if (curX > startX) {
          curX += spaceW;
        }
        continue;
      }

      const wordW = font.widthOfTextAtSize(token.text, size);
      if (curX + wordW > startX + maxWidth && curX > startX) {
        curX = startX;
        curY -= lineHeight;
      }

      page.drawText(token.text, {
        x: curX,
        y: curY,
        size,
        font,
        color,
      });

      curX += wordW;
    }

    return curY - lineHeight;
  }

  // Helper for drawing plain wrapped text
  function drawWrappedText(
    page: any,
    text: string,
    startX: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
    font: any,
    size: number,
    color = black,
  ): number {
    const words = text.split(' ');
    let line = '';
    let y = startY;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const testWidth = font.widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && n > 0) {
        page.drawText(line.trim(), { x: startX, y, size, font, color });
        line = words[n] + ' ';
        y -= lineHeight;
      } else {
        line = testLine;
      }
    }
    page.drawText(line.trim(), { x: startX, y, size, font, color });
    return y - lineHeight;
  }

  // Draw Proportional Official SAAC Purple Footer (Pages 3 & 4)
  function drawProportionalPurpleFooter(page: any) {
    const { width } = page.getSize();
    const footY = 25;
    const boxW = width - 80;

    // Outer border of footer
    page.drawRectangle({
      x: 40,
      y: footY,
      width: boxW,
      height: 52,
      borderColor: rgb(0.5, 0.2, 0.6),
      borderWidth: 1,
    });

    // Left purple logo (natural 430 x 196 ratio -> 110 x 50.1)
    page.drawImage(logoScoutsFooterPurple, {
      x: 42,
      y: footY + 1,
      width: 110,
      height: 50,
    });

    // Vertical divider line
    page.drawLine({
      start: { x: 155, y: footY },
      end: { x: 155, y: footY + 52 },
      thickness: 1,
      color: rgb(0.5, 0.2, 0.6),
    });

    // Right legal text
    page.drawText('Scouts de Argentina Asociación Civil (Res IGJ N° 999 del 24 de septiembre de 1998)', {
      x: 162,
      y: footY + 38,
      size: 6.5,
      font: fontBold,
      color: black,
    });
    page.drawText('Organización sin fines de lucro con Personería Jurídica Nacional N° 1645416 • CUIT 30-69732250-3 • IVA Exento', {
      x: 162,
      y: footY + 27,
      size: 5.8,
      font: fontRegular,
      color: labelColor,
    });
    page.drawText('Sede Nacional: Libertad 1282 – CABA – C1012AAZ – Tel: +54-11-4811-0185 • Miembro WOSM', {
      x: 162,
      y: footY + 16,
      size: 5.8,
      font: fontRegular,
      color: labelColor,
    });
  }

  // ==========================================
  // PAGE 1: FICHA DE INSCRIPCIÓN - 2026 (Letter)
  // ==========================================
  {
    const page1 = pdfDoc.addPage([612, 792]);
    const { width, height } = page1.getSize();
    drawGroupHeader(page1, 'FICHA DE INSCRIPCIÓN - 2026');

    const rama = String(data.rama_nombre || data.rama || 'Scout');
    page1.drawText('RAMA:', { x: 40, y: height - 95, size: 11, font: fontBold, color: labelColor });
    page1.drawText(rama.toUpperCase(), { x: 85, y: height - 95, size: 11, font: fontBold, color: memberDataColor });

    let currentY = height - 110;
    const tableW = width - 80;
    const startX = 40;

    page1.drawRectangle({ x: startX, y: currentY - 18, width: tableW, height: 18, color: lightGray, borderColor: black, borderWidth: 1 });
    page1.drawText('Datos del protagonista', { x: startX + 6, y: currentY - 13, size: 9.5, font: fontBold });
    currentY -= 18;

    const drawRow = (y: number, h: number, cols: Array<{ label: string; value: unknown; width: number }>) => {
      page1.drawRectangle({ x: startX, y: y - h, width: tableW, height: h, borderColor: black, borderWidth: 1 });
      let colX = startX;
      cols.forEach((col, idx) => {
        if (idx > 0) {
          page1.drawLine({ start: { x: colX, y }, end: { x: colX, y: y - h }, thickness: 1, color: black });
        }
        page1.drawText(col.label, { x: colX + 4, y: y - 13, size: 8, font: fontRegular, color: labelColor });
        const labelW = fontRegular.widthOfTextAtSize(col.label, 8);
        const val = col.value ? String(col.value) : '';
        if (val) {
          page1.drawText(val, { x: colX + 6 + labelW, y: y - 13, size: 8.5, font: fontBold, color: memberDataColor });
        } else if (options.blank) {
          page1.drawText('. . . . . . . . . . . . . . . . . . . . . . . .', { x: colX + 6 + labelW, y: y - 13, size: 8, font: fontRegular, color: rgb(0.65, 0.65, 0.65) });
        }
        colX += col.width;
      });
    };

    const pNombre = [data.protagonista_apellido, data.protagonista_nombre].filter(Boolean).join(', ') || String(data.nombre_completo || '');
    drawRow(currentY, 20, [
      { label: 'Apellido y Nombres: ', value: pNombre, width: 230 },
      { label: 'DNI: ', value: data.protagonista_dni || data.dni || '', width: 110 },
      { label: 'Fecha. de Nac.: ', value: normalizeDate(data.protagonista_fecha_nac || data.fecha_nacimiento), width: 192 },
    ]);
    currentY -= 20;

    drawRow(currentY, 20, [
      { label: 'Domicilio: ', value: data.protagonista_domicilio || data.domicilio || '', width: tableW },
    ]);
    currentY -= 20;

    drawRow(currentY, 20, [
      { label: 'Teléfono: ', value: data.protagonista_telefono || data.telefono_contacto || '', width: 330 },
      { label: 'Religión: ', value: data.religion || '', width: 202 },
    ]);
    currentY -= 20;

    drawRow(currentY, 20, [
      { label: 'Escolaridad (tipo e insitución): ', value: data.escolaridad_institucion || data.protagonista_institucion_escolar || '', width: 330 },
      { label: 'Grado/año: ', value: data.escolaridad_grado || data.protagonista_grado_escolar || '', width: 202 },
    ]);
    currentY -= 20;

    drawRow(currentY, 20, [
      { label: 'Obra Social: ', value: data.obra_social || data.protagonista_obra_social || '', width: 330 },
      { label: 'N° Afiliado (Obra Social): ', value: data.obra_social_afiliado || data.protagonista_afiliado_obra_social || '', width: 202 },
    ]);
    currentY -= 20;

    const hobbyStr = data.realiza_hobby ? (data.hobby_detalle ? `SÍ (${data.hobby_detalle})` : 'SÍ') : 'NO';
    drawRow(currentY, 20, [
      { label: '¿Tiene hermanos?: ', value: data.tiene_hermanos === false ? 'NO' : (data.tiene_hermanos ? 'SÍ' : 'NO'), width: 140 },
      { label: '¿Realiza alguna actividad o hobby?: ', value: hobbyStr, width: 392 },
    ]);
    currentY -= 20;

    const saludStr = data.condicion_salud_preexistente ? 'SÍ' : (data.tiene_cud ? 'SÍ (Posee CUD)' : 'NO');
    page1.drawRectangle({ x: startX, y: currentY - 26, width: tableW, height: 26, borderColor: black, borderWidth: 1 });
    page1.drawText('¿Tiene alguna condición de salud o discapacidad preexistente?: ', { x: startX + 4, y: currentY - 12, size: 8, font: fontRegular, color: labelColor });
    const lblW = fontRegular.widthOfTextAtSize('¿Tiene alguna condición de salud o discapacidad preexistente?: ', 8);
    page1.drawText(saludStr, { x: startX + 6 + lblW, y: currentY - 12, size: 8.5, font: fontBold, color: memberDataColor });
    page1.drawText('De responder SI, solicitar la ficha de necesidades especiales, para una mejor adaptación a la actividades.', {
      x: startX + 4,
      y: currentY - 22,
      size: 7,
      font: fontItalic,
      color: labelColor,
    });
    currentY -= 34;

    const drawFamiliarBox = (boxTitle: string, prefix: string) => {
      const boxH = 75;
      page1.drawRectangle({ x: startX, y: currentY - boxH, width: tableW, height: boxH, borderColor: black, borderWidth: 1 });
      const leftColW = 95;
      page1.drawRectangle({ x: startX, y: currentY - boxH, width: leftColW, height: boxH, color: lightGray, borderColor: black, borderWidth: 1 });
      page1.drawText(boxTitle, { x: startX + 6, y: currentY - boxH / 2 - 3, size: 9, font: fontBold });

      const rightX = startX + leftColW;

      let rowY = currentY;
      const fNombre = String(data[`${prefix}_nombres`] || data[`${prefix}_nombre_completo`] || [data[`${prefix}_apellido`], data[`${prefix}_nombre`]].filter(Boolean).join(', ') || '');
      page1.drawLine({ start: { x: rightX, y: rowY - 19 }, end: { x: startX + tableW, y: rowY - 19 }, thickness: 1, color: black });
      page1.drawLine({ start: { x: rightX + 280, y: rowY }, end: { x: rightX + 280, y: rowY - 19 }, thickness: 1, color: black });
      page1.drawText('Apellido y Nombres: ', { x: rightX + 4, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (fNombre) page1.drawText(fNombre, { x: rightX + 85, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });
      page1.drawText('DNI: ', { x: rightX + 285, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (data[`${prefix}_dni`]) page1.drawText(String(data[`${prefix}_dni`]), { x: rightX + 310, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });
      rowY -= 19;

      page1.drawLine({ start: { x: rightX, y: rowY - 19 }, end: { x: startX + tableW, y: rowY - 19 }, thickness: 1, color: black });
      page1.drawText('Domicilio: ', { x: rightX + 4, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (data[`${prefix}_domicilio`]) page1.drawText(String(data[`${prefix}_domicilio`]), { x: rightX + 50, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });
      const viveStr = fNombre
        ? (data[`${prefix}_convive`] === false || data[`${prefix}_mismo_hogar`] === false ? 'NO' : (data[`${prefix}_convive`] === true || data[`${prefix}_mismo_hogar`] === true ? 'SÍ' : ''))
        : '';
      page1.drawText(`¿Vive en el mismo hogar que el protagonista?: ${viveStr}`, { x: rightX + 240, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      rowY -= 19;

      page1.drawLine({ start: { x: rightX, y: rowY - 19 }, end: { x: startX + tableW, y: rowY - 19 }, thickness: 1, color: black });
      page1.drawLine({ start: { x: rightX + 220, y: rowY }, end: { x: rightX + 220, y: rowY - 19 }, thickness: 1, color: black });
      page1.drawText('E-mail: ', { x: rightX + 4, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (data[`${prefix}_email`]) page1.drawText(String(data[`${prefix}_email`]), { x: rightX + 35, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });
      page1.drawText('Teléfono: ', { x: rightX + 225, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (data[`${prefix}_telefono`]) page1.drawText(String(data[`${prefix}_telefono`]), { x: rightX + 265, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });
      rowY -= 19;

      page1.drawLine({ start: { x: rightX + 220, y: rowY }, end: { x: rightX + 220, y: rowY - 18 }, thickness: 1, color: black });
      page1.drawText('Profesión: ', { x: rightX + 4, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (data[`${prefix}_profesion`]) page1.drawText(String(data[`${prefix}_profesion`]), { x: rightX + 50, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });
      page1.drawText('Est. Civil: ', { x: rightX + 225, y: rowY - 13, size: 8, font: fontRegular, color: labelColor });
      if (data[`${prefix}_estado_civil`]) page1.drawText(String(data[`${prefix}_estado_civil`]), { x: rightX + 270, y: rowY - 13, size: 8.5, font: fontBold, color: memberDataColor });

      currentY -= (boxH + 8);
    };

    drawFamiliarBox('Datos de la Madre', 'madre');
    drawFamiliarBox('Datos del Padre', 'padre');
    drawFamiliarBox('Datos del tutor', 'tutor');

    page1.drawText('La presente debe estar acompañada por fotocopia del DNI del protagonista', {
      x: 40,
      y: 40,
      size: 8.5,
      font: fontItalic,
      color: labelColor,
    });
    page1.drawImage(qrImage, { x: width - 95, y: 25, width: 55, height: 55 });
    page1.drawText(`VERIF: ${qrHash.slice(0, 10)}...`, { x: width - 110, y: 16, size: 6, font: fontRegular, color: labelColor });
  }

  // ==========================================
  // PAGE 2: DECLARACIÓN JURADA DE SALUD (A4)
  // ==========================================
  {
    const page2 = pdfDoc.addPage([595.56, 842.04]);
    const { width, height } = page2.getSize();

    page2.drawImage(logoScoutsSalud, { x: 35, y: height - 70, width: 85, height: 42 });
    page2.drawText('Formulario de Información de Salud', { x: 130, y: height - 42, size: 11, font: fontBold, color: blueScout });
    page2.drawText('Planilla Versión: 01-25', { x: 130, y: height - 54, size: 8, font: fontBold, color: black });
    page2.drawText('www.scouts.org.ar', { x: 130, y: height - 64, size: 8, font: fontRegular, color: blueScout });
    page2.drawLine({ start: { x: 35, y: height - 75 }, end: { x: width - 35, y: height - 75 }, thickness: 1, color: black });

    page2.drawText('DECLARACIÓN JURADA DE SALUD', { x: width / 2 - 110, y: height - 92, size: 12, font: fontBold, color: black });
    page2.drawText('Los Datos consignados en la presente tienen carácter de declaración jurada por el firmante', {
      x: width / 2 - 170,
      y: height - 104,
      size: 7.5,
      font: fontBold,
      color: labelColor,
    });

    let leftY = height - 120;
    const drawFieldLeft = (label: string, val: unknown) => {
      page2.drawText(label, { x: 35, y: leftY, size: 8, font: fontRegular, color: labelColor });
      const lw = fontRegular.widthOfTextAtSize(label, 8);
      if (val) {
        page2.drawText(String(val), { x: 38 + lw, y: leftY, size: 8.5, font: fontBold, color: memberDataColor });
      }
      page2.drawLine({ start: { x: 38 + lw, y: leftY - 2 }, end: { x: 290, y: leftY - 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      leftY -= 14;
    };

    drawFieldLeft('Apellido: ', data.salud_apellido || data.protagonista_apellido);
    drawFieldLeft('Nombre: ', data.salud_nombre || data.protagonista_nombre);
    drawFieldLeft('Fecha de nacimiento.: ', normalizeDate(data.salud_fecha_nac || data.protagonista_fecha_nac));
    drawFieldLeft('D.N.I.: ', data.salud_dni || data.protagonista_dni);
    page2.drawText('N° Zona: 22   N° Distrito: 1   N° Grupo: 196 (Juan XXIII)', { x: 35, y: leftY, size: 8, font: fontBold, color: black });
    leftY -= 14;
    drawFieldLeft('Domicilio: ', data.salud_domicilio || data.protagonista_domicilio);
    drawFieldLeft('Teléfono para Emergencia 1: ', data.tel_emergencia_1 || data.salud_tel_emergencia1 || data.madre_telefono || data.telefono_contacto);
    drawFieldLeft('Teléfono para Emergencia 2: ', data.tel_emergencia_2 || data.salud_tel_emergencia2 || '');

    page2.drawRectangle({ x: 35, y: leftY - 32, width: 255, height: 32, color: lightGray, borderColor: black, borderWidth: 0.5 });
    drawWrappedText(
      page2,
      'La información que Ud. se dispone a llenar y que acompañará a su hijo/a o a usted durante todas las actividades, contempla una serie de datos y antecedentes que orientarán al personal de salud actuante en caso de necesidad.',
      38, leftY - 8, 248, 8, fontRegular, 6.5, labelColor,
    );
    leftY -= 40;

    page2.drawRectangle({ x: 35, y: leftY - 60, width: 255, height: 60, borderColor: black, borderWidth: 1 });
    page2.drawRectangle({ x: 35, y: leftY - 14, width: 255, height: 14, color: lightGray, borderColor: black, borderWidth: 0.5 });
    page2.drawLine({ start: { x: 180, y: leftY }, end: { x: 180, y: leftY - 60 }, thickness: 1, color: black });
    page2.drawText('Vacunas', { x: 40, y: leftY - 10, size: 7.5, font: fontBold });
    page2.drawText('Última Dosis', { x: 190, y: leftY - 10, size: 7.5, font: fontBold });

    const vacunas = [
      ['Quíntuple', data.vacuna_quintuple || ''],
      ['Triple Bacteriana Celular', data.vacuna_triple_celular || ''],
      ['Triple Bacteriana Acelular', data.vacuna_triple_acelular || ''],
      ['Doble Bacteriana', data.vacuna_doble_bacteriana || ''],
    ];
    let vacY = leftY - 24;
    vacunas.forEach(([vName, vDosis]) => {
      page2.drawText(String(vName), { x: 40, y: vacY, size: 7, font: fontRegular, color: labelColor });
      if (vDosis) {
        page2.drawText(String(vDosis), { x: 190, y: vacY, size: 7, font: fontBold, color: memberDataColor });
      }
      vacY -= 11;
    });
    leftY -= 68;

    const drawQuestion = (qText: string, val: unknown) => {
      const resp = val ? `SÍ (${String(val)})` : 'NO';
      page2.drawText(qText, { x: 35, y: leftY, size: 7, font: fontBold, color: black });
      page2.drawText(resp, { x: 35, y: leftY - 9, size: 7.5, font: fontBold, color: val ? memberDataColor : labelColor });
      leftY -= 20;
    };

    drawQuestion('¿Toma alguna medicación? SI - NO ¿Cuál?', data.toma_medicacion_detalle || (data.toma_medicacion ? 'SÍ' : ''));
    drawQuestion('¿Padece alguna enfermedad crónica? SI - NO ¿Cuál?', data.enfermedad_cronica_detalle || (data.enfermedad_cronica ? 'SÍ' : ''));
    drawQuestion('¿Requiere tratamiento? SI - NO ¿Cuál?', data.requiere_tratamiento_detalle || (data.requiere_tratamiento ? 'SÍ' : ''));
    drawQuestion('¿Tiene CUD? SI – NO', data.tiene_cud ? 'SÍ (Certificado Activo)' : '');
    drawQuestion('¿Sufre alguna alergia? SI - NO ¿Cuál?', data.sufre_alergia_detalle || (data.sufre_alergia ? 'SÍ' : ''));
    drawQuestion('¿Está anticoagulado? SI – NO ¿Con cuál droga?', data.anticoagulado_droga || (data.esta_anticoagulado ? 'SÍ' : ''));
    drawQuestion('¿Sigue algún régimen dietario especial? SI - NO ¿Cuál?', data.regimen_dietario_detalle || (data.regimen_dietario ? 'SÍ' : ''));
    drawQuestion('¿Ha tenido ataques de pánico/ansiedad? SI – NO', data.ataques_panico_frecuencia || (data.ataques_panico_ansiedad ? 'SÍ' : ''));
    drawQuestion('¿Cuenta con un diagnóstico de profesional de salud mental?', data.diagnostico_salud_mental_detalle || (data.diagnostico_salud_mental ? 'SÍ' : ''));
    drawQuestion('Recibe tratamiento SI – NO ¿Cuál?', data.recibe_tratamiento_salud_mental_detalle || (data.recibe_tratamiento_salud_mental ? 'SÍ' : ''));

    // Miedo o Fobia con especificación de cuál padece
    const fobiaEspec = data.miedo_fobia_detalle || (data.miedo_fobia_excesivo ? 'SÍ' : '');
    drawQuestion('¿Tiene algún miedo excesivo o fobia? SI – NO ¿Cuál?', fobiaEspec);

    // Right Column
    let rightY = height - 120;
    const ctrlMed = data.fecha_control_medico ? normalizeDate(data.fecha_control_medico) : '';
    page2.drawText(`De haber realizado un control médico indique fecha: `, { x: 305, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    if (ctrlMed) {
      page2.drawText(ctrlMed, { x: 485, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    }
    page2.drawLine({ start: { x: 480, y: rightY - 2 }, end: { x: 560, y: rightY - 2 }, thickness: 0.5, color: labelColor });
    rightY -= 16;

    const situW = 255;
    page2.drawRectangle({ x: 305, y: rightY - 142, width: situW, height: 142, borderColor: black, borderWidth: 1 });
    page2.drawRectangle({ x: 305, y: rightY - 14, width: situW, height: 14, color: lightGray, borderColor: black, borderWidth: 0.5 });
    page2.drawLine({ start: { x: 520, y: rightY }, end: { x: 520, y: rightY - 142 }, thickness: 1, color: black });
    page2.drawText('Conteste las siguientes situaciones', { x: 310, y: rightY - 10, size: 7.5, font: fontBold });
    page2.drawText('SI / NO', { x: 525, y: rightY - 10, size: 7.5, font: fontBold });

    const situaciones = [
      ['Tiene hemorragias nasales', data.sit_hemorragias_nasales],
      ['Sangran sus encías al cepillarse los dientes', data.sit_sangrado_encias],
      ['Tiene dolor de cabeza', data.sit_dolor_cabeza],
      ['Sufre presión alta', data.sit_presion_alta],
      ['Sufre presión baja', data.sit_presion_baja],
      ['Alguna vez recibió transfusiones de sangre', data.sit_transfusiones],
      ['Ha tenido convulsiones', data.sit_convulsiones],
      ['Tuvo cirugías en el último año', data.sit_cirugias_ultimo_anio],
      ['Tuvo internaciones en el último año', data.sit_internaciones_ultimo_anio],
      ['Realiza actividad física', data.sit_actividad_fisica ?? true],
      ['Puede realizar cualquier tipo de actividad física', data.sit_cualquier_actividad_fisica ?? true],
    ];

    let sitY = rightY - 24;
    situaciones.forEach(([label, val]) => {
      page2.drawText(String(label), { x: 310, y: sitY, size: 6.5, font: fontRegular, color: labelColor });
      const sVal = val === true ? 'SI' : (val === false ? 'NO' : 'NO');
      page2.drawText(sVal, { x: 532, y: sitY, size: 7, font: fontBold, color: sVal === 'SI' ? memberDataColor : black });
      page2.drawLine({ start: { x: 305, y: sitY - 2 }, end: { x: 560, y: sitY - 2 }, thickness: 0.3, color: lightGray });
      sitY -= 11.5;
    });
    rightY -= 150;

    page2.drawText(`Grupo Sanguíneo: `, { x: 305, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    if (data.grupo_sanguineo) page2.drawText(String(data.grupo_sanguineo), { x: 375, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    page2.drawText(`- Factor RH: `, { x: 420, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    if (data.factor_rh) page2.drawText(String(data.factor_rh), { x: 470, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    rightY -= 14;

    page2.drawText(`Peso: `, { x: 305, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    if (data.peso_kg) page2.drawText(`${data.peso_kg} Kg.`, { x: 335, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    page2.drawText(`– Talla: `, { x: 420, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    if (data.talla_m) page2.drawText(`${data.talla_m} m.`, { x: 460, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    rightY -= 18;

    page2.drawRectangle({ x: 305, y: rightY - 34, width: 255, height: 34, borderColor: black, borderWidth: 0.5 });
    drawWrappedText(
      page2,
      'POR FAVOR: PUEDE UTILIZAR LA PARTE DE ATRÁS DE ESTA HOJA PARA AMPLIAR CUALQUIER COMENTARIO QUE CONSIDERE ÚTIL - AGREGUE AL PRESENTE FORMULARIO FOTOCOPIAS DE DOCUMENTACIÓN QUE CONSIDERE CONVENIENTE.',
      308, rightY - 8, 248, 7.5, fontBold, 5.5, labelColor,
    );
    rightY -= 42;

    page2.drawText('Obra Social o Prepaga: ', { x: 305, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    page2.drawText(String(data.obra_social || data.protagonista_obra_social || ''), { x: 395, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    rightY -= 13;
    page2.drawText('Credencial No: ', { x: 305, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    page2.drawText(String(data.obra_social_afiliado || data.protagonista_afiliado_obra_social || ''), { x: 365, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    rightY -= 13;
    page2.drawText('Tel. Emergencia Obra Social: ', { x: 305, y: rightY, size: 7.5, font: fontRegular, color: labelColor });
    page2.drawText(String(data.tel_emergencia_obra_social || ''), { x: 415, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    rightY -= 20;

    drawWrappedText(
      page2,
      'Declaro bajo juramento que toda la información aquí aportada es verídica y de sufrir alguna modificación de los datos o de hechos nuevos, asumo el compromiso de informarla a la brevedad.',
      305, rightY, 255, 8.5, fontRegular, 6.5, labelColor,
    );
    rightY -= 24;
    page2.drawText('Adulto/Madres/Padres/Tutores/Responsable:', { x: 305, y: rightY, size: 7.5, font: fontBold });
    rightY -= 28;
    page2.drawText('Firma: ____________________________________', { x: 305, y: rightY, size: 7.5, font: fontRegular });
    rightY -= 16;
    const respAclar = String(data.autorizante_nombre || data.madre_nombres || '');
    page2.drawText(`Aclaración: `, { x: 305, y: rightY, size: 8, font: fontRegular, color: labelColor });
    page2.drawText(respAclar, { x: 350, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    rightY -= 16;
    const respDni = String(data.autorizante_dni || data.madre_dni || '');
    page2.drawText(`DNI: `, { x: 305, y: rightY, size: 8, font: fontRegular, color: labelColor });
    page2.drawText(respDni, { x: 325, y: rightY, size: 8, font: fontBold, color: memberDataColor });
    page2.drawText(`       Fecha: `, { x: 400, y: rightY, size: 8, font: fontRegular, color: labelColor });
    page2.drawText(normalizeDate(data.fecha_declaracion || new Date().toISOString().slice(0, 10)), { x: 440, y: rightY, size: 8, font: fontBold, color: memberDataColor });

    page2.drawImage(qrImage, { x: width - 85, y: 25, width: 50, height: 50 });
  }

  // ==========================================
  // PAGE 3: AUTORIZACIÓN DE INGRESO (A4)
  // ==========================================
  {
    const page3 = pdfDoc.addPage([595.32, 841.92]);
    const { width, height } = page3.getSize();
    drawSaacAuthHeader(page3, 'Autorización de Ingreso de Niños, Niñas y Jóvenes Menores de 18 Años');

    page3.drawText('AUTORIZACIÓN DE INGRESO DE', { x: width / 2 - 110, y: height - 105, size: 12, font: fontBold });
    page3.drawText('NIÑOS, NIÑAS Y JÓVENES MENORES DE 18 AÑOS', { x: width / 2 - 160, y: height - 120, size: 12, font: fontBold });

    const autDate = parseDateParts(data.autorizante_fecha_nac);
    const minDate = parseDateParts(data.protagonista_fecha_nac);
    const todayDate = parseDateParts(new Date().toISOString().slice(0, 10));

    const pNombre = [data.protagonista_nombre, data.protagonista_apellido].filter(Boolean).join(' ') || String(data.nombre_completo || '');
    const aNombre = String(data.autorizante_nombre || data.madre_nombres || '');

    const p3Spans = [
      { text: 'En la localidad de ', bold: false },
      { text: String(data.autorizante_localidad || 'Córdoba'), bold: true },
      { text: ', partido / departamento de ', bold: false },
      { text: String(data.autorizante_departamento || 'Capital'), bold: true },
      { text: ' de la provincia de ', bold: false },
      { text: String(data.autorizante_provincia || 'Córdoba'), bold: true },
      { text: ', a los ', bold: false },
      { text: todayDate.dia, bold: true },
      { text: ' días del mes de ', bold: false },
      { text: todayDate.mes, bold: true },
      { text: ' del año ', bold: false },
      { text: todayDate.anio, bold: true },
      { text: ', YO (1) ', bold: false },
      { text: aNombre, bold: true },
      { text: ' de nacionalidad ', bold: false },
      { text: String(data.autorizante_nacionalidad || 'Argentina'), bold: true },
      { text: ', nacido/a él ', bold: false },
      { text: autDate.dia, bold: true },
      { text: ' de ', bold: false },
      { text: autDate.mes, bold: true },
      { text: ' de ', bold: false },
      { text: autDate.anio, bold: true },
      { text: ' DNI ', bold: false },
      { text: String(data.autorizante_dni || ''), bold: true },
      { text: ' Teléfono: ', bold: false },
      { text: String(data.autorizante_telefono || ''), bold: true },
      { text: ', y con domicilio en ', bold: false },
      { text: String(data.autorizante_domicilio || ''), bold: true },
      { text: ' en mi carácter de (2) ', bold: false },
      { text: String(data.autorizante_caracter || 'Madre'), bold: true },
      { text: ' OTORGO AUTORIZACIÓN para que EL MENOR (3) ', bold: false },
      { text: pNombre, bold: true },
      { text: ', de nacionalidad ', bold: false },
      { text: String(data.menor_nacionalidad || data.protagonista_nacionalidad || 'Argentina'), bold: true },
      { text: ' nacido/a el ', bold: false },
      { text: minDate.dia, bold: true },
      { text: ' de ', bold: false },
      { text: minDate.mes, bold: true },
      { text: ' de ', bold: false },
      { text: minDate.anio, bold: true },
      { text: ' y DNI ', bold: false },
      { text: String(data.protagonista_dni || ''), bold: true },
      { text: ', con domicilio en ', bold: false },
      { text: String(data.protagonista_domicilio || ''), bold: true },
      { text: ', para que participe de las actividades scouts desarrolladas por los dirigentes pertenecientes al Grupo Scout Nº 196 Nombre Juan XXIII del Distrito Nº 1 de la Zona Nº 22 de Scouts de Argentina Asociación Civil.', bold: false },
    ];

    let curY = drawStyledParagraph(page3, p3Spans, 40, height - 145, width - 80, 13.5, 8.5);

    curY -= 10;
    curY = drawWrappedText(
      page3,
      'A la autorización se debe adjuntar fotocopias de la Partida de Nacimiento del Menor y de frente y dorso del DNI, tanto del menor, como del autorizante y de otra documentación legal.',
      40, curY, width - 80, 11, fontItalic, 8, labelColor,
    );

    curY -= 20;
    page3.drawText('Firma: ............................................................................', { x: 220, y: curY, size: 9, font: fontRegular });
    curY -= 20;

    const aclaracionGuarda = String(data.aclaraciones_tenencia_guarda || '');
    page3.drawText(`Formula aclaraciones sobre la situación de tenencia o guarda del menor (4):`, { x: 40, y: curY, size: 8, font: fontBold, color: black });
    curY -= 12;
    if (aclaracionGuarda) {
      page3.drawText(aclaracionGuarda, { x: 40, y: curY, size: 8, font: fontBold, color: memberDataColor });
    }
    curY -= 20;
    page3.drawText('Firma: ............................................................................', { x: 220, y: curY, size: 9, font: fontRegular });

    curY -= 25;
    page3.drawText('TESTIGOS (5)', { x: width / 2 - 40, y: curY, size: 10, font: fontBold });
    curY -= 20;

    const testColW = (width - 100) / 2;
    page3.drawText('Firma: .......................................................', { x: 40, y: curY, size: 8.5, font: fontRegular });
    page3.drawText('Firma: .......................................................', { x: 40 + testColW, y: curY, size: 8.5, font: fontRegular });
    curY -= 16;
    page3.drawText('Aclaración: ...............................................', { x: 40, y: curY, size: 8.5, font: fontRegular });
    page3.drawText('Aclaración: ...............................................', { x: 40 + testColW, y: curY, size: 8.5, font: fontRegular });
    curY -= 16;
    page3.drawText('DNI: ...........................................................', { x: 40, y: curY, size: 8.5, font: fontRegular });
    page3.drawText('DNI: ...........................................................', { x: 40 + testColW, y: curY, size: 8.5, font: fontRegular });

    curY -= 22;
    const footnotes = [
      '1 Nombre y apellido completo de quien firma la autorización, tal como figura en el DNI',
      '2 Hay que hacer figurar el carácter en el cual se autoriza al menor: padre/ madre/ tutor/ guardador/ persona que ejerce la tenencia judicial del menor',
      '3 Nombre y apellido del menor, tal como figura en el DNI',
      '4 Aclare lo que corresponda sobre la situación del menor manifestando que se encuentra bajo su guarda provisorio o definitiva...',
      '5 "La autorización de Ingreso debe ser firmada ante al menos dos educadores/as del Grupo Scout..." (Manual General de Normas de SAAC)',
    ];
    footnotes.forEach((fn) => {
      drawWrappedText(page3, fn, 40, curY, width - 80, 8, fontRegular, 6, rgb(0.35, 0.35, 0.35));
      curY -= 9;
    });

    // Proportional official footer
    drawProportionalPurpleFooter(page3);
    page3.drawImage(qrImage, { x: width - 85, y: 80, width: 45, height: 45 });
  }

  // ==========================================
  // PAGE 4: SALIDAS CERCANAS (A4)
  // ==========================================
  {
    const page4 = pdfDoc.addPage([595.32, 841.92]);
    const { width, height } = page4.getSize();
    drawSaacAuthHeader(page4, 'Autorización Anual Para Salidas Cercanas');

    page4.drawText('AUTORIZACIÓN ANUAL PARA SALIDAS CERCANAS', { x: width / 2 - 150, y: height - 105, size: 12, font: fontBold });

    const autDate = parseDateParts(data.autorizante_fecha_nac);
    const minDate = parseDateParts(data.protagonista_fecha_nac);
    const todayDate = parseDateParts(new Date().toISOString().slice(0, 10));

    const pNombre = [data.protagonista_nombre, data.protagonista_apellido].filter(Boolean).join(' ') || String(data.nombre_completo || '');
    const aNombre = String(data.autorizante_nombre || data.madre_nombres || '');

    const p4Spans = [
      { text: 'En la localidad de ', bold: false },
      { text: String(data.autorizante_localidad || 'Córdoba'), bold: true },
      { text: ', partido / departamento de ', bold: false },
      { text: String(data.autorizante_departamento || 'Capital'), bold: true },
      { text: ' de la provincia de ', bold: false },
      { text: String(data.autorizante_provincia || 'Córdoba'), bold: true },
      { text: ', a los ', bold: false },
      { text: todayDate.dia, bold: true },
      { text: ' días del mes de ', bold: false },
      { text: todayDate.mes, bold: true },
      { text: ' del año ', bold: false },
      { text: todayDate.anio, bold: true },
      { text: ', yo (1) ', bold: false },
      { text: aNombre, bold: true },
      { text: ' de nacionalidad ', bold: false },
      { text: String(data.autorizante_nacionalidad || 'Argentina'), bold: true },
      { text: ', nacido/a él ', bold: false },
      { text: autDate.dia, bold: true },
      { text: ' de ', bold: false },
      { text: autDate.mes, bold: true },
      { text: ' de ', bold: false },
      { text: autDate.anio, bold: true },
      { text: ' DNI ', bold: false },
      { text: String(data.autorizante_dni || ''), bold: true },
      { text: ' Teléfono: ', bold: false },
      { text: String(data.autorizante_telefono || ''), bold: true },
      { text: ', y con domicilio en ', bold: false },
      { text: String(data.autorizante_domicilio || ''), bold: true },
      { text: ' en mi carácter de (2) ', bold: false },
      { text: String(data.autorizante_caracter || 'Madre'), bold: true },
      { text: ' OTORGO AUTORIZACIÓN PARA QUE EL / LA MENOR (3) ', bold: false },
      { text: pNombre, bold: true },
      { text: ', de nacionalidad ', bold: false },
      { text: String(data.menor_nacionalidad || data.protagonista_nacionalidad || 'Argentina'), bold: true },
      { text: ', nacido/a el ', bold: false },
      { text: minDate.dia, bold: true },
      { text: ' de ', bold: false },
      { text: minDate.mes, bold: true },
      { text: ' de ', bold: false },
      { text: minDate.anio, bold: true },
      { text: ' y DNI ', bold: false },
      { text: String(data.protagonista_dni || ''), bold: true },
      { text: ', con domicilio en ', bold: false },
      { text: String(data.protagonista_domicilio || ''), bold: true },
      { text: ', para salir de la sede del Grupo Scout N° 196 “Juan XXIII” del Distrito N° 1, perteneciente a la Zona N° 22 de Scouts de Argentina Asociación Civil, durante el presente año 2026, cuando las actividades planificadas así lo requieran y bajo el cuidado de los/las Educadores/as Scout del Grupo Scout.-------------------------', bold: false },
    ];

    let curY = drawStyledParagraph(page4, p4Spans, 40, height - 135, width - 80, 13, 8.5);

    curY -= 10;
    const bodyP1 =
      `Dichas actividades podrán ser: juegos por el barrio / localidad, visita a plazas, recolección y/o venta de elementos varios, ` +
      `servicios, actividades religiosas o comunitarias y cualquier otra actividad fuera de la sede del grupo en un rango no mayor a ........................., ` +
      `y siempre y cuando la salida no requiera pernocte. ---------`;
    curY = drawWrappedText(page4, bodyP1, 40, curY, width - 80, 12, fontRegular, 8, labelColor);

    curY -= 8;
    const bodyP2 =
      `Dejo constancia que tengo conocimiento que para las actividades no abarcadas en esta autorización, los responsables del Organismo me pedirán ` +
      `autorización particular en cada caso, conforme al Manual General de Normas de SAAC, Capitulo 4. -------------------------`;
    curY = drawWrappedText(page4, bodyP2, 40, curY, width - 80, 12, fontRegular, 8, labelColor);

    curY -= 8;
    const bodyP3 =
      `Asimismo, doy autorización para que el menor sea transportado por la Asociación desde y hasta el lugar donde se realice la actividad ` +
      `autorizada por el medio de transporte que decida la Institución, comprometiéndome en caso de revocación a hacerlo saber a las autoridades ` +
      `correspondientes y por escrito.-`;
    curY = drawWrappedText(page4, bodyP3, 40, curY, width - 80, 12, fontRegular, 8, labelColor);

    curY -= 20;
    page4.drawText('Firma: ............................................................................', { x: 220, y: curY, size: 9, font: fontRegular });

    curY -= 25;
    page4.drawText('AVAL DE LOS RESPONSABLES SCOUTS (4)', { x: width / 2 - 120, y: curY, size: 10, font: fontBold });
    curY -= 15;
    const avalText =
      'Certifico que el/la Menor registrado/a en la categoría de Beneficiario, posee el Legajo Personal completo según el capitulo 4, del Manual General de Normas de SAAC ' +
      'y que la persona que está otorgando autorización tiene su firma registrada en la “AUTORIZACIÓN DE INGRESO DE NIÑOS, NIÑAS Y JÓVENES MENORES DE 18 AÑOS”.-';
    curY = drawWrappedText(page4, avalText, 40, curY, width - 80, 11, fontRegular, 7.5, labelColor);

    curY -= 16;
    page4.drawText('Firma: _________________________________________', { x: 40, y: curY, size: 8, font: fontRegular });
    curY -= 14;
    page4.drawText('Aclaración: _____________________________________', { x: 40, y: curY, size: 8, font: fontRegular });
    curY -= 14;
    page4.drawText('DNI: ___________________________________________', { x: 40, y: curY, size: 8, font: fontRegular });
    curY -= 14;
    page4.drawText('Función en el Grupo Scout: _______________________', { x: 40, y: curY, size: 8, font: fontRegular });

    curY -= 18;
    const footnotes = [
      '1 Nombre y apellido completo de quien firma la autorización, tal como figura en el DNI',
      '2 Hay que hacer figurar el carácter en el cual se autoriza al menor: padre/ madre/ tutor/ guardador/ persona que ejerce la tenencia judicial del/la menor',
      '3 Nombre y apellido completo del/la Menor tal como figura en el DNI',
      '4 El/la Jefe de Grupo o Jefe/a de Unidad',
    ];
    footnotes.forEach((fn) => {
      drawWrappedText(page4, fn, 40, curY, width - 80, 8, fontRegular, 6, rgb(0.35, 0.35, 0.35));
      curY -= 8.5;
    });

    drawProportionalPurpleFooter(page4);
    page4.drawImage(qrImage, { x: width - 85, y: 80, width: 45, height: 45 });
  }

  // ==========================================
  // PAGE 5: NECESIDADES ESPECIALES (Letter)
  // ==========================================
  const shouldIncludePage5 = Boolean(
    data.ne_diagnostico ||
    data.ne_medicacion ||
    data.ne_medico_cabecera ||
    data.ne_cud_vencimiento_prestacion ||
    data.ne_situaciones_estres_abordaje ||
    data.tiene_cud ||
    data.condicion_salud_preexistente ||
    options.blank
  );

  if (shouldIncludePage5) {
    const page5 = pdfDoc.addPage([612, 792]);
    const { width, height } = page5.getSize();
    drawGroupHeader(page5, 'FICHA DE NECESIDADES ESPECIALES - 2026');

    let curY = height - 105;
    page5.drawText('Este documento es para poder conocer el diagnóstico y tratamientos de cada protagonista que desee', { x: 40, y: curY, size: 7.5, font: fontItalic, color: labelColor });
    curY -= 10;
    page5.drawText('formar parte del Grupo Scout Juan XXIII, para una mejor adaptación del mismo a las actividades scout.', { x: 40, y: curY, size: 7.5, font: fontItalic, color: labelColor });
    curY -= 18;

    page5.drawText('Diagnósticos o enfermedades', { x: 40, y: curY, size: 9.5, font: fontBold, color: black });
    curY -= 16;

    const drawFieldLine = (lbl: string, val: unknown) => {
      page5.drawText(lbl, { x: 40, y: curY, size: 8, font: fontRegular, color: labelColor });
      const lw = fontRegular.widthOfTextAtSize(lbl, 8);
      if (val) {
        page5.drawText(String(val), { x: 45 + lw, y: curY, size: 8.5, font: fontBold, color: memberDataColor });
      }
      page5.drawLine({ start: { x: 45 + lw, y: curY - 2 }, end: { x: width - 40, y: curY - 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      curY -= 18;
    };

    drawFieldLine('Diagnóstico: ', data.ne_diagnostico);
    drawFieldLine('Evolución: ', data.ne_evolucion);
    drawFieldLine('Médico de cabecera: ', data.ne_medico_cabecera);
    drawFieldLine('Medicación: ', data.ne_medicacion);
    drawFieldLine('Otros antecedentes médicos a saber: ', data.ne_otros_antecedentes);
    drawFieldLine('Medicamento y sus horarios: ', data.ne_medicamento_horarios);
    drawFieldLine('Escolaridad: ', data.escolaridad_institucion || data.protagonista_institucion_escolar);
    drawFieldLine('Obra Social: ', data.obra_social || data.protagonista_obra_social);

    const drawMultiLineField = (title: string, val: unknown) => {
      page5.drawText(title, { x: 40, y: curY, size: 8, font: fontBold, color: black });
      curY -= 12;
      if (val) {
        curY = drawWrappedText(page5, String(val), 40, curY, width - 80, 10, fontBold, 8, memberDataColor);
      } else {
        page5.drawLine({ start: { x: 40, y: curY }, end: { x: width - 40, y: curY }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        curY -= 10;
        page5.drawLine({ start: { x: 40, y: curY }, end: { x: width - 40, y: curY }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        curY -= 10;
      }
      curY -= 6;
    };

    drawMultiLineField('Certificado de discapacidad (fecha de vencimiento y orientación prestacional):', data.ne_cud_vencimiento_prestacion);
    drawMultiLineField('¿Cómo está compuesto el Grupo Acompañante de su hijo/a? (Psicopedagogo, Psicólogo, Kinesiólogo, Acompañante, etc):', data.ne_grupo_acompanante);
    drawFieldLine('Terapias previas: ', data.ne_terapias_previas);
    drawMultiLineField('Situaciones que pueden generarle estrés y cómo las abordan en familia o escuela:', data.ne_situaciones_estres_abordaje);
    drawMultiLineField('Describir en breves palabras a su hijo/a, sus gustos, preferencias, qué estímulos le atraen o asustan:', data.ne_descripcion_hijo_gustos_miedos);
    drawMultiLineField('¿Cuáles son las expectativas de la Familia con el Grupo Scout?:', data.ne_expectativas_familia);

    page5.drawImage(qrImage, { x: width - 95, y: 25, width: 55, height: 55 });
  }

  // ==========================================
  // PAGE 6: RETIRO DE MENORES (Letter)
  // ==========================================
  const shouldIncludePage6 = Boolean(
    data.ret_persona1_nombre ||
    data.ret_persona2_nombre ||
    data.ret_persona3_nombre ||
    data.ret_autoriza_retirarse_solo ||
    options.blank
  );

  if (shouldIncludePage6) {
    const page6 = pdfDoc.addPage([612, 792]);
    const { width, height } = page6.getSize();
    drawGroupHeader(page6, 'AUTORIZACIÓN RETIRO DE MENORES - 2026');

    const autDate = parseDateParts(data.autorizante_fecha_nac);
    const minDate = parseDateParts(data.protagonista_fecha_nac);
    const pNombre = [data.protagonista_nombre, data.protagonista_apellido].filter(Boolean).join(' ') || String(data.nombre_completo || '');
    const aNombre = String(data.autorizante_nombre || data.madre_nombres || '');

    const p6Spans = [
      { text: 'YO ', bold: false },
      { text: aNombre, bold: true },
      { text: ' de nacionalidad ', bold: false },
      { text: String(data.autorizante_nacionalidad || 'Argentina'), bold: true },
      { text: ', nacido él día ', bold: false },
      { text: autDate.dia, bold: true },
      { text: ' / ', bold: false },
      { text: autDate.mes, bold: true },
      { text: ' / ', bold: false },
      { text: autDate.anio, bold: true },
      { text: ' DNI ', bold: false },
      { text: String(data.autorizante_dni || ''), bold: true },
      { text: ' teléfono ', bold: false },
      { text: String(data.autorizante_telefono || ''), bold: true },
      { text: ' con domicilio en ', bold: false },
      { text: String(data.autorizante_domicilio || ''), bold: true },
      { text: ' OTORGO AUTORIZACIÓN para que EL MENOR ', bold: false },
      { text: pNombre, bold: true },
      { text: ' de nacionalidad ', bold: false },
      { text: String(data.menor_nacionalidad || data.protagonista_nacionalidad || 'Argentina'), bold: true },
      { text: ', nacido él día ', bold: false },
      { text: minDate.dia, bold: true },
      { text: ' / ', bold: false },
      { text: minDate.mes, bold: true },
      { text: ' / ', bold: false },
      { text: minDate.anio, bold: true },
      { text: ' DNI: ', bold: false },
      { text: String(data.protagonista_dni || ''), bold: true },
      { text: ' con domicilio en ', bold: false },
      { text: String(data.protagonista_domicilio || ''), bold: true },
      { text: ' pueda retirarse, de las actividades scout pertenecientes al grupo Nº 196 Nombre Juan XXIII del Distrito Nº 1 Zona Nº 22 de Scouts de Argentina Asociación civil con las siguientes personas:', bold: false },
    ];

    let curY = drawStyledParagraph(page6, p6Spans, 40, height - 120, width - 80, 14, 8.5);

    curY -= 20;
    const drawRetiroPersona = (num: number, p: { nombre?: unknown; dni?: unknown; telefono?: unknown; vinculo?: unknown }) => {
      page6.drawText(`${num}. Nombre y apellido: `, { x: 40, y: curY, size: 8.5, font: fontRegular, color: labelColor });
      if (p.nombre) page6.drawText(String(p.nombre), { x: 145, y: curY, size: 8.5, font: fontBold, color: memberDataColor });
      page6.drawText('DNI: ', { x: 380, y: curY, size: 8.5, font: fontRegular, color: labelColor });
      if (p.dni) page6.drawText(String(p.dni), { x: 410, y: curY, size: 8.5, font: fontBold, color: memberDataColor });
      curY -= 15;
      page6.drawText('    Teléfono: ', { x: 40, y: curY, size: 8, font: fontRegular, color: labelColor });
      if (p.telefono) page6.drawText(String(p.telefono), { x: 100, y: curY, size: 8, font: fontBold, color: memberDataColor });
      page6.drawText('En carácter de: ', { x: 250, y: curY, size: 8, font: fontRegular, color: labelColor });
      if (p.vinculo) page6.drawText(String(p.vinculo), { x: 320, y: curY, size: 8, font: fontBold, color: memberDataColor });
      curY -= 20;
    };

    drawRetiroPersona(1, {
      nombre: data.ret_persona1_nombre,
      dni: data.ret_persona1_dni,
      telefono: data.ret_persona1_telefono,
      vinculo: data.ret_persona1_caracter,
    });
    drawRetiroPersona(2, {
      nombre: data.ret_persona2_nombre,
      dni: data.ret_persona2_dni,
      telefono: data.ret_persona2_telefono,
      vinculo: data.ret_persona2_caracter,
    });
    drawRetiroPersona(3, {
      nombre: data.ret_persona3_nombre,
      dni: data.ret_persona3_dni,
      telefono: data.ret_persona3_telefono,
      vinculo: data.ret_persona3_caracter,
    });

    curY -= 10;
    const soloStr = data.ret_autoriza_retirarse_solo ? `SÍ, AUTORIZADO A RETIRARSE SOLO/A (${data.ret_retiro_solo_aclaracion || 'Al finalizar actividades'})` : 'NO (Solo con las personas autorizadas arriba)';
    page6.drawText(`4. Autorizo a que se retire solo/a: `, { x: 40, y: curY, size: 9, font: fontRegular, color: labelColor });
    page6.drawText(soloStr, { x: 210, y: curY, size: 9, font: fontBold, color: memberDataColor });

    curY -= 30;
    const todayDate = parseDateParts(new Date().toISOString().slice(0, 10));
    page6.drawText(`Fecha: `, { x: 40, y: curY, size: 8.5, font: fontRegular, color: labelColor });
    page6.drawText(`${todayDate.dia} / ${todayDate.mes} / ${todayDate.anio}`, { x: 80, y: curY, size: 8.5, font: fontBold, color: memberDataColor });
    curY -= 18;
    page6.drawText(`Provincia y ciudad: `, { x: 40, y: curY, size: 8.5, font: fontRegular, color: labelColor });
    page6.drawText(String(data.autorizante_ciudad || 'Córdoba, Argentina'), { x: 135, y: curY, size: 8.5, font: fontBold, color: memberDataColor });

    curY -= 40;
    page6.drawText('Firma y aclaración, madre, padre o tutor: ............................................................................', { x: 100, y: curY, size: 9, font: fontRegular });

    page6.drawImage(qrImage, { x: width - 95, y: 25, width: 55, height: 55 });
  }

  // ==========================================
  // PAGE 7: FICHA DE ADULTOS (Letter)
  // ==========================================
  const hasAnyColab = Object.keys(data).some(
    (k) => (k.startsWith('colab_') || k.startsWith('mat_')) && Boolean(data[k])
  );
  const shouldIncludePage7 = Boolean(
    data.completar_ficha_adultos ||
    hasAnyColab ||
    options.blank
  );

  if (shouldIncludePage7) {
    const page7 = pdfDoc.addPage([612, 792]);
    const { width, height } = page7.getSize();
    drawGroupHeader(page7, 'FICHA DE ADULTOS - 2026');

    let curY = height - 105;
    page7.drawText('Este formulario debe ser rellenado por cualquier adulto que esté predispuesto a colaborar en el grupo scout.', { x: 40, y: curY, size: 7.5, font: fontItalic, color: labelColor });
    curY -= 10;
    page7.drawText('En caso de ser dos o más, completar esta ficha especificando.', { x: 40, y: curY, size: 7.5, font: fontItalic, color: labelColor });
    curY -= 18;

    const drawAdultField = (lbl: string, val: unknown) => {
      page7.drawText(lbl, { x: 40, y: curY, size: 8, font: fontRegular, color: labelColor });
      const lw = fontRegular.widthOfTextAtSize(lbl, 8);
      if (val) {
        page7.drawText(String(val), { x: 45 + lw, y: curY, size: 8.5, font: fontBold, color: memberDataColor });
      }
      page7.drawLine({ start: { x: 45 + lw, y: curY - 2 }, end: { x: width - 40, y: curY - 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      curY -= 15;
    };

    drawAdultField('Nombre/s: ', data.adulto_nombre || '');
    drawAdultField('Nombre de su hijo/a: ', [data.protagonista_nombre, data.protagonista_apellido].filter(Boolean).join(' '));
    drawAdultField('Dirección: ', data.adulto_direccion || '');
    drawAdultField('Localidad: ', 'Córdoba   Código Postal: 5000');
    drawAdultField('Profesión/Oficio: ', data.adulto_profesion || '');
    const telAdulto = String(data.adulto_telefono || '');
    const prefMap: Record<string, string> = {
      JOVENES: 'Con Jóvenes',
      ADULTOS: 'Con Adultos',
      AMBOS: 'Indistinto',
    };
    const prefTexto = prefMap[String(data.adulto_preferencia_trabajo || '')] || '';
    drawAdultField('Teléfono: ', prefTexto ? `${telAdulto}   Prefiero trabajar: ${prefTexto}` : telAdulto);

    curY -= 5;
    page7.drawText('Puedo colaborar:', { x: 40, y: curY, size: 9, font: fontBold });
    curY -= 12;

    const colabOptions = [
      [['colab_servicio_comunitario', 'EN PROYECTOS DE SERVICIO COMUNITARIO'], ['colab_recaudacion_fondos', 'RECAUDACIÓN DE FONDOS/CUOTAS']],
      [['colab_fotocopias', 'PROVEYENDO FOTOCOPIAS'], ['colab_campamento', 'EN CAMPAMENTO']],
      [['colab_mano_obra', 'PROVEYENDO MANO DE OBRA'], ['colab_cocina_campamento', 'EN COCINA DE CAMPAMENTO']],
      [['colab_administrativo', 'AYUDANDO C/ TAREAS ADMINISTRATIVAS'], ['colab_ensenando', 'ENSEÑANDO*']],
      [['colab_transporte', 'PROVEYENDO TRANSPORTE'], ['colab_mostrando_trabajo', 'MOSTRANDO MI TRABAJO']],
      [['colab_camion', 'TENGO UN CAMIÓN'], ['colab_alimentos_no_perecederos', 'PROVEYENDO ALIM. NO PERECEDEROS']],
      [['colab_camioneta', 'TENGO UNA CAMIONETA'], ['colab_tareas_especiales', 'AYUDAR EN TAREAS ESPECIALES']],
      [['colab_colectivo', 'TENGO UN COLECTIVO'], ['colab_otros', 'OTROS']],
    ];

    const tableW = width - 80;
    const colW = tableW / 2;

    colabOptions.forEach(([leftItem, rightItem]) => {
      const [lKey, lText] = leftItem;
      const [rKey, rText] = rightItem;

      const isLChecked = Boolean(data[lKey]);
      const isRChecked = Boolean(data[rKey]);

      page7.drawRectangle({ x: 40, y: curY - 13, width: colW, height: 13, borderColor: black, borderWidth: 0.5 });
      page7.drawRectangle({ x: 40 + colW, y: curY - 13, width: colW, height: 13, borderColor: black, borderWidth: 0.5 });

      page7.drawText(lText, { x: 44, y: curY - 10, size: 6.5, font: fontRegular, color: black });
      page7.drawText(isLChecked ? '[X]' : '[  ]', { x: 40 + colW - 20, y: curY - 10, size: 7, font: fontBold, color: isLChecked ? memberDataColor : rgb(0.65, 0.65, 0.65) });

      page7.drawText(rText, { x: 44 + colW, y: curY - 10, size: 6.5, font: fontRegular, color: black });
      page7.drawText(isRChecked ? '[X]' : '[  ]', { x: width - 60, y: curY - 10, size: 7, font: fontBold, color: isRChecked ? memberDataColor : rgb(0.65, 0.65, 0.65) });

      curY -= 13;
    });

    curY -= 5;
    page7.drawText('*(DEPORTES, PRIMEROS AUXILIOS, ARTES, PINTURAS, DANZAS MÚSICA, TEATRO, ETC.)', { x: 40, y: curY, size: 6.5, font: fontItalic, color: labelColor });
    curY -= 11;
    page7.drawText(`OTROS: `, { x: 40, y: curY, size: 7.5, font: fontRegular, color: labelColor });
    page7.drawText(String(data.colab_otros_detalle || ''), { x: 80, y: curY, size: 7.5, font: fontBold, color: memberDataColor });
    page7.drawLine({ start: { x: 78, y: curY - 2 }, end: { x: width - 40, y: curY - 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    curY -= 16;

    // Materials Table with PRESTAMO and DONACION checkable boxes
    page7.drawRectangle({ x: 40, y: curY - 14, width: tableW, height: 14, color: rgb(0.92, 0.92, 0.92), borderColor: black, borderWidth: 1 });
    page7.drawLine({ start: { x: 40 + colW, y: curY }, end: { x: 40 + colW, y: curY - 14 }, thickness: 1, color: black });
    page7.drawText('MATERIAL DE CONSTRUCCIÓN', { x: 40 + 20, y: curY - 10.5, size: 7.5, font: fontBold });
    page7.drawText('MATERIAL DE CAMPAMENTO', { x: 40 + colW + 20, y: curY - 10.5, size: 7.5, font: fontBold });
    curY -= 14;

    // Subheader row: Material | PRÉSTAMO | DONACIÓN
    const subL_Mat = 160;
    const subL_Pre = 50;

    page7.drawRectangle({ x: 40, y: curY - 12, width: tableW, height: 12, color: rgb(0.96, 0.96, 0.96), borderColor: black, borderWidth: 0.5 });
    page7.drawLine({ start: { x: 40 + colW, y: curY }, end: { x: 40 + colW, y: curY - 12 }, thickness: 1, color: black });

    // Left subcol headers
    page7.drawLine({ start: { x: 40 + subL_Mat, y: curY }, end: { x: 40 + subL_Mat, y: curY - 12 }, thickness: 0.5, color: black });
    page7.drawLine({ start: { x: 40 + subL_Mat + subL_Pre, y: curY }, end: { x: 40 + subL_Mat + subL_Pre, y: curY - 12 }, thickness: 0.5, color: black });
    page7.drawText('Material', { x: 44, y: curY - 9, size: 6, font: fontBold, color: labelColor });
    page7.drawText('PRÉSTAMO', { x: 40 + subL_Mat + 6, y: curY - 9, size: 5.5, font: fontBold, color: labelColor });
    page7.drawText('DONACIÓN', { x: 40 + subL_Mat + subL_Pre + 6, y: curY - 9, size: 5.5, font: fontBold, color: labelColor });

    // Right subcol headers
    page7.drawLine({ start: { x: 40 + colW + subL_Mat, y: curY }, end: { x: 40 + colW + subL_Mat, y: curY - 12 }, thickness: 0.5, color: black });
    page7.drawLine({ start: { x: 40 + colW + subL_Mat + subL_Pre, y: curY }, end: { x: 40 + colW + subL_Mat + subL_Pre, y: curY - 12 }, thickness: 0.5, color: black });
    page7.drawText('Material', { x: 44 + colW, y: curY - 9, size: 6, font: fontBold, color: labelColor });
    page7.drawText('PRÉSTAMO', { x: 40 + colW + subL_Mat + 6, y: curY - 9, size: 5.5, font: fontBold, color: labelColor });
    page7.drawText('DONACIÓN', { x: 40 + colW + subL_Mat + subL_Pre + 6, y: curY - 9, size: 5.5, font: fontBold, color: labelColor });
    curY -= 12;

    const matConstruccion = [
      { key: 'chapas', label: 'Chapas de Cinc / Zinc' },
      { key: 'puntales', label: 'Puntales de Madera' },
      { key: 'tablas', label: 'Tablas Grandes' },
      { key: 'paneles', label: 'Paneles terciados u otros' },
      { key: 'postes', label: 'Postes de Madera' },
      { key: 'clavos', label: 'Clavos y Tornillos' },
      { key: 'alambrado', label: 'Alambrado' },
      { key: 'alambre_fardo', label: 'Alambre de Fardo' },
      { key: 'ladrillos', label: 'Ladrillos' },
      { key: 'cemento', label: 'Cemento' },
      { key: 'pala', label: 'Pala de punta o ancha' },
      { key: 'serrucho', label: 'Serrucho o sierra' },
      { key: 'pinzas', label: 'Pinzas o tenazas' },
      { key: 'destornilladores', label: 'Destornilladores' },
    ];

    const matCampamento = [
      { key: 'carpas', label: 'Carpas' },
      { key: 'tablones', label: 'Tablones o mesas' },
      { key: 'lonas', label: 'Lonas' },
      { key: 'media_sombras', label: 'Media sombras' },
      { key: 'sogas', label: 'Sogas o Soguines' },
      { key: 'estacas', label: 'Estacas' },
      { key: 'cajones', label: 'Cajones para guardar' },
      { key: 'tachos', label: 'Tachos' },
      { key: 'bidones', label: 'Bidones para Agua' },
      { key: 'bancos', label: 'Bancos o sillas' },
      { key: 'quemadores', label: 'Quemadores p/ cocina' },
      { key: 'utensilios', label: 'Utensilios de cocina' },
      { key: 'otros_camp', label: 'Otros' },
      { key: 'vacio', label: '' },
    ];

    for (let i = 0; i < 14; i++) {
      const cItem = matConstruccion[i];
      const kItem = matCampamento[i];

      const cPre = Boolean(data[`mat_${cItem.key}_prestamo`] || data[`mat_construccion_prestamo_${cItem.key}`]);
      const cDon = Boolean(data[`mat_${cItem.key}_donacion`] || data[`mat_construccion_donacion_${cItem.key}`]);

      const kPre = Boolean(data[`mat_${kItem.key}_prestamo`] || data[`mat_campamento_prestamo_${kItem.key}`]);
      const kDon = Boolean(data[`mat_${kItem.key}_donacion`] || data[`mat_campamento_donacion_${kItem.key}`]);

      page7.drawRectangle({ x: 40, y: curY - 11, width: tableW, height: 11, borderColor: black, borderWidth: 0.3 });
      page7.drawLine({ start: { x: 40 + colW, y: curY }, end: { x: 40 + colW, y: curY - 11 }, thickness: 1, color: black });

      // Left dividers
      page7.drawLine({ start: { x: 40 + subL_Mat, y: curY }, end: { x: 40 + subL_Mat, y: curY - 11 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
      page7.drawLine({ start: { x: 40 + subL_Mat + subL_Pre, y: curY }, end: { x: 40 + subL_Mat + subL_Pre, y: curY - 11 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });

      page7.drawText(cItem.label, { x: 44, y: curY - 8.5, size: 6, font: fontRegular, color: black });
      page7.drawText(cPre ? '[X]' : '[  ]', { x: 40 + subL_Mat + 18, y: curY - 8.5, size: 6.5, font: fontBold, color: cPre ? memberDataColor : rgb(0.65, 0.65, 0.65) });
      page7.drawText(cDon ? '[X]' : '[  ]', { x: 40 + subL_Mat + subL_Pre + 18, y: curY - 8.5, size: 6.5, font: fontBold, color: cDon ? memberDataColor : rgb(0.65, 0.65, 0.65) });

      // Right dividers
      if (kItem.label) {
        page7.drawLine({ start: { x: 40 + colW + subL_Mat, y: curY }, end: { x: 40 + colW + subL_Mat, y: curY - 11 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
        page7.drawLine({ start: { x: 40 + colW + subL_Mat + subL_Pre, y: curY }, end: { x: 40 + colW + subL_Mat + subL_Pre, y: curY - 11 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });

        page7.drawText(kItem.label, { x: 44 + colW, y: curY - 8.5, size: 6, font: fontRegular, color: black });
        page7.drawText(kPre ? '[X]' : '[  ]', { x: 40 + colW + subL_Mat + 18, y: curY - 8.5, size: 6.5, font: fontBold, color: kPre ? memberDataColor : rgb(0.65, 0.65, 0.65) });
        page7.drawText(kDon ? '[X]' : '[  ]', { x: 40 + colW + subL_Mat + subL_Pre + 18, y: curY - 8.5, size: 6.5, font: fontBold, color: kDon ? memberDataColor : rgb(0.65, 0.65, 0.65) });
      }

      curY -= 11;
    }

    curY -= 9;
    page7.drawText(`OBSERVACIONES: `, { x: 40, y: curY, size: 7.5, font: fontRegular, color: labelColor });
    page7.drawText(String(data.adulto_observaciones || ''), { x: 125, y: curY, size: 7.5, font: fontBold, color: memberDataColor });
    page7.drawLine({ start: { x: 120, y: curY - 2 }, end: { x: width - 40, y: curY - 2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });

    page7.drawImage(qrImage, { x: width - 95, y: 25, width: 55, height: 55 });
  }

  // Security footer on every page
  const totalPaginas = pdfDoc.getPageCount();
  const shortHash = qrHash ? qrHash.substring(0, 16).toUpperCase() : 'BORRADOR';
  const dniProtagonista = String(data.protagonista_dni || (options.usuario?.dni) || '');

  for (let i = 0; i < totalPaginas; i++) {
    const page = pdfDoc.getPage(i);
    const { width } = page.getSize();
    const textoSeguridad = `Grupo Scout Juan XXIII • Ciclo 2026 • DNI ${dniProtagonista} • Código: ${shortHash} • Hoja ${i + 1} de ${totalPaginas}`;

    const textWidth = fontRegular.widthOfTextAtSize(textoSeguridad, 7);
    const xCentrado = Math.max(20, (width - textWidth) / 2);

    page.drawText(textoSeguridad, {
      x: xCentrado,
      y: 12,
      size: 7,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.45),
    });
  }

  return await pdfDoc.save();
}

/**
 * Genera el PDF base oficial en blanco de 7 páginas para firma física manual.
 */
export async function generarMoldeEnBlancoPdf(): Promise<Uint8Array> {
  return await buildOfficialPdf({}, { blank: true, hashVerificacion: 'MOLDE-OFICIAL-BLANCO-2026' });
}
