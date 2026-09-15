import "reflect-metadata";
import {
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "./auth.guard";
import type { AuthService } from "./auth.service";
import { Public, Roles } from "./auth.decorators";

// Evita cargar Prisma: estas pruebas verifican las decisiones del guard.
jest.mock("./auth.service", () => ({
  AuthService: jest.fn(),
}));

class TestController {
  @Public()
  publicRoute() {}

  @Roles("ADMIN")
  adminRoute() {}

  protectedRoute() {}
}

describe("AuthGuard", () => {
  const getSessionUser = jest.fn();

  let guard: AuthGuard;

  beforeEach(() => {
    getSessionUser.mockReset();

    guard = new AuthGuard(
      new Reflector(),
      { getSessionUser } as unknown as AuthService,
    );
  });

  function contextFor(
    route: keyof TestController,
  ): ExecutionContext {
    const request = {
      method: "GET",
      headers: {},
      cookies: {
        prestamos_session: "token-de-prueba",
      },
    };

    return {
      getHandler: () => TestController.prototype[route],
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it("permite una ruta pública sin consultar la sesión", async () => {
    await expect(
      guard.canActivate(contextFor("publicRoute")),
    ).resolves.toBe(true);

    expect(getSessionUser).not.toHaveBeenCalled();
  });

  it("rechaza una ruta protegida cuando la sesión es inválida", async () => {
    getSessionUser.mockRejectedValue(
      new UnauthorizedException("Sesión inválida o vencida."),
    );

    await expect(
      guard.canActivate(contextFor("protectedRoute")),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("permite al administrador entrar a una ruta ADMIN", async () => {
    getSessionUser.mockResolvedValue({
      id: "usuario-prueba",
      role: "ADMIN",
    });

    await expect(
      guard.canActivate(contextFor("adminRoute")),
    ).resolves.toBe(true);
  });

  it.each(["COLLECTOR", "VIEWER"])(
    "rechaza al rol %s en una ruta ADMIN",
    async (role) => {
      getSessionUser.mockResolvedValue({
        id: "usuario-prueba",
        role,
      });

      await expect(
        guard.canActivate(contextFor("adminRoute")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});