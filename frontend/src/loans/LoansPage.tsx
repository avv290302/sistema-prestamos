import useReveal from '../components/useReveal';
import Dialog from '../components/Dialog';
import ResponsiveTable from '../components/ResponsiveTable';
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../services/auth";
import type { UserRole } from "../services/auth";
import { listClients } from "../services/clients";
import type { Client, ClientsResponse } from "../services/clients";
import { archiveLoan, createLoan, listLoans, previewLoan, updateLoan } from "../services/loans";
import type { Loan, LoanInput, LoanList, LoanPlan } from "../services/loans";
import "./LoansPage.css";
import { getSettings } from "../services/administration";
import { today } from "../services/payments";
import ScheduleEditor from "./ScheduleEditor";
import { frequencyLabels } from "../services/loans";
import type { LoanFrequency } from "../services/loans";
const money = (cents: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cents / 100);
const dateLabel = (date: string) => new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
const message = (e: unknown) => e instanceof ApiError ? e.message : "No se pudo completar la operación. Intenta nuevamente.";
function firstPaymentDate(days = 7) { const date = new Date(`${today()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0,10); }
function Schedule({ plan }: { plan: LoanPlan }) {
  return <><div className="loan-totals"><div><span>Monto prestado</span><strong>{money(plan.principalCents)}</strong></div><div><span>Interés total · {plan.interestBps / 100} %</span><strong>{money(plan.interestCents)}</strong></div><div><span>Total a pagar</span><strong>{money(plan.totalCents)}</strong></div><div><span>Primer pago</span><strong>{money(plan.weeklyCents)}</strong></div></div>
  <p><strong>{plan.installmentCount} pagos · {plan.frequency === "INTERVAL" ? `Cada ${plan.intervalDays} días` : frequencyLabels[plan.frequency]}</strong><br />Del {dateLabel(plan.installments[0].dueDate)} al {dateLabel(plan.installments[plan.installments.length - 1].dueDate)}. Los importes pactados son los del calendario.</p>
  <div className="client-table-wrap"><ResponsiveTable className="client-table"><caption>Calendario de pagos programados</caption><thead><tr><th scope="col">Pago</th><th scope="col">Vencimiento</th><th scope="col">Importe</th></tr></thead><tbody>{plan.installments.map(i => <tr key={i.number}><td>{i.number}</td><td>{dateLabel(i.dueDate)}</td><td>{money(i.amountCents)}</td></tr>)}</tbody></ResponsiveTable></div></>;
}
function LoanForm({ initial, onCreated, onSessionExpired, onCancel }: { initial?:Loan|null; onCreated: (loan: Loan) => void; onSessionExpired: () => void; onCancel: () => void }) {
  const [clientQuery, setClientQuery] = useState("");
  const [lookup, setLookup] = useState({ search: "", page: 1, revision: 0 });
  const [clients, setClients] = useState<ClientsResponse | null>(null);
  const [client, setClient] = useState<Pick<Client,"id"|"fullName"|"phone"> | null>(initial?.client??null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientError, setClientError] = useState("");
  const [amount, setAmount] = useState(initial?String(initial.principalCents/100):"");
  const [firstDate, setFirstDate] = useState(()=>initial?.installments[0].dueDate.slice(0,10)??firstPaymentDate());
  const [interest, setInterest] = useState(initial?String(initial.interestBps/100):"40");
  const [count, setCount] = useState(initial?String(initial.installmentCount):"14");
  const [frequency, setFrequency] = useState<LoanFrequency>(initial&&initial.frequency!=="CUSTOM"?initial.frequency:"WEEKLY");
  const [intervalDays, setIntervalDays] = useState(initial?String(initial.intervalDays):"7");
  const [regularPayment, setRegularPayment] = useState("");
  const [defaultsReady,setDefaultsReady] = useState(!!initial);
  const [defaultsRevision,setDefaultsRevision] = useState(0);
  const [defaultsError,setDefaultsError] = useState("");
  useEffect(() => { if(initial)return; const c = new AbortController(); void getSettings(c.signal).then(s => { if(c.signal.aborted)return; setInterest(String(s.interestBps/100)); setCount(String(s.installmentCount)); setFrequency(s.frequency); setIntervalDays(String(s.intervalDays)); setFirstDate(firstPaymentDate(s.firstPaymentAfterDays)); setDefaultsReady(true); setDefaultsError(""); }).catch(e => { if(c.signal.aborted)return; if(e instanceof ApiError && e.status === 401) onSessionExpired(); else setDefaultsError(message(e)); }); return () => c.abort(); }, [defaultsRevision,onSessionExpired,initial]);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [preview, setPreview] = useState<{ plan: LoanPlan; input: LoanInput } | null>(()=>initial?{plan:initial,input:{clientId:initial.client.id,requestId:crypto.randomUUID(),principalCents:initial.principalCents,interestBps:initial.interestBps,installmentCount:initial.installmentCount,frequency:"CUSTOM",firstPaymentDate:initial.installments[0].dueDate.slice(0,10),customInstallments:initial.installments.map(i=>({dueDate:i.dueDate.slice(0,10),amountCents:i.amountCents}))}}:null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void listClients({ ...lookup, signal: controller.signal }).then(r => { if (!controller.signal.aborted) setClients(r); }).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setClientError(message(e));
    }).finally(() => { if (!controller.signal.aborted) setLoadingClients(false); });
    return () => controller.abort();
  }, [lookup, onSessionExpired]);
  function searchClients(page = 1) {
    setLoadingClients(true); setClientError(""); setClients(null);
    setLookup(previous => ({ search: clientQuery.trim(), page, revision: previous.revision + 1 }));
  }
  function fail(e: unknown) { if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setError(message(e)); }
  async function review(e: FormEvent) {
    e.preventDefault(); if (lock.current || !defaultsReady) return; setError("");
    if (!client) { setError("Selecciona un cliente activo."); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setError("Escribe un monto con máximo dos decimales."); return; }
    const [whole, decimals = ""] = amount.split(".");
    const principalCents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
    if (principalCents < 100 || principalCents > 100000000) { setError("El monto debe estar entre $1 y $1,000,000."); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(interest) || (regularPayment && !/^\d+(\.\d{1,2})?$/.test(regularPayment))) { setError("El interés y el importe por pago admiten máximo dos decimales."); return; }
    lock.current = true; setBusy(true);
    try {
      const input: LoanInput = { clientId: client.id, principalCents, firstPaymentDate: firstDate, requestId: crypto.randomUUID(), interestBps: Math.round(Number(interest) * 100), installmentCount: Number(count), frequency, intervalDays: Number(intervalDays), ...(regularPayment ? { regularPaymentCents: Math.round(Number(regularPayment) * 100) } : {}) };
      setPreview({ plan: await previewLoan(input), input });
    } catch (err) { fail(err); } finally { lock.current = false; setBusy(false); }
  }
  const stepRef=useReveal(editingSchedule?null:preview?"review":"terms");
  async function save() {
    if (!preview || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { onCreated(initial?await updateLoan(initial.id,preview.input,initial.version):await createLoan(preview.input)); }
    catch (err) { fail(err); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog label={initial?"Modificar préstamo":"Nuevo préstamo"} onClose={onCancel} busy={busy||editingSchedule}><section ref={stepRef} tabIndex={-1} className="client-panel"><div className="clients-heading"><h3>{initial?"Modificar préstamo":"Nuevo préstamo"}</h3><button className="secondary-button" disabled={busy || editingSchedule} onClick={onCancel}>Cancelar</button></div>
    {initial&&<p>Se conserva el cliente y el historial de pagos. Las cuotas con historial de abonos, incluso cancelados, mantienen fecha e importe; puedes personalizar las demás cuotas. Cada modificación queda registrada.</p>}
    {!preview ? <>
      <form className="client-search" onSubmit={e => { e.preventDefault(); searchClients(); }}><div className="form-field"><label htmlFor="loan-client-search">Buscar cliente por nombre o teléfono</label><input id="loan-client-search" maxLength={150} value={clientQuery} disabled={busy} onChange={e => setClientQuery(e.target.value)} /></div><button className="secondary-button" disabled={busy}>Buscar</button></form>
      {clientError && <p role="alert" className="error-message">{clientError}</p>}
      {loadingClients ? <p role="status">Cargando clientes…</p> : clients && <><div className="loan-client-options" role="group" aria-label="Selecciona un cliente">{clients.items.length === 0 && <p>No se encontraron clientes. Regístralo en el módulo Clientes.</p>}{clients.items.map(c => <button type="button" className="secondary-button" key={c.id} disabled={!c.isActive || busy || !!initial} aria-pressed={client?.id === c.id} onClick={() => setClient(c)}>{c.fullName} · {c.phone}{!c.isActive && " · Inactivo"}</button>)}</div><div className="client-pagination"><button className="secondary-button" disabled={busy || lookup.page <= 1} onClick={() => searchClients(lookup.page - 1)}>Anterior</button><span>Página {lookup.page} de {Math.max(1, clients.pagination.totalPages)}</span><button className="secondary-button" disabled={busy || lookup.page >= clients.pagination.totalPages} onClick={() => searchClients(lookup.page + 1)}>Siguiente</button></div></>}
      <p role="status">{client ? `Cliente seleccionado: ${client.fullName}` : "Selecciona un cliente para continuar."}</p>
      {!defaultsReady && (defaultsError ? <div><p className="error-message" role="alert">{defaultsError}</p><button className="secondary-button" onClick={() => { setDefaultsError(""); setDefaultsRevision(r => r+1); }}>Recargar configuración</button></div> : <p role="status">Cargando condiciones iniciales…</p>)}
      <form onSubmit={e => void review(e)}><fieldset disabled={!defaultsReady || busy} style={{border:0,padding:0,margin:0}}><legend className="loan-terms-legend">Condiciones de este préstamo</legend><div className="client-form-grid"><div className="form-field"><label htmlFor="loan-amount">Monto prestado (MXN)</label><input id="loan-amount" type="number" min="1" max="1000000" step="0.01" required value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} placeholder="10000" /></div><div className="form-field"><label htmlFor="loan-first-date">Fecha del primer pago</label><input id="loan-first-date" type="date" min="2000-01-01" max="2100-12-31" required value={firstDate} disabled={busy} onChange={e => setFirstDate(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="loan-interest">Interés total (%)</label><input id="loan-interest" type="number" min="0" max="1000" step="0.01" required value={interest} disabled={busy} onChange={e => setInterest(e.target.value)} /><small>Porcentaje sobre el capital durante todo el préstamo.</small></div>
      <div className="form-field"><label htmlFor="loan-count">Número de pagos</label><input id="loan-count" type="number" min="1" max="1000" step="1" required value={count} disabled={busy} onChange={e => setCount(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="loan-frequency">Frecuencia de pago</label><select id="loan-frequency" value={frequency} disabled={busy} onChange={e => setFrequency(e.target.value as LoanFrequency)}>{Object.entries(frequencyLabels).filter(([key]) => key !== "CUSTOM").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      {frequency === "INTERVAL" && <div className="form-field"><label htmlFor="loan-interval">Días entre pagos</label><input id="loan-interval" type="number" min="1" max="365" step="1" required value={intervalDays} disabled={busy} onChange={e => setIntervalDays(e.target.value)} /></div>}
      <div className="form-field"><label htmlFor="loan-regular">Importe por pago (MXN, opcional)</label><input id="loan-regular" type="number" min="0.01" max="11000000" step="0.01" value={regularPayment} disabled={busy} onChange={e => setRegularPayment(e.target.value)} placeholder="Calcular automáticamente" /><small>Si lo indicas, el último pago cubre la diferencia.</small></div>
      </div><p>El plazo se define con el número de pagos y su frecuencia. Después podrás ajustar las fechas y los importes de cada cuota.</p><button className="primary-button" disabled={busy || !client}>{busy ? "Calculando…" : "Revisar calendario"}</button></fieldset></form>
    </> : <><h4>Revisa el préstamo de {client?.fullName}</h4><Schedule plan={preview.plan} />{editingSchedule ? <ScheduleEditor fixedInstallments={initial?.installments.filter(i=>i.hasPaymentHistory||(i.paidCents??0)>0)} plan={preview.plan} input={preview.input} onSessionExpired={onSessionExpired} onCancel={() => setEditingSchedule(false)} onReviewed={(plan, input) => { setPreview({ plan, input }); setEditingSchedule(false); setError(""); }} /> : <div className="loan-actions"><button className="secondary-button" disabled={busy} onClick={() => { setEditingSchedule(true); setError(""); }}>Personalizar calendario</button><button className="secondary-button" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>Modificar datos</button><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? "Registrando…" : initial?"Guardar modificación":"Confirmar y registrar préstamo"}</button></div>}</>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section></Dialog>;
}
export default function LoansPage({ role, onSessionExpired, refreshVersion = 0, onLoanSaved }: { role: UserRole; onSessionExpired: () => void; refreshVersion?: number; onLoanSaved?: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState({ search: "", page: 1, revision: 0 });
  const [data, setData] = useState<LoanList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Loan | null>(null);
  const [notice, setNotice] = useState("");
  const [editingLoan,setEditingLoan]=useState<Loan|null>(null);
  const [archived,setArchived]=useState(false);
  const [deleting,setDeleting]=useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void listLoans(filter.search, filter.page, controller.signal,archived).then(r => { if (!controller.signal.aborted) { setData(r); setError(""); setSelected(previous => previous ? r.items.find(item => item.id === previous.id) ?? null : null); } }).catch((e: unknown) => {
      if (controller.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) onSessionExpired(); else setError(message(e));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, refreshVersion, onSessionExpired,archived]);
  function refresh(search = filter.search, page = filter.page) {
    setLoading(true); setError(""); setData(null); setSelected(null);
    setFilter(f => ({ search, page, revision: f.revision + 1 }));
  }
  async function remove(loan:Loan){if(deleting)return;const restore=!!loan.deletedAt;if(!window.confirm(restore?'¿Restaurar este préstamo y su saldo en cobranza?':'¿Eliminar este préstamo? Su saldo dejará de aparecer en cobranza. Los abonos y el historial se conservan; podrás restaurarlo desde Eliminados.'))return;setDeleting(true);try{await archiveLoan(loan,restore);onLoanSaved?.();refresh();setNotice(restore?'Préstamo restaurado.':'Préstamo enviado a Eliminados.');}catch(e){if(e instanceof ApiError&&e.status===401)onSessionExpired();else setError(message(e));}finally{setDeleting(false);}}
  return <section className="clients-page loans-page"><header className="clients-heading"><div><h2>Préstamos</h2><p>Interés, plazo y calendario a la medida de cada préstamo.</p></div>{role === "ADMIN" && !showForm && <button className="primary-button" onClick={() => { setEditingLoan(null); setShowForm(true); setNotice(""); }}>Nuevo préstamo</button>}</header>
    {notice && <p className="client-notice" role="status">{notice}</p>}
    {showForm && role === "ADMIN" && <LoanForm key={editingLoan?.id??"new"} initial={editingLoan} onCancel={() => setShowForm(false)} onSessionExpired={onSessionExpired} onCreated={loan => { onLoanSaved?.(); setShowForm(false); setQuery(""); refresh("", 1); setSelected(loan); setNotice(editingLoan?"Préstamo modificado correctamente.":"Préstamo registrado correctamente."); }} />}
    <div className="form-field"><label htmlFor="loan-archive">Mostrar préstamos</label><select id="loan-archive" value={String(archived)} onChange={e=>{setArchived(e.target.value==="true");refresh(filter.search,1);}}><option value="false">Actuales</option><option value="true">Eliminados</option></select></div>
    <form className="client-search" onSubmit={e => { e.preventDefault(); refresh(query.trim(), 1); }}><div className="form-field"><label htmlFor="loans-search">Buscar préstamos por cliente o teléfono</label><input id="loans-search" type="search" maxLength={150} value={query} onChange={e => setQuery(e.target.value)} /></div><button className="secondary-button">Buscar</button></form>
    {loading && <p role="status">Cargando préstamos…</p>}
    {error && <div><p className="error-message" role="alert">{error}</p><button className="secondary-button" onClick={() => refresh()}>Reintentar</button></div>}
    {!loading && !error && data && <><p role="status">{data.pagination.total} préstamos encontrados</p>{data.items.length === 0 ? <p className="client-panel">No hay préstamos para mostrar.</p> : <div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th scope="col">Cliente</th><th scope="col">Prestado</th><th scope="col">Condiciones</th><th scope="col">Total pactado</th><th scope="col">Saldo</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead><tbody>{data.items.map(loan => <tr key={loan.id}><td>{loan.client.fullName}</td><td>{money(loan.principalCents)}</td><td>{loan.interestBps / 100} % · {loan.installmentCount} pagos<br /><small>{loan.frequency === "INTERVAL" ? `Cada ${loan.intervalDays} días` : frequencyLabels[loan.frequency]}</small></td><td>{money(loan.totalCents)}</td><td>{money(loan.balanceCents ?? loan.totalCents)}</td><td>{loan.deletedAt?"Eliminado":loan.status === "PAID" ? "Liquidado" : "Activo"}</td><td><button className="secondary-button" onClick={() => setSelected(loan)} aria-label={`Ver calendario de ${loan.client.fullName}`}>Ver calendario</button></td></tr>)}</tbody></ResponsiveTable></div>}<nav className="client-pagination" aria-label="Páginas de préstamos"><button className="secondary-button" disabled={filter.page <= 1} onClick={() => refresh(filter.search, filter.page - 1)}>Anterior</button><span>Página {filter.page} de {Math.max(1, data.pagination.totalPages)}</span><button className="secondary-button" disabled={filter.page >= data.pagination.totalPages} onClick={() => refresh(filter.search, filter.page + 1)}>Siguiente</button></nav></>}
    {selected && <Dialog label="Detalle del préstamo" onClose={()=>setSelected(null)} busy={showForm||deleting}><section className="client-panel"><div className="clients-heading"><h3>{selected.client.fullName}</h3><button className="secondary-button" onClick={() => setSelected(null)}>Cerrar calendario</button></div><p>Folio: {selected.id}</p><Schedule plan={selected} />{role==="ADMIN"&&<div className="loan-actions">{!selected.deletedAt&&<button className="secondary-button" disabled={showForm||deleting} onClick={()=>{setEditingLoan(selected);setShowForm(true);setNotice("");}}>Modificar préstamo</button>}<button className="secondary-button" disabled={showForm||deleting} onClick={()=>void remove(selected)}>{selected.deletedAt?"Restaurar préstamo":"Eliminar préstamo"}</button></div>}</section></Dialog>}
  </section>;
}
