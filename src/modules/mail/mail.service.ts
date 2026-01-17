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

    async sendStudentApprovedEmail(email: string, name: string) {
        const subject = 'Application Approved! Welcome to Parchi';
        const html = `
      <h1>Congratulations ${name}!</h1>
      <p>Your application for the Parchi Student Program has been approved.</p>
      <p>You can now log in to the app and start accessing exclusive student offers.</p>
      <br>
      <p>Best regards,</p>
      <p>The Parchi Team</p>
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
