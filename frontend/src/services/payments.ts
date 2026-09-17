import { request } from './auth';
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'OTHER';
export const methodLabels: Record<PaymentMethod, string> = { CASH: 'Efectivo', TRANSFER: 'Transferencia', OTHER: 'Otro' };
export interface PaymentInput { loanId: string; requestId: string; amountCents: number; paidOn: string; method: PaymentMethod; notes?: string }
export interface Payment {
  cancelledAt:string|null; cancellationReason:string|null; cancelledByName:string|null;
  receiptSnapshot?: {clientName:string;balanceBeforeCents:number;balanceAfterCents:number} | null;
  id: string; loanId: string; amountCents: number; paidOn: string; method: PaymentMethod; notes: string | null; createdAt: string;
  loan: { id: string; client: { fullName: string; phone: string } };
  createdBy: { fullName: string };
  allocations: { amountCents: number; installment: { number: number } }[];
}
export interface PaymentList { items: Payment[]; pagination: { page: number; total: number; totalPages: number } }
export async function createPayment(input: PaymentInput): Promise<Payment> {
  return (await request('/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json();
}
export async function listPayments(search: string, page: number, loanId: string, signal: AbortSignal, filters:{status?:string;from?:string;to?:string}={}): Promise<PaymentList> {
  const params = new URLSearchParams({ search, page: String(page), limit: '20' });
  Object.entries(filters).forEach(([key,value])=>{if(value)params.set(key,value);});
  if (loanId) params.set('loanId', loanId);
  return (await request(`/payments?${params}`, { signal })).json();
}
export const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
export const displayDate = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
export function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function getPayment(id:string,signal?:AbortSignal):Promise<Payment>{return(await request('/payments/'+encodeURIComponent(id),{signal})).json();}
export async function cancelPayment(id:string,reason:string):Promise<Payment>{return(await request('/payments/'+encodeURIComponent(id)+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})})).json();}
