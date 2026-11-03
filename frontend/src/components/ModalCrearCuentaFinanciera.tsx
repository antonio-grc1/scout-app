import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { Landmark, Wallet, X, PlusCircle } from 'lucide-react';

export interface ModalCrearCuentaFinancieraProps {
  abierto: boolean;
  onCerrar: () => void;
  onCuentaCreada: (nuevaCuenta?: any) => void;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const ModalCrearCuentaFinanciera: React.FC<ModalCrearCuentaFinancieraProps> = ({
  abierto,
  onCerrar,
  onCuentaCreada,
  onToast,
}) => {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'CAJA_EFECTIVO' | 'BANCO'>('BANCO');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setNombre('');
      setTipo('BANCO');
      setError(null);
    }
  }, [abierto]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abierto && !guardando) {
        onCerrar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto, guardando, onCerrar]);

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
      const res = await api.post('/tesoreria/cuentas', {
        nombre: nombreLimpio,
        tipo,
      });

      if (onToast) {
        onToast(`Cuenta "${nombreLimpio}" creada con éxito.`);
      }
      onCuentaCreada(res.data);
      onCerrar();
    } catch (err: any) {
      const msg = traducirErrorAmigable(err, 'No se pudo crear la cuenta financiera.');
      setError(msg);
      if (onToast) {
        onToast(msg, 'error');
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) {
          onCerrar();
        }
      }}
    >
      <div
        className="bg-surface border border-rule rounded-2xl w-full max-w-md shadow-md overflow-hidden transition-colors"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-crear-cuenta-title"
      >
        <div className="p-5 sm:p-6">
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="modal-crear-cuenta-title" className="text-base sm:text-lg font-bold text-ink leading-snug">
                  Nueva Cuenta Financiera
                </h3>
                <p className="text-xs text-ink-muted">
                  Crea una cuenta para registrar movimientos de caja o banco.
                </p>
              </div>
            </div>
            {!guardando && (
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
              disabled={guardando}
              autoFocus
              helperText="Nombre visible para identificar la cuenta en arqueos y cobros."
            />

            <Select
              label="Tipo de Cuenta"
              required
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'CAJA_EFECTIVO' | 'BANCO')}
              disabled={guardando}
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

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium"
              >
                {error}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onCerrar}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={guardando}
                loadingText="Creando cuenta..."
              >
                Crear Cuenta
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
