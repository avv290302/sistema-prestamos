import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  getSession,
  login,
  logout,
} from "./services/auth";
import type { AuthUser, UserRole } from "./services/auth";
import "./App.css";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrador",
  COLLECTOR: "Cobrador",
  VIEWER: "Consulta",
};

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
        if (!cancelled && !(err instanceof ApiError && err.status === 401)) {
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await login(email.trim().toLowerCase(), password);
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
          <div className="brand-icon" aria-hidden="true">P</div>
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
          <h1>No pudimos comprobar tu sesión</h1>
          <p role="alert">{sessionError}</p>
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
      <main className="workspace">
        <header className="workspace-header">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true">P</span>
            <span>Préstamos y cobranza</span>
          </div>

          <button
            className="secondary-button"
            onClick={() => void handleLogout()}
            disabled={busy}
          >
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </header>

        <section className="welcome-card">
          <span className="role-badge">
            {roleLabels[user.role] ?? "Usuario"}
          </span>
          <h1>Bienvenido, {user.fullName}</h1>
          <p>Tu sesión está activa.</p>

          <div className="account-detail">
            <span>Correo de la cuenta</span>
            <strong>{user.email}</strong>
          </div>

          <p className="workspace-note">
            Aquí incorporaremos el panel de clientes, préstamos y cobranza.
          </p>

          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="login-layout">
      <section className="brand-panel" aria-labelledby="brand-title">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">P</span>
          <span>Préstamos y cobranza</span>
        </div>

        <div className="brand-copy">
          <span className="eyebrow">ADMINISTRACIÓN DEL NEGOCIO</span>
          <h1 id="brand-title">
            Cada cuenta clara.<br />
            Cada movimiento en orden.
          </h1>
          <p>
            Un espacio para organizar tus clientes, dar seguimiento
            a los préstamos y llevar el control de la cobranza.
          </p>

          <div className="feature-list">
            <span>Clientes y préstamos</span>
            <span>Seguimiento de pagos</span>
            <span>Historial de movimientos</span>
          </div>
        </div>

        <p className="brand-footer">Control y claridad para tu día a día.</p>
      </section>

      <section className="form-panel" aria-labelledby="login-title">
        <div className="login-card">
          <span className="eyebrow">ACCESO AL SISTEMA</span>
          <h2 id="login-title">Inicia sesión</h2>
          <p className="form-intro">
            Ingresa con la cuenta asignada por tu administrador.
          </p>

          <form onSubmit={handleLogin} aria-busy={busy}>
            <div className="form-field">
              <label htmlFor="email">Correo electrónico</label>
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
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Contraseña</label>
              <div className="password-field">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Escribe tu contraseña"
                  maxLength={128}
                  required
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={showPassword}
                  aria-controls="password"
                  disabled={busy}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Iniciando sesión…" : "Ingresar al sistema"}
            </button>
          </form>

          <p className="access-help">
            ¿Necesitas acceso? Contacta al administrador del sistema.
          </p>
        </div>

        <p className="form-footer">
          Uso exclusivo para personal autorizado.
        </p>
      </section>
    </main>
  );
}