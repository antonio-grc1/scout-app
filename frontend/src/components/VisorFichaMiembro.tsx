import React, { lazy, Suspense, useState } from 'react';
import {
  HeartPulse,
  Users,
  ShieldCheck,
  Sparkles,
  Phone,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  GraduationCap,
  Syringe,
  Car,
  UserCheck,
  Utensils,
  Pill,
} from 'lucide-react';
import { extraerInfoMedicaMiembro } from '../lib/alertasMedicas';
import { obtenerCicloAnioActual } from '../lib/formatters';

const PdfViewerModal = lazy(() =>
  import('./PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

interface VisorFichaMiembroProps {
  miembro: any;
  entrega?: any | any[] | null;
  plantillas?: any[];
  pdfPreviewUrl?: string | null;
  ocultarModalPdf?: boolean;
  onCerrarPdfPreview?: () => void;
  onDescargarPdf?: () => void;
}

type SeccionVista = 'salud' | 'familia' | 'retiro' | 'apoyos';

const valorTexto = (val: unknown, fallback = '—'): string => {
  if (val === undefined || val === null) return fallback;
  const s = String(val).trim();
  return s.length > 0 ? s : fallback;
};

const esVerdadero = (val: unknown): boolean =>
  val === true || val === 'true' || val === 'SI' || val === 'Sí';

export const VisorFichaMiembro: React.FC<VisorFichaMiembroProps> = ({
  miembro,
  entrega,
  plantillas,
  pdfPreviewUrl,
  ocultarModalPdf = false,
  onCerrarPdfPreview,
  onDescargarPdf,
}) => {
  const [seccion, setSeccion] = useState<SeccionVista>('salud');

  // Combinamos los datos del snapshot de la(s) entrega(s) con los datos fijos del usuario
  const datos: Record<string, any> = {
    ...(miembro?.datosFijosJson || {}),
  };
  if (Array.isArray(entrega)) {
    const ordenadas = [...entrega].sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0));
    for (const ent of ordenadas) {
      if (ent?.respuestasSnapshotJson && typeof ent.respuestasSnapshotJson === 'object') {
        Object.assign(datos, ent.respuestasSnapshotJson);
      }
    }
  } else if (entrega?.respuestasSnapshotJson && typeof entrega.respuestasSnapshotJson === 'object') {
    Object.assign(datos, entrega.respuestasSnapshotJson);
  }

  const tieneDatosCargados =
    (Array.isArray(entrega)
      ? entrega.some((e) => Boolean(e?.respuestasSnapshotJson))
      : Boolean(entrega?.respuestasSnapshotJson)) ||
    Object.keys(miembro?.datosFijosJson || {}).length > 0;

  const infoMedica = extraerInfoMedicaMiembro(miembro, entrega, plantillas);
  const alertasMedicas = infoMedica.alertas;
  const situacionesPuntuales = infoMedica.situacionesClinicas;

  const telEmergencia1 = infoMedica.telEmergencia1 || '';
  const telEmergencia2 = infoMedica.telEmergencia2 || '';
  const grupoSanguineo = infoMedica.grupoSanguineo || 'Sin especificar';
  const obraSocial = infoMedica.obraSocial || '—';
  const afiliadoObraSocial = infoMedica.afiliadoObraSocial || '';

  // Personas autorizadas a retirar
  const personasRetiro = [1, 2, 3]
    .map((n) => ({
      nombre: datos[`ret_persona${n}_nombre`],
      dni: datos[`ret_persona${n}_dni`],
      telefono: datos[`ret_persona${n}_telefono`],
      vinculo: datos[`ret_persona${n}_caracter`],
    }))
    .filter((p) => Boolean(p.nombre));

  // Familiares
  const familiares = [
    {
      rol: 'Madre',
      nombre: datos.madre_nombres,
      dni: datos.madre_dni,
      telefono: datos.madre_telefono,
      email: datos.madre_email,
      domicilio: datos.madre_domicilio,
      convive: datos.madre_convive,
      profesion: datos.madre_profesion,
      estadoCivil: datos.madre_estado_civil,
    },
    {
      rol: 'Padre',
      nombre: datos.padre_nombres,
      dni: datos.padre_dni,
      telefono: datos.padre_telefono,
      email: datos.padre_email,
      domicilio: datos.padre_domicilio,
      convive: datos.padre_convive,
      profesion: datos.padre_profesion,
      estadoCivil: datos.padre_estado_civil,
    },
    {
      rol: 'Tutor',
      nombre: datos.tutor_nombres,
      dni: datos.tutor_dni,
      telefono: datos.tutor_telefono,
      email: datos.tutor_email,
      domicilio: datos.tutor_domicilio,
      convive: datos.tutor_convive,
      profesion: datos.tutor_profesion,
      estadoCivil: datos.tutor_estado_civil,
    },
  ].filter((f) => Boolean(f.nombre) || f.rol !== 'Tutor');

  return (
    <div className="space-y-3">
      {/* Modal Visor de PDF en pantalla (compatible con celulares Android/iOS sin apps externas) */}
      {!ocultarModalPdf && pdfPreviewUrl && (
        <Suspense fallback={null}>
          <PdfViewerModal
            url={pdfPreviewUrl}
            titulo={`Vista Previa: ${miembro?.apellido || ''}, ${miembro?.nombre || ''}`}
            subtitulo={`Planilla Oficial ${obtenerCicloAnioActual()}`}
            onCerrar={onCerrarPdfPreview}
            onDescargar={onDescargarPdf}
          />
        </Suspense>
      )}

      {!tieneDatosCargados ? (
        <div className="p-6 text-center bg-paper-2 rounded-2xl border border-dashed border-rule space-y-1.5">
          <p className="text-sm font-bold text-ink-2">
            Este miembro todavía no tiene respuestas cargadas en su ficha digital.
          </p>
          <p className="text-xs text-ink-muted">
            Tocá &ldquo;Rellenar Ficha&rdquo; arriba para completarla desde el celular.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Selector de Secciones de la Ficha (Mobile-First Chips) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-paper-3/90 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setSeccion('salud')}
              className={`min-h-[42px] px-3 py-1.5 rounded-xl text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'salud'
                  ? 'bg-brand text-brand-contrast font-bold'
                  : 'text-ink-muted'
              }`}
            >
              <HeartPulse className="w-4 h-4 shrink-0" />
              <span>Salud</span>
              {alertasMedicas.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSeccion('familia')}
              className={`min-h-[42px] px-3 py-1.5 rounded-xl text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'familia'
                  ? 'bg-brand text-brand-contrast font-bold'
                  : 'text-ink-muted'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Familia</span>
            </button>

            <button
              type="button"
              onClick={() => setSeccion('retiro')}
              className={`min-h-[42px] px-3 py-1.5 rounded-xl text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'retiro'
                  ? 'bg-brand text-brand-contrast font-bold'
                  : 'text-ink-muted'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Retiro y Salidas</span>
            </button>

            <button
              type="button"
              onClick={() => setSeccion('apoyos')}
              className={`min-h-[42px] px-3 py-1.5 rounded-xl text-[13px] font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'apoyos'
                  ? 'bg-brand text-brand-contrast font-bold'
                  : 'text-ink-muted'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Apoyos</span>
            </button>
          </div>

          {/* ========================================================== */}
          {/* SECCIÓN 1: SALUD Y EMERGENCIAS                             */}
          {/* ========================================================== */}
          {seccion === 'salud' && (
            <div className="space-y-3.5">
              {/* Tarjeta Rápida de Biometría y Cobertura */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50">
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 block">
                    Grupo y Factor
                  </span>
                  <span className="text-lg font-black text-rose-900 dark:text-rose-100">
                    {grupoSanguineo}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-paper-2 border border-rule/70">
                  <span className="text-xs font-semibold text-ink-muted block">
                    Peso / Talla
                  </span>
                  <span className="text-[15px] font-extrabold text-ink">
                    {datos.peso_kg ? `${datos.peso_kg} kg` : '—'} •{' '}
                    {datos.talla_m ? `${datos.talla_m} m` : '—'}
                  </span>
                </div>

                <div className="col-span-2 p-3.5 rounded-xl bg-paper-2 border border-rule/70">
                  <span className="text-xs font-semibold text-ink-muted block">
                    Obra Social / Prepaga
                  </span>
                  <span className="text-[15px] font-extrabold text-ink block truncate">
                    {obraSocial}
                    {afiliadoObraSocial ? ` (Afiliado: ${afiliadoObraSocial})` : ''}
                  </span>
                </div>
              </div>

              {/* Teléfonos de Emergencia con 1-Tap Call */}
              <div className="p-4 rounded-2xl bg-surface/50 border border-rule/70 space-y-2.5">
                <span className="text-[13px] font-semibold text-ink-muted block">
                  Teléfonos de Emergencia
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {telEmergencia1 ? (
                    <a
                      href={`tel:${telEmergencia1}`}
                      className="min-h-[48px] px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/40 flex items-center justify-between gap-2 text-ink font-bold text-sm"
                    >
                      <div>
                        <span className="text-xs text-brand-ink block">
                          Emergencia 1
                        </span>
                        <span>{telEmergencia1}</span>
                      </div>
                      <Phone className="w-4 h-4 text-brand-ink shrink-0" />
                    </a>
                  ) : (
                    <div className="p-3 rounded-xl bg-paper-2 text-[13px] text-ink-muted">
                      Sin teléfono de emergencia 1
                    </div>
                  )}

                  {telEmergencia2 && (
                    <a
                      href={`tel:${telEmergencia2}`}
                      className="min-h-[48px] px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/40 flex items-center justify-between gap-2 text-ink font-bold text-sm"
                    >
                      <div>
                        <span className="text-xs text-brand-ink block">
                          Emergencia 2
                        </span>
                        <span>{telEmergencia2}</span>
                      </div>
                      <Phone className="w-4 h-4 text-brand-ink shrink-0" />
                    </a>
                  )}
                </div>
              </div>

              {/* Bloques Estructurados: Régimen Alimentario, Alergias y Medicación */}
              <div className="grid grid-cols-1 gap-2.5">
                <div
                  className={`p-3.5 rounded-2xl border space-y-2 ${
                    infoMedica.tieneDieta
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70'
                      : 'bg-paper-2 border-rule'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink">
                    <Utensils className="w-4 h-4 text-brand shrink-0" />
                    <span>Régimen Alimentario / Comidas</span>
                  </div>
                  {infoMedica.tieneDieta ? (
                    <div className="space-y-1.5">
                      {infoMedica.dietasLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {infoMedica.dietasLabels.map((lbl) => (
                            <span
                              key={lbl}
                              className="px-2.5 py-0.5 rounded-full bg-brand text-brand-contrast text-xs font-bold"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}
                      {infoMedica.dietaDetalle && (
                        <p className="text-[13px] font-semibold text-ink-2">
                          {infoMedica.dietaDetalle}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted">Sin restricciones alimentarias declaradas.</p>
                  )}
                </div>

                {(infoMedica.tieneAlergia || infoMedica.tomaMedicacion || infoMedica.tieneCondicionCronica) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {infoMedica.tieneAlergia && (
                      <div className="p-3.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-rose-900 dark:text-rose-100">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span>Alergias</span>
                        </div>
                        {infoMedica.alergiasLabels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {infoMedica.alergiasLabels.map((lbl) => (
                              <span
                                key={lbl}
                                className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-bold"
                              >
                                {lbl}
                              </span>
                            ))}
                          </div>
                        )}
                        {infoMedica.alergiasDetalle && (
                          <p className="text-xs font-semibold text-rose-900/90 dark:text-rose-100/90">
                            {infoMedica.alergiasDetalle}
                          </p>
                        )}
                      </div>
                    )}

                    {(infoMedica.tomaMedicacion || infoMedica.tieneCondicionCronica) && (
                      <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 space-y-2">
                        <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
                          <Pill className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Medicación y Condiciones</span>
                        </div>
                        {infoMedica.tomaMedicacion && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-bold uppercase text-ink-muted block">
                              Medicación
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {infoMedica.medicacionLabels.map((lbl) => (
                                <span
                                  key={lbl}
                                  className="px-2 py-0.5 rounded-md bg-brand text-brand-contrast text-[11px] font-bold"
                                >
                                  {lbl}
                                </span>
                              ))}
                            </div>
                            {infoMedica.medicacionDetalle && (
                              <p className="text-xs font-semibold text-ink-2">
                                {infoMedica.medicacionDetalle}
                              </p>
                            )}
                          </div>
                        )}
                        {infoMedica.tieneCondicionCronica && (
                          <div className="space-y-1">
                            <span className="text-[11px] font-bold uppercase text-ink-muted block">
                              Condición crónica
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {infoMedica.condicionesLabels.map((lbl) => (
                                <span
                                  key={lbl}
                                  className="px-2 py-0.5 rounded-md bg-surface border border-rule text-ink text-[11px] font-bold"
                                >
                                  {lbl}
                                </span>
                              ))}
                            </div>
                            {infoMedica.condicionesDetalle && (
                              <p className="text-xs font-semibold text-ink-2">
                                {infoMedica.condicionesDetalle}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Alertas Médicas y Condiciones Declaradas */}
              {alertasMedicas.length > 0 ? (
                <div className="space-y-2.5">
                  <span className="text-[13px] font-semibold text-rose-600 dark:text-rose-400 block">
                    Atención Médica a Tener en Cuenta
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    {alertasMedicas.map((al, i) => (
                      <div
                        key={i}
                        className={`p-3.5 rounded-xl border flex items-start gap-2.5 ${
                          al.critico
                            ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80 text-rose-950 dark:text-rose-100'
                            : 'bg-brand/10 border-brand/40 text-ink'
                        }`}
                      >
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            al.critico ? 'text-rose-600 dark:text-rose-400' : 'text-brand'
                          }`}
                        />
                        <div className="text-[13px]">
                          <span className="font-extrabold block">{al.titulo}</span>
                          {al.detalle && <span className="opacity-90">{al.detalle}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/30 flex items-center gap-2 text-ink text-[13px] font-bold">
                  <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                  <span>Sin alergias, medicaciones ni alertas médicas críticas declaradas.</span>
                </div>
              )}

              {/* Situaciones clínicas y Vacunas */}
              {situacionesPuntuales.length > 0 && (
                <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-2.5">
                  <span className="text-[13px] font-semibold text-ink-muted block">
                    Antecedentes Clínicos
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {situacionesPuntuales.map((s) => (
                      <span
                        key={s}
                        className="px-3 py-1 rounded-lg bg-surface border border-rule text-[13px] font-bold text-ink-2"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-2.5">
                <div className="flex items-center gap-1.5 text-ink-muted">
                  <Syringe className="w-4 h-4" />
                  <span className="text-[13px] font-semibold text-ink-2">Vacunas y Controles</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <span className="text-ink-muted block text-xs">Quíntuple</span>
                    <span className="font-bold text-ink-2">
                      {valorTexto(datos.vacuna_quintuple)}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-xs">Triple Celular</span>
                    <span className="font-bold text-ink-2">
                      {valorTexto(datos.vacuna_triple_celular)}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-xs">Triple Acelular</span>
                    <span className="font-bold text-ink-2">
                      {valorTexto(datos.vacuna_triple_acelular)}
                    </span>
                  </div>
                  <div>
                    <span className="text-ink-muted block text-xs">Doble Bacteriana</span>
                    <span className="font-bold text-ink-2">
                      {valorTexto(datos.vacuna_doble_bacteriana)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* SECCIÓN 2: FAMILIA Y ESCOLARIDAD                           */}
          {/* ========================================================== */}
          {seccion === 'familia' && (
            <div className="space-y-3.5">
              {/* Domicilio y Escuela del Protagonista */}
              <div className="p-4 rounded-2xl bg-paper-2 border border-rule grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-semibold text-ink-muted block">
                      Domicilio Real
                    </span>
                    <span className="font-bold text-ink">
                      {valorTexto(datos.protagonista_domicilio || datos.domicilio)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <GraduationCap className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-semibold text-ink-muted block">
                      Escolaridad
                    </span>
                    <span className="font-bold text-ink">
                      {valorTexto(datos.escolaridad_institucion)}
                      {datos.escolaridad_grado ? ` (${datos.escolaridad_grado})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tarjetas de Madre, Padre y Tutor */}
              <div className="grid grid-cols-1 gap-3">
                {familiares.map((fam) => (
                  <div
                    key={fam.rol}
                    className="p-4 rounded-2xl bg-surface border border-rule/70 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-brand-ink block">
                          {fam.rol}
                        </span>
                        <span className="text-[15px] font-extrabold text-ink">
                          {valorTexto(fam.nombre, 'Sin completar')}
                        </span>
                      </div>

                      {fam.telefono && (
                        <a
                          href={`tel:${fam.telefono}`}
                          className="min-h-[40px] px-3.5 rounded-xl bg-brand/10 text-ink-2 font-bold text-[13px] flex items-center gap-1.5"
                        >
                          <Phone className="w-4 h-4" />
                          <span>{fam.telefono}</span>
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1.5 border-t border-rule text-[13px]">
                      <div>
                        <span className="text-xs text-ink-muted block">DNI</span>
                        <span className="font-semibold text-ink-2">
                          {valorTexto(fam.dni)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-ink-muted block">Ocupación</span>
                        <span className="font-semibold text-ink-2">
                          {valorTexto(fam.profesion)}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-xs text-ink-muted block">Email</span>
                        <span className="font-semibold text-ink-2 truncate block">
                          {valorTexto(fam.email)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-ink-muted block">Domicilio</span>
                        <span className="font-semibold text-ink-2">
                          {valorTexto(fam.domicilio)}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-ink-muted block">Convive</span>
                        <span className="font-semibold text-ink-2">
                          {fam.convive === undefined ? '—' : esVerdadero(fam.convive) ? 'Sí' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* SECCIÓN 3: RETIRO DE MENORES Y PERMISOS                    */}
          {/* ========================================================== */}
          {seccion === 'retiro' && (
            <div className="space-y-3.5">
              {/* Badges de Permisos Clave */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div
                  className={`p-4 rounded-2xl border flex items-center gap-3 ${
                    esVerdadero(datos.ret_autoriza_retirarse_solo)
                      ? 's-badge-warn'
                      : 'bg-paper-2 border-rule'
                  }`}
                >
                  <Car
                    className={`w-5 h-5 shrink-0 ${
                      esVerdadero(datos.ret_autoriza_retirarse_solo)
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-brand-ink'
                    }`}
                  />
                  <div className="text-[13px]">
                    <span className="text-xs font-semibold opacity-85 block">
                      Retiro al finalizar actividades
                    </span>
                    <span className="font-extrabold">
                      {esVerdadero(datos.ret_autoriza_retirarse_solo)
                        ? 'Puede retirarse SOLO/A'
                        : 'NO se retira solo (Solo con autorizados)'}
                    </span>
                    {datos.ret_retiro_solo_aclaracion && (
                      <span className="block text-xs mt-0.5 opacity-80">
                        Nota: {datos.ret_retiro_solo_aclaracion}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border flex items-center gap-3 ${
                    esVerdadero(datos.confirma_autorizacion_salidas)
                      ? 'bg-brand/10 border-brand/30'
                      : 'bg-paper-2 border-rule'
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-brand shrink-0" />
                  <div className="text-[13px]">
                    <span className="text-xs font-semibold opacity-85 block">
                      Salidas Cercanas por el Día
                    </span>
                    <span className="font-extrabold text-ink">
                      {esVerdadero(datos.confirma_autorizacion_salidas)
                        ? 'Autorizado para salidas anuales'
                        : 'Sin autorización marcada'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lista de Personas Autorizadas a Retirar */}
              <div className="p-4 rounded-2xl bg-surface border border-rule/70 space-y-2.5">
                <span className="text-[13px] font-semibold text-ink-muted block">
                  Personas Autorizadas a Retirar al Menor
                </span>

                {personasRetiro.length === 0 ? (
                  <p className="text-[13px] text-ink-muted">
                    No se especificaron personas adicionales fuera de Madre / Padre.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {personasRetiro.map((p, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-paper-2 border border-rule flex items-center justify-between gap-2"
                      >
                        <div className="text-[13px]">
                          <span className="font-extrabold text-ink block">
                            {p.nombre}
                          </span>
                          <span className="text-xs text-ink-muted">
                            {p.vinculo ? `${p.vinculo} / ` : ''}DNI {valorTexto(p.dni)}
                          </span>
                        </div>

                        {p.telefono && (
                          <a
                            href={`tel:${p.telefono}`}
                            className="min-h-[40px] px-3.5 rounded-xl bg-brand/10 text-brand-ink font-bold text-[13px] flex items-center gap-1.5 shrink-0"
                          >
                            <Phone className="w-4 h-4" />
                            <span>{p.telefono}</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Adulto Firmante de Ingreso */}
              {datos.autorizante_nombre && (
                <div className="p-3.5 rounded-xl bg-paper-2 border border-rule text-[13px]">
                  <span className="text-xs font-semibold text-ink-muted block">
                    Adulto Firmante de las Autorizaciones
                  </span>
                  <span className="font-bold text-ink">
                    {datos.autorizante_nombre} ({valorTexto(datos.autorizante_caracter, 'Familiar')}) / DNI{' '}
                    {valorTexto(datos.autorizante_dni)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* SECCIÓN 4: APOYOS, ADAPTACIONES Y COLABORACIÓN             */}
          {/* ========================================================== */}
          {seccion === 'apoyos' && (
            <div className="space-y-3.5">
              {/* Necesidades Especiales y Pautas Pedagógicas */}
              <div className="p-4 rounded-2xl bg-surface border border-rule/70 space-y-2.5 text-[13px]">
                <span className="text-[13px] font-semibold text-ink-muted block">
                  Acompañamiento Pedagógico y Salud
                </span>

                {datos.ne_diagnostico ||
                datos.ne_situaciones_estres_abordaje ||
                datos.ne_descripcion_hijo_gustos_miedos ||
                datos.ne_expectativas_familia ||
                datos.comunicacion_educador_necesaria ? (
                  <div className="space-y-2.5">
                    {datos.ne_diagnostico && (
                      <div>
                        <span className="text-xs text-ink-muted block">Diagnóstico</span>
                        <span className="font-bold text-ink">
                          {datos.ne_diagnostico}
                        </span>
                      </div>
                    )}
                    {datos.ne_situaciones_estres_abordaje && (
                      <div>
                        <span className="text-xs text-ink-muted block">
                          Situaciones de estrés y cómo abordarlas
                        </span>
                        <span className="font-semibold text-ink-2">
                          {datos.ne_situaciones_estres_abordaje}
                        </span>
                      </div>
                    )}
                    {datos.ne_descripcion_hijo_gustos_miedos && (
                      <div>
                        <span className="text-xs text-ink-muted block">
                          Gustos, estímulos y miedos
                        </span>
                        <span className="font-semibold text-ink-2">
                          {datos.ne_descripcion_hijo_gustos_miedos}
                        </span>
                      </div>
                    )}
                    {datos.ne_expectativas_familia && (
                      <div>
                        <span className="text-xs text-ink-muted block">
                          Expectativas de la familia
                        </span>
                        <span className="font-semibold text-ink-2">
                          {datos.ne_expectativas_familia}
                        </span>
                      </div>
                    )}
                    {datos.comunicacion_educador_necesaria && (
                      <div className="p-3 rounded-xl bg-brand/10 border border-brand/40">
                        <span className="text-xs font-bold text-brand-ink block">
                          Pedido de comunicación con educadores:
                        </span>
                        <span className="font-bold text-ink">
                          {datos.comunicacion_educador_necesaria}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-ink-muted">
                    Sin observaciones pedagógicas ni adaptaciones especiales registradas.
                  </p>
                )}
              </div>

              {/* Adulto Colaborador */}
              <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-1.5 text-[13px]">
                <span className="text-xs font-semibold text-ink-muted block">
                  Colaboración Familiar
                </span>
                {esVerdadero(datos.completar_ficha_adultos) ? (
                  <div>
                    <span className="font-bold text-brand-ink block">
                      ✓ Familia disponible para colaborar ({valorTexto(datos.adulto_nombre, 'Familiar')})
                    </span>
                    {datos.adulto_profesion && (
                      <span className="text-ink-2 block">
                        Oficio / Profesión: {datos.adulto_profesion}
                      </span>
                    )}
                    {datos.adulto_observaciones && (
                      <span className="text-ink-muted block mt-1">
                        Nota: {datos.adulto_observaciones}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-ink-muted">No registró ficha de voluntariado adulto.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
