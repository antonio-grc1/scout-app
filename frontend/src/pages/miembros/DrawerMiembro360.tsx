import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Drawer } from '../../components/ui';
import { ExpedienteMiembro360, type TabExpediente360 } from './ExpedienteMiembro360';

export interface DrawerMiembro360Props {
  usuarioId: number | null;
  tabInicial?: TabExpediente360;
  onCerrar: () => void;
  onActualizado?: () => void;
  onEliminado?: (mensaje: string) => void;
  onClaveReseteada?: (mensaje: string) => void;
}

export const DrawerMiembro360: React.FC<DrawerMiembro360Props> = ({
  usuarioId,
  tabInicial = 'datos',
  onCerrar,
  onActualizado,
  onEliminado,
  onClaveReseteada,
}) => {
  const [tabActual, setTabActual] = useState<TabExpediente360>(tabInicial);

  useEffect(() => {
    setTabActual(tabInicial);
  }, [tabInicial, usuarioId]);

  if (usuarioId === null) return null;

  return (
    <Drawer
      abierto={true}
      onCerrar={onCerrar}
      titulo="Expediente"
      mode="drawer"
      allowFullscreen={true}
      maxWidthClass="sm:max-w-2xl"
      headerExtra={
        <Link
          to={`/miembros/${usuarioId}?tab=${tabActual}`}
          onClick={onCerrar}
          title="Abrir ficha completa en página dedicada"
          className="s-btn-sec min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <ExternalLink className="w-4 h-4 text-brand" />
          <span className="hidden sm:inline">Abrir completo</span>
        </Link>
      }
    >
      <ExpedienteMiembro360
        usuarioId={usuarioId}
        tabInicial={tabInicial}
        enDrawer={true}
        onTabChange={setTabActual}
        onCerrar={onCerrar}
        onActualizado={onActualizado}
        onEliminado={onEliminado}
        onClaveReseteada={onClaveReseteada}
      />
    </Drawer>
  );
};
