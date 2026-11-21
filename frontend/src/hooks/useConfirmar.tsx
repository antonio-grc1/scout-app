import React, { useCallback, useRef, useState } from 'react';
import { ConfirmImpactDialog } from '../components/ui/ConfirmImpactDialog';

export interface OpcionesConfirmar {
  titulo: string;
  mensaje: React.ReactNode;
  impacto?: React.ReactNode;
  textoConfirmar?: string;
  peligroso?: boolean;
  tipoImpacto?: 'warn' | 'info' | 'danger';
}

/**
 * Confirmación estándar para acciones destructivas o masivas (B6).
 * `pedir(opciones, accion)` abre el diálogo y ejecuta `accion` solo si la persona confirma.
 * Renderizar `dialogo` una vez en el componente.
 */
export function useConfirmar() {
  const [opciones, setOpciones] = useState<OpcionesConfirmar | null>(null);
  const [cargando, setCargando] = useState(false);
  const accionRef = useRef<(() => void | Promise<void>) | null>(null);

  const pedir = useCallback((op: OpcionesConfirmar, accion: () => void | Promise<void>) => {
    accionRef.current = accion;
    setOpciones(op);
  }, []);

  const cerrar = useCallback(() => {
    setOpciones(null);
    accionRef.current = null;
  }, []);

  const confirmar = useCallback(async () => {
    const accion = accionRef.current;
    if (!accion) return;
    setCargando(true);
    try {
      await accion();
    } finally {
      setCargando(false);
      cerrar();
    }
  }, [cerrar]);

  const dialogo = (
    <ConfirmImpactDialog
      abierto={opciones !== null}
      onCerrar={cerrar}
      onConfirmar={confirmar}
      titulo={opciones?.titulo ?? ''}
      mensaje={opciones?.mensaje ?? ''}
      impacto={opciones?.impacto}
      tipoImpacto={opciones?.tipoImpacto}
      textoConfirmar={opciones?.textoConfirmar}
      peligroso={opciones?.peligroso ?? true}
      cargando={cargando}
    />
  );

  return { pedir, dialogo };
}
