import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService implements OnModuleInit {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpSecure =
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : smtpPort === 465;
    const tlsRejectUnauthorized =
      process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined
        ? process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'true'
        : true;

    const transportOptions: SMTPTransport.Options = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: !smtpSecure,
      tls: {
        rejectUnauthorized: tlsRejectUnauthorized,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      auth: {
        user: process.env.EMAIL_USER || 'your.email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your_app_password',
      },
    };

    this.transporter = nodemailer.createTransport(transportOptions);
  }

  async onModuleInit() {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP ulanish tekshirildi: email yuborishga tayyor.');
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        response?: string;
        responseCode?: number;
      };
      const response = err.response || '';

      if (err.code === 'EAUTH' || response.includes('535-5.7.8')) {
        this.logger.error(
          'SMTP auth xatosi: EMAIL_USER/EMAIL_PASS noto‘g‘ri. Gmail uchun App Password ishlating.',
        );
      } else {
        this.logger.error('SMTP verify xatoligi:', error);
      }
    }
  }

  async sendOTP(email: string, otp: string) {
    const mailUser = process.env.EMAIL_USER || 'no-reply@lms.com';
    const fromHeader =
      process.env.EMAIL_FROM?.trim() || `"LMS Platform" <${mailUser}>`;
    try {
      await this.transporter.sendMail({
        from: fromHeader,
        to: email,
        subject: 'LMS Platform - OTP Tasdiqlash Kodi',
        html: `<h2>Assalomu alaykum!</h2><p>Sizning OTP kodingiz: <b>${otp}</b></p><p>Kodning amal qilish muddati 5 daqiqa.</p>`,
      });
      this.logger.log(
        `OTP (${otp}) muvaffaqiyatli ${email} pochtasiga yuborildi.`,
      );
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException & {
        response?: string;
      };
      const response = err.response || '';

      if (err.code === 'EAUTH' || response.includes('535-5.7.8')) {
        this.logger.error(
          'Email yuborilmadi: SMTP login noto‘g‘ri (Gmail App Password kerak).',
        );
      } else {
        this.logger.error('Email yuborishda xatolik:', error);
      }
      return false;
    }
  }
}
