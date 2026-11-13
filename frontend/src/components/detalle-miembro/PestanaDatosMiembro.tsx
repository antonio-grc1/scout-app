import React from 'react';
import { Users, Save, Trash2 } from 'lucide-react';
import { TrayectoriaMiembro } from './TrayectoriaMiembro';

export interface FormDatosMiembro {
  nombre: string;
  apellido: string;
  dni: string;
  fechaNacimiento: string;
  emailContacto: string;
  telefonoContacto: string;
  madreNombres: string;
  madreTelefono: string;
  padreNombres: string;
  padreTelefono: string;
  tutorNombres: string;
  tutorTelefono: string;
  domicilio: string;
  obraSocial: string;
  telefonoUrgencias: string;
  alergias: string;
  activo: boolean;
}

export interface PestanaDatosMiembroProps {
  miembro: any;
  estadoCuenta: any;
  formData: FormDatosMiembro;
  setFormData: React.Dispatch<React.SetStateAction<FormDatosMiembro>>;
  guardando: boolean;
  desvinculandoMiembroId: number | null;
  puedeEditarIdentidad: boolean;
  puedeEditarContacto: boolean;
  puedeDarBaja: boolean;
  puedeEditarMiembro: boolean;
  puedeGestionarTesoreria?: boolean;
  puedeEliminarDefinitivo?: boolean;
  eliminandoDefinitivo?: boolean;
  onGuardarDatos: (e: React.FormEvent) => Promise<void>;
  onDesvincularRapido: (targetUserId: number, targetNombre: string) => Promise<void>;
  onAbrirEditarFamilia: () => void;
  onAbrirVincularHermano: () => void;
  onSolicitarEliminarDefinitivo?: () => void;
}

export const PestanaDatosMiembro: React.FC<PestanaDatosMiembroProps> = ({
  miembro,
  estadoCuenta,
  formData,
  setFormData,
  guardando,
  desvinculandoMiembroId,
  puedeEditarIdentidad,
  puedeEditarContacto,
  puedeDarBaja: _puedeDarBaja,
  puedeEditarMiembro,
  puedeGestionarTesoreria,
  puedeEliminarDefinitivo = false,
  eliminandoDefinitivo = false,
  onGuardarDatos,
  onDesvincularRapido,
  onAbrirEditarFamilia,
  onAbrirVincularHermano,
  onSolicitarEliminarDefinitivo,
}) => {
  type Campo = {
    key: keyof FormDatosMiembro;
    label: string;
    editable: boolean;
    type?: string;
    placeholder?: string;
    full?: boolean;
    multiline?: boolean;
    required?: boolean;
  };

  const campos: Campo[] = [
    { key: 'nombre', label: 'Nombre', editable: puedeEditarIdentidad, required: true },
    { key: 'apellido', label: 'Apellido', editable: puedeEditarIdentidad, required: true },
    { key: 'dni', label: 'DNI', editable: puedeEditarIdentidad, required: true },
    { key: 'fechaNacimiento', label: 'Fecha de Nacimiento', editable: puedeEditarIdentidad, type: 'date', required: true },
    { key: 'telefonoContacto', label: 'Teléfono del Miembro', editable: puedeEditarContacto, type: 'tel', placeholder: 'Ej: 3511234567' },
    { key: 'emailContacto', label: 'Email', editable: puedeEditarContacto, type: 'email', placeholder: 'correo@ejemplo.com' },
    { key: 'madreNombres', label: 'Nombre y Apellido Madre', editable: puedeEditarContacto, placeholder: 'Nombre y apellido de la madre' },
    { key: 'madreTelefono', label: 'Teléfono Madre', editable: puedeEditarContacto, type: 'tel', placeholder: 'Celular madre' },
    { key: 'padreNombres', label: 'Nombre y Apellido Padre', editable: puedeEditarContacto, placeholder: 'Nombre y apellido del padre' },
    { key: 'padreTelefono', label: 'Teléfono Padre', editable: puedeEditarContacto, type: 'tel', placeholder: 'Celular padre' },
    { key: 'tutorNombres', label: 'Nombre y Apellido Tutor/a', editable: puedeEditarContacto, placeholder: 'Nombre y apellido del tutor/a' },
    { key: 'tutorTelefono', label: 'Teléfono Tutor/a', editable: puedeEditarContacto, type: 'tel', placeholder: 'Celular tutor/a' },
    { key: 'telefonoUrgencias', label: 'Teléfono de Urgencias', editable: puedeEditarContacto, type: 'tel', placeholder: 'Alternativo para emergencias' },
    { key: 'domicilio', label: 'Domicilio', editable: puedeEditarContacto, placeholder: 'Calle y número' },
    { key: 'obraSocial', label: 'Obra Social / Prepaga', editable: puedeEditarContacto, placeholder: 'OSDE, Apross, etc.', full: true },
    { key: 'alergias', label: 'Alergias o Cuidados Médicos', editable: puedeEditarContacto, placeholder: 'Alergias, medicación habitual o dieta especial', full: true, multiline: true },
  ];

  const claseInput =
    'w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors';

  const mostrarValor = (c: Campo) => {
    const v = String(formData[c.key] ?? '');
    if (!v) return null;
    if (c.type === 'date') return new Date(`${v}T00:00:00`).toLocaleDateString('es-AR');
    return v;
  };

  const familiar = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
  const integrantesFamilia = familiar?.miembros || [];
  const pctDesc = familiar ? Number(familiar.porcentajeDescuentoHermanos ?? 0) : 0;

  return (
    <form onSubmit={onGuardarDatos} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campos.map((c) => {
          const valor = mostrarValor(c);
          // Solo lectura limpio: si no puede editar y no hay dato, no mostrar el campo
          if (!c.editable && !valor) return null;
          return (
            <div key={c.key} className={c.full ? 'sm:col-span-2' : ''}>
              <label className="block text-ink-2 font-bold mb-1">
                {c.label}
                {c.editable && c.required ? ' *' : ''}
              </label>
              {c.editable ? (
                c.multiline ? (
                  <textarea
                    rows={2}
                    placeholder={c.placeholder}
                    value={String(formData[c.key] ?? '')}
                    onChange={(e) => setFormData({ ...formData, [c.key]: e.target.value })}
                    className={claseInput}
                  />
                ) : (
                  <input
                    type={c.type || 'text'}
                    inputMode={c.type === 'tel' ? 'tel' : c.key === 'dni' ? 'numeric' : undefined}
                    required={c.required}
                    placeholder={c.placeholder}
                    value={String(formData[c.key] ?? '')}
                    onChange={(e) => setFormData({ ...formData, [c.key]: e.target.value })}
                    className={`${claseInput} ${c.key === 'dni' ? 'font-mono' : ''}`}
                  />
                )
              ) : (
                <p className="min-h-[42px] px-1 py-2 text-sm font-semibold text-ink whitespace-pre-wrap break-words">
                  {valor}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Grupo Familiar */}
      <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/30 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-4 h-4 text-brand" />
            <span className="font-bold text-ink">
              {familiar ? familiar.nombreFamilia : 'Sin hermanos vinculados'}
            </span>
            {familiar && pctDesc > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-brand/20 text-brand font-bold text-[10px]">
                -{pctDesc}% cuota
              </span>
            )}
          </div>

          {puedeGestionarTesoreria && (
            <div className="flex items-center gap-2">
              {familiar && (
                <button
                  type="button"
                  onClick={onAbrirEditarFamilia}
                  className="min-h-[38px] px-3 rounded-xl border border-brand/40 bg-surface text-brand font-bold text-xs cursor-pointer"
                >
                  Descuento ({pctDesc}%)
                </button>
              )}
              <button
                type="button"
                onClick={onAbrirVincularHermano}
                className="min-h-[38px] px-3 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs cursor-pointer transition-colors"
              >
                + Hermano
              </button>
            </div>
          )}
        </div>

        {integrantesFamilia.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rule">
            <span className="text-[11px] font-bold text-ink-muted mr-1">
              Integrantes:
            </span>
            {integrantesFamilia.map((h: any) => (
              <span
                key={h.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl bg-surface border border-brand/30 text-xs font-bold text-ink"
              >
                <span>
                  {h.nombre} {h.apellido}
                </span>
                <button
                  type="button"
                  disabled={desvinculandoMiembroId === h.id}
                  onClick={() => onDesvincularRapido(h.id, `${h.nombre} ${h.apellido}`)}
                  title={`Quitar a ${h.nombre} del grupo familiar`}
                  className="px-1.5 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold transition cursor-pointer disabled:opacity-50"
                >
                  {desvinculandoMiembroId === h.id ? '...' : 'Quitar'}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Trayectoria en el Grupo */}
      <TrayectoriaMiembro asignaciones={miembro?.asignaciones} />

      {/* Estado Activo / Baja y Botón Guardar */}
      {puedeEditarMiembro && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-rule">
          <label className="flex items-center gap-2.5 cursor-pointer min-h-[42px]">
            <input
              type="checkbox"
              checked={formData.activo}
              onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
              className="w-5 h-5 text-brand rounded border-rule cursor-pointer focus:ring-brand/20"
            />
            <span className="font-bold text-ink-2">
              {formData.activo ? 'Miembro activo en el grupo' : 'Dado de baja (Inactivo)'}
            </span>
          </label>

          <button
            type="submit"
            disabled={guardando}
            className="min-h-[44px] px-5 bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </div>
      )}

      {/* Eliminación definitiva (solo alcance global cuando el miembro ya está dado de baja) */}
      {!miembro?.activo && puedeEliminarDefinitivo && onSolicitarEliminarDefinitivo && (
        <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="block text-xs font-extrabold text-rose-700 dark:text-rose-300">
              Eliminar miembro definitivamente
            </span>
            <p className="text-[11px] text-ink-2 leading-relaxed">
              Borra permanentemente este registro del padrón. Solo es posible si no posee pagos, cargos activos ni fichas emitidas.
            </p>
          </div>
          <button
            type="button"
            disabled={eliminandoDefinitivo || guardando}
            onClick={onSolicitarEliminarDefinitivo}
            className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{eliminandoDefinitivo ? 'Eliminando...' : 'Eliminar definitivamente'}</span>
          </button>
        </div>
      )}
    </form>
  );
};
