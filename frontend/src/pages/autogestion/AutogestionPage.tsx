import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { DynamicFormRenderer, type EsquemaCampos } from '../../components/DynamicFormRenderer';
import { Navbar } from '../../components/Navbar';
import { descargarPdfBlob, generarFichaPdf, type MapeoPdf } from '../../services/pdfGenerator';
import { useAuthStore } from '../../store/authStore';
import {
  FileText,
  Download,
  CheckCircle,
  Clock,
  AlertTriangle,
  CreditCard,
  Info,
  ShieldAlert,
  Printer,
  Sparkles,
  Receipt,
  CheckCircle2,
} from 'lucide-react';

export const AutogestionPage: React.FC = () => {
  const { usuario, asignaciones, tieneUnidad, tieneGlobal } = useAuthStore();
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<any | null>(null);
  const [precarga, setPrecarga] = useState<any | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);

  useEffect(() => {
    cargarPlantillas();
    if (usuario) {
      cargarEstadoCuenta(usuario.id);
    }
  }, [usuario]);

  const cargarPlantillas = async () => {
    try {
      const res = await api.get('/legajos/plantillas?cicloAnio=2026');
      setPlantillas(res.data);
      if (res.data.length > 0) {
        seleccionarPlantilla(res.data[0]);
      }
    } catch (err) {
      console.error('Error al cargar plantillas', err);
    }
  };

  const cargarEstadoCuenta = async (usuarioId: number) => {
    try {
      const res = await api.get(`/tesoreria/estado-cuenta/${usuarioId}`);
      setEstadoCuenta(res.data);
    } catch (err) {
      console.error('Error al cargar estado de cuenta', err);
    }
  };

  const seleccionarPlantilla = async (plantilla: any) => {
    setPlantillaSeleccionada(plantilla);
    setCargando(true);
    setMensaje(null);
    try {
      if (!usuario) return;
      const res = await api.get(
        `/legajos/miembro/${usuario.id}/plantilla/${plantilla.id}/precarga?cicloAnio=2026`,
      );
      setPrecarga(res.data);
    } catch (err) {
      console.error('Error al precargar', err);
    } finally {
      setCargando(false);
    }
  };

  const handleDescargarCopiaPdf = async () => {
    if (!usuario || !plantillaSeleccionada || !precarga?.ultimaEntrega) return;
    setCargando(true);
    setMensaje('Generando copia del documento PDF oficial...');
    try {
      const entrega = precarga.ultimaEntrega;
      const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson;

      const ramaNombre =
        precarga.usuario?.asignaciones?.[0]?.unidad?.nombre ||
        asignaciones?.[0]?.unidadNombre ||
        '';

      const usuarioParaPdf = {
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        dni: usuario.dni,
        fechaNacimiento: precarga.usuario?.fechaNacimiento,
        ramaNombre,
        telefonoContacto: precarga.usuario?.telefonoContacto,
      };

      const pdfBytes = await generarFichaPdf(
        mapeo,
        entrega.respuestasSnapshotJson || {},
        entrega.hashVerificacion,
        usuarioParaPdf,
        entrega.versionImpresion,
      );

      descargarPdfBlob(pdfBytes, `Legajo_${usuario.dni}_V${entrega.versionImpresion}.pdf`);
      setMensaje(`Documento oficial V${entrega.versionImpresion} descargado exitosamente.`);
    } catch (err: any) {
      setMensaje(err.message || 'Error al generar copia PDF.');
    } finally {
      setCargando(false);
    }
  };

  const handleSubmitFormulario = async (datos: Record<string, unknown>, finalizarParaFirma: boolean) => {
    if (!usuario || !plantillaSeleccionada) return;
    setCargando(true);
    setMensaje(null);

    try {
      // 1. Guardar o finalizar entrega en el backend (JSONB puro)
      const res = await api.post('/legajos/entregas', {
        usuarioId: usuario.id,
        plantillaId: plantillaSeleccionada.id,
        cicloAnio: 2026,
        respuestas: datos,
        finalizarParaFirma,
        actualizarDatosFijos: true,
      });

      const entrega = res.data;

      // 2. Si finalizó para firma, generar el PDF dinámico estampado en el cliente con pdf-lib + qrcode
      if (finalizarParaFirma && entrega.hashVerificacion) {
        setMensaje('Generando y ensamblando documento oficial con código QR y pie de seguridad...');

        const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson;
        const ramaNombre =
          precarga?.usuario?.asignaciones?.[0]?.unidad?.nombre ||
          asignaciones?.[0]?.unidadNombre ||
          '';

        const usuarioParaPdf = {
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          dni: usuario.dni,
          fechaNacimiento: precarga?.usuario?.fechaNacimiento,
          ramaNombre,
          telefonoContacto: precarga?.usuario?.telefonoContacto,
        };

        const pdfBytes = await generarFichaPdf(
          mapeo,
          datos,
          entrega.hashVerificacion,
          usuarioParaPdf,
          entrega.versionImpresion,
        );

        descargarPdfBlob(pdfBytes, `Legajo_${usuario.dni}_V${entrega.versionImpresion}.pdf`);

        setMensaje(
          `¡Documento oficial generado exitosamente (Versión ${entrega.versionImpresion})! Por favor imprímelo, fírmalo en papel y entrégaselo a tu Educador de Rama para su validación física.`,
        );
      } else {
        setMensaje('Borrador guardado exitosamente. Podrás continuar completándolo en cualquier momento.');
      }

      // Recargar precarga para ver estado actualizado
      seleccionarPlantilla(plantillaSeleccionada);
    } catch (err: any) {
      setMensaje(err.response?.data?.message || 'Error al procesar el formulario.');
    } finally {
      setCargando(false);
    }
  };

  const renderBadgeEstado = (estado?: string) => {
    switch (estado) {
      case 'VALIDADO_FISICAMENTE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Legajo Validado Físicamente
          </span>
        );
      case 'PENDIENTE_FIRMA_FISICA':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Pendiente Entrega / Firma Física
          </span>
        );
      case 'DESACTUALIZADO_REQUIERE_REIMPRESION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Requiere Reimpresión (Datos Editados)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Borrador No Finalizado
          </span>
        );
    }
  };

  const esEducador =
    precarga?.esEducador || tieneUnidad() || tieneGlobal();

  const esMayor = Boolean(precarga && typeof precarga.edad === 'number' && precarga.edad >= 18);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Encabezado Principal */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Portal de Autogestión</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {usuario?.nombre} {usuario?.apellido} • DNI {usuario?.dni}
              {precarga?.usuario?.asignaciones?.[0]?.unidad?.nombre && (
                <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">
                  ({precarga.usuario.asignaciones[0].unidad.nombre})
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {precarga?.ultimaEntrega && renderBadgeEstado(precarga.ultimaEntrega.estado)}
            {precarga?.ultimaEntrega && (
              <button
                type="button"
                onClick={handleDescargarCopiaPdf}
                disabled={cargando}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer transition-all"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-600" />
                Descargar Copia PDF (V{precarga.ultimaEntrega.versionImpresion})
              </button>
            )}
          </div>
        </div>

        {/* Notificaciones y Avisos de Perfil (Concisos y claros) */}
        {esEducador && (
          <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-2.5">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                <strong>Modo Educador / Jefatura:</strong> Puedes previsualizar el legajo digital familiar o validar fichas físicas con código QR desde <em>Padrón de Rama</em>.
              </span>
            </div>
          </div>
        )}

        {esMayor && !esEducador && (
          <div className="bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Mayor de 18 años:</strong> Puedes completar tu Ficha de Inscripción y Declaración Jurada de Salud para mantener tu legajo médico actualizado.
            </span>
          </div>
        )}

        {/* Sección de Estado de Cuenta / Tesorería Familiar */}
        {estadoCuenta && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
            {/* Resumen Superior */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Estado de Cuenta y Cuotas</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Resumen de cuotas del ciclo y comprobantes de pago registrados
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {Number(estadoCuenta.resumen?.saldoAFavor || 0) > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block">
                      Saldo a Favor
                    </span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                      ${estadoCuenta.resumen.saldoAFavor}
                    </span>
                  </div>
                )}
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block">
                    Saldo Pendiente
                  </span>
                  <span
                    className={`text-lg font-extrabold ${
                      estadoCuenta.resumen.saldoPendiente > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    ${estadoCuenta.resumen.saldoPendiente}
                  </span>
                </div>
              </div>
            </div>

            {/* Cuotas y Cargos */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Cuotas del Miembro
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {estadoCuenta.cargos?.map((cargo: any) => (
                  <div
                    key={cargo.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                        {cargo.concepto?.nombre}
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          cargo.estado === 'PAGADO'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : cargo.estado === 'PARCIAL'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {cargo.estado}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-between">
                      <span>Total: ${cargo.montoFinal}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Pagado: ${cargo.montoPagado}
                      </span>
                    </div>
                    {Number(cargo.montoDescuento) > 0 && (
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Descuento familiar: -${cargo.montoDescuento}
                      </p>
                    )}
                  </div>
                ))}

                {(!estadoCuenta.cargos || estadoCuenta.cargos.length === 0) && (
                  <div className="col-span-full py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                    No posees cargos o cuotas asignadas en este ciclo.
                  </div>
                )}
              </div>
            </div>

            {/* Historial de Pagos Realizados */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Historial de Pagos Realizados
                </h3>
              </div>

              {estadoCuenta.pagos && estadoCuenta.pagos.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 uppercase font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Concepto(s) Imputados</th>
                        <th className="py-2.5 px-3">Método / Ref.</th>
                        <th className="py-2.5 px-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {estadoCuenta.pagos.map((pago: any) => {
                        const conceptosTexto =
                          pago.imputaciones
                            ?.map((imp: any) => imp.cargo?.concepto?.nombre)
                            .filter(Boolean)
                            .join(', ') || 'Cuota general / Saldo a favor';

                        return (
                          <tr key={pago.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                              {new Date(pago.fechaPago).toLocaleDateString('es-AR')}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">
                              {conceptosTexto}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                              <span className="capitalize">{pago.metodoPago?.toLowerCase()}</span>
                              {pago.referenciaComprobante && (
                                <span className="ml-1 text-[10px] text-slate-400 font-mono">
                                  ({pago.referenciaComprobante})
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              +${pago.montoTotal}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400 dark:text-slate-500">
                  Aún no registras pagos realizados en el sistema.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sección de Formulario Dinámico de Legajo */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Inscripción y Legajo Anual 2026
              </h2>
            </div>
          </div>

          {mensaje && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-xl text-sm font-medium">
              {mensaje}
            </div>
          )}

          {plantillaSeleccionada && precarga ? (
            <DynamicFormRenderer
              esquema={plantillaSeleccionada.esquemaCamposJson as EsquemaCampos}
              valoresIniciales={{
                protagonista_telefono: precarga.usuario.telefonoContacto || '',
                protagonista_domicilio:
                  (precarga.usuario.datosFijosJson as any)?.protagonista_domicilio ||
                  (precarga.usuario.datosFijosJson as any)?.domicilio ||
                  '',
                ...(precarga.datosFamiliaresSugeridos || {}),
                ...(precarga.usuario.datosFijosJson || {}),
                ...(precarga.ultimaEntrega?.respuestasSnapshotJson || {}),
              }}
              onSubmit={handleSubmitFormulario}
              cargando={cargando}
              edadMiembro={precarga.edad}
            />
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-800">
              Cargando formulario oficial 2026...
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
