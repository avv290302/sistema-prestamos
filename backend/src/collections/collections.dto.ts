import { IsIn, IsOptional } from 'class-validator';
import { ListClientsDto } from '../clients/dto/list-clients.dto';
export class ListCollectionsDto extends ListClientsDto {
  @IsOptional()
  @IsIn(['OVERDUE', 'TODAY', 'NEXT_7', 'ALL'])
  status: 'OVERDUE' | 'TODAY' | 'NEXT_7' | 'ALL' = 'OVERDUE';
}
