import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { useAuthStore } from '../store/authStore';
import {
  esFechaCalendarioValida,
  formatearFecha,
  rolRequiereRama,
  esRolDeProtagonista,
  esRolRama,
  esRolAlcanceGlobal,
} from '../lib/formatters';
import { exportarAExcel, exportarACSV } from '../utils/exportadorPlanillas';

export interface FilaImportada {
  idTemporal: string;
  dni: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string; // YYYY-MM-DD
  telefonoContacto: string;
  emailContacto: string;
  domicilio: string;
  estado: 'VALIDO_NUEVO' | 'VALIDO_EXISTENTE' | 'ERROR';
  motivoError?: string;
  miembroExistenteId?: number;
  nombreExistente?: string;
  datosFijosExistentes?: Record<string, any> | null;
}

export function construirPayloadActualizacionMiembro(
  fila: Pick<FilaImportada, 'telefonoContacto' | 'emailContacto' | 'domicilio'>,
  datosFijosExistentes?: Record<string, any> | null,
) {
  const tieneDatosFijosPrevios =
    datosFijosExistentes &&
    typeof datosFijosExistentes === 'object' &&
    !Array.isArray(datosFijosExistentes);

  return {
    telefonoContacto: fila.telefonoContacto || undefined,
    emailContacto: fila.emailContacto || undefined,
    datosFijosJson: fila.domicilio
      ? {
          ...(tieneDatosFijosPrevios ? datosFijosExistentes : {}),
          domicilio: fila.domicilio,
        }
      : undefined,
  };
}

export interface ModalImportarMiembrosProps {
  abierto: boolean;
  onCerrar: () => void;
  onImportado: () => void;
  unidadesDisponibles: any[];
  rolesDisponibles: any[];
  miembrosExistentes: any[];
}

function normalizarFechaNacimiento(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  // Si es número (serial de fecha de Excel)
  if (typeof valor === 'number') {
    if (valor > 0 && valor < 100000) {
      const fechaUtc = new Date(Math.round((valor - 25569) * 86400 * 1000));
      if (!isNaN(fechaUtc.getTime())) {
        return fechaUtc.toISOString().slice(0, 10);
      }
    }
  }

  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }

  const str = String(valor).trim();
  if (!str) return null;

  // ISO YYYY-MM-DD
  const matchIso = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (matchIso) {
    const y = Number(matchIso[1]);
    const m = Number(matchIso[2]);
    const d = Number(matchIso[3]);
    if (!esFechaCalendarioValida(y, m, d)) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const matchHisp = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (matchHisp) {
    const d = Number(matchHisp[1]);
    const m = Number(matchHisp[2]);
    const y = Number(matchHisp[3]);
    if (!esFechaCalendarioValida(y, m, d)) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

function encontrarValorPorColumna(fila: Record<string, any>, clavesPosibles: string[]): any {
  for (const [key, value] of Object.entries(fila)) {
    const keyNorm = key
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

    for (const clave of clavesPosibles) {
      const claveNorm = clave
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
      if (keyNorm === claveNorm || keyNorm.includes(claveNorm)) {
        return value;
      }
    }
  }
  return '';
}

export const ModalImportarMiembros: React.FC<ModalImportarMiembrosProps> = ({
  abierto,
  onCerrar,
  onImportado,
  unidadesDisponibles,
  rolesDisponibles,
  miembrosExistentes,
}) => {
  const { tieneGlobal } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [archivoNombre, setArchivoNombre] = useState<string | null>(null);
  const [filasParseadas, setFilasParseadas] = useState<FilaImportada[]>([]);
  const [procesandoArchivo, setProcesandoArchivo] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  // Asignación de Rama y Rol único para el lote en pantalla
  const [unidadId, setUnidadId] = useState<number | ''>('');
  const [rolId, setRolId] = useState<number | ''>('');

  // Opción ante DNIs existentes: actualizar info o no
  const [actualizarExistentes, setActualizarExistentes] = useState(false);

  // Estado de importación
  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [resumenFin, setResumenFin] = useState<{
    creados: number;
    actualizados: number;
    omitidos: number;
    errores: { fila: FilaImportada; mensaje: string }[];
    clavesGeneradas: { dni: string; nombre: string; apellido: string; claveTemporal: string }[];
  } | null>(null);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar: () => {
      if (!ejecutando) {
        limpiarEstado();
        onCerrar();
      }
    },
    bloqueado: ejecutando,
  });

  const limpiarEstado = () => {
    setArchivoNombre(null);
    setFilasParseadas([]);
    setProcesandoArchivo(false);
    setErrorGlobal(null);
    setUnidadId('');
    setRolId('');
    setActualizarExistentes(false);
    setEjecutando(false);
    setProgreso({ actual: 0, total: 0 });
    setResumenFin(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Filtrado de roles y unidades disponibles
  const esUnidadRama = (u: any) => u?.tipo === 'SECCION_RAMA' || u?.ramaId != null;

  const rolesFiltrados = useMemo(() => {
    let list = rolesDisponibles;
    if (!tieneGlobal()) {
      list = list.filter((r) => !esRolAlcanceGlobal(r));
    }
    const u = unidadesDisponibles.find((x) => x.id === Number(unidadId));
    if (u && esUnidadRama(u)) {
      const deRama = list.filter(esRolRama);
      return deRama.length > 0 ? deRama : list;
    }
    return list;
  }, [rolesDisponibles, unidadId, unidadesDisponibles, tieneGlobal]);

  const handleCambioUnidad = (nuevaUnidadId: number | '') => {
    setUnidadId(nuevaUnidadId);
    if (!nuevaUnidadId) return;
    const u = unidadesDisponibles.find((x) => x.id === nuevaUnidadId);
    if (u && esUnidadRama(u)) {
      const rActual = rolesDisponibles.find((r) => r.id === Number(rolId));
      if (!rActual || !rolRequiereRama(rActual)) {
        const prota =
          rolesDisponibles.find((r) => esRolDeProtagonista(r) && rolRequiereRama(r)) ||
          rolesDisponibles.find(esRolRama);
        if (prota) setRolId(prota.id);
      }
    }
  };

  // Procesamiento del archivo cargado
  const handleSeleccionarArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setArchivoNombre(archivo.name);
    setProcesandoArchivo(true);
    setErrorGlobal(null);
    setResumenFin(null);

    try {
      const XLSX = await import('xlsx');
      const buffer = await archivo.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      if (workbook.SheetNames.length === 0) {
        throw new Error('El archivo no contiene ninguna hoja de cálculo.');
      }

      const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
      const filasCrudas: Record<string, any>[] = XLSX.utils.sheet_to_json(primeraHoja, {
        defval: '',
      });

      if (filasCrudas.length === 0) {
        throw new Error('La hoja seleccionada está vacía.');
      }

      const dnisEnArchivo = new Set<string>();
      const resultado: FilaImportada[] = [];

      for (let i = 0; i < filasCrudas.length; i++) {
        const fila = filasCrudas[i];
        const idTemporal = `fila-${i + 1}`;

        const rawDni = String(
          encontrarValorPorColumna(fila, ['dni', 'documento', 'nrodocumento', 'cedula']),
        ).trim();
        const dniLimpio = rawDni.replace(/\D/g, '');

        const nombre = String(
          encontrarValorPorColumna(fila, ['nombre', 'nombres', 'primernombre']),
        ).trim();
        const apellido = String(
          encontrarValorPorColumna(fila, ['apellido', 'apellidos']),
        ).trim();

        const rawFecha = encontrarValorPorColumna(fila, [
          'fechanacimiento',
          'nacimiento',
          'fecnac',
          'fecha de nacimiento',
          'cumpleanos',
          'cumpleaños',
        ]);
        const fechaNacimiento = normalizarFechaNacimiento(rawFecha) || '';

        const rawTel = encontrarValorPorColumna(fila, [
          'telefono',
          'celular',
          'tel',
          'telefonocontacto',
        ]);
        const telefonoContacto = String(rawTel).trim();

        const rawEmail = encontrarValorPorColumna(fila, [
          'email',
          'correo',
          'mail',
          'correoelectronico',
        ]);
        const emailContacto = String(rawEmail).trim();

        const rawDom = encontrarValorPorColumna(fila, ['domicilio', 'direccion', 'calle']);
        const domicilio = String(rawDom).trim();

        // Validaciones de consistencia
        if (!dniLimpio || dniLimpio.length < 6 || dniLimpio.length > 10) {
          resultado.push({
            idTemporal,
            dni: rawDni || '(vacío)',
            nombre,
            apellido,
            fechaNacimiento,
            telefonoContacto,
            emailContacto,
            domicilio,
            estado: 'ERROR',
            motivoError: 'DNI inválido o vacío (debe tener entre 6 y 10 dígitos).',
          });
          continue;
        }

        if (dnisEnArchivo.has(dniLimpio)) {
          resultado.push({
            idTemporal,
            dni: dniLimpio,
            nombre,
            apellido,
            fechaNacimiento,
            telefonoContacto,
            emailContacto,
            domicilio,
            estado: 'ERROR',
            motivoError: 'DNI repetido dentro de la misma planilla.',
          });
          continue;
        }
        dnisEnArchivo.add(dniLimpio);

        if (!nombre || !apellido) {
          resultado.push({
            idTemporal,
            dni: dniLimpio,
            nombre,
            apellido,
            fechaNacimiento,
            telefonoContacto,
            emailContacto,
            domicilio,
            estado: 'ERROR',
            motivoError: 'Nombre y apellido son obligatorios.',
          });
          continue;
        }

        if (!fechaNacimiento) {
          resultado.push({
            idTemporal,
            dni: dniLimpio,
            nombre,
            apellido,
            fechaNacimiento,
            telefonoContacto,
            emailContacto,
            domicilio,
            estado: 'ERROR',
            motivoError: 'Fecha de nacimiento requerida (ej: YYYY-MM-DD o DD/MM/AAAA).',
          });
          continue;
        }

        // Cotejar si ya existe en el padrón
        const existente = miembrosExistentes.find((m) => String(m.dni).trim() === dniLimpio);

        if (existente) {
          resultado.push({
            idTemporal,
            dni: dniLimpio,
            nombre,
            apellido,
            fechaNacimiento,
            telefonoContacto,
            emailContacto,
            domicilio,
            estado: 'VALIDO_EXISTENTE',
            miembroExistenteId: existente.id,
            nombreExistente: `${existente.apellido}, ${existente.nombre}`,
            datosFijosExistentes: existente.datosFijosJson,
          });
        } else {
          resultado.push({
            idTemporal,
            dni: dniLimpio,
            nombre,
            apellido,
            fechaNacimiento,
            telefonoContacto,
            emailContacto,
            domicilio,
            estado: 'VALIDO_NUEVO',
          });
        }
      }

      setFilasParseadas(resultado);
    } catch (err: any) {
      setErrorGlobal(err.message || 'Error al procesar la hoja de cálculo.');
      setFilasParseadas([]);
    } finally {
      setProcesandoArchivo(false);
    }
  };

  // Contadores reactivos
  const totalValidosNuevos = useMemo(
    () => filasParseadas.filter((f) => f.estado === 'VALIDO_NUEVO').length,
    [filasParseadas],
  );
  const totalExistentes = useMemo(
    () => filasParseadas.filter((f) => f.estado === 'VALIDO_EXISTENTE').length,
    [filasParseadas],
  );
  const totalErrores = useMemo(
    () => filasParseadas.filter((f) => f.estado === 'ERROR').length,
    [filasParseadas],
  );

  // Descarga de plantillas de ejemplo
  const handleDescargarPlantilla = async (tipo: 'xlsx' | 'csv') => {
    const columnasEjemplo = [
      { header: 'DNI', clave: 'dni' },
      { header: 'Apellido', clave: 'apellido' },
      { header: 'Nombre', clave: 'nombre' },
      { header: 'Fecha de Nacimiento', clave: 'fechaNacimiento' },
      { header: 'Teléfono', clave: 'telefonoContacto' },
      { header: 'Email', clave: 'emailContacto' },
      { header: 'Domicilio', clave: 'domicilio' },
    ];

    const datosEjemplo = [
      {
        dni: '45123456',
        apellido: 'González',
        nombre: 'Martín',
        fechaNacimiento: '2012-05-14',
        telefonoContacto: '1145678901',
        emailContacto: 'martin.gonzalez@ejemplo.com',
        domicilio: 'San Martín 1234',
      },
      {
        dni: '47987654',
        apellido: 'Fernández',
        nombre: 'Sofía',
        fechaNacimiento: '2014-09-22',
        telefonoContacto: '1198765432',
        emailContacto: 'sofia.fernandez@ejemplo.com',
        domicilio: 'Av. Belgrano 567',
      },
    ];

    if (tipo === 'xlsx') {
      await exportarAExcel({
        nombreArchivo: 'Plantilla_Importar_Miembros_Scout',
        nombreHoja: 'Miembros',
        columnas: columnasEjemplo,
        filas: datosEjemplo,
      });
    } else {
      exportarACSV({
        nombreArchivo: 'Plantilla_Importar_Miembros_Scout',
        columnas: columnasEjemplo,
        filas: datosEjemplo,
      });
    }
  };

  // Ejecución de la importación
  const handleConfirmarImportacion = async () => {
    if (!rolId) {
      setErrorGlobal('Debes seleccionar una Función (Rol) para asignar al lote.');
      return;
    }
    const rolSel = rolesDisponibles.find((r) => r.id === Number(rolId));
    if (rolRequiereRama(rolSel) && !unidadId) {
      setErrorGlobal('Esta función requiere seleccionar una Rama / Unidad asignada.');
      return;
    }

    setEjecutando(true);
    setErrorGlobal(null);

    const aProcesar = filasParseadas.filter(
      (f) => f.estado === 'VALIDO_NUEVO' || (f.estado === 'VALIDO_EXISTENTE' && actualizarExistentes),
    );

    setProgreso({ actual: 0, total: aProcesar.length });

    let creados = 0;
    let actualizados = 0;
    let omitidos = filasParseadas.filter(
      (f) => f.estado === 'VALIDO_EXISTENTE' && !actualizarExistentes,
    ).length;
    const errores: { fila: FilaImportada; mensaje: string }[] = [];
    const clavesGeneradas: { dni: string; nombre: string; apellido: string; claveTemporal: string }[] = [];

    for (let i = 0; i < aProcesar.length; i++) {
      const f = aProcesar[i];
      setProgreso({ actual: i + 1, total: aProcesar.length });

      try {
        if (f.estado === 'VALIDO_NUEVO') {
          const resAlta = await api.post('/miembros', {
            dni: f.dni,
            nombre: f.nombre,
            apellido: f.apellido,
            fechaNacimiento: f.fechaNacimiento,
            unidadId: unidadId ? Number(unidadId) : undefined,
            rolId: Number(rolId),
            telefonoContacto: f.telefonoContacto || undefined,
            emailContacto: f.emailContacto || undefined,
            datosFijosJson: f.domicilio ? { domicilio: f.domicilio } : undefined,
          });
          creados++;
          if (resAlta.data?.claveTemporal) {
            clavesGeneradas.push({
              dni: f.dni,
              nombre: f.nombre,
              apellido: f.apellido,
              claveTemporal: resAlta.data.claveTemporal,
            });
          }
        } else if (f.estado === 'VALIDO_EXISTENTE' && actualizarExistentes && f.miembroExistenteId) {
          let datosFijosBase = f.datosFijosExistentes;
          if (f.domicilio && datosFijosBase === undefined) {
            const resMiembro = await api.get(`/miembros/${f.miembroExistenteId}`);
            datosFijosBase = resMiembro.data?.datosFijosJson ?? null;
          }
          await api.patch(
            `/miembros/${f.miembroExistenteId}`,
            construirPayloadActualizacionMiembro(f, datosFijosBase),
          );
          actualizados++;
        }
      } catch (err: any) {
        errores.push({
          fila: f,
          mensaje: err.response?.data?.message || err.message || 'Error al guardar registro.',
        });
      }
    }

    setEjecutando(false);
    setResumenFin({ creados, actualizados, omitidos, errores, clavesGeneradas });
    onImportado();
  };

  if (!abierto) return null;

  return (
    <div
      {...backdropProps}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none overflow-y-auto"
    >
      <div
        {...contentProps}
        className="relative w-full max-w-3xl bg-surface border border-rule rounded-2xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-rule flex items-center justify-between gap-3 bg-paper-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-ink leading-tight">
                Importar Miembros desde Hoja de Cálculo
              </h2>
              <p className="text-xs text-ink-muted">
                Carga un archivo Excel (.xlsx) o CSV con el listado de personas
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={ejecutando}
            onClick={() => {
              limpiarEstado();
              onCerrar();
            }}
            aria-label="Cerrar modal"
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-paper-3 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {errorGlobal && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorGlobal}</span>
            </div>
          )}

          {/* Resumen de éxito al finalizar */}
          {resumenFin ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-extrabold text-sm">
                    ¡Proceso de importación finalizado!
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                  <div className="p-2 bg-surface rounded-xl border border-rule">
                    <span className="block font-black text-lg text-emerald-600">
                      {resumenFin.creados}
                    </span>
                    <span className="text-[11px] text-ink-muted font-semibold">Nuevos Creados</span>
                  </div>
                  <div className="p-2 bg-surface rounded-xl border border-rule">
                    <span className="block font-black text-lg text-blue-600">
                      {resumenFin.actualizados}
                    </span>
                    <span className="text-[11px] text-ink-muted font-semibold">Actualizados</span>
                  </div>
                  <div className="p-2 bg-surface rounded-xl border border-rule">
                    <span className="block font-black text-lg text-ink-muted">
                      {resumenFin.omitidos}
                    </span>
                    <span className="text-[11px] text-ink-muted font-semibold">Omitidos</span>
                  </div>
                </div>
              </div>

              {resumenFin.clavesGeneradas.length > 0 && (
                <div className="p-3.5 bg-paper-2 border border-rule rounded-2xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-ink">
                      Claves temporales generadas ({resumenFin.clavesGeneradas.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        exportarACSV({
                          nombreArchivo: 'claves-temporales-alta',
                          columnas: [
                            { header: 'DNI', clave: 'dni' },
                            { header: 'Apellido', clave: 'apellido' },
                            { header: 'Nombre', clave: 'nombre' },
                            { header: 'Clave Temporal', clave: 'claveTemporal' },
                          ],
                          filas: resumenFin.clavesGeneradas,
                        })
                      }
                      className="min-h-[34px] px-3 rounded-lg border border-rule bg-surface hover:bg-paper-3 text-ink font-bold text-[11px] cursor-pointer"
                    >
                      Descargar CSV de claves
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-rule bg-surface">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-paper-2 text-ink-muted border-b border-rule sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2.5">DNI</th>
                          <th className="py-1.5 px-2.5">Miembro</th>
                          <th className="py-1.5 px-2.5">Clave Temporal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {resumenFin.clavesGeneradas.map((c) => (
                          <tr key={c.dni}>
                            <td className="py-1.5 px-2.5 font-semibold text-ink">{c.dni}</td>
                            <td className="py-1.5 px-2.5 text-ink-2">
                              {c.apellido}, {c.nombre}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono font-bold text-ink select-all">
                              {c.claveTemporal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {resumenFin.errores.length > 0 && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl space-y-2">
                  <span className="font-bold text-rose-700 dark:text-rose-300 block">
                    Observaciones ({resumenFin.errores.length} registros no pudieron guardarse):
                  </span>
                  <ul className="space-y-1 max-h-36 overflow-y-auto text-ink-2 pl-2">
                    {resumenFin.errores.map((err, i) => (
                      <li key={i} className="list-disc list-inside">
                        <strong>DNI {err.fila.dni}</strong> ({err.fila.apellido}, {err.fila.nombre}):{' '}
                        {err.mensaje}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Sección 1: Carga del Archivo y Descarga de Plantilla */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="font-bold text-ink">
                    1. Selecciona o arrastra el archivo de la planilla:
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted font-medium">
                      Descargar modelo:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDescargarPlantilla('xlsx')}
                      className="px-2 py-1 rounded-lg border border-rule hover:bg-paper-2 text-ink font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                      <span>Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDescargarPlantilla('csv')}
                      className="px-2 py-1 rounded-lg border border-rule hover:bg-paper-2 text-ink font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <FileText className="w-3 h-3 text-blue-600" />
                      <span>CSV (.csv)</span>
                    </button>
                  </div>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-rule hover:border-brand/60 rounded-2xl p-6 text-center bg-paper-2 hover:bg-paper-3/60 transition cursor-pointer flex flex-col items-center justify-center gap-2.5"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleSeleccionarArchivo}
                    className="hidden"
                  />
                  {procesandoArchivo ? (
                    <div className="flex items-center gap-2 text-brand font-bold py-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Leyendo y analizando archivo...</span>
                    </div>
                  ) : archivoNombre ? (
                    <div className="flex items-center gap-2 text-ink font-bold">
                      <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                      <span className="text-sm truncate max-w-md">{archivoNombre}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-brand/10 text-brand">
                        Cambiar
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="font-bold text-ink block sm:text-sm">
                          Haz clic aquí para seleccionar tu archivo Excel o CSV
                        </span>
                        <span className="text-ink-muted text-[11px] block mt-0.5">
                          Formatos aceptados: .xlsx, .xls, .csv (columnas: DNI, Nombre, Apellido, Fecha de Nacimiento)
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Sección 2: Asignación Masiva de Rama y Rol (para todos en el lote) */}
              <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3">
                <label className="font-bold text-ink block">
                  2. Asignar Rama / Sección y Función para este lote:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-ink-muted block mb-1">
                      Rama / Sección de destino:
                    </label>
                    <select
                      value={unidadId}
                      onChange={(e) => handleCambioUnidad(Number(e.target.value) || '')}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-rule bg-surface text-ink text-xs font-semibold focus:border-brand outline-none cursor-pointer"
                    >
                      <option value="">-- Seleccionar Rama / Sección --</option>
                      {unidadesDisponibles.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-ink-muted block mb-1">
                      Función / Rol asignado:
                    </label>
                    <select
                      value={rolId}
                      onChange={(e) => setRolId(Number(e.target.value) || '')}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-rule bg-surface text-ink text-xs font-semibold focus:border-brand outline-none cursor-pointer"
                    >
                      <option value="">-- Seleccionar Rol / Función --</option>
                      {rolesFiltrados.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección 3: Previsualización y Manejo de Conflictos de DNI */}
              {filasParseadas.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-ink">
                      3. Previsualización de los datos ({filasParseadas.length} filas):
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                        {totalValidosNuevos} Nuevos
                      </span>
                      {totalExistentes > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          {totalExistentes} Ya Registrados
                        </span>
                      )}
                      {totalErrores > 0 && (
                        <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                          {totalErrores} Con Errores
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Banner interactivo si hay DNIs existentes */}
                  {totalExistentes > 0 && (
                    <div className="p-3.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-amber-900 dark:text-amber-200 block text-xs">
                            Se encontraron {totalExistentes} personas cuyo DNI ya existe en el grupo.
                          </span>
                          <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80 block mt-0.5">
                            Puedes actualizar sus datos de contacto (teléfono, email, domicilio) o dejarlos intactos.
                          </span>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer select-none bg-surface px-3 py-1.5 rounded-xl border border-rule shrink-0">
                        <input
                          type="checkbox"
                          checked={actualizarExistentes}
                          onChange={(e) => setActualizarExistentes(e.target.checked)}
                          className="w-4 h-4 rounded accent-brand cursor-pointer"
                        />
                        <span className="text-xs font-bold text-ink">
                          Actualizar existentes
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Tabla de previsualización */}
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-rule bg-surface shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-paper-2 text-ink-muted border-b border-rule sticky top-0 font-bold">
                        <tr>
                          <th className="py-2 px-3">Estado</th>
                          <th className="py-2 px-3">DNI</th>
                          <th className="py-2 px-3">Nombre y Apellido</th>
                          <th className="py-2 px-3">Fecha Nac.</th>
                          <th className="py-2 px-3">Teléfono</th>
                          <th className="py-2 px-3">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule">
                        {filasParseadas.map((f) => (
                          <tr
                            key={f.idTemporal}
                            className={
                              f.estado === 'ERROR'
                                ? 'bg-rose-50/50 dark:bg-rose-950/20'
                                : f.estado === 'VALIDO_EXISTENTE'
                                ? 'bg-amber-50/50 dark:bg-amber-950/20'
                                : 'hover:bg-paper-2 transition-colors'
                            }
                          >
                            <td className="py-2 px-3 whitespace-nowrap">
                              {f.estado === 'VALIDO_NUEVO' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Nuevo</span>
                                </span>
                              )}
                              {f.estado === 'VALIDO_EXISTENTE' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600" title={`Ya registrado: ${f.nombreExistente}`}>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>{actualizarExistentes ? 'Se Actualizará' : 'Se Omitirá'}</span>
                                </span>
                              )}
                              {f.estado === 'ERROR' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600" title={f.motivoError}>
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>Error</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-semibold text-ink whitespace-nowrap">
                              {f.dni}
                            </td>
                            <td className="py-2 px-3 text-ink">
                              {f.apellido ? `${f.apellido}, ${f.nombre}` : '-'}
                              {f.motivoError && (
                                <span className="block text-[10px] text-rose-600 font-medium mt-0.5">
                                  {f.motivoError}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-ink-2 whitespace-nowrap">
                              {f.fechaNacimiento ? formatearFecha(f.fechaNacimiento) : '-'}
                            </td>
                            <td className="py-2 px-3 text-ink-2 whitespace-nowrap">
                              {f.telefonoContacto || '-'}
                            </td>
                            <td className="py-2 px-3 text-ink-2 truncate max-w-[140px]">
                              {f.emailContacto || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Barra de Progreso en ejecución */}
          {ejecutando && (
            <div className="p-4 bg-paper-2 rounded-2xl border border-rule space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-ink">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-brand" />
                  <span>Importando miembros al padrón...</span>
                </span>
                <span>
                  {progreso.actual} de {progreso.total}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-paper-3 overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-200"
                  style={{
                    width: `${progreso.total > 0 ? (progreso.actual / progreso.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-rule flex items-center justify-end gap-2.5 bg-paper-2 shrink-0">
          {resumenFin ? (
            <button
              type="button"
              onClick={() => {
                limpiarEstado();
                onCerrar();
              }}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-brand-contrast font-bold text-xs hover:opacity-95 transition cursor-pointer"
            >
              Cerrar y Ver Padrón
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={ejecutando}
                onClick={() => {
                  limpiarEstado();
                  onCerrar();
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-rule hover:bg-paper-3 text-ink font-semibold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  ejecutando ||
                  filasParseadas.length === 0 ||
                  !rolId ||
                  (totalValidosNuevos === 0 && (!actualizarExistentes || totalExistentes === 0))
                }
                onClick={handleConfirmarImportacion}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-brand text-brand-contrast font-bold text-xs hover:opacity-95 transition cursor-pointer disabled:opacity-50 disabled:pointer-events-none shadow-2xs flex items-center gap-2"
              >
                {ejecutando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importando...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>
                      Importar{' '}
                      {totalValidosNuevos + (actualizarExistentes ? totalExistentes : 0)}{' '}
                      Personas
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
