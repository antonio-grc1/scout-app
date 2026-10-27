import React, { useState } from 'react';
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
} from 'lucide-react';
import { PdfViewerModal } from './PdfViewerModal';

interface VisorFichaMiembroProps {
  miembro: any;
  entrega?: any | null;
  pdfPreviewUrl?: string | null;
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
  pdfPreviewUrl,
  onCerrarPdfPreview,
  onDescargarPdf,
}) => {
  const [seccion, setSeccion] = useState<SeccionVista>('salud');

  // Combinamos los datos del snapshot de la entrega con los datos fijos del usuario
  const datos: Record<string, any> = {
    ...(miembro?.datosFijosJson || {}),
    ...(entrega?.respuestasSnapshotJson || {}),
  };

  const tieneDatosCargados =
    Boolean(entrega?.respuestasSnapshotJson) ||
    Object.keys(miembro?.datosFijosJson || {}).length > 0;

  // Recopilación de alertas médicas activas para vista rápida de emergencia
  const alertasMedicas: { titulo: string; detalle?: string; critico?: boolean }[] = [];

  if (esVerdadero(datos.sufre_alergia) || datos.alergias || datos.sufre_alergia_detalle) {
    alertasMedicas.push({
      titulo: 'Alergias',
      detalle: valorTexto(datos.sufre_alergia_detalle || datos.alergias, 'Sí (sin detalle especificado)'),
      critico: true,
    });
  }
  if (esVerdadero(datos.toma_medicacion) || datos.toma_medicacion_detalle) {
    alertasMedicas.push({
      titulo: 'Toma medicación',
      detalle: valorTexto(datos.toma_medicacion_detalle, 'Sí'),
      critico: true,
    });
  }
  if (esVerdadero(datos.enfermedad_cronica) || datos.enfermedad_cronica_detalle) {
    alertasMedicas.push({
      titulo: 'Enfermedad crónica',
      detalle: valorTexto(datos.enfermedad_cronica_detalle, 'Sí'),
      critico: true,
    });
  }
  if (esVerdadero(datos.requiere_tratamiento) || datos.requiere_tratamiento_detalle) {
    alertasMedicas.push({
      titulo: 'Tratamiento médico activo',
      detalle: valorTexto(datos.requiere_tratamiento_detalle, 'Sí'),
      critico: true,
    });
  }
  if (esVerdadero(datos.esta_anticoagulado) || datos.anticoagulado_droga) {
    alertasMedicas.push({
      titulo: 'Anticoagulado/a',
      detalle: valorTexto(datos.anticoagulado_droga, 'Sí'),
      critico: true,
    });
  }
  if (esVerdadero(datos.regimen_dietario) || datos.regimen_dietario_detalle) {
    alertasMedicas.push({
      titulo: 'Dieta / Régimen alimentario',
      detalle: valorTexto(datos.regimen_dietario_detalle, 'Sí'),
    });
  }
  if (esVerdadero(datos.tiene_cud)) {
    alertasMedicas.push({
      titulo: 'Posee CUD (Certificado de Discapacidad)',
      detalle: valorTexto(datos.ne_diagnostico || datos.ne_cud_vencimiento_prestacion, 'Sí'),
    });
  }
  if (esVerdadero(datos.ataques_panico_ansiedad) || datos.ataques_panico_frecuencia) {
    alertasMedicas.push({
      titulo: 'Ataques de pánico / ansiedad',
      detalle: valorTexto(datos.ataques_panico_frecuencia, 'Sí'),
    });
  }
  if (esVerdadero(datos.diagnostico_salud_mental) || datos.diagnostico_salud_mental_detalle) {
    alertasMedicas.push({
      titulo: 'Diagnóstico de salud mental',
      detalle: valorTexto(datos.diagnostico_salud_mental_detalle, 'Sí'),
    });
  }
  if (esVerdadero(datos.recibe_tratamiento_salud_mental) || datos.recibe_tratamiento_salud_mental_detalle) {
    alertasMedicas.push({
      titulo: 'Tratamiento de salud mental',
      detalle: valorTexto(datos.recibe_tratamiento_salud_mental_detalle, 'Sí'),
    });
  }
  if (esVerdadero(datos.miedo_fobia_excesivo) || datos.miedo_fobia_detalle) {
    alertasMedicas.push({
      titulo: 'Miedo o fobia puntual',
      detalle: valorTexto(datos.miedo_fobia_detalle, 'Sí'),
    });
  }
  if (
    datos.sit_cualquier_actividad_fisica === false ||
    datos.sit_actividad_fisica_no_especifique
  ) {
    alertasMedicas.push({
      titulo: 'Restricción de actividad física',
      detalle: valorTexto(datos.sit_actividad_fisica_no_especifique, 'No puede realizar cualquier actividad'),
      critico: true,
    });
  }

  // Situaciones clínicas puntuales marcadas como verdaderas
  const situacionesPuntuales: string[] = [];
  if (esVerdadero(datos.sit_hemorragias_nasales)) situacionesPuntuales.push('Hemorragias nasales');
  if (esVerdadero(datos.sit_sangrado_encias)) situacionesPuntuales.push('Sangrado de encías');
  if (esVerdadero(datos.sit_dolor_cabeza)) situacionesPuntuales.push('Dolor de cabeza frecuente');
  if (esVerdadero(datos.sit_presion_alta)) situacionesPuntuales.push('Presión alta');
  if (esVerdadero(datos.sit_presion_baja)) situacionesPuntuales.push('Presión baja');
  if (esVerdadero(datos.sit_transfusiones)) situacionesPuntuales.push('Recibió transfusiones');
  if (esVerdadero(datos.sit_convulsiones)) situacionesPuntuales.push('Antecedente de convulsiones');
  if (esVerdadero(datos.sit_cirugias_ultimo_anio)) situacionesPuntuales.push('Cirugía en el último año');
  if (esVerdadero(datos.sit_internaciones_ultimo_anio)) situacionesPuntuales.push('Internación en el último año');

  const telEmergencia1 =
    datos.tel_emergencia_1 ||
    datos.telefono_urgencias ||
    datos.madre_telefono ||
    miembro?.telefonoContacto ||
    '';
  const telEmergencia2 = datos.tel_emergencia_2 || datos.padre_telefono || '';

  const grupoSanguineo = datos.grupo_sanguineo
    ? `${datos.grupo_sanguineo} ${datos.factor_rh || ''}`.trim()
    : 'Sin especificar';

  const obraSocial = valorTexto(datos.obra_social);
  const afiliadoObraSocial = valorTexto(datos.obra_social_afiliado, '');

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
      <PdfViewerModal
        url={pdfPreviewUrl}
        titulo={`Vista Previa: ${miembro?.apellido || ''}, ${miembro?.nombre || ''}`}
        subtitulo="Planilla Oficial 2026"
        onCerrar={onCerrarPdfPreview}
        onDescargar={onDescargarPdf}
      />

      {!tieneDatosCargados ? (
        <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-1.5">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Este miembro todavía no tiene respuestas cargadas en su ficha digital.
          </p>
          <p className="text-[11px] text-slate-400">
            Tocá &ldquo;Rellenar Ficha&rdquo; arriba para completarla desde el celular.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Selector de Secciones de la Ficha (Mobile-First Chips) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-2xl">
            <button
              type="button"
              onClick={() => setSeccion('salud')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'salud'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5 shrink-0" />
              <span>Salud</span>
              {alertasMedicas.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSeccion('familia')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'familia'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>Familia</span>
            </button>

            <button
              type="button"
              onClick={() => setSeccion('retiro')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'retiro'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Retiro y Salidas</span>
            </button>

            <button
              type="button"
              onClick={() => setSeccion('apoyos')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                seccion === 'apoyos'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Apoyos</span>
            </button>
          </div>

          {/* ========================================================== */}
          {/* SECCIÓN 1: SALUD Y EMERGENCIAS                             */}
          {/* ========================================================== */}
          {seccion === 'salud' && (
            <div className="space-y-3">
              {/* Tarjeta Rápida de Biometría y Cobertura */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50">
                  <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 block">
                    Grupo y Factor
                  </span>
                  <span className="text-base font-black text-rose-900 dark:text-rose-100">
                    {grupoSanguineo}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Peso / Talla
                  </span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                    {datos.peso_kg ? `${datos.peso_kg} kg` : '—'} •{' '}
                    {datos.talla_m ? `${datos.talla_m} m` : '—'}
                  </span>
                </div>

                <div className="col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Obra Social / Prepaga
                  </span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block truncate">
                    {obraSocial}
                    {afiliadoObraSocial ? ` (Afiliado: ${afiliadoObraSocial})` : ''}
                  </span>
                </div>
              </div>

              {/* Teléfonos de Emergencia con 1-Tap Call */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70 space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Teléfonos de Emergencia
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {telEmergencia1 ? (
                    <a
                      href={`tel:${telEmergencia1}`}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-2 text-emerald-900 dark:text-emerald-200 font-bold text-xs"
                    >
                      <div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">
                          Emergencia 1
                        </span>
                        <span>{telEmergencia1}</span>
                      </div>
                      <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    </a>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-400">
                      Sin teléfono de emergencia 1
                    </div>
                  )}

                  {telEmergencia2 && (
                    <a
                      href={`tel:${telEmergencia2}`}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-2 text-emerald-900 dark:text-emerald-200 font-bold text-xs"
                    >
                      <div>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">
                          Emergencia 2
                        </span>
                        <span>{telEmergencia2}</span>
                      </div>
                      <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    </a>
                  )}
                </div>
              </div>

              {/* Alertas Médicas y Condiciones Declaradas */}
              {alertasMedicas.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500 block">
                    Atención Médica a Tener en Cuenta
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    {alertasMedicas.map((al, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                          al.critico
                            ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/80 text-rose-950 dark:text-rose-100'
                            : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
                        }`}
                      >
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            al.critico ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600'
                          }`}
                        />
                        <div className="text-xs">
                          <span className="font-extrabold block">{al.titulo}</span>
                          {al.detalle && <span className="opacity-90">{al.detalle}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Sin alergias, medicaciones ni alertas médicas críticas declaradas.</span>
                </div>
              )}

              {/* Situaciones clínicas y Vacunas */}
              {situacionesPuntuales.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <span className="text-[11px] font-extrabold uppercase text-slate-400 block">
                    Antecedentes Clínicos
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {situacionesPuntuales.map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Syringe className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-extrabold uppercase">Vacunas y Controles</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Quíntuple</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {valorTexto(datos.vacuna_quintuple)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Triple Celular</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {valorTexto(datos.vacuna_triple_celular)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Triple Acelular</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {valorTexto(datos.vacuna_triple_acelular)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Doble Bacteriana</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
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
            <div className="space-y-3">
              {/* Domicilio y Escuela del Protagonista */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Domicilio Real
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {valorTexto(datos.protagonista_domicilio || datos.domicilio)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Escolaridad
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {valorTexto(datos.escolaridad_institucion)}
                      {datos.escolaridad_grado ? ` (${datos.escolaridad_grado})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tarjetas de Madre, Padre y Tutor */}
              <div className="grid grid-cols-1 gap-2.5">
                {familiares.map((fam) => (
                  <div
                    key={fam.rol}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                          {fam.rol}
                        </span>
                        <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                          {valorTexto(fam.nombre, 'Sin completar')}
                        </span>
                      </div>

                      {fam.telefono && (
                        <a
                          href={`tel:${fam.telefono}`}
                          className="min-h-[38px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>{fam.telefono}</span>
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/50 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">DNI</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {valorTexto(fam.dni)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Ocupación</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {valorTexto(fam.profesion)}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-400 block">Email</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block">
                          {valorTexto(fam.email)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 block">Domicilio</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {valorTexto(fam.domicilio)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Convive</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
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
            <div className="space-y-3">
              {/* Badges de Permisos Clave */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                    esVerdadero(datos.ret_autoriza_retirarse_solo)
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <Car className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <span className="text-[10px] font-bold uppercase opacity-75 block">
                      Retiro al finalizar actividades
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      {esVerdadero(datos.ret_autoriza_retirarse_solo)
                        ? 'Puede retirarse SOLO/A'
                        : 'NO se retira solo (Solo con autorizados)'}
                    </span>
                    {datos.ret_retiro_solo_aclaracion && (
                      <span className="block text-[11px] mt-0.5 opacity-80">
                        Nota: {datos.ret_retiro_solo_aclaracion}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                    esVerdadero(datos.confirma_autorizacion_salidas)
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <span className="text-[10px] font-bold uppercase opacity-75 block">
                      Salidas Cercanas por el Día
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      {esVerdadero(datos.confirma_autorizacion_salidas)
                        ? 'Autorizado para salidas anuales'
                        : 'Sin autorización marcada'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lista de Personas Autorizadas a Retirar */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Personas Autorizadas a Retirar al Menor
                </span>

                {personasRetiro.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No se especificaron personas adicionales fuera de Madre / Padre.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {personasRetiro.map((p, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2"
                      >
                        <div className="text-xs">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 block">
                            {p.nombre}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.vinculo ? `${p.vinculo} • ` : ''}DNI {valorTexto(p.dni)}
                          </span>
                        </div>

                        {p.telefono && (
                          <a
                            href={`tel:${p.telefono}`}
                            className="min-h-[36px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 shrink-0"
                          >
                            <Phone className="w-3.5 h-3.5" />
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
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Adulto Firmante de las Autorizaciones
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {datos.autorizante_nombre} ({valorTexto(datos.autorizante_caracter, 'Familiar')}) • DNI{' '}
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
            <div className="space-y-3">
              {/* Necesidades Especiales y Pautas Pedagógicas */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-2.5 text-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Acompañamiento Pedagógico y Salud
                </span>

                {datos.ne_diagnostico ||
                datos.ne_situaciones_estres_abordaje ||
                datos.ne_descripcion_hijo_gustos_miedos ||
                datos.ne_expectativas_familia ||
                datos.comunicacion_educador_necesaria ? (
                  <div className="space-y-2">
                    {datos.ne_diagnostico && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">Diagnóstico</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {datos.ne_diagnostico}
                        </span>
                      </div>
                    )}
                    {datos.ne_situaciones_estres_abordaje && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">
                          Situaciones de estrés y cómo abordarlas
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {datos.ne_situaciones_estres_abordaje}
                        </span>
                      </div>
                    )}
                    {datos.ne_descripcion_hijo_gustos_miedos && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">
                          Gustos, estímulos y miedos
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {datos.ne_descripcion_hijo_gustos_miedos}
                        </span>
                      </div>
                    )}
                    {datos.ne_expectativas_familia && (
                      <div>
                        <span className="text-[10px] text-slate-400 block">
                          Expectativas de la familia
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {datos.ne_expectativas_familia}
                        </span>
                      </div>
                    )}
                    {datos.comunicacion_educador_necesaria && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 block">
                          Pedido de comunicación con educadores:
                        </span>
                        <span className="font-bold text-amber-950 dark:text-amber-100">
                          {datos.comunicacion_educador_necesaria}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500">
                    Sin observaciones pedagógicas ni adaptaciones especiales registradas.
                  </p>
                )}
              </div>

              {/* Adulto Colaborador */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-xs">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Colaboración Familiar
                </span>
                {esVerdadero(datos.completar_ficha_adultos) ? (
                  <div>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 block">
                      ✓ Familia disponible para colaborar ({valorTexto(datos.adulto_nombre, 'Familiar')})
                    </span>
                    {datos.adulto_profesion && (
                      <span className="text-slate-600 dark:text-slate-300 block">
                        Oficio / Profesión: {datos.adulto_profesion}
                      </span>
                    )}
                    {datos.adulto_observaciones && (
                      <span className="text-slate-500 block mt-1">
                        Nota: {datos.adulto_observaciones}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500">No registró ficha de voluntariado adulto.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
