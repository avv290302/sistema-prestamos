import { BadRequestException } from '@nestjs/common';

export const frequencies = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'INTERVAL', 'CUSTOM'] as const;
export type Frequency = typeof frequencies[number];
export interface PlanOptions {
  interestBps?: number;
  installmentCount?: number;
  frequency?: Frequency;
  intervalDays?: number;
  regularPaymentCents?: number;
  customInstallments?: { dueDate: string; amountCents: number }[];
}
function fail(message: string): never { throw new BadRequestException(message); }
function calendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) {
    fail('Selecciona fechas válidas entre los años 2000 y 2100.');
  }
  return date;
}
// Integer cents and hundredths of a percent. Defaults preserve legacy contracts.
export function buildLoanPlan(principalCents: number, firstPaymentDate: string, options: PlanOptions = {}) {
  if (!Number.isInteger(principalCents) || principalCents < 100 || principalCents > 100_000_000) fail('El monto debe estar entre $1 y $1,000,000, con máximo dos decimales.');
  const date = calendarDate(firstPaymentDate);
  const { interestBps = 4000, installmentCount = 14, frequency = 'WEEKLY', intervalDays = 7, regularPaymentCents, customInstallments } = options;
  if (!Number.isInteger(interestBps) || interestBps < 0 || interestBps > 100_000) fail('El interés total debe estar entre 0 y 1,000 %, con máximo dos decimales.');
  if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 1000) fail('El número de pagos debe estar entre 1 y 1,000.');
  if (!frequencies.includes(frequency)) fail('Selecciona una frecuencia válida.');
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) fail('El intervalo debe estar entre 1 y 365 días.');
  const interestCents = Math.round(principalCents * interestBps / 10000);
  const totalCents = principalCents + interestCents;
  const step = frequency === 'DAILY' ? 1 : frequency === 'FORTNIGHTLY' ? 15 : frequency === 'INTERVAL' ? intervalDays : 7;
  let installments: { number: number; dueDate: string; amountCents: number }[];
  if (frequency === 'CUSTOM') {
    if (regularPaymentCents !== undefined) fail('El calendario personalizado define el importe de cada pago.');
    if (!Array.isArray(customInstallments) || customInstallments.length !== installmentCount) fail('El calendario debe contener el número de pagos indicado.');
    installments = customInstallments.map((item, index) => {
      calendarDate(item.dueDate);
      if (!Number.isInteger(item.amountCents) || item.amountCents < 1 || item.amountCents > totalCents) fail('Cada pago debe ser positivo y expresarse con máximo dos decimales.');
      if (index === 0 && item.dueDate !== firstPaymentDate) fail('El primer vencimiento debe coincidir con la fecha del primer pago.');
      if (index > 0 && item.dueDate <= customInstallments[index - 1].dueDate) fail('Las fechas de pago deben estar en orden y no repetirse.');
      return { number: index + 1, dueDate: item.dueDate, amountCents: item.amountCents };
    });
    if (installments.reduce((sum, i) => sum + i.amountCents, 0) !== totalCents) fail('La suma del calendario debe coincidir con el capital más el interés pactado.');
  } else {
    if (customInstallments !== undefined) fail('Selecciona calendario personalizado para ajustar los pagos.');
    const rounded = Math.round(totalCents / installmentCount);
    const automatic = totalCents - rounded * (installmentCount - 1) > 0 ? rounded : Math.floor(totalCents / installmentCount);
    const payment = regularPaymentCents ?? automatic;
    const lastPayment = totalCents - payment * (installmentCount - 1);
    if (!Number.isInteger(payment) || payment < 1 || payment > totalCents || lastPayment < 1 || (installmentCount === 1 && payment !== totalCents)) fail('El importe por pago no es compatible con el total y el número de pagos. Ajusta estas condiciones.');
    installments = Array.from({ length: installmentCount }, (_, index) => {
      const due = new Date(date);
      if (frequency === 'MONTHLY') {
        // Anchor to the original day, clamping short months without drifting.
        due.setUTCDate(1);
        due.setUTCMonth(due.getUTCMonth() + index);
        const lastDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 0)).getUTCDate();
        due.setUTCDate(Math.min(date.getUTCDate(), lastDay));
      } else due.setUTCDate(due.getUTCDate() + index * step);
      const dueDate = due.toISOString().slice(0, 10);
      calendarDate(dueDate);
      return { number: index + 1, dueDate, amountCents: index === installmentCount - 1 ? lastPayment : payment };
    });
  }
  // weeklyCents is the legacy storage/API name of the first scheduled payment.
  return { principalCents, interestCents, totalCents, weeklyCents: installments[0].amountCents,
    interestBps, installmentCount, frequency, intervalDays: frequency === 'INTERVAL' ? intervalDays : step, installments };
}
