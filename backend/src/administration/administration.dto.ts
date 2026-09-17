import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import type { UserRole } from '../generated/prisma/client';
const trim = ({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value;
class UserDetailsDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(150)
  fullName!: string;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254)
  email!: string;
  @IsIn(['ADMIN','COLLECTOR','VIEWER'])
  role!: UserRole;
}
export class CreateUserDto extends UserDetailsDto {
  @IsString() @MinLength(12, {message: 'La contraseña debe tener al menos 12 caracteres.'}) @MaxLength(128)
  password!: string;
}
export class UpdateUserDto extends UserDetailsDto {
  @IsBoolean() isActive!: boolean;
  @IsInt() @Min(1) version!: number;
  @ValidateIf((_, value) => value !== undefined)
  @IsString() @MinLength(12, {message: 'La contraseña debe tener al menos 12 caracteres.'}) @MaxLength(128)
  password?: string;
}
export class SettingsDto {
  @ValidateIf((_, value) => value !== undefined) @Transform(trim) @IsString() @MaxLength(30)
  businessPhone?: string;
  @ValidateIf((_, value) => value !== undefined) @Transform(trim) @IsString() @MaxLength(300)
  businessAddress?: string;
  @ValidateIf((_, value) => value !== undefined) @Transform(trim) @IsString() @MaxLength(300)
  receiptFooter?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  businessName!: string;
  @IsInt() @Min(0) @Max(100000)
  interestBps!: number;
  @IsInt() @Min(1) @Max(1000)
  installmentCount!: number;
  @IsIn(['DAILY','WEEKLY','FORTNIGHTLY','MONTHLY','INTERVAL'])
  frequency!: string;
  @IsInt() @Min(1) @Max(365)
  intervalDays!: number;
  @IsInt() @Min(0) @Max(365)
  firstPaymentAfterDays!: number;
  @IsInt() @Min(1) version!: number;
}

export class DeleteUserDto {
  @IsInt() @Min(1) version!: number;
}
