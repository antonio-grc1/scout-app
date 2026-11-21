import React from 'react';
import { ConfirmImpactDialog } from './ui/ConfirmImpactDialog';
import { useCambiosSinGuardarStore } from '../store/cambiosSinGuardarStore';

/** Host único del diálogo "cambios sin guardar" (ver `pedirConfirmacionDescarte`). */
export const DialogoDescartarCambios: React.FC = () => {
  const mensaje = useCambiosSinGuardarStore((s) => s.mensajeDialogo);
  const responder = useCambiosSinGuardarStore((s) => s.responderDialogo);
  return (
    <ConfirmImpactDialog
      abierto={mensaje !== null}
      onCerrar={() => responder(false)}
      onConfirmar={() => responder(true)}
      titulo="Cambios sin guardar"
      mensaje={mensaje ?? ''}
      textoConfirmar="Descartar cambios"
      textoCancelar="Seguir editando"
      tipoImpacto="warn"
    />
  );
};
