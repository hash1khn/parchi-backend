import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';

export interface MailAttachment {
    name: string;
    /** Base64-encoded file content (Brevo expects this without data-URI prefix). */
    content: string;
}

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    constructor(private readonly configService: ConfigService) { }

    // ─── Core send via Brevo Transactional Email API (HTTPS, port 443) ──────────
    // Replaces nodemailer/SMTP entirely. Port 587 is often blocked on cloud hosts.
    // Docs: https://developers.brevo.com/reference/sendtransacemail
    async sendMail(
        to: string,
        subject: string,
        html: string,
        attachments?: MailAttachment[],
    ): Promise<boolean> {
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

        const payload: Record<string, unknown> = {
            sender:  { name: fromName, email: fromEmail },
            to:      [{ email: to }],
            subject,
            htmlContent: html,
        };

        if (attachments?.length) {
            payload.attachment = attachments.map((a) => ({
                name: a.name,
                content: a.content,
            }));
        }

        const body = JSON.stringify(payload);

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

    // ─── Templates ───────────────────────────────────────────────────────────────

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

    async sendAccountDeletionConfirmationEmail(email: string, name: string) {
        const subject = 'Your Parchi Account Has Been Deleted';
        const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Account Deletion Confirmed</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="margin-top: 0;">Hi <strong>${name}</strong>,</p>
          <p>
            We're writing to confirm that your Parchi account and all associated data have been
            <strong>permanently deleted</strong> as per your request.
          </p>
          <div style="background-color: #fff8f0; border-left: 4px solid #e07b00; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #7a4000;">
              <strong>What has been removed:</strong><br/>
              • Your account credentials and profile information<br/>
              • Your student KYC records<br/>
              • Your redemption history and savings data<br/>
              • All other personal data linked to your account
            </p>
          </div>
          <p>
            If you did <strong>not</strong> request this deletion, or if you believe this was done
            in error, please contact our support team immediately at
            <a href="mailto:support@parchipakistan.com" style="color: #007bff;">support@parchipakistan.com</a>.
          </p>
          <p>
            We're sorry to see you go. If you'd like to rejoin Parchi in the future, you are
            welcome to create a new account and re-apply for the student program.
          </p>
          <p style="margin-bottom: 0;">Thank you for being part of the Parchi community.</p>
        </div>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777;">
          <p style="margin: 0;">© ${new Date().getFullYear()} Parchi. All rights reserved.</p>
          <p style="margin: 5px 0 0 0;">This is an automated message — please do not reply directly to this email.</p>
        </div>
      </div>
    `;
        return this.sendMail(email, subject, html);
    }

    async sendMerchantMonthEndDigestEmail(params: {
        to: string;
        businessName: string;
        periodLabel: string;
        totalRedemptions: number;
        uniqueStudents: number;
        bonusRedemptions: number;
        totalFixedDiscountPkr: number;
        branchRows: { branchName: string; totalRedemptions: number }[];
        topOffers: {
            offerTitle: string;
            totalRedemptions: number;
            discountLabel: string;
        }[];
        pdfBuffer: Buffer;
        pdfFileName: string;
        dashboardUrl?: string;
    }): Promise<boolean> {
        const {
            to,
            businessName,
            periodLabel,
            totalRedemptions,
            uniqueStudents,
            bonusRedemptions,
            totalFixedDiscountPkr,
            branchRows,
            topOffers,
            pdfBuffer,
            pdfFileName,
            dashboardUrl,
        } = params;

        const subject = `Parchi Month-End Digest — ${businessName} — ${periodLabel}`;

        const branchHtml =
            branchRows.length > 0
                ? branchRows
                      .map(
                          (b) =>
                              `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(b.branchName)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${b.totalRedemptions}</td></tr>`,
                      )
                      .join('')
                : `<tr><td colspan="2" style="padding:8px;color:#666;">No branch activity this month</td></tr>`;

        const offersHtml =
            topOffers.length > 0
                ? topOffers
                      .map(
                          (o) =>
                              `<tr><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(o.offerTitle)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${o.totalRedemptions}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(o.discountLabel)}</td></tr>`,
                      )
                      .join('')
                : `<tr><td colspan="3" style="padding:8px;color:#666;">No offer activity this month</td></tr>`;

        const cta = dashboardUrl
            ? `<div style="text-align:center;margin-top:28px;"><a href="${dashboardUrl}" style="background-color:#1a1a2e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">Open Dashboard</a></div>`
            : '';

        const html = `
      <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;max-width:640px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background-color:#1a1a2e;padding:22px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:20px;">Month-End Digest</h1>
          <p style="color:#bbb;margin:6px 0 0 0;font-size:14px;">${escapeHtml(periodLabel)}</p>
        </div>
        <div style="padding:28px;background:#fff;">
          <p style="margin-top:0;">Hi <strong>${escapeHtml(businessName)}</strong>,</p>
          <p>Here is your Parchi performance summary for <strong>${escapeHtml(periodLabel)}</strong>. Full line-item detail is attached as a PDF.</p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8f9fa;border-radius:6px;">
            <tr>
              <td style="padding:14px;text-align:center;width:25%;"><div style="font-size:11px;color:#666;text-transform:uppercase;">Redemptions</div><div style="font-size:22px;font-weight:bold;margin-top:4px;">${totalRedemptions}</div></td>
              <td style="padding:14px;text-align:center;width:25%;"><div style="font-size:11px;color:#666;text-transform:uppercase;">Students</div><div style="font-size:22px;font-weight:bold;margin-top:4px;">${uniqueStudents}</div></td>
              <td style="padding:14px;text-align:center;width:25%;"><div style="font-size:11px;color:#666;text-transform:uppercase;">Bonus Redemptions</div><div style="font-size:22px;font-weight:bold;margin-top:4px;">${bonusRedemptions}</div></td>
              <td style="padding:14px;text-align:center;width:25%;"><div style="font-size:11px;color:#666;text-transform:uppercase;">Fixed Disc. PKR</div><div style="font-size:22px;font-weight:bold;margin-top:4px;">${Math.round(totalFixedDiscountPkr)}</div></td>
            </tr>
          </table>

          <h3 style="margin:24px 0 8px 0;font-size:15px;">Branch Breakdown</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead><tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">Branch</th><th style="padding:8px;text-align:right;">Redemptions</th></tr></thead>
            <tbody>${branchHtml}</tbody>
          </table>

          <h3 style="margin:24px 0 8px 0;font-size:15px;">Top Offers</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead><tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">Offer</th><th style="padding:8px;text-align:right;">Redemptions</th><th style="padding:8px;text-align:right;">Discount</th></tr></thead>
            <tbody>${offersHtml}</tbody>
          </table>

          ${cta}
        </div>
        <div style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#777;">
          <p style="margin:0;">© ${new Date().getFullYear()} Parchi. All rights reserved.</p>
          <p style="margin:4px 0 0 0;">This is an automated message — please do not reply directly.</p>
        </div>
      </div>
    `;

        return this.sendMail(to, subject, html, [
            {
                name: pdfFileName,
                content: pdfBuffer.toString('base64'),
            },
        ]);
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
