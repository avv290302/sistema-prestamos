import ReceiptsPage from '../receipts/ReceiptsPage';
import ThemePicker from '../theme/ThemePicker';
import UsersPage from "../administration/UsersPage";
import SettingsPage from "../administration/SettingsPage";
import { getBranding } from "../services/administration";
import ReportsPage from "../reports/ReportsPage";
import CollectionsPage from "../collections/CollectionsPage";
import PaymentsPage from "../payments/PaymentsPage";
import LoansPage from "../loans/LoansPage";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { AuthUser } from "../services/auth";
import ClientsPage from "../clients/ClientsPage";

import blessedCompanyLogo from "../assets/blessed-company-logo.png";

import "./Workspace.css";

const modules = [
  {
    id: "home",
    name: "Inicio",
    icon: "home",
    description: "Tu espacio de trabajo y acceso a los módulos.",
    ready: true,
  },
  {
    id: "clients",
    name: "Clientes",
    icon: "users",
    description: "Registro, búsqueda y consulta de clientes.",
    ready: true,
  },
  {
    id: "loans",
    name: "Préstamos",
    icon: "document",
    description:
      "Préstamos con interés, plazo y calendario personalizados.",
    ready: true,
  },
  {
    id: "payments",
    name: "Pagos",
    icon: "wallet",
    description:
      "Registro de abonos, saldos e historial de pagos.",
    ready: true,
  },
  {id:"receipts",name:"Comprobantes",icon:"document",description:"Comprobantes de pagos, archivos PDF y cancelaciones.",ready:true},
  {
    id: "collections",
    name: "Cobranza",
    icon: "calendar",
    description:
      "Cuotas vencidas, vencimientos de hoy y próximos cobros.",
    ready: true,
  },
  {
    id: "delinquents", name: "Clientes morosos", icon: "users", description: "Semáforo de puntualidad y seguimiento de atrasos.", ready: true,
  },
  {
    id: "reports",
    name: "Reportes",
    icon: "chart",
    description:
      "Indicadores, gráficas y análisis de cartera y cobros.",
    ready: true,
  },
  {
    id: "users",
    name: "Usuarios",
    icon: "users",
    description:
      "Cuentas, roles y estado de acceso al sistema.",
    ready: true,
    admin: true,
  },
  {
    id: "settings",
    name: "Configuración",
    icon: "settings",
    description:
      "Datos del negocio y condiciones iniciales de los préstamos.",
    ready: true,
    admin: true,
  },
] as const;

type ModuleId = (typeof modules)[number]["id"];

const roles = {
  ADMIN: "Administrador",
  COLLECTOR: "Cobrador",
  VIEWER: "Consulta",
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
    users:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    document:
      "M14 2H5v20h14V7l-5-5v5h5M8 12h8M8 16h8",
    wallet:
      "M20 8V4H4a2 2 0 0 0 0 4h17v12H4a2 2 0 0 1-2-2V6M21 12h-6v4h6",
    calendar:
      "M4 5h16v16H4ZM8 2v6M16 2v6M4 11h16M8 15h2M14 15h2",
    chart: "M4 3v18h17M8 17v-5M13 17V8M18 17V4",
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  };

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.home} />
    </svg>
  );
}

export default function Workspace({
  user,
  busy,
  error,
  onLogout,
  onSessionExpired,
}: {
  user: AuthUser;
  busy: boolean;
  error: string;
  onLogout: () => void;
  onSessionExpired: () => void;
}) {
  const [active, setActive] =
    useState<ModuleId>("clients");

  const [businessName, setBusinessName] =
    useState("The Blessed Company");

  useEffect(() => {
    const controller = new AbortController();

    void getBranding(controller.signal)
      .then((settings) => {
        if (!controller.signal.aborted) {
          setBusinessName(settings.businessName);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const [loansVisited, setLoansVisited] =
    useState(false);

  const [paymentsVisited, setPaymentsVisited] =
    useState(false);

  const [collectionsVisited, setCollectionsVisited] =
    useState(false);

  const [reportsVisited, setReportsVisited] =
    useState(false);

  const [paymentTarget, setPaymentTarget] = useState({
    loanId: "",
    version: 0,
  });

  const [paymentRevision, setPaymentRevision] =
    useState(0);

  const handlePaymentSaved = useCallback(() => {
    setPaymentRevision((revision) => revision + 1);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);

  const heading = useRef<HTMLHeadingElement>(null);

  const visible = modules.filter(
    (module) =>
      !("admin" in module) ||
      user.role === "ADMIN"
  );

  const current =
    visible.find((module) => module.id === active) ??
    modules[0];

  useEffect(()=>{const frame=requestAnimationFrame(()=>{heading.current?.scrollIntoView({block:'start'});heading.current?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[active]);
  function navigate(id: ModuleId) {
    if (id === "loans") {
      setLoansVisited(true);
    }

    if (id === "payments") {
      setPaymentsVisited(true);
    }

    if (id === "collections") {
      setCollectionsVisited(true);
    }

    if (id === "reports") {
      setReportsVisited(true);
    }

    setActive(id);
    setMenuOpen(false);


  }

  function openCollectionLoan(loanId: string) {
    setPaymentTarget((target) => ({
      loanId,
      version: target.version + 1,
    }));

    navigate("payments");
  }

  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#module-content"
      >
        Ir al contenido
      </a>

      <aside
        className={
          "app-sidebar" +
          (menuOpen ? " is-open" : "")
        }
      >
        <div className="sidebar-brand" title={businessName}>
          <img
            src={blessedCompanyLogo}
            alt="The Blessed Company"
            className="sidebar-brand-logo"
          />

          <div className="sidebar-brand-copy">
            <strong className="sidebar-brand-name">
              {businessName}
            </strong>

            <span>Administración y cobranza</span>
          </div>
        </div>

        <button
          className="sidebar-toggle"
          aria-expanded={menuOpen}
          aria-controls="module-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen
            ? "Cerrar menú"
            : "Abrir menú"}

          <span aria-hidden="true">☰</span>
        </button>

        <div
          className="sidebar-body"
          id="module-navigation"
        >
          <nav aria-label="Módulos del sistema">
            <p className="sidebar-label">
              OPERACIÓN
            </p>

            {visible
              .filter(
                (module) =>
                  !("admin" in module)
              )
              .map((module) => (
                <button
                  key={module.id}
                  className={
                    "module-link" +
                    (current.id === module.id
                      ? " active"
                      : "")
                  }
                  aria-current={
                    current.id === module.id
                      ? "page"
                      : undefined
                  }
                  onClick={() =>
                    navigate(module.id)
                  }
                >
                  <Icon name={module.icon} />

                  <span>{module.name}</span>

                  {!module.ready && (
                    <span className="module-soon">
                      Próximamente
                    </span>
                  )}
                </button>
              ))}

            {user.role === "ADMIN" && (
              <>
                <p className="sidebar-label administration-label">
                  ADMINISTRACIÓN
                </p>

                {visible
                  .filter(
                    (module) =>
                      "admin" in module
                  )
                  .map((module) => (
                    <button
                      key={module.id}
                      className={
                        "module-link" +
                        (current.id ===
                        module.id
                          ? " active"
                          : "")
                      }
                      aria-current={
                        current.id ===
                        module.id
                          ? "page"
                          : undefined
                      }
                      onClick={() =>
                        navigate(module.id)
                      }
                    >
                      <Icon
                        name={module.icon}
                      />

                      <span>
                        {module.name}
                      </span>
                    </button>
                  ))}
              </>
            )}
          </nav>

          <ThemePicker compact/><div className="sidebar-account">
            <span
              className="account-avatar"
              aria-hidden="true"
            >
              {user.fullName
                .charAt(0)
                .toUpperCase()}
            </span>

            <div>
              <strong>
                {user.fullName}
              </strong>

              <span>
                {roles[user.role]}
              </span>
            </div>
          </div>

          <button
            className="sidebar-logout"
            disabled={busy}
            onClick={onLogout}
          >
            {busy
              ? "Cerrando sesión…"
              : "Cerrar sesión"}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="module-header">
          <div>
            <span className="eyebrow">
              PRÉSTAMOS Y COBRANZA
            </span>

            <h1
              ref={heading}
              tabIndex={-1}
            >
              {current.name}
            </h1>
          </div>

          <span className="role-badge">
            {roles[user.role]}
          </span>
        </header>

        <main
          id="module-content"
          tabIndex={-1}
        >
          {error && (
            <p
              className="error-message shell-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <div
            hidden={
              current.id !== "clients"
            }
          >
            <ClientsPage
              active={current.id === "clients"}
              refreshVersion={paymentRevision}
              onChanged={handlePaymentSaved}
              role={user.role}
              onSessionExpired={
                onSessionExpired
              }
            />
          </div>

          {loansVisited && (
            <div
              hidden={
                current.id !== "loans"
              }
            >
              <LoansPage
                onLoanSaved={
                  handlePaymentSaved
                }
                role={user.role}
                onSessionExpired={
                  onSessionExpired
                }
                refreshVersion={
                  paymentRevision
                }
              />
            </div>
          )}

          {paymentsVisited && (
            <div
              hidden={
                current.id !==
                "payments"
              }
            >
              <PaymentsPage
                key={
                  paymentTarget.version
                }
                refreshVersion={paymentRevision}
                initialLoanId={
                  paymentTarget.loanId
                }
                role={user.role}
                active={
                  current.id ===
                  "payments"
                }
                onSessionExpired={
                  onSessionExpired
                }
                onPaymentSaved={
                  handlePaymentSaved
                }
              />
            </div>
          )}

          {collectionsVisited && (
            <div
              hidden={
                current.id !==
                "collections"
              }
            >
              <CollectionsPage
                role={user.role}
                active={
                  current.id ===
                  "collections"
                }
                refreshVersion={
                  paymentRevision
                }
                onSessionExpired={
                  onSessionExpired
                }
                onOpenLoan={
                  openCollectionLoan
                }
              />
            </div>
          )}

          {reportsVisited && (
            <div
              hidden={
                current.id !==
                "reports"
              }
            >
              <ReportsPage
                active={
                  current.id ===
                  "reports"
                }
                refreshVersion={
                  paymentRevision
                }
                onSessionExpired={
                  onSessionExpired
                }
                onOpenCollections={() =>
                  navigate(
                    "collections"
                  )
                }
              />
            </div>
          )}

          {current.id === "delinquents" && <ClientsPage initialTraffic="LATE" refreshVersion={paymentRevision} onChanged={handlePaymentSaved} role={user.role} onSessionExpired={onSessionExpired} />}
          {current.id === "receipts" && <ReceiptsPage role={user.role} onSessionExpired={onSessionExpired} onChanged={handlePaymentSaved}/> }
          {current.id === "users" &&
            user.role === "ADMIN" && (
              <UsersPage
                currentId={user.id}
                onSessionExpired={
                  onSessionExpired
                }
              />
            )}

          {current.id === "settings" &&
            user.role === "ADMIN" && (
              <SettingsPage
                onSessionExpired={
                  onSessionExpired
                }
                onSaved={(settings) =>
                  setBusinessName(
                    settings.businessName
                  )
                }
              />
            )}

          {current.id === "home" && (
            <section className="module-overview">
              <span className="eyebrow">
                TU ESPACIO DE TRABAJO
              </span>

              <h2>
                Bienvenido, {user.fullName}
              </h2>

              <p>
                Accede a cada módulo desde
                el menú lateral. Iremos
                incorporando nuevas
                funciones en este espacio.
              </p>

              <div className="module-grid">
                {visible
                  .filter(
                    (module) =>
                      module.id !== "home"
                  )
                  .map((module) => (
                    <button
                      key={module.id}
                      className="module-card"
                      onClick={() =>
                        navigate(
                          module.id
                        )
                      }
                    >
                      <Icon
                        name={module.icon}
                      />

                      <strong>
                        {module.name}
                      </strong>

                      <span>
                        {
                          module.description
                        }
                      </span>

                      <small>
                        {module.ready
                          ? "Abrir módulo →"
                          : "Próximamente"}
                      </small>
                    </button>
                  ))}
              </div>
            </section>
          )}

          {!current.ready && (
            <section className="module-placeholder">
              <div className="placeholder-icon">
                <Icon
                  name={current.icon}
                />
              </div>

              <span className="role-badge">
                Próximamente
              </span>

              <h2>
                {current.name}
              </h2>

              <p>
                {current.description}
              </p>

              <p>
                Este módulo está pendiente
                de implementación.
              </p>

              <button
                className="secondary-button"
                onClick={() =>
                  navigate("clients")
                }
              >
                Ir a Clientes
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}