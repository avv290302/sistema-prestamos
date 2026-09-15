import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../database/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await argon2.hash(
      randomBytes(32).toString("hex"),
      { type: argon2.argon2id },
    );
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    });

    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? this.dummyHash,
      dto.password,
    );

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException("Correo o contraseña incorrectos.");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getSessionUser(token: unknown) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      throw new UnauthorizedException("Sesión inválida o vencida.");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException("Sesión inválida o vencida.");
    }

    return {
      id: session.user.id,
      fullName: session.user.fullName,
      email: session.user.email,
      role: session.user.role,
    };
  }

  async logout(token: unknown): Promise<void> {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
      return;
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    await this.prisma.session.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}