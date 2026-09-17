import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  getSession,
  login,
  logout,
} from "./services/auth";
import type { AuthUser } from "./services/auth";

import "./App.css";
import Workspace from "./layout/Workspace";
import blessedCompanyLogo from "./assets/blessed-company-logo.png";

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Ocurrió un problema. Intenta nuevamente.";
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const result = await getSession();

        if (!cancelled) {
          setUser(result.user);
        }
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof ApiError && err.status === 401)
        ) {
          setSessionError(errorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSessionExpired = useCallback(() => {
    setUser(null);
    setError("Tu sesión venció. Inicia sesión nuevamente.");
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await login(
        email.trim().toLowerCase(),
        password
      );

      setUser(result.user);
      setPassword("");
      setShowPassword(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await logout();

      setUser(null);
      setPassword("");
      setShowPassword(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="status-screen">
        <div className="status-card" role="status">
          <img
            src={blessedCompanyLogo}
            alt="The Blessed Company"
            className="status-logo"
          />

          <h1>Preparando tu espacio</h1>

          <p>Estamos comprobando tu sesión.</p>
        </div>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="status-screen">
        <section className="status-card">
          <img
            src={blessedCompanyLogo}
            alt="The Blessed Company"
            className="status-logo"
          />

          <h1>No pudimos comprobar tu sesión</h1>

          <p role="alert">
            {sessionError}
          </p>

          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Volver a intentar
          </button>
        </section>
      </main>
    );
  }

  if (user) {
    return (
      <Workspace
        user={user}
        busy={busy}
        error={error}
        onLogout={() => void handleLogout()}
        onSessionExpired={handleSessionExpired}
      />
    );
  }

  return (
    <main className="login-layout">
      <section
        className="brand-panel"
        aria-labelledby="brand-title"
      >
        <div className="brand">
          <img
            src={blessedCompanyLogo}
            alt="Logotipo de The Blessed Company"
            className="brand-logo"
          />

          <span className="brand-name">
            The Blessed Company
          </span>
        </div>

        <div className="brand-copy">
          <span className="eyebrow">
            ADMINISTRACIÓN DEL NEGOCIO
          </span>

          <h1 id="brand-title">
            Cada cuenta clara.
            <br />
            Cada movimiento en orden.
          </h1>

          <p>
            Un espacio para organizar tus clientes, dar
            seguimiento a los préstamos y llevar el control
            de la cobranza.
          </p>

          <div className="feature-list">
            <span>Clientes y préstamos</span>
            <span>Seguimiento de pagos</span>
            <span>Historial de movimientos</span>
          </div>
        </div>

        <p className="brand-footer">
          Control y claridad para tu día a día.
        </p>
      </section>

      <section
        className="form-panel"
        aria-labelledby="login-title"
      >
        <div className="login-card">
          <span className="eyebrow">
            ACCESO AL SISTEMA
          </span>

          <h2 id="login-title">
            Inicia sesión
          </h2>

          <p className="form-intro">
            Ingresa con la cuenta asignada por tu
            administrador.
          </p>

          <form
            onSubmit={handleLogin}
            aria-busy={busy}
          >
            <div className="form-field">
              <label htmlFor="email">
                Correo electrónico
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nombre@empresa.com"
                maxLength={254}
                required
                value={email}
                disabled={busy}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">
                Contraseña
              </label>

              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  placeholder="Escribe tu contraseña"
                  maxLength={128}
                  required
                  value={password}
                  disabled={busy}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                />

                <button
                  className="password-toggle"
                  type="button"
                  aria-label={
                    showPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                  aria-controls="password"
                  disabled={busy}
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                >
                  {showPassword
                    ? "Ocultar"
                    : "Mostrar"}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="error-message"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Iniciando sesión…"
                : "Ingresar al sistema"}
            </button>
          </form>

          <p className="access-help">
            ¿Necesitas acceso? Contacta al
            administrador del sistema.
          </p>
        </div>

        <p className="form-footer">
          Uso exclusivo para personal autorizado.
        </p>
      </section>
    </main>
  );
}