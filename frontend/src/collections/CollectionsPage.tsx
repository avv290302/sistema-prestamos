import ResponsiveTable from '../components/ResponsiveTable';
import { useEffect, useState } from 'react';
import { ApiError } from '../services/auth';
import type { UserRole } from '../services/auth';
import { listCollections } from '../services/collections';
import type { CollectionFilter, CollectionsResponse } from '../services/collections';
import { displayDate, money } from '../services/payments';
import './CollectionsPage.css';
const filters: { id: CollectionFilter; label: string }[] = [
  { id: 'OVERDUE', label: 'Vencidas' }, { id: 'TODAY', label: 'Vencen hoy' },
  { id: 'NEXT_7', label: 'Próximos 7 días' }, { id: 'ALL', label: 'Todas las pendientes' },
];
export default function CollectionsPage({ role, active, refreshVersion, onSessionExpired, onOpenLoan }: {
  role: UserRole; active: boolean; refreshVersion: number; onSessionExpired: () => void; onOpenLoan: (loanId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ status: 'OVERDUE' as CollectionFilter, search: '', page: 1, revision: 0 });
  const [result, setResult] = useState<{ key: string; data?: CollectionsResponse; error?: string } | null>(null);
  const requestKey = JSON.stringify([query, refreshVersion]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void listCollections(query.status, query.search, query.page, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key: requestKey, data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onSessionExpired();
      else setResult({ key: requestKey, error: error instanceof ApiError ? error.message : 'No se pudo cargar la cobranza. Intenta nuevamente.' });
    });
    return () => controller.abort();
  }, [query, refreshVersion, requestKey, active, onSessionExpired]);
  const data = result?.key === requestKey ? result.data : undefined;
  const error = result?.key === requestKey ? result.error : undefined;
  function refresh() { setQuery(q => ({ ...q, revision: q.revision + 1 })); }
  function selectFilter(status: CollectionFilter) { setQuery(q => ({ ...q, status, page: 1 })); }
  return <section className="clients-page collections-page">
    <header className="clients-heading"><div><span className="eyebrow">AGENDA DE COBRANZA</span><h2>Cuotas por cobrar</h2><p>Atiende primero los vencimientos más antiguos.</p></div><button className="secondary-button" onClick={refresh}>Actualizar</button></header>
    <form className="client-search" onSubmit={e => { e.preventDefault(); setQuery(q => ({ ...q, search: search.trim(), page: 1, revision: q.revision + 1 })); }}><div className="form-field"><label htmlFor="collection-search">Buscar por cliente o teléfono</label><input id="collection-search" type="search" maxLength={150} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre o teléfono" /></div><button className="secondary-button">Buscar</button></form>
    {data && <><p className="collection-date">Al {displayDate(data.asOf)} · Hora de Ciudad de México. {query.search ? 'Resumen de los clientes que coinciden con la búsqueda.' : 'Resumen de todos los préstamos.'}</p><div className="collection-summary">
      <button className="collection-card overdue" onClick={() => selectFilter('OVERDUE')}><span>Saldo vencido</span><strong>{money(data.summary.overdueCents)}</strong><small>{data.summary.overdueCount} cuotas vencidas</small></button>
      <button className="collection-card" onClick={() => selectFilter('TODAY')}><span>Vence hoy</span><strong>{money(data.summary.todayCents)}</strong><small>{data.summary.todayCount} cuotas</small></button>
      <button className="collection-card" onClick={() => selectFilter('NEXT_7')}><span>Próximos 7 días</span><strong>{money(data.summary.nextSevenDaysCents)}</strong><small>{data.summary.nextSevenDaysCount} cuotas · hasta {displayDate(data.nextSevenDaysThrough)}</small></button>
      <button className="collection-card" onClick={() => selectFilter('ALL')}><span>Saldo total pendiente</span><strong>{money(data.summary.outstandingCents)}</strong><small>{data.summary.loanCount} préstamos · {data.summary.pendingCount} cuotas</small></button>
    </div></>}
    <div className="collection-filters" role="group" aria-label="Filtrar por vencimiento">{filters.map(f => <button key={f.id} className="secondary-button" aria-pressed={query.status === f.id} onClick={() => selectFilter(f.id)}>{f.label}</button>)}</div>
    {error ? <div role="alert"><p className="error-message">{error}</p><button className="secondary-button" onClick={refresh}>Reintentar</button></div> : !data ? <p role="status">Cargando cobranza…</p> : <>
      <p role="status">{data.pagination.total} cuotas pendientes en esta vista.</p>
      {query.status === 'NEXT_7' && <p>Incluye desde mañana hasta {displayDate(data.nextSevenDaysThrough)}. Las cuotas de hoy aparecen en “Vencen hoy”.</p>}
      {data.items.length === 0 ? <div className="client-panel"><h3>No hay cuotas en esta vista</h3><p>Prueba otro filtro o una búsqueda diferente.</p></div> : <div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th scope="col">Cliente y contacto</th><th scope="col">Préstamo / semana</th><th scope="col">Vencimiento</th><th scope="col">Cuota</th><th scope="col">Abonado</th><th scope="col">Por cobrar</th><th scope="col">Acción</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}>
        <td><strong>{item.client.fullName}</strong><span className="collection-contact">{item.client.phone}</span><span className="collection-address">{item.client.address}</span>{!item.client.isActive && <small>Cliente inactivo</small>}</td>
        <td><span>Cuota {item.number} de {item.installmentCount}</span><small className="collection-loan-id">{item.loanId}</small></td>
        <td>{displayDate(item.dueDate)}<span className={'collection-status ' + (item.status === 'OVERDUE' ? 'late' : '')}>{item.status === 'OVERDUE' ? `${item.daysOverdue} días de atraso` : item.status === 'TODAY' ? 'Vence hoy' : 'Próxima'}</span></td>
        <td>{money(item.amountCents)}</td><td>{money(item.paidCents)}</td><td><strong>{money(item.balanceCents)}</strong></td>
        <td><button className="secondary-button" onClick={() => onOpenLoan(item.loanId)} aria-label={`${role === 'VIEWER' ? 'Ver préstamo' : 'Registrar pago'} de ${item.client.fullName}, semana ${item.number}`}>{role === 'VIEWER' ? 'Ver préstamo' : 'Registrar pago'}</button></td>
      </tr>)}</tbody></ResponsiveTable></div>}
      <nav className="client-pagination" aria-label="Páginas de cobranza"><button className="secondary-button" disabled={query.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>Anterior</button><span>Página {query.page} de {Math.max(1, data.pagination.totalPages)}</span><button className="secondary-button" disabled={query.page >= data.pagination.totalPages} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>Siguiente</button></nav>
      <p className="collection-date">Los importes muestran lo pendiente de cada cuota después de los abonos registrados. Cada fila corresponde a una semana del préstamo.</p>
    </>}
  </section>;
}
