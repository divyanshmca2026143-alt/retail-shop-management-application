import fs from 'node:fs';
import path from 'node:path';

export interface PdfInvoiceData {
  bill_ref: string;
  customer_name: string;
  customer_phone?: string;
  payment_method: string;
  created_at: string;
  items: Array<{
    product_id: string;
    product_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>;
  subtotal: number;
  promo_code: string | null;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  gst_amount: number;
  final_amount: number;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

export function generateInvoicePdf(invoice: PdfInvoiceData, invoicesDir: string): string {
  fs.mkdirSync(invoicesDir, { recursive: true });
  const outputPath = path.join(invoicesDir, `${invoice.bill_ref}.pdf`);

  const lines: string[] = [
    '========================================================================',
    '                    RETAIL MART - TAX INVOICE (GST)                     ',
    '========================================================================',
    `Bill Ref       : ${invoice.bill_ref}`,
    `Date & Time    : ${invoice.created_at}`,
    `Customer       : ${invoice.customer_name}${invoice.customer_phone ? ` (${invoice.customer_phone})` : ''}`,
    `Payment Method : ${invoice.payment_method}`,
    '------------------------------------------------------------------------',
    `${padRight('ID', 10)} ${padRight('Item', 30)} ${padLeft('Qty', 5)} ${padLeft('Price', 11)} ${padLeft('Total', 12)}`,
    '------------------------------------------------------------------------',
  ];

  for (const item of invoice.items) {
    const shortName =
      item.product_name.length > 30
        ? `${item.product_name.slice(0, 28)}..`
        : item.product_name;
    lines.push(
      `${padRight(item.product_id, 10)} ${padRight(shortName, 30)} ${padLeft(String(item.quantity), 5)} ${padLeft(item.unit_price.toFixed(2), 11)} ${padLeft(item.line_total.toFixed(2), 12)}`,
    );
  }

  lines.push('------------------------------------------------------------------------');
  lines.push(`${padRight('Subtotal (INR):', 58)} ${padLeft(invoice.subtotal.toFixed(2), 13)}`);

  if (invoice.discount_amount > 0) {
    const label = invoice.promo_code
      ? `Discount (${invoice.promo_code} ${invoice.discount_percent}%):`
      : `Auto Discount (${invoice.discount_percent}%):`;
    lines.push(`${padRight(label, 58)} ${padLeft((-invoice.discount_amount).toFixed(2), 13)}`);
  } else {
    lines.push(`${padRight('Discount:', 58)} ${padLeft('0.00', 13)}`);
  }

  lines.push(`${padRight('Taxable Amount:', 58)} ${padLeft(invoice.taxable_amount.toFixed(2), 13)}`);
  lines.push(
    `${padRight(`GST (${(invoice.gst_rate * 100).toFixed(0)}%):`, 58)} ${padLeft(invoice.gst_amount.toFixed(2), 13)}`,
  );
  lines.push('------------------------------------------------------------------------');
  lines.push(
    `${padRight('FINAL PAYABLE AMOUNT (INR):', 58)} ${padLeft(invoice.final_amount.toFixed(2), 13)}`,
  );
  lines.push('========================================================================');
  lines.push('Thank you for shopping with us!');

  const commands: string[] = ['BT', '/F1 9.5 Tf', '42 775 Td', '13.5 TL'];
  lines.slice(0, 54).forEach((line, idx) => {
    const safe = escapePdfText(line.replace(/[^\x20-\x7E]/g, ' '));
    commands.push(idx === 0 ? `(${safe}) Tj` : `T* (${safe}) Tj`);
  });
  commands.push('ET');

  const streamContent = commands.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'latin1')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [0];
  let byteCount = chunks[0].length;

  for (const obj of objects) {
    offsets.push(byteCount);
    const buf = Buffer.from(obj, 'latin1');
    chunks.push(buf);
    byteCount += buf.length;
  }

  const xrefStart = byteCount;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i < offsets.length; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefLines.join('') + trailer, 'latin1'));

  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  return outputPath;
}
