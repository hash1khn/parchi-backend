import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    constructor(private readonly configService: ConfigService) { }

    // ─── Core send via Brevo Transactional Email API (HTTPS, port 443) ──────────
    // Replaces nodemailer/SMTP entirely. Port 587 is often blocked on cloud hosts.
    // Docs: https://developers.brevo.com/reference/sendtransacemail
    async sendMail(to: string, subject: string, html: string): Promise<boolean> {
        const apiKey = this.configService.get<string>('BREVO_API_KEY');
        const fromRaw = this.configService.get<string>('SMTP_FROM', '"Parchi" <parchipakistan@gmail.com>');

        if (!apiKey) {
            this.logger.error('BREVO_API_KEY is not set — cannot send email');
            return false;
        }

        // Parse "Display Name <email@example.com>" → { name, email }
        const fromMatch = fromRaw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
        const fromEmail = fromMatch ? fromMatch[2].trim() : fromRaw.trim();
        const fromName  = fromMatch ? fromMatch[1].trim() : 'Parchi';

        const body = JSON.stringify({
            sender:  { name: fromName, email: fromEmail },
            to:      [{ email: to }],
            subject,
            htmlContent: html,
        });

        return new Promise((resolve) => {
            const req = https.request(
                {
                    hostname: 'api.brevo.com',
                    path:     '/v3/smtp/email',
                    method:   'POST',
                    headers:  {
                        'Content-Type':  'application/json',
                        'Content-Length': Buffer.byteLength(body),
                        'api-key':        apiKey,
                    },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            const parsed = JSON.parse(data || '{}');
                            this.logger.log(`Email sent to ${to} — messageId: ${parsed.messageId}`);
                            resolve(true);
                        } else {
                            this.logger.error(
                                `Brevo API error sending to ${to}: HTTP ${res.statusCode} — ${data}`,
                            );
                            resolve(false);
                        }
                    });
                },
            );

            req.on('error', (err) => {
                this.logger.error(`Network error sending email to ${to}: ${err.message}`, err.stack);
                resolve(false);
            });

            req.write(body);
            req.end();
        });
    }

    // ─── Templates (unchanged) ───────────────────────────────────────────────────

    async sendStudentAppliedEmail(email: string, name: string) {
        const subject = 'Application Received - Parchi Student Program';
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
