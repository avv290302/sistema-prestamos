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

export async function request(
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
  } catch (error) {
    if (options.signal?.aborted) throw error;
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
      message = "Revisa los datos ingresados e intenta nuevamente.";
    } else if (response.status === 403) {
      message = "No tienes permiso para realizar esta operación desde esta página.";
    } else if (response.status === 413) {
      message = "El archivo supera el máximo permitido de 5 MB.";
    } else if (response.status >= 500) {
      message = "El servidor no pudo completar la solicitud. Intenta más tarde.";
    }

    if ((path.startsWith("/payments") || path.startsWith("/reports") || path.startsWith("/loans") || path.startsWith("/users") || path.startsWith("/clients") || path.startsWith("/settings")) && [400, 404, 409].includes(response.status)) {
      try {
        const details = await response.json() as { message?: unknown };
        if (typeof details.message === "string") message = details.message;
        else if (Array.isArray(details.message) && details.message.every(item => typeof item === "string")) message = details.message.join(" ");
      } catch { /* Keep the fallback if the response is not JSON. */ }
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
