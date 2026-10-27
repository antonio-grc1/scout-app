import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoEntrega, type Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { assertUnidadEnAlcance, filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CrearPlantillaDto,
  EditarPlantillaDto,
  GuardarEntregaDto,
  ListarEntregasQueryDto,
} from './legajos.dto.js';

export function calcularHashVerificacion(
  usuarioId: number,
  plantillaId: number,
  cicloAnio: number,
  versionImpresion: number,
  respuestas: Record<string, unknown>,
): string {
  const payload = JSON.stringify({
    u: usuarioId,
    p: plantillaId,
    c: cicloAnio,
    v: versionImpresion,
    r: respuestas,
    salt: crypto.randomBytes(8).toString('hex'),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

@Injectable()
export class LegajosService {
  constructor(private readonly prisma: PrismaService) {}

  private plantillasMayoresVerificadas = false;

  private async asegurarPlantillasMayores() {
    if (this.plantillasMayoresVerificadas || !this.prisma?.plantillaFormulario?.findFirst) return;
    this.plantillasMayoresVerificadas = true;

    try {
      const base = await this.prisma.plantillaFormulario.findFirst({
        where: { codigo: 'LEGAJO_MENORES_2026', cicloAnio: 2026 },
      });
      if (!base) return;

      const esquemaBase = (base.esquemaCamposJson as any) || {};
      const seccionSalud = Array.isArray(esquemaBase.secciones)
        ? esquemaBase.secciones.find((s: any) => s.id === 'seccion_salud') || esquemaBase.secciones[1]
        : null;

      const existentes = await this.prisma.plantillaFormulario.findMany({
        where: {
          codigo: { in: ['LEGAJO_ROVERS_2026', 'LEGAJO_EDUCADORES_2026'] },
          cicloAnio: 2026,
        },
        select: { codigo: true },
      });
      const codigosExistentes = new Set(existentes.map((e) => e.codigo));

      if (!codigosExistentes.has('LEGAJO_ROVERS_2026')) {
        await this.prisma.plantillaFormulario.create({
          data: {
            codigo: 'LEGAJO_ROVERS_2026',
            titulo: 'Inscripción y Legajo Anual 2026 (Rama Rover / Jóvenes Adultos)',
            version: '2026.1',
            cicloAnio: 2026,
            activa: true,
            mapeoPdfJson: base.mapeoPdfJson ?? {},
            esquemaCamposJson: {
              secciones: [
                {
                  id: 'seccion_inscripcion_rover',
                  titulo: '1. Ficha Personal de Protagonista Rover (Mayor de Edad)',
                  descripcion: 'Datos personales, estudios/ocupación y contactos de emergencia para integrantes de la Rama Rover.',
                  permiteCopiarHermano: true,
                  campos: [
                    { key: 'protagonista_domicilio', label: 'Domicilio real (Calle, N°, Barrio, Localidad)', type: 'text', required: true },
                    { key: 'protagonista_telefono', label: 'Teléfono celular personal', type: 'tel', required: true },
                    { key: 'ocupacion_estudios', label: 'Carrera / Estudios / Ocupación actual', type: 'text', required: true },
                    { key: 'obra_social', label: 'Obra Social / Prepaga', type: 'text', required: true },
                    { key: 'obra_social_afiliado', label: 'N° de Afiliado (Obra Social)', type: 'text', required: false },
                    { key: 'religion', label: 'Religión', type: 'text', required: false },
                    { key: 'emergencia_nombre', label: 'Contacto de Emergencia: Nombre y Apellido', type: 'text', required: true },
                    { key: 'emergencia_vinculo', label: 'Contacto de Emergencia: Vínculo (Madre, Padre, Pareja, Familiar)', type: 'text', required: true },
                    { key: 'emergencia_telefono', label: 'Contacto de Emergencia: Teléfono principal', type: 'tel', required: true },
                    { key: 'madre_nombres', label: 'Madre: Nombre y Apellido (opcional)', type: 'text', required: false },
                    { key: 'madre_telefono', label: 'Madre: Teléfono (opcional)', type: 'tel', required: false },
                    { key: 'padre_nombres', label: 'Padre: Nombre y Apellido (opcional)', type: 'text', required: false },
                    { key: 'padre_telefono', label: 'Padre: Teléfono (opcional)', type: 'tel', required: false },
                  ],
                },
                ...(seccionSalud ? [seccionSalud] : []),
                {
                  id: 'seccion_consentimiento_rover',
                  titulo: '3. Consentimiento Propio de Mayor de Edad (Rama Rover)',
                  descripcion: 'Declaración jurada de participación voluntaria en actividades, acampadas y proyectos de servicio de la Comunidad Rover.',
                  campos: [
                    { key: 'menor_nacionalidad', label: 'Nacionalidad', type: 'text', required: true },
                    {
                      key: 'confirma_autorizacion_salidas',
                      label: 'Declaro bajo juramento ser mayor de edad y prestar mi consentimiento personal para participar en actividades, campamentos y traslados del Grupo Scout Juan XXIII N° 196',
                      type: 'boolean',
                      required: true,
                    },
                    {
                      key: 'ret_autoriza_retirarse_solo',
                      label: 'Como mayor de edad, me retiro por mis propios medios al finalizar las actividades',
                      type: 'boolean',
                      required: false,
                    },
                  ],
                },
              ],
            } as Prisma.InputJsonObject,
          },
        });
      }

      if (!codigosExistentes.has('LEGAJO_EDUCADORES_2026')) {
        await this.prisma.plantillaFormulario.create({
          data: {
            codigo: 'LEGAJO_EDUCADORES_2026',
            titulo: 'Ficha Médica y Legajo Anual 2026 (Educadores y Dirigentes)',
            version: '2026.1',
            cicloAnio: 2026,
            activa: true,
            mapeoPdfJson: base.mapeoPdfJson ?? {},
            esquemaCamposJson: {
              secciones: [
                {
                  id: 'seccion_datos_educador',
                  titulo: '1. Datos Personales y Función del Educador / Dirigente',
                  descripcion: 'Información personal, laboral, formación scout y contactos en caso de emergencia para adultos responsables del grupo.',
                  permiteCopiarHermano: false,
                  campos: [
                    { key: 'protagonista_domicilio', label: 'Domicilio real (Calle, N°, Barrio, Localidad)', type: 'text', required: true },
                    { key: 'protagonista_telefono', label: 'Teléfono celular personal', type: 'tel', required: true },
                    { key: 'profesion_ocupacion', label: 'Profesión / Ocupación laboral', type: 'text', required: true },
                    { key: 'nivel_formacion_scout', label: 'Nivel de Formación / Cursos / Insignia de Madera', type: 'text', required: false },
                    { key: 'obra_social', label: 'Obra Social / Prepaga / ART', type: 'text', required: true },
                    { key: 'obra_social_afiliado', label: 'N° de Afiliado', type: 'text', required: false },
                    { key: 'emergencia_nombre', label: 'Contacto de Emergencia: Nombre y Apellido', type: 'text', required: true },
                    { key: 'emergencia_vinculo', label: 'Contacto de Emergencia: Vínculo o Parentesco', type: 'text', required: true },
                    { key: 'emergencia_telefono', label: 'Contacto de Emergencia: Teléfono directo', type: 'tel', required: true },
                    { key: 'posee_licencia_conducir', label: '¿Posee licencia de conducir vigente y vehículo para apoyo en campamentos?', type: 'boolean', required: false },
                  ],
                },
                ...(seccionSalud ? [seccionSalud] : []),
                {
                  id: 'seccion_compromiso_educador',
                  titulo: '3. Declaración Jurada y Compromiso del Educador Adulto',
                  descripcion: 'Confirmación de veracidad de los antecedentes médicos y compromiso con las normas de convivencia y seguridad de SAAC.',
                  campos: [
                    {
                      key: 'confirma_autorizacion_salidas',
                      label: 'Declaro bajo juramento que los datos médicos consignados son exactos y asumo las responsabilidades propias de mi rol como Educador/Adulto en el Grupo Scout Juan XXIII N° 196',
                      type: 'boolean',
                      required: true,
                    },
                  ],
                },
              ],
            } as Prisma.InputJsonObject,
          },
        });
      }
    } catch {
      // No bloquear listado si la tabla está en test mockeado
    }
  }

  // ---------------- Plantillas ----------------
  async listarPlantillas(incluirInactivas = false, cicloAnio?: number) {
    await this.asegurarPlantillasMayores();
    return this.prisma.plantillaFormulario.findMany({
      where: {
        ...(incluirInactivas ? {} : { activa: true }),
        ...(cicloAnio ? { cicloAnio } : {}),
      },
      orderBy: [{ cicloAnio: 'desc' }, { id: 'asc' }],
    });
  }

  async obtenerPlantilla(id: number) {
    const plantilla = await this.prisma.plantillaFormulario.findUnique({ where: { id } });
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada');
    return plantilla;
  }

  async crearPlantilla(alcance: AlcanceAcceso, dto: CrearPlantillaDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Gestionar plantillas requiere alcance global');
    }
    return this.prisma.plantillaFormulario.create({
      data: {
        codigo: dto.codigo,
        titulo: dto.titulo,
        version: dto.version,
        cicloAnio: dto.cicloAnio,
        esquemaCamposJson: dto.esquemaCamposJson as Prisma.InputJsonObject,
        mapeoPdfJson: dto.mapeoPdfJson as Prisma.InputJsonObject,
        activa: dto.activa,
      },
    });
  }

  async editarPlantilla(alcance: AlcanceAcceso, id: number, dto: EditarPlantillaDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Gestionar plantillas requiere alcance global');
    }
    const actual = await this.prisma.plantillaFormulario.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Plantilla no encontrada');
    return this.prisma.plantillaFormulario.update({
      where: { id },
      data: {
        codigo: dto.codigo,
        titulo: dto.titulo,
        version: dto.version,
        cicloAnio: dto.cicloAnio,
        esquemaCamposJson: dto.esquemaCamposJson ? (dto.esquemaCamposJson as Prisma.InputJsonObject) : undefined,
        mapeoPdfJson: dto.mapeoPdfJson ? (dto.mapeoPdfJson as Prisma.InputJsonObject) : undefined,
        activa: dto.activa,
      },
    });
  }

  // ---------------- Precarga de Formulario ----------------
  /**
   * Obtiene los datos fijos del usuario y la última entrega (si existe) para que
   * el cliente arme el formulario dinámico con los valores prellenados.
   */
  async obtenerDatosPrecarga(alcance: AlcanceAcceso, usuarioId: number, plantillaId: number, cicloAnio: number) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        fechaNacimiento: true,
        emailContacto: true,
        telefonoContacto: true,
        datosFijosJson: true,
        grupoFamiliar: { select: { id: true, nombreFamilia: true } },
        asignaciones: {
          where: { activo: true },
          select: {
            unidad: { select: { id: true, nombre: true } },
            rol: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado en su alcance');

    const plantilla = await this.prisma.plantillaFormulario.findUnique({ where: { id: plantillaId } });
    if (!plantilla || !plantilla.activa) throw new NotFoundException('Plantilla inexistente o inactiva');

    const ultimaEntrega = await this.prisma.entregaFormulario.findFirst({
      where: { usuarioId, plantillaId, cicloAnio },
      orderBy: { id: 'desc' },
      include: {
        validadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });

    const hoy = new Date();
    const nac = new Date(usuario.fechaNacimiento);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
      edad--;
    }
    const esMenor = edad < 18;
    const esEducador = usuario.asignaciones.some(
      (a) =>
        a.rol.nombre.includes('Educador') ||
        a.rol.nombre.includes('Jefe') ||
        a.rol.nombre.includes('Apoyo'),
    );

    let datosFamiliaresSugeridos: Record<string, unknown> = {};
    if (usuario.grupoFamiliar) {
      const hermanos = await this.prisma.usuario.findMany({
        where: {
          grupoFamiliarId: usuario.grupoFamiliar.id,
          id: { not: usuario.id },
        },
        select: { datosFijosJson: true },
        take: 5,
      });
      for (const h of hermanos) {
        if (h.datosFijosJson && typeof h.datosFijosJson === 'object') {
          datosFamiliaresSugeridos = { ...h.datosFijosJson, ...datosFamiliaresSugeridos };
        }
      }
    }

    return {
      usuario,
      plantilla,
      ultimaEntrega,
      edad,
      esMenor,
      esEducador,
      datosFamiliaresSugeridos,
    };
  }

  // ---------------- Guardado / Snapshot de Entrega ----------------
  async guardarEntrega(actor: AuthUser, alcance: AlcanceAcceso, dto: GuardarEntregaDto) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: dto.usuarioId }, filtroUsuariosPorAlcance(alcance)] },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado en su alcance');

    const plantilla = await this.prisma.plantillaFormulario.findUnique({ where: { id: dto.plantillaId } });
    if (!plantilla || !plantilla.activa) throw new BadRequestException('Plantilla no encontrada o inactiva');

    return this.prisma.$transaction(async (tx) => {
      const entregaActual = await tx.entregaFormulario.findFirst({
        where: { usuarioId: dto.usuarioId, plantillaId: dto.plantillaId, cicloAnio: dto.cicloAnio },
        orderBy: { id: 'desc' },
      });

      let estado: EstadoEntrega = EstadoEntrega.BORRADOR;
      let versionImpresion = entregaActual ? entregaActual.versionImpresion : 1;
      let fechaGeneracionPdf = entregaActual?.fechaGeneracionPdf ?? null;
      let fechaValidacionFisica = entregaActual?.fechaValidacionFisica ?? null;
      let validadoPorUsuarioId = entregaActual?.validadoPorUsuarioId ?? null;

      if (dto.finalizarParaFirma) {
        // Al finalizar para firma, se pasa a PENDIENTE_FIRMA_FISICA
        estado = EstadoEntrega.PENDIENTE_FIRMA_FISICA;
        fechaGeneracionPdf = new Date();
        fechaValidacionFisica = null;
        validadoPorUsuarioId = null;
        if (entregaActual && entregaActual.estado !== EstadoEntrega.BORRADOR) {
          versionImpresion = entregaActual.versionImpresion + 1;
        }
      } else {
        // Si no se pide finalizar para firma:
        if (entregaActual) {
          if (entregaActual.estado === EstadoEntrega.VALIDADO_FISICAMENTE) {
            // Edición post-validación: la copia física previa queda desactualizada
            estado = EstadoEntrega.DESACTUALIZADO_REQUIERE_REIMPRESION;
            versionImpresion = entregaActual.versionImpresion + 1;
          } else {
            estado = entregaActual.estado;
          }
        } else {
          estado = EstadoEntrega.BORRADOR;
        }
      }

      const hashVerificacion = calcularHashVerificacion(
        dto.usuarioId,
        dto.plantillaId,
        dto.cicloAnio,
        versionImpresion,
        dto.respuestas,
      );

      const dataToSave = {
        usuarioId: dto.usuarioId,
        plantillaId: dto.plantillaId,
        cicloAnio: dto.cicloAnio,
        versionImpresion,
        respuestasSnapshotJson: dto.respuestas as Prisma.InputJsonObject,
        hashVerificacion,
        estado,
        fechaGeneracionPdf,
        fechaValidacionFisica,
        validadoPorUsuarioId,
      };

      const entrega = entregaActual
        ? await tx.entregaFormulario.update({
            where: { id: entregaActual.id },
            data: dataToSave,
            include: {
              plantilla: { select: { id: true, codigo: true, titulo: true } },
              usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            },
          })
        : await tx.entregaFormulario.create({
            data: dataToSave,
            include: {
              plantilla: { select: { id: true, codigo: true, titulo: true } },
              usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            },
          });

      // Si se pidió actualizar datos fijos, sincronizar con usuario.datosFijosJson
      if (dto.actualizarDatosFijos) {
        const datosActuales = (usuario.datosFijosJson ?? {}) as Record<string, unknown>;
        const nuevosDatos = { ...datosActuales, ...dto.respuestas };
        await tx.usuario.update({
          where: { id: usuario.id },
          data: { datosFijosJson: nuevosDatos as Prisma.InputJsonObject },
        });
      }

      return entrega;
    });
  }

  // ---------------- Listado de Entregas ----------------
  async listarEntregas(alcance: AlcanceAcceso, q: ListarEntregasQueryDto) {
    const where: Prisma.EntregaFormularioWhereInput = {
      AND: [
        { usuario: filtroUsuariosPorAlcance(alcance) },
        q.usuarioId ? { usuarioId: q.usuarioId } : {},
        q.plantillaId ? { plantillaId: q.plantillaId } : {},
        q.cicloAnio ? { cicloAnio: q.cicloAnio } : {},
        q.estado ? { estado: q.estado } : {},
        q.unidadId
          ? {
              usuario: {
                asignaciones: { some: { activo: true, unidadId: q.unidadId } },
              },
            }
          : {},
      ],
    };

    return this.prisma.entregaFormulario.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      include: {
        plantilla: { select: { id: true, codigo: true, titulo: true } },
        usuario: { select: { id: true, dni: true, nombre: true, apellido: true } },
        validadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });
  }

  // ---------------- Verificación y Validación de QR ----------------
  /**
   * Consulta pública o semi-pública para cuando el educador escanea el QR.
   * Devuelve los datos del legajo asociado al hash para confirmar visualmente.
   */
  private async resolverEntregaPorCodigo(codigoRaw: string) {
    const limpio = codigoRaw
      .trim()
      .replace(/^verif:\s*/i, '')
      .replace(/^c[oó]digo:\s*/i, '')
      .replace(/\.\.\.$/, '')
      .trim();

    if (!limpio) return null;

    const includeDetalle = {
      plantilla: { select: { id: true, codigo: true, titulo: true, version: true } },
      usuario: {
        select: {
          id: true,
          dni: true,
          nombre: true,
          apellido: true,
          asignaciones: {
            where: { activo: true },
            select: { unidadId: true, unidad: { select: { id: true, nombre: true } } },
          },
        },
      },
      validadoPor: { select: { id: true, nombre: true, apellido: true } },
    };

    const exacta = await this.prisma.entregaFormulario.findFirst({
      where: { hashVerificacion: { equals: limpio, mode: 'insensitive' } },
      include: includeDetalle,
    });
    if (exacta) return exacta;

    if (limpio.length >= 6 && /^[0-9a-f]+$/i.test(limpio)) {
      const porPrefijo = await this.prisma.entregaFormulario.findFirst({
        where: { hashVerificacion: { startsWith: limpio, mode: 'insensitive' } },
        orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
        include: includeDetalle,
      });
      if (porPrefijo) return porPrefijo;
    }

    const soloDigitos = limpio.replace(/\D/g, '');
    if (soloDigitos.length >= 6 && soloDigitos.length <= 10 && /^\d+$/.test(limpio.replace(/\./g, ''))) {
      const porDni = await this.prisma.entregaFormulario.findFirst({
        where: { usuario: { dni: soloDigitos } },
        orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
        include: includeDetalle,
      });
      if (porDni) return porDni;
    }

    return null;
  }

  async verificarQr(hashVerificacion: string) {
    const entrega = await this.resolverEntregaPorCodigo(hashVerificacion);
    if (!entrega) throw new NotFoundException('Comprobante QR no válido o inexistente');
    return entrega;
  }

  /**
   * El educador valida físicamente que la firma en papel coincide con el QR escaneado.
   */
  async validarFisico(actor: AuthUser, alcance: AlcanceAcceso, hashVerificacion: string) {
    const entrega = await this.resolverEntregaPorCodigo(hashVerificacion);
    if (!entrega) throw new NotFoundException('Ficha no encontrada para ese código QR');

    // Comprobar alcance sobre el usuario dueño de la ficha
    if (alcance.tipo === 'UNIDAD') {
      const unidadesUsuario = entrega.usuario.asignaciones.map((a) => a.unidadId);
      const perteneceAUnidad = unidadesUsuario.some((uId) => alcance.unidadIds.includes(uId));
      if (!perteneceAUnidad) {
        throw new ForbiddenException('La ficha pertenece a un miembro fuera de su unidad');
      }
    } else if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para validar físicamente fichas');
    }

    if (entrega.estado === EstadoEntrega.VALIDADO_FISICAMENTE) {
      throw new ConflictException('Esta ficha ya fue validada físicamente con anterioridad');
    }

    if (entrega.estado === EstadoEntrega.DESACTUALIZADO_REQUIERE_REIMPRESION) {
      throw new BadRequestException(
        'Esta impresión física está desactualizada. El miembro editó sus datos con posterioridad y debe presentar una nueva copia impresa.',
      );
    }

    if (entrega.estado === EstadoEntrega.BORRADOR) {
      throw new BadRequestException('Esta ficha aún está en estado BORRADOR y no fue finalizada para firma');
    }

    // Pasa de PENDIENTE_FIRMA_FISICA a VALIDADO_FISICAMENTE
    return this.prisma.entregaFormulario.update({
      where: { id: entrega.id },
      data: {
        estado: EstadoEntrega.VALIDADO_FISICAMENTE,
        fechaValidacionFisica: new Date(),
        validadoPorUsuarioId: actor.sub,
      },
      include: {
        plantilla: { select: { id: true, titulo: true } },
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
        validadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });
  }

  // ---------------- Relevamiento de Colaboradores Adultos y Materiales ----------------
  async listarColaboradoresAdultos(alcance: AlcanceAcceso, cicloAnio = 2026) {
    const entregas = await this.prisma.entregaFormulario.findMany({
      where: {
        cicloAnio,
        usuario: filtroUsuariosPorAlcance(alcance),
      },
      include: {
        usuario: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            telefonoContacto: true,
            emailContacto: true,
            asignaciones: {
              where: { activo: true },
              select: { unidad: { select: { id: true, nombre: true } } },
            },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    const colaboradores = [];
    for (const ent of entregas) {
      const resp = (ent.respuestasSnapshotJson as Record<string, any>) || {};
      if (resp.completar_ficha_adultos) {
        colaboradores.push({
          entregaId: ent.id,
          estado: ent.estado,
          protagonista: {
            id: ent.usuario.id,
            nombre: ent.usuario.nombre,
            apellido: ent.usuario.apellido,
            dni: ent.usuario.dni,
            unidad: ent.usuario.asignaciones[0]?.unidad?.nombre ?? 'Sin Asignación',
          },
          adulto: {
            nombre: resp.adulto_nombre || `${resp.madre_nombres || resp.padre_nombres || 'Adulto Colaborador'}`,
            profesion: resp.adulto_profesion || resp.madre_profesion || resp.padre_profesion || '-',
            telefono: resp.adulto_telefono || resp.madre_telefono || resp.padre_telefono || ent.usuario.telefonoContacto,
            preferenciaTrabajo: resp.adulto_preferencia_trabajo || 'Indistinto',
            observaciones: resp.adulto_observaciones || '-',
          },
          areas: {
            servicioComunitario: !!resp.colab_servicio_comunitario,
            fotocopias: !!resp.colab_fotocopias,
            manoObra: !!resp.colab_mano_obra,
            administrativo: !!resp.colab_administrativo,
            transporte: !!resp.colab_transporte,
            camion: !!resp.colab_camion,
            camioneta: !!resp.colab_camioneta,
            colectivo: !!resp.colab_colectivo,
            recaudacionFondos: !!resp.colab_recaudacion_fondos,
            campamento: !!resp.colab_campamento,
            cocinaCampamento: !!resp.colab_cocina_campamento,
            ensenando: !!resp.colab_ensenando,
            mostrandoTrabajo: !!resp.colab_mostrando_trabajo,
            alimentos: !!resp.colab_alimentos_no_perecederos,
            tareasEspeciales: !!resp.colab_tareas_especiales,
            otros: !!resp.colab_otros,
            otrosDetalle: resp.colab_otros_detalle || '',
          },
          materiales: {
            construccionPrestamo: resp.mat_construccion_prestamo || '',
            construccionDonacion: resp.mat_construccion_donacion || '',
            campamentoPrestamo: resp.mat_campamento_prestamo || '',
            campamentoDonacion: resp.mat_campamento_donacion || '',
          },
        });
      }
    }
    return colaboradores;
  }
}
