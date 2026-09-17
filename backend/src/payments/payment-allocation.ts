import { BadRequestException } from '@nestjs/common';

export function allocatePayment(amountCents: number, installments: { id: string; number: number; amountCents: number; paidCents: number }[]) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new BadRequestException('El pago debe ser mayor a cero y tener máximo dos decimales.');
  const ordered = [...installments].sort((a, b) => a.number - b.number);
  const balance = ordered.reduce((sum, i) => sum + i.amountCents - i.paidCents, 0);
  if (amountCents > balance) throw new BadRequestException('El pago supera el saldo pendiente. Actualiza el préstamo y revisa el importe.');
  let remaining = amountCents;
  const allocations: { installmentId: string; amountCents: number }[] = [];
  for (const installment of ordered) {
    if (remaining === 0) break;
    const applied = Math.min(remaining, installment.amountCents - installment.paidCents);
    if (applied > 0) { allocations.push({ installmentId: installment.id, amountCents: applied }); remaining -= applied; }
  }
  return allocations;
}

export function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function validatePaymentDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > businessDate()) {
    throw new BadRequestException('La fecha del pago debe ser válida y no puede estar en el futuro.');
  }
  return date;
}
