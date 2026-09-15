import "dotenv/config";
import * as argon2 from "argon2";
import { PrismaService } from "../database/prisma.service";

async function main(): Promise<void> {
  const fullName = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!fullName || fullName.length > 150) {
    throw new Error("ADMIN_NAME debe tener entre 1 y 150 caracteres.");
  }

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Configura un ADMIN_EMAIL válido.");
  }

  if (!password || password.length < 15 || password.length > 128) {
    throw new Error("ADMIN_PASSWORD debe tener entre 15 y 128 caracteres.");
  }

  const prisma = new PrismaService();

  try {
    await prisma.$connect();

    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    if (existingAdmin) {
      console.log("Ya existe un administrador. No se modificó ninguna cuenta.");
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new Error("Ese correo ya pertenece a una cuenta.");
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });

    console.log("Administrador creado correctamente.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo crear el administrador.",
  );
  process.exitCode = 1;
});