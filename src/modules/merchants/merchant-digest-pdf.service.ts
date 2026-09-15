import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import { MerchantDigestPayload } from './merchant-digest.types';
import { PAKISTAN_TIMEZONE } from '../../utils/pakistan-time.util';

// pdfmake 0.2.x: default export is the PdfPrinter constructor (CJS).
// Standard Helvetica only supports WinAnsi - no Unicode dashes/bullets.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

/** Strip/replace chars Helvetica cannot encode (avoids garbled "ÿ" in PDF). */
function pdfSafe(value: string): string {
  return value
    .replace(/[\u2013\u2014\u2212]/g, '-') // en/em/minus dashes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

@Injectable()
export class MerchantDigestPdfService {
  private readonly printer = new PdfPrinter(fonts);

  async generate(digest: MerchantDigestPayload): Promise<Buffer> {
    const fmtDate = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: PAKISTAN_TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(d)
        .replace(',', '');

    const empty = '-';

    const content: Content[] = [
      {
        text: pdfSafe(digest.businessName),
        style: 'header',
        margin: [0, 0, 0, 4],
      },
      {
        text: pdfSafe(`Month-End Digest - ${digest.periodLabel}`),
        style: 'subheader',
        margin: [0, 0, 0, 16],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Total Redemptions', style: 'kpiLabel' },
              {
                text: String(digest.summary.totalRedemptions),
                style: 'kpiValue',
              },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Unique Students', style: 'kpiLabel' },
              {
                text: String(digest.summary.uniqueStudents),
                style: 'kpiValue',
              },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Bonus Redemptions', style: 'kpiLabel' },
              {
                text: String(digest.summary.bonusRedemptions),
                style: 'kpiValue',
              },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Fixed Discount (PKR)', style: 'kpiLabel' },
              {
                text: `PKR ${Math.round(digest.summary.totalFixedDiscountPkr)}`,
                style: 'kpiValue',
              },
            ],
          },
        ],
        margin: [0, 0, 0, 20],
      },
      { text: 'Branch Breakdown', style: 'sectionTitle', margin: [0, 0, 0, 8] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 70],
          body: [
            [
              { text: 'Branch', style: 'tableHeader' },
              { text: 'Redemptions', style: 'tableHeader', alignment: 'right' },
            ],
            ...(digest.branchBreakdown.length > 0
              ? digest.branchBreakdown.map((b) => [
                  pdfSafe(b.branchName),
                  {
                    text: String(b.totalRedemptions),
                    alignment: 'right' as const,
                  },
                ])
              : [
                  [
                    'No branch activity',
                    { text: '0', alignment: 'right' as const },
                  ],
                ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 16],
      },
      { text: 'Top Offers', style: 'sectionTitle', margin: [0, 0, 0, 8] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 70, 60],
          body: [
            [
              { text: 'Offer', style: 'tableHeader' },
              { text: 'Redemptions', style: 'tableHeader', alignment: 'right' },
              { text: 'Discount', style: 'tableHeader', alignment: 'right' },
            ],
            ...(digest.topOffers.length > 0
              ? digest.topOffers.map((o) => [
                  pdfSafe(o.offerTitle),
                  {
                    text: String(o.totalRedemptions),
                    alignment: 'right' as const,
                  },
                  {
                    text: pdfSafe(o.discountLabel),
                    alignment: 'right' as const,
                  },
                ])
              : [
                  [
                    'No offer activity',
                    { text: '0', alignment: 'right' as const },
                    { text: empty, alignment: 'right' as const },
                  ],
                ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 16],
      },
      {
        text: 'All Redemptions',
        style: 'sectionTitle',
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [72, 70, 88, 42, 42, 95, 42],
          body: [
            [
              { text: 'Date (PKT)', style: 'tableHeader' },
              { text: 'Branch', style: 'tableHeader' },
              { text: 'Offer', style: 'tableHeader' },
              { text: 'Offer Disc', style: 'tableHeader' },
              { text: 'Parchi ID', style: 'tableHeader' },
              { text: 'University', style: 'tableHeader' },
              { text: 'Bonus', style: 'tableHeader', alignment: 'right' },
            ],
            ...(digest.redemptions.length > 0
              ? digest.redemptions.map((r) => [
                  fmtDate(r.date),
                  pdfSafe(r.branchName),
                  pdfSafe(r.offerTitle),
                  pdfSafe(r.offerDiscountLabel),
                  pdfSafe(r.parchiId),
                  pdfSafe(r.university || empty),
                  {
                    text: pdfSafe(r.bonusDiscountLabel),
                    alignment: 'right' as const,
                  },
                ])
              : [
                  [
                    empty,
                    'No redemptions this month',
                    empty,
                    empty,
                    empty,
                    empty,
                    { text: empty, alignment: 'right' as const },
                  ],
                ]),
          ],
        },
        layout: 'lightHorizontalLines',
        fontSize: 7,
      },
      {
        text: pdfSafe(`Generated by Parchi - ${fmtDate(new Date())}`),
        style: 'footer',
        margin: [0, 24, 0, 0],
      },
    ];

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [36, 36, 36, 36],
      defaultStyle: { font: 'Helvetica', fontSize: 10 },
      styles: {
        header: { fontSize: 18, bold: true, color: '#1a1a2e' },
        subheader: { fontSize: 12, color: '#555555' },
        sectionTitle: { fontSize: 12, bold: true, color: '#1a1a2e' },
        kpiLabel: { fontSize: 8, color: '#666666' },
        kpiValue: { fontSize: 14, bold: true, margin: [0, 2, 0, 0] },
        tableHeader: { bold: true, fillColor: '#f0f0f0', fontSize: 7 },
        footer: { fontSize: 8, color: '#999999' },
      },
      content,
    };

    const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
