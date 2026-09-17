import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ListClientsDto } from '../clients/dto/list-clients.dto';

export class CreatePaymentDto {
  @IsUUID() loanId!: string;
  @IsUUID() requestId!: string;
  @IsInt() @Min(1) @Max(140_000_000) amountCents!: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) paidOn!: string;
  @IsIn(['CASH', 'TRANSFER', 'OTHER']) method!: 'CASH' | 'TRANSFER' | 'OTHER';
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
export class CancelPaymentDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
export class ListPaymentsDto extends ListClientsDto {
  @IsOptional() @IsIn(['ALL', 'ACTIVE', 'CANCELLED']) status?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() loanId?: string;
}
