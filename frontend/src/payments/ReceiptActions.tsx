import { useEffect, useState } from "react";
import { ApiError, request } from "../services/auth";
import { money, displayDate } from "../services/payments";
import type { Payment } from "../services/payments";
function phoneForWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return "52" + digits;
  if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith("0"))
    return digits;
  return null;
}
export default function ReceiptActions({
  payment,
  onSessionExpired,
}: {
  payment: Payment;
  onSessionExpired: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/payments/${encodeURIComponent(payment.id)}/receipt.pdf`, {
      signal: controller.signal,
    })
      .then((r) => r.blob())
      .then((blob) => {
        if (!controller.signal.aborted)
          setFile(
            new File([blob], `comprobante-${payment.id}.pdf`, {
              type: "application/pdf",
            }),
          );
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
        else
          setError(
            e instanceof Error ? e.message : "No se pudo preparar el PDF.",
          );
      });
    return () => controller.abort();
  }, [payment.id, attempt, onSessionExpired]);
  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setNotice(
      "PDF descargado. Para WhatsApp, abre la conversación y adjunta el archivo.",
    );
  }
  const snapshot = payment.receiptSnapshot;
  const text = `${payment.cancelledAt?"AVISO: PAGO CANCELADO. ":""}Hola, ${snapshot?.clientName ?? payment.loan.client.fullName}. Comprobante del pago de ${money(payment.amountCents)} del ${displayDate(payment.paidOn)}. Folio: ${payment.id}.`;
  const phone = phoneForWhatsapp(payment.loan.client.phone);
  const canShare =
    !!file &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  async function share() {
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: "Comprobante de pago",
        text,
      });
      setNotice("Se abrió el uso compartido del dispositivo.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(
        "No se pudo compartir desde este navegador. Descarga el PDF y adjúntalo en WhatsApp.",
      );
    }
  }
  return (
    <div className="receipt-actions">
      {payment.cancelledAt&&<p><strong>PDF marcado como cancelado.</strong> Los saldos mostrados son históricos y ya no acreditan el abono.</p>}
      {snapshot ? (
        <p>
          <strong>Deuda anterior:</strong> {money(snapshot.balanceBeforeCents)}{" "}
          · <strong>Nueva deuda:</strong> {money(snapshot.balanceAfterCents)}
        </p>
      ) : (
        <p>
          Pago anterior a esta función: el PDF no incluye saldos históricos que
          no se conservaron.
        </p>
      )}
      {!file && !error && <p role="status">Preparando comprobante PDF…</p>}
      <div className="loan-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!file}
          onClick={download}
        >
          {payment.cancelledAt?"Descargar PDF cancelado":"Descargar comprobante PDF"}
        </button>
        {canShare && (
          <button
            type="button"
            className="primary-button"
            onClick={() => void share()}
          >
            Compartir PDF (elige WhatsApp)
          </button>
        )}
        {file && phone && (
          <a
            className="secondary-button"
            href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir WhatsApp del cliente
          </a>
        )}
      </div>
      <p>
        <small>
          {canShare
            ? "Al compartir, selecciona WhatsApp y confirma el destinatario. "
            : "Para enviarlo: descarga el PDF, abre WhatsApp y adjunta el archivo. "}
          El enlace a WhatsApp prepara el mensaje; no adjunta ni envía el
          comprobante automáticamente.
        </small>
      </p>
      {!phone && (
        <p>
          Revisa el teléfono del cliente para abrir su conversación. Se admite
          un número mexicano de 10 dígitos o un número con código de país.
        </p>
      )}
      {error && (
        <div role="alert" className="error-message">
          {error}
          {!file && (
            <button
              className="secondary-button"
              onClick={() => {
                setError("");
                setAttempt((n) => n + 1);
              }}
            >
              Reintentar PDF
            </button>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
