import { request } from './auth';
export type LoanFrequency = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'INTERVAL' | 'CUSTOM';
export const frequencyLabels: Record<LoanFrequency, string> = { DAILY: 'Diario', WEEKLY: 'Semanal', FORTNIGHTLY: 'Cada 15 días', MONTHLY: 'Mensual', INTERVAL: 'Cada cierto número de días', CUSTOM: 'Calendario personalizado' };
export interface Installment { hasPaymentHistory?: boolean; paidCents?: number; balanceCents?: number; status?: 'PAID' | 'PARTIAL' | 'PENDING'; number: number; dueDate: string; amountCents: number }
export interface LoanPlan { principalCents: number; interestCents: number; totalCents: number; weeklyCents: number; interestBps: number; installmentCount: number; frequency: LoanFrequency; intervalDays: number; installments: Installment[] }
export interface Loan extends LoanPlan { paidCents?: number; balanceCents?: number; status?: 'PAID' | 'ACTIVE' | 'CANCELLED'; version:number; deletedAt:string|null; id: string; createdAt: string; client: { id: string; fullName: string; phone: string } }
export interface PlanInput { principalCents: number; firstPaymentDate: string; interestBps: number; installmentCount: number; frequency: LoanFrequency; intervalDays?: number; regularPaymentCents?: number; customInstallments?: { dueDate: string; amountCents: number }[] }
export interface LoanInput extends PlanInput { clientId: string; requestId: string }
export interface LoanList { items: Loan[]; pagination: { page: number; total: number; totalPages: number } }
export async function listLoans(search: string, page: number, signal: AbortSignal, archived=false): Promise<LoanList> {
  const params = new URLSearchParams({ search, page: String(page), limit: '20', archived:String(archived) });
  return (await request(`/loans?${params}`, { signal })).json();
}
export async function previewLoan(input: PlanInput): Promise<LoanPlan> {
  const { principalCents, firstPaymentDate, interestBps, installmentCount, frequency, intervalDays, regularPaymentCents, customInstallments } = input;
  return (await request('/loans/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principalCents, firstPaymentDate, interestBps, installmentCount, frequency, intervalDays, regularPaymentCents, customInstallments }) })).json();
}
export async function createLoan(data: LoanInput): Promise<Loan> {
  return (await request('/loans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
}
export async function getLoan(id: string, signal: AbortSignal): Promise<Loan> {
  return (await request(`/loans/${encodeURIComponent(id)}`, { signal })).json();
}

export async function updateLoan(id:string,input:LoanInput,version:number):Promise<Loan>{
 const {clientId:_clientId,requestId:_requestId,...plan}=input;
 return(await request('/loans/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...plan,version})})).json();
}
export async function archiveLoan(loan:Loan,restore=false):Promise<Loan>{return(await request('/loans/'+encodeURIComponent(loan.id)+(restore?'/restore':''),{method:restore?'POST':'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:loan.version})})).json();}
