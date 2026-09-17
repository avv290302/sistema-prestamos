import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Matches, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { frequencies } from './loan-plan';
import type { Frequency } from './loan-plan';

class ScheduledPaymentDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;

  @IsInt()
  @Min(1)
  @Max(1_100_000_000)
  amountCents!: number;
}

export class LoanPlanDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100_000)
  interestBps?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  installmentCount?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(frequencies)
  frequency?: Frequency;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(365)
  intervalDays?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(1_100_000_000)
  regularPaymentCents?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ScheduledPaymentDto)
  customInstallments?: ScheduledPaymentDto[];
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  principalCents!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  firstPaymentDate!: string;
}

export class CreateLoanDto extends LoanPlanDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  requestId!: string;
}
export class UpdateLoanDto extends LoanPlanDto {
  @IsInt() @Min(1) version!:number;
}
