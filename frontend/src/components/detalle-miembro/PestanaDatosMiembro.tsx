import React from 'react';
import { useConfirmar } from '../../hooks/useConfirmar';
import { Check, HeartPulse, Save, Trash2, Utensils } from 'lucide-react';
import {
  OPCIONES_ALERGIA_ESTANDAR,
  OPCIONES_DIETA_ESTANDAR,
} from '../../lib/alertasMedicas';
import { TrayectoriaMiembro } from './TrayectoriaMiembro';
import { puedeDesvincularIntegrantePorAlcance } from '../../lib/permisos';
import { BloqueGrupoFamiliar } from './BloqueGrupoFamiliar';
import { Button } from '../ui';

export interface FormDatosMiembro {
  nombre: string;
  apellido: string;
  dni: string;
  fechaNacimiento: string;
  tipoMiembro: 'PROTAGONISTA' | 'EDUCADOR';
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
  alergiasTipos: string[];
  regimenDietarioTipos: string[];
  regimenDietarioDetalle: string;
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
  /** Alergias y dieta son datos de salud: requieren además legajos.editar. */
  puedeEditarSalud: boolean;
  puedeDarBaja: boolean;
  puedeEditarMiembro: boolean;
  puedeGestionarTesoreria?: boolean;
  puedeVincularHermano?: boolean;
  puedeEditarDescuentoFamilia?: boolean;
  esGlobal?: boolean;
  unidadesEnAlcanceIds?: readonly number[];
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
  puedeEditarSalud,
  puedeDarBaja,
  puedeEditarMiembro,
  puedeGestionarTesoreria,
  puedeVincularHermano,
  puedeEditarDescuentoFamilia,
  esGlobal = true,
  unidadesEnAlcanceIds = [],
  puedeEliminarDefinitivo = false,
  eliminandoDefinitivo = false,
  onGuardarDatos,
  onDesvincularRapido,
  onAbrirEditarFamilia,
  onAbrirVincularHermano,
  onSolicitarEliminarDefinitivo,
}) => {
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();
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

  const habilitarVincularHermano = puedeVincularHermano ?? Boolean(puedeGestionarTesoreria);
  const habilitarEditarDescuento =
    puedeEditarDescuentoFamilia ?? Boolean(puedeGestionarTesoreria);
  const puedeDesvincularIntegrante = (h: any) =>
    habilitarVincularHermano &&
    puedeDesvincularIntegrantePorAlcance(h, {
      esGlobal,
      unidadesEnAlcanceIds,
      miembroActualId: miembro?.id,
    });

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
  ];

  const claseInput =
    'w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-base sm:text-[15px] focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors';

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
      {dialogoConfirmacion}
      {/* Categoría en el Grupo (independiente del rol de permisos) */}
      <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <span className="text-sm font-bold text-ink block">Categoría en el Grupo</span>
          <span className="text-xs text-ink-muted block">
            Define plantilla de legajo y cobros aplicables al miembro.
          </span>
        </div>
        {puedeEditarIdentidad ? (
          <div className="inline-grid grid-cols-2 rounded-xl bg-paper-3 p-1 gap-1 shrink-0">
            {(
              [
                { id: 'PROTAGONISTA', label: 'Protagonista' },
                { id: 'EDUCADOR', label: 'Educador / Adulto' },
              ] as const
            ).map((op) => {
              const sel = formData.tipoMiembro === op.id;
              return (
                <button
                  aria-pressed={sel}
                  key={op.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, tipoMiembro: op.id })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    sel ? 'bg-brand text-brand-contrast shadow-xs' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="px-3 py-1 rounded-xl bg-surface border border-rule text-xs font-bold text-ink">
            {formData.tipoMiembro === 'EDUCADOR' ? 'Educador / Adulto' : 'Protagonista / Beneficiario'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {campos.map((c) => {
          const valor = mostrarValor(c);
          // Solo lectura limpio: si no puede editar y no hay dato, no mostrar el campo
          if (!c.editable && !valor) return null;
          return (
            <div key={c.key} className={c.full ? 'sm:col-span-2' : ''}>
              <label className="block text-sm text-ink-2 font-bold mb-1.5">
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
                <p className="min-h-[44px] px-1 py-2 text-[15px] font-semibold text-ink whitespace-pre-wrap break-words">
                  {valor}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Salud y Régimen Alimentario Rápido */}
      {(puedeEditarSalud ||
        formData.regimenDietarioTipos.length > 0 ||
        formData.regimenDietarioDetalle ||
        formData.alergiasTipos.length > 0 ||
        formData.alergias) && (
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3.5">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-brand shrink-0" />
            <span className="font-bold text-sm text-ink">
              Salud y Régimen Alimentario Rápido
            </span>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-ink-2 flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-brand" />
              <span>Régimen de comidas / Dieta</span>
            </span>
            {puedeEditarSalud ? (
              <div className="flex flex-wrap gap-1.5">
                {OPCIONES_DIETA_ESTANDAR.map((op) => {
                  const activo = formData.regimenDietarioTipos.includes(op.value);
                  return (
                    <button
                      aria-pressed={activo}
                      key={op.value}
                      type="button"
                      onClick={() => {
                        const next = activo
                          ? formData.regimenDietarioTipos.filter((v) => v !== op.value)
                          : [...formData.regimenDietarioTipos, op.value];
                        setFormData({ ...formData, regimenDietarioTipos: next });
                      }}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer inline-flex items-center gap-1.5 ${
                        activo
                          ? 'bg-brand text-brand-contrast border-brand'
                          : 'bg-surface text-ink-2 border-rule hover:border-brand/50'
                      }`}
                    >
                      {activo && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      <span>{op.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : formData.regimenDietarioTipos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {formData.regimenDietarioTipos.map((v) => {
                  const lbl = OPCIONES_DIETA_ESTANDAR.find((o) => o.value === v)?.label || v;
                  return (
                    <span
                      key={v}
                      className="px-2.5 py-1 rounded-lg bg-brand/10 text-brand text-xs font-bold border border-brand/25"
                    >
                      {lbl}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {puedeEditarSalud ? (
              <input
                type="text"
                placeholder="Detalle de dieta u observaciones alimentarias..."
                value={formData.regimenDietarioDetalle}
                onChange={(e) =>
                  setFormData({ ...formData, regimenDietarioDetalle: e.target.value })
                }
                className={claseInput}
              />
            ) : formData.regimenDietarioDetalle ? (
              <p className="text-[14px] font-semibold text-ink">{formData.regimenDietarioDetalle}</p>
            ) : null}
          </div>

          <div className="space-y-2 pt-2 border-t border-rule">
            <span className="block text-xs font-bold text-ink-2">
              Categorías de alergias y detalle médico
            </span>
            {puedeEditarSalud ? (
              <div className="flex flex-wrap gap-1.5">
                {OPCIONES_ALERGIA_ESTANDAR.map((op) => {
                  const activo = formData.alergiasTipos.includes(op.value);
                  return (
                    <button
                      aria-pressed={activo}
                      key={op.value}
                      type="button"
                      onClick={() => {
                        const next = activo
                          ? formData.alergiasTipos.filter((v) => v !== op.value)
                          : [...formData.alergiasTipos, op.value];
                        setFormData({ ...formData, alergiasTipos: next });
                      }}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer inline-flex items-center gap-1.5 ${
                        activo
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-surface text-ink-2 border-rule hover:border-rose-400'
                      }`}
                    >
                      {activo && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      <span>{op.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : formData.alergiasTipos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {formData.alergiasTipos.map((v) => {
                  const lbl = OPCIONES_ALERGIA_ESTANDAR.find((o) => o.value === v)?.label || v;
                  return (
                    <span
                      key={v}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-800"
                    >
                      {lbl}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {puedeEditarSalud ? (
              <textarea
                rows={2}
                placeholder="Detalle de alergias o cuidados médicos..."
                value={formData.alergias}
                onChange={(e) => setFormData({ ...formData, alergias: e.target.value })}
                className={claseInput}
              />
            ) : formData.alergias ? (
              <p className="text-[14px] font-semibold text-ink whitespace-pre-wrap break-words">
                {formData.alergias}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Grupo Familiar y Descuento Hermanos (bloque compartido con la pestaña Cuotas) */}
      <BloqueGrupoFamiliar
        familiar={familiar}
        pctDesc={pctDesc}
        integrantesFamilia={integrantesFamilia}
        habilitarVincularHermano={habilitarVincularHermano}
        habilitarEditarDescuento={habilitarEditarDescuento}
        onEditarFamilia={onAbrirEditarFamilia}
        onVincularHermano={onAbrirVincularHermano}
        puedeDesvincularIntegrante={puedeDesvincularIntegrante}
        desvinculandoMiembroId={desvinculandoMiembroId}
        onDesvincularRapido={onDesvincularRapido}
      />

      {/* Trayectoria en el Grupo */}
      <TrayectoriaMiembro asignaciones={miembro?.asignaciones} />

      {/* Estado Activo / Baja y Botón Guardar */}
      {puedeEditarMiembro && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-rule">
          {puedeDarBaja ? (
            <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={formData.activo}
                onChange={(e) => {
                  const activo = e.target.checked;
                  if (!activo && formData.activo) {
                    pedirConfirmacion(
                      {
                        titulo: 'Dar de baja al miembro',
                        mensaje: 'Al guardar, el miembro quedará inactivo en el grupo.',
                        impacto: 'Se cierran sus asignaciones activas y deja de aparecer en el padrón activo. Se puede reactivar después.',
                        textoConfirmar: 'Marcar como baja',
                      },
                      () => setFormData({ ...formData, activo: false }),
                    );
                    return;
                  }
                  setFormData({ ...formData, activo });
                }}
                className="w-5 h-5 text-brand rounded border-rule cursor-pointer focus:ring-brand/20"
              />
              <span className="font-bold text-sm text-ink-2">
                {formData.activo ? 'Miembro activo en el grupo' : 'Dado de baja (Inactivo)'}
              </span>
            </label>
          ) : (
            <span className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl bg-paper-2 border border-rule text-[13px] font-bold text-ink-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  formData.activo ? 'bg-emerald-500' : 'bg-ink-muted'
                }`}
              />
              {formData.activo ? 'Miembro activo en el grupo' : 'Dado de baja (Inactivo)'}
            </span>
          )}

          <Button
            type="submit"
            disabled={guardando}
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
          </Button>
        </div>
      )}

      {/* Eliminación definitiva (solo alcance global cuando el miembro ya está dado de baja) */}
      {!miembro?.activo && puedeEliminarDefinitivo && onSolicitarEliminarDefinitivo && (
        <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="block text-sm font-extrabold text-rose-700 dark:text-rose-300">
              Eliminar miembro definitivamente
            </span>
            <p className="text-[13px] text-ink-2 leading-relaxed">
              Borra permanentemente este registro del padrón. Solo es posible si no posee pagos, cargos activos ni fichas emitidas.
            </p>
          </div>
          <button
            type="button"
            disabled={eliminandoDefinitivo || guardando}
            onClick={onSolicitarEliminarDefinitivo}
            className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{eliminandoDefinitivo ? 'Eliminando...' : 'Eliminar definitivamente'}</span>
          </button>
        </div>
      )}
    </form>
  );
};
