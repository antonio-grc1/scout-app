import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface DatosEmailBienvenida {
  destinatario: string;
  nombre: string;
  apellido: string;
  dni: string;
  unidadNombre?: string;
  rolNombre?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  private crearTransporter() {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (!host || !user || !pass) {
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async enviarBienvenidaAlta(datos: DatosEmailBienvenida): Promise<boolean> {
    const destinatario = datos.destinatario?.trim();
    if (!destinatario) return false;

    const transporter = this.crearTransporter();
    const appUrl = process.env.APP_URL?.trim() || 'http://localhost:5173';
    const remitente =
      process.env.SMTP_FROM?.trim() ||
      `"Grupo Scout Juan XXIII" <${process.env.SMTP_USER || 'no-reply@scoutjuanxxiii.org'}>`;

    const asunto = `¡Bienvenido/a al Grupo Scout Juan XXIII! - Alta de ${datos.nombre} ${datos.apellido}`;

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background-color: #ffffff; color: #0f172a;">
        <div style="background-color: #18181b; padding: 24px; text-align: center; border-bottom: 4px solid #eab308;">
          <div style="font-size: 28px; margin-bottom: 6px;">⚜</div>
          <h1 style="margin: 0; font-size: 20px; color: #facc15; font-weight: 800;">Grupo Scout Juan XXIII</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #d4d4d8;">Sistema de Gestión Institucional</p>
        </div>
        <div style="padding: 24px; line-height: 1.6; font-size: 14px;">
          <p style="margin-top: 0;">¡Hola <strong>${datos.nombre} ${datos.apellido}</strong> (y familia)!</p>
          <p>Te informamos que se ha registrado tu alta en el padrón oficial del <strong>Grupo Scout Juan XXIII</strong>${
            datos.unidadNombre ? ` en la sección <strong>${datos.unidadNombre}</strong>` : ''
          }${datos.rolNombre ? ` (${datos.rolNombre})` : ''}.</p>
          
          <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 12px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #854d0e; font-size: 13px; text-transform: uppercase;">Tus credenciales de ingreso:</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Usuario (DNI):</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${datos.dni}</code></p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Contraseña inicial:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 4px;">${datos.dni}</code> (tu número de DNI)</p>
          </div>

          <p style="font-size: 13px; color: #475569;">Al ingresar por primera vez, el sistema te solicitará elegir una contraseña personal segura. Desde la aplicación podrás completar tu ficha médica anual y consultar el estado de tus cuotas.</p>

          <div style="text-align: center; margin: 24px 0 12px;">
            <a href="${appUrl}" style="display: inline-block; background-color: #eab308; color: #09090b; font-weight: 800; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 14px;">Ingresar a la Plataforma</a>
          </div>
        </div>
        <div style="background-color: #f8fafc; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
          Siempre Listo • Grupo Scout San Juan XXIII
        </div>
      </div>
    `;

    if (!transporter) {
      this.logger.log(
        `[SMTP no configurado] Aviso de bienvenida preparado para ${destinatario} (DNI ${datos.dni}). Configure SMTP_HOST, SMTP_USER y SMTP_PASS en .env para enviar correos reales.`,
      );
      return false;
    }

    try {
      await transporter.sendMail({
        from: remitente,
        to: destinatario,
        subject: asunto,
        html,
      });
      this.logger.log(`Correo de bienvenida enviado a ${destinatario} (DNI ${datos.dni})`);
      return true;
    } catch (err: any) {
      this.logger.warn(
        `No se pudo enviar correo de bienvenida a ${destinatario}: ${err?.message || err}`,
      );
      return false;
    }
  }
}
