import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mail, MessageCircle } from 'lucide-react';
import { useMenuKeyboard } from '../hooks/useMenuKeyboard';
import { useToastStore } from '../store/toastStore';
import { traducirErrorAmigable } from '../lib/formatters';
import {
  abrirWhatsAppRecibo,
  enviarReciboPorMail,
  obtenerDatosRecibo,
  type TelefonoContacto,
} from '../lib/reciboPago';

const CLASE_BOTON =
  'min-h-[34px] px-2.5 py-1 rounded-lg text-ink-2 hover:bg-paper-3 font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-wait';

/** Envía el recibo de un pago por WhatsApp (mensaje con link) o por mail (PDF adjunto) al titular. */
export const BotonesEnvioRecibo: React.FC<{ pagoId: number }> = ({ pagoId }) => {
  const [ocupado, setOcupado] = useState<'wpp' | 'mail' | null>(null);
  const [opciones, setOpciones] = useState<{
    datos: Awaited<ReturnType<typeof obtenerDatosRecibo>>;
    telefonos: TelefonoContacto[];
  } | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const cerrarMenu = () => setOpciones(null);
  const { menuRef, onKeyDown } = useMenuKeyboard(opciones !== null, cerrarMenu);

  useEffect(() => {
    if (!opciones) return;
    const clicFuera = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) cerrarMenu();
    };
    document.addEventListener('mousedown', clicFuera);
    return () => document.removeEventListener('mousedown', clicFuera);
  }, [opciones]);

  const handleWhatsApp = async () => {
    setOcupado('wpp');
    try {
      const datos = await obtenerDatosRecibo(pagoId);
      const telefonos = datos.contactos?.telefonos ?? [];
      if (telefonos.length === 0) {
        useToastStore
          .getState()
          .mostrarToast('El miembro no tiene ningún teléfono cargado en su ficha.', 'advertencia');
      } else if (telefonos.length === 1) {
        abrirWhatsAppRecibo(datos, telefonos[0]);
      } else {
        setOpciones({ datos, telefonos });
      }
    } catch (err) {
      useToastStore
        .getState()
        .mostrarToast(traducirErrorAmigable(err, 'No se pudo preparar el mensaje.'), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const handleMail = async () => {
    setOcupado('mail');
    await enviarReciboPorMail(pagoId);
    setOcupado(null);
  };

  return (
    <div ref={contenedorRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void handleWhatsApp()}
        disabled={ocupado !== null}
        aria-haspopup="menu"
        aria-expanded={opciones !== null}
        title="Enviar el recibo por WhatsApp"
        className={CLASE_BOTON}
      >
        {ocupado === 'wpp' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <MessageCircle className="w-3.5 h-3.5" />
        )}
        <span>WhatsApp</span>
      </button>
      <button
        type="button"
        onClick={() => void handleMail()}
        disabled={ocupado !== null}
        title="Enviar el recibo en PDF al email del miembro"
        className={CLASE_BOTON}
      >
        {ocupado === 'mail' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Mail className="w-3.5 h-3.5" />
        )}
        <span>Mail</span>
      </button>

      {opciones && (
        <div
          role="menu"
          ref={menuRef}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full mt-1.5 z-40 w-64 bg-surface border border-rule rounded-2xl shadow-lg p-1.5"
        >
          <span className="px-3 py-2 text-xs font-bold text-ink-muted uppercase tracking-wider block">
            Enviar a
          </span>
          {opciones.telefonos.map((t) => (
            <button
              key={t.numero}
              type="button"
              role="menuitem"
              onClick={() => {
                abrirWhatsAppRecibo(opciones.datos, t);
                cerrarMenu();
              }}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left text-sm hover:bg-paper-2 cursor-pointer"
            >
              <span className="font-bold text-ink block">{t.etiqueta}</span>
              <span className="text-xs text-ink-muted">{t.numero}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
