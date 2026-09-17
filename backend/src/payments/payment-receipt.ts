import PDFDocument = require('pdfkit');
export interface ReceiptSnapshot {
  version: 1;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  footer: string;
  clientName: string;
  clientPhone: string;
  cashierName: string;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  installments: {
    number: number;
    dueDate: string;
    amountCents: number;
    remainingCents: number;
  }[];
}
interface ReceiptPayment {
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  cancelledByName?: string | null;
  id: string;
  loanId: string;
  amountCents: number;
  paidOn: Date;
  method: string;
  notes: string | null;
  loan: { client: { fullName: string; phone: string } };
  createdBy: { fullName: string };
  allocations: { amountCents: number; installment: { number: number } }[];
}
const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
    cents / 100,
  );
const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export function renderReceipt(
  payment: ReceiptPayment,
  snapshot: ReceiptSnapshot | null,
  legacyBusiness: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: 'Comprobante de pago ' + payment.id,
        Author: snapshot?.businessName ?? legacyBusiness,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.on('pageAdded', () => {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#526672')
        .text(
          (payment.cancelledAt ? 'CANCELADO · ' : '') +
            'Comprobante de pago · Continuación',
          48,
          48,
        );
      doc.text('Folio: ' + payment.id);
      doc.moveDown(1.5);
    });
    const width = 499;
    const text = (value: string, size = 10, color = '#253d49') => {
      doc
        .font('Helvetica')
        .fontSize(size)
        .fillColor(color)
        .text(value, { width, lineGap: 4 });
    };
    const space = (height = 12) => {
      doc.y += height;
    };
    const room = (height: number) => {
      if (doc.y + height > 760) doc.addPage();
    };
    text(snapshot?.businessName ?? legacyBusiness, 22, '#146454');
    if (snapshot?.businessAddress) text(snapshot.businessAddress);
    if (snapshot?.businessPhone) text('Teléfono: ' + snapshot.businessPhone);
    space(20);
    if (payment.cancelledAt) {
      text('CANCELADO · SIN VALIDEZ COMO PAGO', 16, '#a02525');
      text(
        'Cancelado el ' +
          new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/Mexico_City',
          }).format(payment.cancelledAt) +
          ' (Ciudad de México)',
        9,
      );
      text('Por: ' + payment.cancelledByName, 9);
      text('Motivo: ' + payment.cancellationReason, 9);
      text(
        'El abono fue retirado del saldo. Los importes siguientes corresponden al registro original.',
        9,
      );
      space();
    }
    text('COMPROBANTE DE PAGO', 19, '#112d3b');
    space();
    text('Folio: ' + payment.id, 9);
    text('Préstamo: ' + payment.loanId, 9);
    text('Fecha del pago: ' + date(payment.paidOn.toISOString()));
    space();
    text(
      'Cliente: ' + (snapshot?.clientName ?? payment.loan.client.fullName),
      12,
    );
    text('Teléfono: ' + (snapshot?.clientPhone ?? payment.loan.client.phone));
    text('Recibió: ' + (snapshot?.cashierName ?? payment.createdBy.fullName));
    text(
      'Método: ' +
        ({ CASH: 'Efectivo', TRANSFER: 'Transferencia', OTHER: 'Otro' }[
          payment.method
        ] ?? payment.method),
    );
    space(18);
    room(112);
    const top = doc.y;
    doc.roundedRect(48, top, width, 100, 8).fill('#edf7f3');
    doc.y = top + 14;
    doc.x = 64;
    text(
      'Deuda anterior: ' +
        (snapshot ? money(snapshot.balanceBeforeCents) : 'No disponible'),
      12,
    );
    text('Pago recibido: ' + money(payment.amountCents), 14, '#146454');
    text(
      'Nueva deuda: ' +
        (snapshot ? money(snapshot.balanceAfterCents) : 'No disponible'),
      14,
    );
    doc.x = 48;
    doc.y = top + 116;
    if (!snapshot) {
      text(
        'Pago anterior a la función de comprobantes. No se conservaron los saldos históricos; los datos de cliente y negocio corresponden al registro actual. Este documento no certifica el saldo de aquella fecha.',
        9,
        '#7c4d12',
      );
      space();
    }
    room(70);
    text('Aplicación del pago', 14);
    space(6);
    const rows =
      snapshot?.installments ??
      [...payment.allocations]
        .sort((a, b) => a.installment.number - b.installment.number)
        .map((a) => ({
          number: a.installment.number,
          amountCents: a.amountCents,
          dueDate: '',
          remainingCents: null,
        }));
    for (const row of rows) {
      room(55);
      text(
        'Cuota ' +
          row.number +
          (row.dueDate ? ' · Vencimiento ' + date(row.dueDate) : '') +
          ' · Abono ' +
          money(row.amountCents),
        10,
      );
      if (row.remainingCents !== null)
        text(
          row.remainingCents === 0
            ? 'Cuota cubierta'
            : 'Pago parcial · Pendiente de esta cuota: ' +
                money(row.remainingCents),
          9,
          '#526672',
        );
      space(6);
    }
    if (payment.notes) {
      room(110);
      space();
      text('Referencia / nota', 11);
      text(payment.notes, 10);
    }
    room(105);
    space(16);
    if (snapshot?.footer) text(snapshot.footer, 10, '#146454');
    space();
    text(
      'Importes en pesos mexicanos (MXN). Saldos del préstamo al registrar este abono; pueden existir movimientos posteriores. Conserve este comprobante.',
      8,
      '#526672',
    );
    doc.end();
  });
}
