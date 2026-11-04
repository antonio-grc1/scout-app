import QRCode from 'qrcode';
import type { TicketData } from '../components/ModalTicketQR';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = 2,
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      if (linesDrawn + 1 === maxLines && n < words.length - 1) {
        ctx.fillText(line.trim() + '...', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
      linesDrawn++;
      if (linesDrawn >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (linesDrawn < maxLines && line.trim().length > 0) {
    ctx.fillText(line.trim(), x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function formatearFecha(f?: string): string {
  if (!f) return '';
  try {
    const d = new Date(f);
    if (isNaN(d.getTime())) return f;
    return d.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return f;
  }
}

/**
 * Genera una tarjeta digital completa (vale con QR y detalles de compra)
 * lista para ver en pantalla, descargar o copiar como imagen PNG.
 */
export async function generarTarjetaValeQR(ticket: TicketData): Promise<string> {
  // 1. Generar imagen base del QR
  const qrDataUrl = await QRCode.toDataURL(ticket.tokenQr, {
    width: 320,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = (e) => reject(e);
    qrImg.src = qrDataUrl;
  });

  // 2. Crear Canvas de alta resolución
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 820;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrDataUrl;

  // Fondo blanco con bordes redondeados
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 3. Encabezado Verde Scout
  const headerGrad = ctx.createLinearGradient(0, 0, canvas.width, 130);
  headerGrad.addColorStop(0, '#065f46'); // emerald-800
  headerGrad.addColorStop(1, '#047857'); // emerald-700
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, canvas.width, 125);

  // Subtítulo Grupo Scout
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#a7f3d0'; // emerald-200
  ctx.fillText('GRUPO SCOUT JUAN XXIII  •  VALE DIGITAL', 28, 38);

  // Título del Evento
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#ffffff';
  wrapText(ctx, ticket.pedido.evento.titulo, 28, 70, 544, 28, 2);

  // 4. Bloque de Datos de la Compra / Titular
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 24, 140, 552, 130, 16);
  ctx.fill();
  ctx.stroke();

  // Producto y Cantidad (Grande y destacado)
  ctx.font = '900 23px sans-serif';
  ctx.fillStyle = '#0f172a';
  wrapText(ctx, `${ticket.cantidad}x ${ticket.item.nombre}`, 44, 175, 512, 26, 1);

  // Titular / Comprador
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Titular:', 44, 212);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(ticket.pedido.compradorNombre, 102, 212);

  // Vendedor Scout y Pedido
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#64748b';
  const vendedorTxt = ticket.pedido.vendedorUsuario
    ? `Vendido por: ${ticket.pedido.vendedorUsuario.nombre} ${ticket.pedido.vendedorUsuario.apellido}`
    : 'Venta General del Grupo';
  ctx.fillText(vendedorTxt, 44, 242);

  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#059669';
  ctx.textAlign = 'right';
  ctx.fillText(`Pedido #${ticket.pedido.id} • Vale #${ticket.id}`, 556, 242);
  ctx.textAlign = 'left';

  // 5. Marco del Código QR
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 160, 285, 280, 280, 20);
  ctx.fill();
  ctx.stroke();

  // Dibujar QR centrado
  ctx.drawImage(qrImg, 172, 297, 256, 256);

  // Código alfanumérico debajo del QR
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText(`CÓDIGO: ${ticket.tokenQr.slice(0, 8)}...`, 300, 590);
  ctx.textAlign = 'left';

  // 6. Bloque de Retiro / Fecha / Instrucciones
  ctx.fillStyle = '#f1f5f9';
  ctx.strokeStyle = '#e2e8f0';
  roundRect(ctx, 24, 615, 552, 110, 16);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#0f172a';
  const lugar = ticket.pedido.evento.lugarEntrega || 'Sede del Grupo Scout';
  ctx.fillText(`📍 Retiro: ${lugar}`, 44, 648);

  const fechaStr = formatearFecha(ticket.pedido.evento.fechaEvento);
  if (fechaStr) {
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText(`📅 Fecha: ${fechaStr}`, 44, 674);
  }

  ctx.font = 'italic 12px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Presentá este vale digital con su QR al momento del retiro para canjear tu pedido.', 44, 704);

  // Pie de página
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText('Grupo Scout Juan XXIII • Sistema de Gestión de Cobranzas y Eventos', 300, 770);
  ctx.textAlign = 'left';

  // 7. Si el vale ya fue utilizado, estampar franja roja de canjeado
  if (ticket.estado === 'UTILIZADO') {
    ctx.save();
    ctx.translate(300, 425);
    ctx.rotate(-0.35);

    ctx.fillStyle = 'rgba(220, 38, 38, 0.9)'; // rose-600
    roundRect(ctx, -190, -32, 380, 64, 12);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    roundRect(ctx, -185, -27, 370, 54, 8);
    ctx.stroke();

    ctx.font = '900 24px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('CANJEADO / YA RETIRADO', 0, 8);
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}
