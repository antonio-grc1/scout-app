import React, { useState, useEffect } from 'react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { api } from '../api/client';
import { traducirErrorAmigable, formatearMoneda } from '../lib/formatters';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { ModalConfirmacion } from './ModalConfirmacion';
import { Landmark, Wallet, X, PlusCircle, Pencil, Trash2 } from 'lucide-react';

export interface CuentaFinancieraItem {
  id: number;
  nombre: string;
  tipo: 'CAJA_EFECTIVO' | 'BANCO';
  activa: boolean;
  saldoActual: number;
}

export interface ModalCrearCuentaFinancieraProps {
  abierto: boolean;
  onCerrar: () => void;
  onCuentaCreada: (nuevaCuenta?: any) => void;
  cuentaAEditar?: CuentaFinancieraItem | null;
  onCuentaEliminada?: (cuenta: CuentaFinancieraItem, eliminadoPermanente: boolean) => void;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const ModalCrearCuentaFinanciera: React.FC<ModalCrearCuentaFinancieraProps> = ({
  abierto,
  onCerrar,
  onCuentaCreada,
  cuentaAEditar,
  onCuentaEliminada,
  onToast,
}) => {
  const esModoEdicion = Boolean(cuentaAEditar);

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'CAJA_EFECTIVO' | 'BANCO'>('BANCO');
  const [activa, setActiva] = useState<boolean>(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      if (cuentaAEditar) {
        setNombre(cuentaAEditar.nombre);
        setTipo(cuentaAEditar.tipo);
        setActiva(cuentaAEditar.activa);
      } else {
        setNombre('');
        setTipo('BANCO');
        setActiva(true);
      }
      setError(null);
    }
  }, [abierto, cuentaAEditar]);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando || eliminando,
  });

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
      setError('Ingresá un nombre identificatorio para la cuenta (mínimo 2 caracteres).');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      if (esModoEdicion && cuentaAEditar) {
        const res = await api.patch(`/tesoreria/cuentas/${cuentaAEditar.id}`, {
          nombre: nombreLimpio,
          tipo,
          activa,
        });

        if (onToast) {
          onToast(`Cuenta "${nombreLimpio}" actualizada con éxito.`);
        }
        onCuentaCreada(res.data);
      } else {
        const res = await api.post('/tesoreria/cuentas', {
          nombre: nombreLimpio,
          tipo,
        });

        if (onToast) {
          onToast(`Cuenta "${nombreLimpio}" creada con éxito.`);
        }
        onCuentaCreada(res.data);
      }
      onCerrar();
    } catch (err: any) {
      const accion = esModoEdicion ? 'modificar' : 'crear';
      const msg = traducirErrorAmigable(err, `No se pudo ${accion} la cuenta financiera.`);
      setError(msg);
      if (onToast) {
        onToast(msg, 'error');
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarCuenta = async () => {
    if (!cuentaAEditar) return;
    setEliminando(true);
    setError(null);

    try {
      const res = await api.delete(`/tesoreria/cuentas/${cuentaAEditar.id}`);
      const eliminadoPermanente = Boolean(res.data?.eliminadoPermanente);

      setModalConfirmarEliminar(false);
      onCerrar();
      if (onCuentaEliminada) {
        onCuentaEliminada(cuentaAEditar, eliminadoPermanente);
      } else if (onToast) {
        onToast(
          eliminadoPermanente
            ? `Cuenta "${cuentaAEditar.nombre}" eliminada exitosamente.`
            : `Cuenta "${cuentaAEditar.nombre}" desactivada exitosamente (conserva historial de movimientos).`,
        );
      }
    } catch (err: any) {
      const msg = traducirErrorAmigable(err, 'No se pudo eliminar la cuenta financiera.');
      setError(msg);
      if (onToast) {
        onToast(msg, 'error');
      }
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
        {...backdropProps}
      >
        <div
          className="bg-surface border border-rule rounded-2xl w-full max-w-md shadow-md overflow-hidden transition-colors"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-cuenta-title"
          {...contentProps}
        >
          <div className="p-5 sm:p-6">
            {/* Cabecera */}
            <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
                  {esModoEdicion ? <Pencil className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h3 id="modal-cuenta-title" className="text-base sm:text-lg font-bold text-ink leading-snug">
                    {esModoEdicion ? 'Editar Cuenta Financiera' : 'Nueva Cuenta Financiera'}
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {esModoEdicion
                      ? 'Modifica los datos de la cuenta o gestiona su estado.'
                      : 'Crea una cuenta para registrar movimientos de caja o banco.'}
                  </p>
                </div>
              </div>
              {!guardando && !eliminando && (
                <button
                  type="button"
                  onClick={onCerrar}
                  className="text-ink-muted hover:text-ink transition-colors p-1.5 rounded-lg cursor-pointer hover:bg-paper-2"
                  aria-label="Cerrar ventana"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <Input
                label="Nombre de la Cuenta"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. MercadoPago Grupo, Banco Galicia..."
                disabled={guardando || eliminando}
                autoFocus
                helperText="Nombre visible para identificar la cuenta en arqueos y cobros."
              />

              <Select
                label="Tipo de Cuenta"
                required
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'CAJA_EFECTIVO' | 'BANCO')}
                disabled={guardando || eliminando}
                leftIcon={tipo === 'BANCO' ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                helperText={
                  tipo === 'BANCO'
                    ? 'Cuenta bancaria o billetera virtual (transferencias, depósitos).'
                    : 'Caja chica física o efectivo en mano para gastos diarios.'
                }
              >
                <option value="BANCO">Cuenta Bancaria / Billetera Virtual</option>
                <option value="CAJA_EFECTIVO">Caja Chica / Efectivo Físico</option>
              </Select>

              {esModoEdicion && (
                <Select
                  label="Estado de la Cuenta"
                  required
                  value={activa ? 'ACTIVA' : 'INACTIVA'}
                  onChange={(e) => setActiva(e.target.value === 'ACTIVA')}
                  disabled={guardando || eliminando}
                  helperText={
                    activa
                      ? 'La cuenta está habilitada para cobros, egresos y transferencias.'
                      : 'La cuenta no recibirá nuevos movimientos pero conservará su historial contable.'
                  }
                >
                  <option value="ACTIVA">Activa</option>
                  <option value="INACTIVA">Inactiva (Deshabilitada)</option>
                </Select>
              )}

              {esModoEdicion && cuentaAEditar && (
                <div className="p-3 rounded-xl bg-paper-2 border border-rule text-xs flex justify-between items-center text-ink-2">
                  <span>Saldo Actual:</span>
                  <span className="font-bold text-ink">{formatearMoneda(cuentaAEditar.saldoActual)}</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium"
                >
                  {error}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-2.5">
                {esModoEdicion ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setModalConfirmarEliminar(true)}
                    disabled={guardando || eliminando}
                    className="gap-1.5 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </Button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={onCerrar}
                    disabled={guardando || eliminando}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={guardando}
                    loadingText={esModoEdicion ? 'Guardando...' : 'Creando...'}
                    disabled={eliminando}
                  >
                    {esModoEdicion ? 'Guardar Cambios' : 'Crear Cuenta'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {modalConfirmarEliminar && cuentaAEditar && (
        <ModalConfirmacion
          abierto={modalConfirmarEliminar}
          onCerrar={() => !eliminando && setModalConfirmarEliminar(false)}
          onConfirmar={handleEliminarCuenta}
          titulo="Eliminar Cuenta Financiera"
          tipo="peligro"
          textoConfirmar={eliminando ? 'Eliminando...' : 'Sí, Eliminar Cuenta'}
          textoCancelar="Cancelar"
          cargando={eliminando}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas eliminar o desactivar la cuenta{' '}
                <strong className="text-ink font-bold">"{cuentaAEditar.nombre}"</strong>?
              </p>
              <p className="text-xs text-ink-muted leading-relaxed">
                Para poder eliminarla, el saldo debe ser exactamente $0,00. Si la cuenta ya tiene movimientos contables registrados, se archivará como inactiva para preservar el libro diario.
              </p>
            </div>
          }
        />
      )}
    </>
  );
};
