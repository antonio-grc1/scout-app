import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Drawer } from './Drawer';
import { Button } from './Button';

export interface ConfirmImpactDialogProps {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: () => void | Promise<void>;
  titulo: string;
  mensaje: React.ReactNode;
  impacto?: React.ReactNode;
  tipoImpacto?: 'warn' | 'info' | 'danger';
  textoConfirmar?: string;
  textoCancelar?: string;
  peligroso?: boolean;
  cargando?: boolean;
}

export const ConfirmImpactDialog: React.FC<ConfirmImpactDialogProps> = ({
  abierto,
  onCerrar,
  onConfirmar,
  titulo,
  mensaje,
  impacto,
  tipoImpacto,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligroso = true,
  cargando = false,
}) => {
  const tone = tipoImpacto ?? (peligroso ? 'warn' : 'info');
  const badgeClass =
    tone === 'danger'
      ? 's-badge-err'
      : tone === 'warn'
        ? 's-badge-warn'
        : 's-badge-info';

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      mode="sheet"
      maxWidthClass="sm:max-w-md"
      bloqueado={cargando}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={cargando}
            onClick={onCerrar}
          >
            {textoCancelar}
          </Button>
          <Button
            type="button"
            variant={peligroso ? 'danger' : 'primary'}
            size="md"
            loading={cargando}
            disabled={cargando}
            onClick={() => void onConfirmar()}
          >
            {textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5 text-[15px] text-ink-2 leading-relaxed">
        <div>{mensaje}</div>
        {impacto && (
          <div className={`${badgeClass} rounded-xl p-3.5 text-sm font-medium flex items-start gap-2.5`}>
            {tone === 'info' ? (
              <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">{impacto}</div>
          </div>
        )}
      </div>
    </Drawer>
  );
};
