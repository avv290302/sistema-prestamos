import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CreateClientDto } from './create-client.dto';
import { ListClientsDto } from './list-clients.dto';
export class VersionDto { @Type(()=>Number) @IsInt() @Min(1) version!:number; }
export class UpdateClientDto extends CreateClientDto {
  @IsInt() @Min(1) version!:number;
  @IsBoolean() isActive!:boolean;
}
export class ClientDirectoryDto extends ListClientsDto {
  @IsOptional() @IsIn(['true','false']) archived?:string;
  @IsOptional() @IsIn(['ALL','GREEN','YELLOW','RED','GRAY','LATE']) traffic?:string;
}
