import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";

import type { CookieOptions, Request, Response } from "express";

import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { Public } from "./auth.decorators";
import type { AuthenticatedRequest } from "./auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private validateOrigin(origin: string | undefined): void {
    const allowedOrigin =
      process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

    if (origin !== allowedOrigin) {
      throw new ForbiddenException("Origen de solicitud no permitido.");
    }
  }

  private cookieOptions(): CookieOptions {
    const isProduction = process.env.NODE_ENV === "production";

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    };
  }

  private readSessionToken(request: Request): unknown {
    const cookies = request.cookies as
      | Record<string, unknown>
      | undefined;

    return cookies?.["prestamos_session"];
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  async login(
    @Body() dto: LoginDto,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.validateOrigin(origin);

    const result = await this.authService.login(dto);

    response.cookie("prestamos_session", result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });

    return {
      user: result.user,
      expiresAt: result.expiresAt,
    };
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  me(@Req() request: AuthenticatedRequest) {
    if (!request.authUser) {
      throw new UnauthorizedException("Sesión inválida o vencida.");
    }

    return {
      user: request.authUser,
    };
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  async logout(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.validateOrigin(origin);

    const token = this.readSessionToken(request);

    await this.authService.logout(token);

    response.clearCookie(
      "prestamos_session",
      this.cookieOptions(),
    );
  }
}