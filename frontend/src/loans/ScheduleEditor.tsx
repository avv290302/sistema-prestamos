import {useEffect,useRef} from 'react';
import ResponsiveTable from '../components/ResponsiveTable';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Installment, LoanInput, LoanPlan } from '../services/loans';
import { previewLoan } from '../services/loans';
import { ApiError } from '../services/auth';

const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
export default function ScheduleEditor({ fixedInstallments=[], plan, input, onReviewed, onCancel, onSessionExpired }: {
  fixedInstallments?:Installment[]; plan: LoanPlan; input: LoanInput; onReviewed: (plan: LoanPlan, input: LoanInput) => void; onCancel: () => void; onSessionExpired: () => void;
}) {
  const formRef=useRef<HTMLFormElement>(null);useEffect(()=>{formRef.current?.scrollIntoView({block:'start'});formRef.current?.focus({preventScroll:true});},[]);
  const [rows, setRows] = useState(() => plan.installments.map(i => {const item=fixedInstallments.find(f=>f.number===i.number)??i;return { dueDate: item.dueDate.slice(0, 10), amount: (item.amountCents / 100).toFixed(2) };}));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sum = rows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);
  async function review(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (rows.some(r => !/^\d+(\.\d{1,2})?$/.test(r.amount))) { setError('Cada importe debe tener máximo dos decimales.'); return; }
    setBusy(true); setError('');
    const updated: LoanInput = { ...input, requestId: crypto.randomUUID(), frequency: 'CUSTOM', regularPaymentCents: undefined,
      firstPaymentDate: rows[0].dueDate, customInstallments: rows.map(r => ({ dueDate: r.dueDate, amountCents: Math.round(Number(r.amount) * 100) })) };
    try { onReviewed(await previewLoan(updated), updated); }
    catch (err) { if (err instanceof ApiError && err.status === 401) onSessionExpired(); else setError(err instanceof ApiError ? err.message : 'No se pudo validar el calendario. Intenta nuevamente.'); }
    finally { setBusy(false); }
  }
  return <form ref={formRef} tabIndex={-1} onSubmit={e => void review(e)} className="loan-schedule-editor"><h4>Personalizar fechas e importes</h4>
    <p>Ajusta cada cuota. Las fechas deben ser distintas y estar en orden; los importes deben sumar {money(plan.totalCents)}.</p>
    <div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th>Pago</th><th>Vencimiento</th><th>Importe (MXN)</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{index + 1}</td><td><input aria-label={`Fecha del pago ${index + 1}`} type="date" min="2000-01-01" max="2100-12-31" required value={row.dueDate} disabled={busy||fixedInstallments.some(i=>i.number===index+1)} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, dueDate: e.target.value } : r))} /></td><td><input aria-label={`Importe del pago ${index + 1}`} type="number" min="0.01" max={plan.totalCents / 100} step="0.01" required value={row.amount} disabled={busy||fixedInstallments.some(i=>i.number===index+1)} onChange={e => setRows(current => current.map((r, i) => i === index ? { ...r, amount: e.target.value } : r))} /></td></tr>)}</tbody></ResponsiveTable></div>
    <p role="status">Total del calendario: <strong>{money(sum)}</strong> · Diferencia pendiente: <strong>{money(plan.totalCents - sum)}</strong></p>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="loan-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Descartar ajustes</button><button className="primary-button" disabled={busy}>{busy ? 'Validando…' : 'Validar calendario'}</button></div>
  </form>;
}
