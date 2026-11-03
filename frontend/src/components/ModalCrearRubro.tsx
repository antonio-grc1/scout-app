import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { X, Tag, PlusCircle } from 'lucide-react';
import { traducirErrorAmigable } from '../lib/formatters';

export interface ModalCrearRubroProps {
  abierto: boolean;
  tipoDefault?: 'INGRESO' | 'EGRESO';
  onCerrar: () => void;
  onRubroCreado: (rubro: { id: number; nombre: string; tipo: 'INGRESO' | 'EGRESO' }) => void;
}

export const ModalCrearRubro: React.FC<ModalCrearRubroProps> = ({
  abierto,
  tipoDefault = 'EGRESO',
  onCerrar,
  onRubroCreado,
}) => {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>(tipoDefault);
  const [permiteDescuentoDefault, setPermiteDescuentoDefault] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setNombre('');
      setTipo(tipoDefault);
      setPermiteDescuentoDefault(tipoDefault === 'INGRESO');
      setError(null);
    }
  }, [abierto, tipoDefault]);

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre de la categoría es obligatorio');
      return;
    }

    try {
      setGuardando(true);
      setError(null);
      const res = await api.post('/tesoreria/rubros', {
        nombre: nombre.trim(),
        tipo,
        permiteDescuentoDefault: tipo === 'INGRESO' ? permiteDescuentoDefault : false,
      });
      onRubroCreado(res.data);
      onCerrar();
    } catch (err) {
      setError(traducirErrorAmigable(err, 'No se pudo crear la categoría o rubro.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-paper border border-rule w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black text-ink">
              Nueva Categoría / Rubro Contable
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-ink block mb-1">
              Tipo de Rubro
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipo('INGRESO');
                  setPermiteDescuentoDefault(true);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                  tipo === 'INGRESO'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-paper-2 text-ink-muted border-rule hover:text-ink'
                }`}
              >
                Ingreso (Categoría de Cobro)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo('EGRESO');
                  setPermiteDescuentoDefault(false);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                  tipo === 'EGRESO'
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                    : 'bg-paper-2 text-ink-muted border-rule hover:text-ink'
                }`}
              >
                Egreso (Rubro de Gasto)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">
              Nombre de la Categoría
            </label>
            <Input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={
                tipo === 'INGRESO'
                  ? 'Ej: Cuota Taller de Nudos, Remera de Grupo, Seguro'
                  : 'Ej: Ferretería y Pintura, Combustible, Azúcar'
              }
              autoFocus
              required
            />
          </div>

          {tipo === 'INGRESO' && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-paper-2 border border-rule cursor-pointer">
              <input
                type="checkbox"
                checked={permiteDescuentoDefault}
                onChange={(e) => setPermiteDescuentoDefault(e.target.checked)}
                className="mt-0.5 rounded text-brand focus:ring-brand"
              />
              <span className="text-xs text-ink">
                <strong>Permitir descuento por hermanos por defecto</strong>
                <span className="block text-[11px] text-ink-muted mt-0.5">
                  Si se tilda, los cobros creados bajo este rubro aplicarán el % familiar predeterminado.
                </span>
              </span>
            </label>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t border-rule">
            <Button
              type="button"
              variant="secondary"
              onClick={onCerrar}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={guardando || !nombre.trim()}
              className="gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : 'Crear Categoría'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
