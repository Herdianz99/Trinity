import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
}

// Servicio de correo genérico (nodemailer). Configurado por variables de entorno; por defecto
// usa SMTP de Gmail (basta MAIL_USER + MAIL_PASS con un App Password de la cuenta con 2FA).
// Variables: MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASS, MAIL_FROM_NAME.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private get user(): string | undefined {
    return this.config.get<string>('MAIL_USER');
  }
  private get pass(): string | undefined {
    return this.config.get<string>('MAIL_PASS');
  }

  // ¿Hay credenciales cargadas? El módulo funciona sin correo; solo el envío falla si no está configurado.
  isConfigured(): boolean {
    return !!(this.user && this.pass);
  }

  private getTransporter(): nodemailer.Transporter {
    if (!this.isConfigured()) {
      throw new Error(
        'Correo no configurado: define MAIL_USER y MAIL_PASS (App Password de Gmail) en el .env del API',
      );
    }
    if (!this.transporter) {
      const host = this.config.get<string>('MAIL_HOST') || 'smtp.gmail.com';
      const port = Number(this.config.get<string>('MAIL_PORT') || 465);
      const secure = String(this.config.get<string>('MAIL_SECURE') ?? 'true') !== 'false';
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure, // true = 465 (SSL); false = 587 (STARTTLS)
        auth: { user: this.user, pass: this.pass },
      });
    }
    return this.transporter;
  }

  private fromAddress(): string {
    const name = this.config.get<string>('MAIL_FROM_NAME') || 'Trinity ERP';
    return `"${name}" <${this.user}>`;
  }

  async sendMail(input: SendMailInput): Promise<{ messageId: string }> {
    const transporter = this.getTransporter();
    const info = await transporter.sendMail({
      from: this.fromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || 'application/pdf',
      })),
    });
    return { messageId: info.messageId };
  }
}
