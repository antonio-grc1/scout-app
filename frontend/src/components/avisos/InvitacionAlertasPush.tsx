import React, { useEffect, useState } from 'react';
import { BellRing, CalendarClock, Smartphone, Tent, TriangleAlert } from 'lucide-react';
import { useAlertasPush } from '../../hooks/useAlertasPush';
import { Button, Drawer } from '../ui';

const CLAVE_POSPUESTA = 'alertas-push-invitacion-pospuesta';
const DIAS_POSPUESTA = 3;
const DEMORA_MS = 1500;

// Evita volver a mostrarla en esta pestaña si el navegador no deja guardar en localStorage.
let yaMostradaEnEstaSesion = false;

function estaPospuesta(): boolean {
  try {
    const valor = Number(localStorage.getItem(CLAVE_POSPUESTA));
    return Number.isFinite(valor) && valor > Date.now();
  } catch {
    return false;
  }
}

function posponer() {
  yaMostradaEnEstaSesion = true;
  try {
    localStorage.setItem(
      CLAVE_POSPUESTA,
      String(Date.now() + DIAS_POSPUESTA * 24 * 60 * 60 * 1000),
    );
  } catch {
    // Sin almacenamiento: queda el flag de la sesión.
  }
}

const BENEFICIOS = [
  { icono: CalendarClock, texto: 'Cambios de horario y suspensiones de actividades' },
  { icono: Tent, texto: 'Salidas, campamentos y lo que hay que llevar' },
  { icono: TriangleAlert, texto: 'Avisos urgentes del grupo, al instante' },
];

/**
 * Invitación que aparece al entrar a la app cuando este dispositivo todavía no tiene las
 * alertas activas. "Ahora no" la pospone unos días; nunca se muestra si la persona ya
 * bloqueó las notificaciones o si el servidor no tiene push configurado.
 */
export const InvitacionAlertasPush: React.FC = () => {
  const push = useAlertasPush();
  const [abierta, setAbierta] = useState(false);

  const corresponde =
    !push.cargando &&
    push.pushHabilitado &&
    !push.suscripto &&
    (push.iosSinInstalar || (push.soportado && push.permiso === 'default'));

  useEffect(() => {
    if (!corresponde || yaMostradaEnEstaSesion || estaPospuesta()) return;
    const timer = window.setTimeout(() => {
      yaMostradaEnEstaSesion = true;
      setAbierta(true);
    }, DEMORA_MS);
    return () => window.clearTimeout(timer);
  }, [corresponde]);

  const cerrar = () => {
    posponer();
    setAbierta(false);
  };

  const handleActivar = async () => {
    await push.activar();
    setAbierta(false);
  };

  if (!abierta) return null;

  return (
    <Drawer
      abierto={abierta}
      onCerrar={cerrar}
      titulo="Enterate de todo al instante"
      mode="sheet"
      maxWidthClass="sm:max-w-md"
      bloqueado={push.procesando}
      manejarHistorial={false}
      footer={
        push.iosSinInstalar ? (
          <Button type="button" variant="primary" size="md" onClick={cerrar}>
            Entendido
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={push.procesando}
              onClick={cerrar}
            >
              Ahora no
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={push.procesando}
              disabled={push.procesando}
              onClick={() => void handleActivar()}
            >
              <BellRing className="w-4 h-4" aria-hidden="true" />
              Activar alertas
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-[15px] text-ink-2 leading-relaxed">
        <p>
          Activá las alertas y te avisamos en el celular, aunque no tengas la app abierta.
        </p>
        <ul className="space-y-2.5">
          {BENEFICIOS.map(({ icono: Icono, texto }) => (
            <li key={texto} className="flex items-start gap-2.5">
              <Icono className="w-5 h-5 text-brand shrink-0 mt-0.5" aria-hidden="true" />
              <span>{texto}</span>
            </li>
          ))}
        </ul>
        {push.iosSinInstalar && (
          <div className="s-badge-info rounded-xl p-3.5 text-sm font-medium flex items-start gap-2.5">
            <Smartphone className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              En iPhone/iPad, primero tocá <strong>Compartir → Agregar a inicio</strong> y abrí la
              app desde tu pantalla. Ahí vas a poder activarlas.
            </span>
          </div>
        )}
      </div>
    </Drawer>
  );
};
