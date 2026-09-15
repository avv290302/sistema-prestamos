import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "Escribe un correo válido." })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1, { message: "Escribe tu contraseña." })
  @MaxLength(128)
  password!: string;
}