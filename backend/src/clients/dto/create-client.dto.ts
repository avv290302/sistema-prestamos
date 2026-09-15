import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

function trimText({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function optionalText({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const text = value.trim();
  return text === "" ? undefined : text;
}

export class CreateClientDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: "El nombre del cliente es obligatorio." })
  @MaxLength(150)
  fullName!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: "El teléfono es obligatorio." })
  @MaxLength(30)
  @Matches(/^\+?[0-9 ()-]+$/, {
    message: "El teléfono solo admite números, espacios, paréntesis y guiones.",
  })
  @Matches(/^(?:\D*\d){7,15}\D*$/, {
    message: "El teléfono debe contener entre 7 y 15 dígitos.",
  })
  phone!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty({ message: "La dirección es obligatoria." })
  @MaxLength(500)
  address!: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  referenceName?: string;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^\+?[0-9 ()-]+$/, {
    message: "El teléfono de referencia tiene un formato inválido.",
  })
  @Matches(/^(?:\D*\d){7,15}\D*$/, {
    message: "El teléfono de referencia debe contener entre 7 y 15 dígitos.",
  })
  referencePhone?: string;
}