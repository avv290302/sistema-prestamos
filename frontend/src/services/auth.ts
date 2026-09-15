export type UserRole = "ADMIN" | "COLLECTOR" | "VIEWER";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

interface LoginResponse {
  user: AuthUser;
  expiresAt: string;
}

interface SessionResponse {
  user: AuthUser;
}

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente.",
      0,
    );
  }

  if (!response.ok) {
    let message = "No se pudo completar la solicitud.";

    if (response.status === 401) {
      message =
        path === "/auth/login"
          ? "Correo o contraseña incorrectos."
          : "Tu sesión venció. Inicia sesión nuevamente.";
    } else if (response.status === 429) {
      message = "Demasiados intentos. Intenta nuevamente en 15 minutos.";
    } else if (response.status === 400) {
      message = "Revisa el correo y la contraseña que escribiste.";
    } else if (response.status === 403) {
      message = "La solicitud no está permitida desde esta página.";
    } else if (response.status >= 500) {
      message = "El servidor no pudo completar la solicitud. Intenta más tarde.";
    }

    throw new ApiError(message, response.status);
  }

  return response;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  return response.json() as Promise<LoginResponse>;
}

export async function getSession(): Promise<SessionResponse> {
  const response = await request("/auth/me");

  return response.json() as Promise<SessionResponse>;
}

export async function logout(): Promise<void> {
  await request("/auth/logout", {
    method: "POST",
  });
}