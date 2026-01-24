import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(MailService.name);

    constructor(private readonly configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('SMTP_HOST'),
            port: this.configService.get<number>('SMTP_PORT'),
            secure: this.configService.get<boolean>('SMTP_SECURE', false), // true for 465, false for other ports
            auth: {
                user: this.configService.get<string>('SMTP_USER'),
                pass: this.configService.get<string>('SMTP_PASS'),
            },
        });
    }

    async sendMail(to: string, subject: string, html: string) {
        try {
            const from = this.configService.get<string>('SMTP_FROM', '"Parchi Support" <no-reply@parchi.com>');
            const info = await this.transporter.sendMail({
                from,
                to,
                subject,
                html,
            });
            this.logger.log(`Message sent: ${info.messageId}`);
            return info;
        } catch (error) {
            this.logger.error(`Error sending email to ${to}`, error.stack);
            // We don't want to block the flow if email fails, so we just log it
            // throwing error is optional depending on requirements
            return null;
        }
    }

    async sendStudentAppliedEmail(email: string, name: string) {
        const subject = 'Application Received - Parchi Student Program';
        // Simple HTML template
        const html = `
      <h1>Hello ${name},</h1>
      <p>Thank you for applying to the Parchi Student Program.</p>
      <p>We have received your application and our team will review it shortly. You will be notified once your verification status updates.</p>
      <br>
      <p>Best regards,</p>
      <p>The Parchi Team</p>
    `;
        return this.sendMail(email, subject, html);
    }

    async sendStudentApprovedEmail(email: string, name: string, parchiId: string) {
        const subject = 'Application Approved! Welcome to Parchi';
        const appLoginUrl = this.configService.get<string>('APP_LOGIN_URL', 'parchi://login');

        const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #007bff; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Application Approved!</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <h2 style="color: #007bff; margin-top: 0;">Congratulations ${name}!</h2>
          <p>We are excited to inform you that your application for the <strong>Parchi Student Program</strong> has been approved.</p>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 25px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your Unique Parchi ID</p>
            <h3 style="margin: 10px 0 0 0; font-size: 32px; color: #333; letter-spacing: 2px;">${parchiId}</h3>
          </div>

          <p>You can now log in to the Parchi app and start accessing exclusive student offers, discounts, and rewards tailored just for you.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${appLoginUrl}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Login to Parchi</a>
          </div>
        </div>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Parchi. All rights reserved.</p>
          <p style="margin: 5px 0 0 0;">Helping students save more every day.</p>
        </div>
      </div>
    `;
        return this.sendMail(email, subject, html);
    }

    async sendStudentRejectedEmail(email: string, name: string, reason: string) {
        const subject = 'Application Update - Parchi Student Program';
        const html = `
      <h1>Hello ${name},</h1>
      <p>Thank you for your interest in the Parchi Student Program.</p>
      <p>Unfortunately, we are unable to approve your application at this time.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>You may re-apply after addressing the issues mentioned above.</p>
      <br>
      <p>Best regards,</p>
      <p>The Parchi Team</p>
    `;
        return this.sendMail(email, subject, html);
    }
}
