import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { UserRole } from "../generated/prisma/client";
import { AuthService } from "./auth.service";
import {
  PUBLIC_ROUTE_KEY,
  REQUIRED_ROLES_KEY,
} from "./auth.decorators";

export type SessionUser = Awaited<
  ReturnType<AuthService["getSessionUser"]>
>;

export interface AuthenticatedRequest extends Request {
  authUser?: SessionUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      targets,
    );

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const cookies = request.cookies as
      | Record<string, unknown>
      | undefined;

    const user = await this.authService.getSessionUser(
      cookies?.["prestamos_session"],
    );

    request.authUser = user;

    // Las operaciones que modifican datos deben venir del frontend autorizado.
    const safeMethods = ["GET", "HEAD", "OPTIONS"];

    if (!safeMethods.includes(request.method)) {
      const allowedOrigin =
        process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

      if (request.headers.origin !== allowedOrigin) {
        throw new ForbiddenException("Origen de solicitud no permitido.");
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES_KEY,
      targets,
    );

    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        "No tienes permisos para realizar esta operación.",
      );
    }

    return true;
  }
}