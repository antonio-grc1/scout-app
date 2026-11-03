import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  QrCode,
  Share2,
  Download,
  Copy,
  Check,
  ImageIcon,
  Maximize2,
  Minimize2,
  Sun,
} from 'lucide-react';
import { Button } from './ui/Button';
import { generarTarjetaValeQR } from '../lib/generadorValeQR';

export interface TicketData {
  id: number;
  tokenQr: string;
  cantidad: number;
  estado: 'ACTIVO' | 'UTILIZADO' | 'CANCELADO';
  fechaUso?: string | null;
  item: {
    nombre: string;
    precioVenta: string | number;
  };
  pedido: {
    id: number;
    compradorNombre: string;
    compradorContacto?: string | null;
    evento: {
      id: number;
      titulo: string;
      fechaEvento: string;
      lugarEntrega?: string | null;
    };
    vendedorUsuario?: {
      nombre: string;
      apellido: string;
    } | null;
  };
}

export interface ModalTicketQRProps {
  abierto: boolean;
  onCerrar: () => void;
  ticket: TicketData | null;
}

export const ModalTicketQR: React.FC<ModalTicketQRProps> = ({ abierto, onCerrar, ticket }) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copiadoToken, setCopiadoToken] = useState<boolean>(false);
  const [copiadaImagen, setCopiadaImagen] = useState<boolean>(false);
  const [mensajeAyuda, setMensajeAyuda] = useState<string | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState<boolean>(false);

  const entrarPantallaCompleta = async () => {
    setPantallaCompleta(true);
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignorar si el navegador bloquea fullscreen nativo (el visor CSS ya cubre la pantalla)
    }
  };

  const salirPantallaCompleta = async () => {
    setPantallaCompleta(false);
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignorar
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pantallaCompleta) {
        salirPantallaCompleta();
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && pantallaCompleta) {
        setPantallaCompleta(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [pantallaCompleta]);

  useEffect(() => {
    if (!abierto) {
      setPantallaCompleta(false);
    }
  }, [abierto]);

  const handleCerrar = () => {
    if (pantallaCompleta) {
      salirPantallaCompleta();
    }
    onCerrar();
  };

  useEffect(() => {
    if (abierto && ticket?.tokenQr) {
      generarTarjetaValeQR(ticket)
        .then((url) => setQrUrl(url))
        .catch((err) => {
          console.error('Error generando tarjeta QR:', err);
          QRCode.toDataURL(ticket.tokenQr, { width: 320, margin: 2 })
            .then(setQrUrl)
            .catch(() => {});
        });
    } else {
      setQrUrl('');
      setMensajeAyuda(null);
    }
  }, [abierto, ticket]);

  if (!abierto || !ticket) return null;

  const handleCopiarToken = () => {
    navigator.clipboard.writeText(ticket.tokenQr);
    setCopiadoToken(true);
    setTimeout(() => setCopiadoToken(false), 2000);
  };

  const handleDescargarQR = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `Vale-QR-${ticket.pedido.evento.titulo}-${ticket.id}.png`;
    a.click();
  };

  const handleCopiarImagen = async () => {
    if (!qrUrl) return;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopiadaImagen(true);
      setMensajeAyuda('¡Imagen del vale copiada al portapapeles! Pegala en el chat con Ctrl + V.');
      setTimeout(() => setCopiadaImagen(false), 3000);
    } catch (err) {
      console.warn('No se pudo copiar la imagen al portapapeles:', err);
      handleDescargarQR();
    }
  };

  const handleCompartirWhatsApp = async () => {
    const texto = `Hola ${ticket.pedido.compradorNombre}! Acá tenés tu vale digital con los detalles de compra para "${ticket.pedido.evento.titulo}":
Producto: ${ticket.cantidad}x ${ticket.item.nombre}
Lugar de retiro: ${ticket.pedido.evento.lugarEntrega || 'Sede del Grupo'}
Presentá este código o mostrá la tarjeta con QR al retirar: ${ticket.tokenQr.slice(0, 8)}...`;

    // 1. Intentar Web Share API con archivo adjunto (en móviles adjunta directamente la foto en WhatsApp)
    if (qrUrl && typeof navigator !== 'undefined' && navigator.canShare) {
      try {
        const res = await fetch(qrUrl);
        const blob = await res.blob();
        const file = new File([blob], `vale-${ticket.pedido.evento.titulo}-${ticket.id}.png`, {
          type: 'image/png',
        });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Vale Digital - ${ticket.pedido.evento.titulo}`,
            text: texto,
            files: [file],
          });
          return;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // 2. Si no soporta compartir archivo directamente (ej: Desktop Chrome):
    // Copiamos la imagen al portapapeles y abrimos WhatsApp con el texto
    try {
      if (qrUrl && navigator.clipboard && window.ClipboardItem) {
        const res = await fetch(qrUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setMensajeAyuda('¡Imagen copiada al portapapeles! En WhatsApp pegala con Ctrl + V.');
      }
    } catch {
      // Ignorar
    }

    const cleanPhone = (ticket.pedido.compradorContacto || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-3xl bg-surface border border-rule shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="p-4 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-brand" />
            <div>
              <h3 className="text-sm font-black text-ink">Vale Digital / Entrada</h3>
              <span className="text-[11px] text-ink-muted">
                Pedido #{ticket.pedido.id} • Vale #{ticket.id}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={entrarPantallaCompleta}
              className="p-1.5 rounded-xl text-ink-muted hover:text-brand hover:bg-paper-3 transition cursor-pointer"
              title="Ver entrada en pantalla completa"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCerrar}
              className="p-1 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenido / Tarjeta del Ticket */}
        <div className="p-5 flex flex-col items-center text-center space-y-3.5 overflow-y-auto">
          {/* Previsualización de la Tarjeta del Vale con los detalles de compra */}
          <div className="w-full flex justify-center">
            {qrUrl ? (
              <div
                className="relative group cursor-pointer"
                onClick={entrarPantallaCompleta}
                title="Hacé clic para ver la entrada en pantalla completa"
              >
                <img
                  src={qrUrl}
                  alt={`Vale Digital - ${ticket.pedido.evento.titulo}`}
                  className="max-h-[350px] w-auto object-contain rounded-2xl shadow-md border border-rule group-hover:brightness-95 transition"
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition rounded-2xl flex items-center justify-center pointer-events-none">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 text-white text-xs font-bold backdrop-blur-xs shadow-md">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Pantalla Completa</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-64 h-80 flex items-center justify-center text-ink-muted text-xs bg-paper-2 rounded-2xl border border-rule">
                Generando tarjeta de vale...
              </div>
            )}
          </div>

          <p className="text-[11px] text-ink-muted">
            La imagen incluye el título del evento, los productos pedidos, nombre del titular y datos de retiro.
          </p>

          {mensajeAyuda && (
            <div className="w-full p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs text-left animate-in fade-in duration-200">
              {mensajeAyuda}
            </div>
          )}

          {/* Botones de acción */}
          <div className="w-full pt-2 border-t border-rule flex flex-col gap-2">
            {/* Botón ver en Pantalla Completa */}
            <Button
              variant="secondary"
              size="sm"
              onClick={entrarPantallaCompleta}
              className="gap-2 text-xs w-full py-2 font-bold cursor-pointer border-brand/40 text-brand hover:bg-brand/10"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Ver Entrada en Pantalla Completa</span>
            </Button>

            {/* Botón principal de WhatsApp */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleCompartirWhatsApp}
              className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white w-full py-2.5 font-black shadow-xs cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar Vale por WhatsApp</span>
            </Button>

            {/* Acciones secundarias */}
            <div className="grid grid-cols-3 gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopiarImagen}
                className="gap-1 text-[11px] px-1.5 py-1.5"
                title="Copiar imagen al portapapeles para pegar en WhatsApp Web con Ctrl+V"
              >
                {copiadaImagen ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ImageIcon className="w-3.5 h-3.5" />}
                <span>{copiadaImagen ? 'Copiada!' : 'Copiar Foto'}</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleDescargarQR}
                className="gap-1 text-[11px] px-1.5 py-1.5"
                title="Descargar imagen PNG completa del vale"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopiarToken}
                className="gap-1 text-[11px] px-1.5 py-1.5"
                title="Copiar código alfanumérico"
              >
                {copiadoToken ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiadoToken ? 'Listo!' : 'Código'}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* VISTA EN PANTALLA COMPLETA */}
      {pantallaCompleta && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between items-center p-3 sm:p-5 select-none animate-in fade-in duration-150"
        >
          {/* Barra superior */}
          <div className="w-full max-w-3xl flex items-center justify-between text-white py-1">
            <div className="flex items-center gap-2 truncate pr-2">
              <QrCode className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="truncate">
                <h4 className="text-xs sm:text-sm font-black truncate text-white">
                  {ticket.pedido.evento.titulo}
                </h4>
                <span className="text-[10px] sm:text-xs text-white/70 block truncate">
                  Pedido #{ticket.pedido.id} • Vale #{ticket.id} • {ticket.pedido.compradorNombre}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={salirPantallaCompleta}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs font-bold transition cursor-pointer backdrop-blur-md border border-white/20 shrink-0"
              title="Salir de pantalla completa (Esc)"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Salir</span>
            </button>
          </div>

          {/* Tarjeta del Vale centrada y maximizada */}
          <div className="flex-1 flex flex-col items-center justify-center p-2 max-h-[78vh] w-full">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt={`Entrada en pantalla completa - ${ticket.pedido.evento.titulo}`}
                className="max-h-[72vh] sm:max-h-[76vh] w-auto max-w-[95vw] object-contain rounded-2xl shadow-2xl ring-1 ring-white/15"
              />
            ) : (
              <div className="text-white text-xs">Cargando entrada...</div>
            )}
          </div>

          {/* Barra inferior */}
          <div className="w-full max-w-md flex flex-col items-center gap-2 pb-1">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-amber-300 bg-amber-950/70 border border-amber-600/50 px-3.5 py-1 rounded-full shadow-sm text-center">
              <Sun className="w-3.5 h-3.5 shrink-0" />
              <span>Subí el brillo de tu pantalla para facilitar el escaneo</span>
            </div>

            <div className="flex items-center gap-2 w-full justify-center">
              <Button
                variant="primary"
                size="sm"
                onClick={handleCompartirWhatsApp}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-transparent flex-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleDescargarQR}
                className="gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 flex-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={salirPantallaCompleta}
                className="gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 flex-1"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Cerrar</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
