import { useEffect, useState } from "react";
import { ApiError } from "../services/auth";
import type { UserRole } from "../services/auth";
import {
  listPayments,
  money,
  displayDate,
  methodLabels,
  today,
} from "../services/payments";
import type { PaymentList } from "../services/payments";
import PaymentDetails from "../payments/PaymentDetails";
export default function ReceiptsPage({
  role,
  onSessionExpired,
  onChanged,
}: {
  role: UserRole;
  onSessionExpired: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("ALL");
  const [filter, setFilter] = useState({
    search: "",
    from: "",
    to: "",
    status: "ALL",
    page: 1,
    revision: 0,
  });
  const [data, setData] = useState<PaymentList | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    void listPayments(filter.search, filter.page, "", c.signal, {
      status: filter.status,
      from: filter.from,
      to: filter.to,
    })
      .then((r) => {
        if (!c.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (c.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
        else
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los comprobantes.",
          );
      });
    return () => c.abort();
  }, [filter, onSessionExpired]);
  function refresh() {
    setData(null);
    setError("");
    setFilter((f) => ({ ...f, revision: f.revision + 1 }));
  }
  return (
    <section className="clients-page receipts-page">
      <header className="clients-heading">
        <div>
          <h2>Comprobantes</h2>
          <p>
            Encuentra los pagos registrados, descarga su PDF o compártelo con el
            cliente.
          </p>
        </div>
        <button className="secondary-button" onClick={refresh}>
          Actualizar
        </button>
      </header>
      <form
        className="client-panel receipt-filters"
        onSubmit={(e) => {
          e.preventDefault();
          if (from && to && from > to) {
            setError("La fecha inicial debe ser anterior o igual a la final.");
            return;
          }
          setData(null);
          setError("");
          setFilter((f) => ({
            search: search.trim(),
            from,
            to,
            status,
            page: 1,
            revision: f.revision + 1,
          }));
        }}
      >
        <div className="form-field">
          <label htmlFor="receipt-search">
            Cliente, teléfono o folio completo
          </label>
          <input
            id="receipt-search"
            type="search"
            maxLength={150}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="client-form-grid">
          <div className="form-field">
            <label htmlFor="receipt-from">Pagos desde</label>
            <input
              id="receipt-from"
              type="date"
              min="2000-01-01"
              max={today()}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="receipt-to">Hasta</label>
            <input
              id="receipt-to"
              type="date"
              min="2000-01-01"
              max={today()}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="receipt-status">Estado del comprobante</label>
            <select
              id="receipt-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Vigentes</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </div>
        <div className="loan-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSearch("");
              setFrom("");
              setTo("");
              setStatus("ALL");
              setData(null);
              setError("");
              setFilter((f) => ({
                search: "",
                from: "",
                to: "",
                status: "ALL",
                page: 1,
                revision: f.revision + 1,
              }));
            }}
          >
            Limpiar filtros
          </button>
          <button className="primary-button">Buscar comprobantes</button>
        </div>
      </form>
      {error ? (
        <div role="alert" className="error-message">
          {error}
          <button className="secondary-button" onClick={refresh}>
            Reintentar
          </button>
        </div>
      ) : !data ? (
        <p role="status">Cargando comprobantes…</p>
      ) : (
        <>
          <p>{data.pagination.total} comprobantes encontrados</p>
          {data.items.length === 0 ? (
            <p className="client-panel">
              No hay comprobantes que coincidan con los filtros.
            </p>
          ) : (
            <div className="receipt-grid">
              {data.items.map((p) => (
                <article key={p.id} className="receipt-card">
                  <div className="clients-heading">
                    <span
                      className={
                        "payment-status " +
                        (p.cancelledAt ? "cancelled" : "valid")
                      }
                    >
                      {p.cancelledAt ? "Cancelado" : "Vigente"}
                    </span>
                    <span>{displayDate(p.paidOn)}</span>
                  </div>
                  <h3>
                    {p.receiptSnapshot?.clientName ?? p.loan.client.fullName}
                  </h3>
                  <strong className="receipt-amount">
                    {money(p.amountCents)}
                  </strong>
                  <p>
                    {methodLabels[p.method]} · {p.createdBy.fullName}
                  </p>
                  <small className="receipt-folio">Folio: {p.id}</small>
                  <button
                    className="secondary-button"
                    onClick={() => setSelected(p.id)}
                    aria-label={"Abrir comprobante " + p.id}
                  >
                    Ver / descargar comprobante
                  </button>
                </article>
              ))}
            </div>
          )}
          <nav
            className="client-pagination"
            aria-label="Páginas de comprobantes"
          >
            <button
              className="secondary-button"
              disabled={filter.page <= 1}
              onClick={() => {
                setData(null);
                setFilter((f) => ({ ...f, page: f.page - 1 }));
              }}
            >
              Anterior
            </button>
            <span>
              Página {filter.page} de {Math.max(1, data.pagination.totalPages)}
            </span>
            <button
              className="secondary-button"
              disabled={filter.page >= data.pagination.totalPages}
              onClick={() => {
                setData(null);
                setFilter((f) => ({ ...f, page: f.page + 1 }));
              }}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
      {selected && (
        <PaymentDetails
          key={selected}
          id={selected}
          role={role}
          onSessionExpired={onSessionExpired}
          onClose={() => setSelected(null)}
          onChanged={() => {
            refresh();
            onChanged();
          }}
        />
      )}
    </section>
  );
}
