import useReveal from '../components/useReveal';
import PaymentDetails from './PaymentDetails';
import ResponsiveTable from '../components/ResponsiveTable';
import ReceiptActions from './ReceiptActions';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../services/auth';
import type { UserRole } from '../services/auth';
import { getLoan, listLoans } from '../services/loans';
import type { Loan, LoanList } from '../services/loans';
import { createPayment, getPayment, displayDate, listPayments, methodLabels, money, today } from '../services/payments';
import type { Payment, PaymentInput, PaymentList, PaymentMethod } from '../services/payments';
import './PaymentsPage.css';
const message = (e: unknown) => e instanceof ApiError ? e.message : 'No se pudo completar la operación. Intenta nuevamente.';

function PaymentForm({ loan, onSaved, onSessionExpired }: { loan: Loan; onSaved: (payment: Payment) => void; onSessionExpired: () => void }) {
  const balance = loan.balanceCents ?? loan.totalCents;
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [review, setReview] = useState<PaymentInput | null>(null);
  const formRef=useReveal(review?"review":loan.id);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  function prepare(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setError('Escribe un importe con máximo dos decimales.'); return; }
    const [whole, decimals = ''] = amount.split('.');
    const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > balance) { setError('El abono debe ser mayor a cero y no superar el saldo pendiente.'); return; }
    setReview({ loanId: loan.id, requestId: crypto.randomUUID(), amountCents: cents, paidOn, method, notes: notes.trim() || undefined });
  }
  async function save() {
    if (!review || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const payment = await createPayment(review);
      setReview(null); setAmount(''); setNotes(''); onSaved(payment);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setError(message(e));
    } finally { lock.current = false; setBusy(false); }
  }
  return <section ref={formRef} tabIndex={-1} className="payment-form"><h3>Registrar abono</h3>
    {!review ? <form onSubmit={prepare}><div className="client-form-grid">
      <div className="form-field"><label htmlFor="payment-amount">Importe recibido (MXN)</label><input id="payment-amount" type="number" min="0.01" max={balance / 100} step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="payment-date">Fecha del pago</label><input id="payment-date" type="date" min="2000-01-01" max={today()} required value={paidOn} onChange={e => setPaidOn(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="payment-method">Método</label><select id="payment-method" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{Object.entries(methodLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
      <div className="form-field"><label htmlFor="payment-notes">Referencia o nota (opcional)</label><input id="payment-notes" maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} /></div>
    </div><p>El abono se aplicará primero a las cuotas pendientes más antiguas.</p><button className="primary-button">Revisar pago</button></form> : <div className="payment-review"><h4>Confirma los datos del abono</h4><dl><div><dt>Cliente</dt><dd>{loan.client.fullName}</dd></div><div><dt>Folio del préstamo</dt><dd>{loan.id}</dd></div><div><dt>Importe recibido</dt><dd>{money(review.amountCents)}</dd></div><div><dt>Fecha y método</dt><dd>{displayDate(review.paidOn)} · {methodLabels[review.method]}</dd></div><div><dt>Saldo estimado después del pago</dt><dd>{money(balance - review.amountCents)}</dd></div></dl><div className="loan-actions"><button className="secondary-button" disabled={busy} onClick={() => { setReview(null); setError(''); }}>Modificar</button><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? 'Registrando…' : 'Confirmar pago recibido'}</button></div></div>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}

export default function PaymentsPage({ role, active, onSessionExpired, onPaymentSaved, initialLoanId = "", refreshVersion=0 }: { role: UserRole; active: boolean; onSessionExpired: () => void; onPaymentSaved: () => void; initialLoanId?: string;refreshVersion?:number }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ search: '', page: 1, revision: 0 });
  const [loans, setLoans] = useState<LoanList | null>(null);
  const [loansError, setLoansError] = useState('');
  const [selectedId, setSelectedId] = useState(initialLoanId);
  const [showLoanPicker, setShowLoanPicker] = useState(!initialLoanId);
  const [selected, setSelected] = useState<Loan | null>(null);
  const [detailError, setDetailError] = useState('');
  const [revision, setRevision] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<PaymentList | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [historyDetail, setHistoryDetail] = useState<Payment | null>(null);
  const receiptId=receipt?.id;
  useEffect(()=>{if(!active||!receiptId)return;const c=new AbortController();void getPayment(receiptId,c.signal).then(p=>{if(!c.signal.aborted)setReceipt(p);}).catch(e=>{if(!c.signal.aborted&&e instanceof ApiError&&e.status===401)onSessionExpired();});return()=>c.abort();},[active,receiptId,refreshVersion,onSessionExpired]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    void listLoans(filter.search, filter.page, controller.signal).then(r => { if (!controller.signal.aborted) { setLoans(r); setLoansError(''); } }).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setLoansError(message(e));
    });
    return () => controller.abort();
  }, [filter, revision, refreshVersion, active, onSessionExpired]);
  useEffect(() => {
    if (!selectedId || !active) return;
    const controller = new AbortController();

    void getLoan(selectedId, controller.signal).then(r => { if (!controller.signal.aborted) { setSelected(r); setDetailError(''); } }).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setDetailError(message(e));
    });
    return () => controller.abort();
  }, [selectedId, revision, refreshVersion, active, onSessionExpired]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    void listPayments(selectedId ? '' : filter.search, historyPage, selectedId, controller.signal).then(r => { if (!controller.signal.aborted) { setHistory(r); setHistoryError(''); } }).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setHistoryError(message(e));
    });
    return () => controller.abort();
  }, [filter.search, filter.revision, historyPage, selectedId, revision, refreshVersion, active, onSessionExpired]);
  function refresh() { setLoans(null); setLoansError(''); setDetailError(''); setHistory(null); setHistoryError(''); setRevision(r => r + 1); }
  function choose(loan: Loan) { if (selectedId === loan.id) { refresh(); return; } setHistory(null); setHistoryError(''); setSelected(null); setSelectedId(loan.id); setDetailError(''); setHistoryPage(1); setReceipt(null); setHistoryDetail(null); }
  function saved(payment: Payment) { setReceipt(payment); setHistoryPage(1); refresh(); onPaymentSaved(); }
  const balance = selected ? selected.balanceCents ?? selected.totalCents : 0;
  return <section className="clients-page payments-page"><header className="clients-heading"><div><h2>Pagos</h2><p>Registra abonos y consulta el saldo de cada préstamo.</p></div><button className="secondary-button" onClick={refresh}>Actualizar</button></header>
    {receipt && <section className="client-notice" role="status"><strong>{receipt.cancelledAt?'Pago cancelado':'Pago registrado'}: {money(receipt.amountCents)}</strong><p>{receipt.loan.client.fullName} · {displayDate(receipt.paidOn)} · {methodLabels[receipt.method]}</p><p>Folio del pago: {receipt.id}</p><p>Registrado por: {receipt.createdBy.fullName}</p><ReceiptActions key={receipt.id+receipt.cancelledAt} payment={receipt} onSessionExpired={onSessionExpired}/></section>}
    {!showLoanPicker && <button className="secondary-button" onClick={() => setShowLoanPicker(true)}>Buscar otro préstamo</button>}
    {showLoanPicker && <><form className="client-search" onSubmit={e => { e.preventDefault(); setLoans(null); setLoansError(''); setHistory(null); setHistoryError(''); setSelectedId(''); setSelected(null); setHistoryPage(1); setHistoryDetail(null); setFilter(f => ({ search: search.trim(), page: 1, revision: f.revision + 1 })); }}><div className="form-field"><label htmlFor="payments-search">Buscar por cliente o teléfono</label><input id="payments-search" type="search" maxLength={150} value={search} onChange={e => setSearch(e.target.value)} /></div><button className="secondary-button">Buscar</button></form>
    {loansError ? <p role="alert" className="error-message">{loansError}</p> : !loans ? <p role="status">Cargando préstamos…</p> : <>{loans.items.length === 0 ? <p>No hay préstamos para mostrar.</p> : <div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th scope="col">Cliente / préstamo</th><th scope="col">Total pactado</th><th scope="col">Pagado</th><th scope="col">Saldo</th><th scope="col">Acción</th></tr></thead><tbody>{loans.items.map(loan => <tr key={loan.id}><td>{loan.client.fullName}<small className="payment-loan-id">{loan.id}</small></td><td>{money(loan.totalCents)}</td><td>{money(loan.paidCents ?? 0)}</td><td>{money(loan.balanceCents ?? loan.totalCents)}{loan.status === 'PAID' && <small className="payment-loan-id">Liquidado</small>}</td><td><button className="secondary-button" onClick={() => choose(loan)} aria-pressed={selectedId === loan.id}>Ver pagos</button></td></tr>)}</tbody></ResponsiveTable></div>}<nav className="client-pagination" aria-label="Páginas de préstamos"><button className="secondary-button" disabled={filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}>Anterior</button><span>Página {filter.page} de {Math.max(1, loans.pagination.totalPages)}</span><button className="secondary-button" disabled={filter.page >= loans.pagination.totalPages} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}>Siguiente</button></nav></>}
    </>}
    {selectedId && <section className="client-panel"><div className="clients-heading"><h3>{selected ? `Préstamo de ${selected.client.fullName}` : 'Detalle del préstamo'}</h3><button className="secondary-button" onClick={() => { setShowLoanPicker(true); setSelectedId(''); setSelected(null); setHistoryPage(1); setHistoryDetail(null); }}>Ver todos los pagos</button></div>
      {detailError ? <p className="error-message" role="alert">{detailError}</p> : !selected ? <p role="status">Actualizando saldo…</p> : <><p>Folio: {selected.id}</p><div className="loan-totals"><div><span>Total pactado</span><strong>{money(selected.totalCents)}</strong></div><div><span>Pagado</span><strong>{money(selected.paidCents ?? 0)}</strong></div><div><span>Saldo pendiente</span><strong>{money(balance)}</strong></div></div>
        {selected.deletedAt ? <p className="client-notice">Préstamo eliminado. El historial se conserva; no se admiten nuevos pagos.</p> : balance === 0 ? <p className="client-notice">Préstamo liquidado.</p> : role !== 'VIEWER' ? <PaymentForm key={selected.id} loan={selected} onSaved={saved} onSessionExpired={onSessionExpired} /> : <p>Tu cuenta tiene acceso de consulta.</p>}
        <h3>Estado de las cuotas</h3><div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th scope="col">Pago</th><th scope="col">Vencimiento</th><th scope="col">Cuota</th><th scope="col">Pagado</th><th scope="col">Pendiente</th><th scope="col">Estado</th></tr></thead><tbody>{selected.installments.map(i => <tr key={i.number}><td>{i.number}</td><td>{displayDate(i.dueDate)}</td><td>{money(i.amountCents)}</td><td>{money(i.paidCents ?? 0)}</td><td>{money(i.balanceCents ?? i.amountCents)}</td><td>{i.status === 'PAID' ? 'Pagada' : i.status === 'PARTIAL' ? 'Parcial' : 'Pendiente'}</td></tr>)}</tbody></ResponsiveTable></div>
      </>}
    </section>}
    <section className="client-panel"><h3>{selectedId ? 'Historial de este préstamo' : 'Historial de pagos'}</h3>
      {historyError ? <p role="alert" className="error-message">{historyError}</p> : !history ? <p role="status">Cargando historial…</p> : <><p>{history.pagination.total} pagos registrados</p>{history.items.length > 0 && <div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th scope="col">Fecha</th><th scope="col">Cliente</th><th scope="col">Importe</th><th scope="col">Método</th><th scope="col">Registró</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead><tbody>{history.items.map(p => <tr key={p.id}><td>{displayDate(p.paidOn)}</td><td>{p.loan.client.fullName}</td><td>{money(p.amountCents)}</td><td>{methodLabels[p.method]}</td><td>{p.createdBy.fullName}</td><td><span className={'payment-status '+(p.cancelledAt?'cancelled':'valid')}>{p.cancelledAt?'Cancelado':'Vigente'}</span></td><td><button className="secondary-button" onClick={() => setHistoryDetail(p)}>Ver detalle</button></td></tr>)}</tbody></ResponsiveTable></div>}<nav className="client-pagination" aria-label="Páginas de pagos"><button className="secondary-button" disabled={historyPage <= 1} onClick={() => { setHistoryPage(p => p - 1); setHistoryDetail(null); }}>Anterior</button><span>Página {historyPage} de {Math.max(1, history.pagination.totalPages)}</span><button className="secondary-button" disabled={historyPage >= history.pagination.totalPages} onClick={() => { setHistoryPage(p => p + 1); setHistoryDetail(null); }}>Siguiente</button></nav></>}
      {historyDetail && <PaymentDetails key={historyDetail.id} id={historyDetail.id} role={role} onSessionExpired={onSessionExpired} onClose={()=>setHistoryDetail(null)} onChanged={()=>{setReceipt(null);refresh();onPaymentSaved();}}/>}
    </section>
  </section>;
}
