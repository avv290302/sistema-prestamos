import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Dialog from "../components/Dialog";
import { ApiError } from "../services/auth";
import type { UserRole } from "../services/auth";
import {
  cancelPayment,
  getPayment,
  money,
  displayDate,
  methodLabels,
} from "../services/payments";
import type { Payment } from "../services/payments";
import ReceiptActions from "./ReceiptActions";
function CancelPayment({
  payment,
  onClose,
  onSaved,
  onSessionExpired,
}: {
  payment: Payment;
  onClose: () => void;
  onSaved: (p: Payment) => void;
  onSessionExpired: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    if (reason.trim().length < 3) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      onSaved(await cancelPayment(payment.id, reason.trim()));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSessionExpired();
      else
        setError(
          e instanceof Error ? e.message : "No se pudo cancelar el pago.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      label="Cancelar pago registrado por error"
      busy={busy}
      onClose={onClose}
    >
      <form className="client-panel" onSubmit={(e) => void submit(e)}>
        <h2>Cancelar este pago</h2>
        <p>
          <strong>
            {payment.loan.client.fullName} · {money(payment.amountCents)}
          </strong>
          <br />
          {displayDate(payment.paidOn)} · {methodLabels[payment.method]}
        </p>
        <p>
          Este importe volverá al saldo pendiente del préstamo. Se actualizarán
          cobranza, reportes y semáforo. El comprobante quedará cancelado y el
          historial se conservará. Si ya lo compartiste, avisa al cliente y
          envíale el PDF cancelado.
        </p>
        <p>
          Esta acción no devuelve dinero ni permite reactivar el mismo pago. Si
          corresponde, registra un nuevo pago con los datos correctos.
        </p>
        <div className="form-field">
          <label htmlFor="cancel-payment-reason">
            Motivo de la cancelación *
          </label>
          <textarea
            id="cancel-payment-reason"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ejemplo: se registró dos veces el mismo abono"
          />
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="loan-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onClose}
          >
            Volver sin cancelar el pago
          </button>
          <button className="danger-button" disabled={busy}>
            {busy ? "Cancelando…" : "Confirmar cancelación del pago"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export default function PaymentDetails({
  id,
  role,
  onClose,
  onChanged,
  onSessionExpired,
}: {
  id: string;
  role: UserRole;
  onClose: () => void;
  onChanged: () => void;
  onSessionExpired: () => void;
}) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void getPayment(id, c.signal)
      .then((p) => {
        if (!c.signal.aborted) setPayment(p);
      })
      .catch((e) => {
        if (c.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
        else
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo cargar el comprobante.",
          );
      });
    return () => c.abort();
  }, [id, revision, onSessionExpired]);
  return (
    <Dialog label="Detalle del comprobante" onClose={onClose} busy={cancelling}>
      <section className="client-panel payment-detail">
        <div className="clients-heading">
          <h2>Comprobante de pago</h2>
          <button
            className="secondary-button"
            onClick={onClose}
            disabled={cancelling}
          >
            Cerrar comprobante
          </button>
        </div>
        {error ? (
          <>
            <p role="alert" className="error-message">
              {error}
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                setRevision((n) => n + 1);
              }}
            >
              Reintentar
            </button>
          </>
        ) : !payment ? (
          <p role="status">Cargando comprobante…</p>
        ) : (
          <>
            <span
              className={
                "payment-status " +
                (payment.cancelledAt ? "cancelled" : "valid")
              }
            >
              {payment.cancelledAt ? "Cancelado" : "Vigente"}
            </span>
            <h3>
              {payment.receiptSnapshot?.clientName ??
                payment.loan.client.fullName}
            </h3>
            <p className="receipt-amount">{money(payment.amountCents)}</p>
            <dl>
              <div>
                <dt>Fecha del pago</dt>
                <dd>
                  {displayDate(payment.paidOn)} · {methodLabels[payment.method]}
                </dd>
              </div>
              <div>
                <dt>Folio del comprobante</dt>
                <dd>{payment.id}</dd>
              </div>
              <div>
                <dt>Folio del préstamo</dt>
                <dd>{payment.loanId}</dd>
              </div>
              <div>
                <dt>Registrado por</dt>
                <dd>{payment.createdBy.fullName}</dd>
              </div>
            </dl>
            {payment.cancelledAt && (
              <div className="error-message">
                <strong>Pago cancelado; no cuenta como abono.</strong>
                <p>
                  {new Intl.DateTimeFormat("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Mexico_City",
                  }).format(new Date(payment.cancelledAt))}{" "}
                  · {payment.cancelledByName}
                </p>
                <p>Motivo: {payment.cancellationReason}</p>
                <p>
                  Los saldos del comprobante corresponden al registro original.
                  Consulta el préstamo para ver el saldo actual.
                </p>
              </div>
            )}
            <p>{payment.notes || "Sin notas."}</p>
            <h3>Cuotas a las que se aplicó</h3>
            <ul>
              {[...payment.allocations]
                .sort((a, b) => a.installment.number - b.installment.number)
                .map((a) => (
                  <li key={a.installment.number}>
                    Cuota {a.installment.number}: {money(a.amountCents)}
                  </li>
                ))}
            </ul>
            <ReceiptActions
              key={payment.id + payment.cancelledAt}
              payment={payment}
              onSessionExpired={onSessionExpired}
            />
            {role === "ADMIN" && !payment.cancelledAt && (
              <div className="cancel-payment-section">
                <h3>¿Este pago se registró por error?</h3>
                <button
                  className="danger-button"
                  onClick={() => setCancelling(true)}
                >
                  Cancelar pago por error
                </button>
              </div>
            )}
            {cancelling && (
              <CancelPayment
                payment={payment}
                onClose={() => setCancelling(false)}
                onSessionExpired={onSessionExpired}
                onSaved={(p) => {
                  setPayment(p);
                  setCancelling(false);
                  onChanged();
                }}
              />
            )}
          </>
        )}
      </section>
    </Dialog>
  );
}
