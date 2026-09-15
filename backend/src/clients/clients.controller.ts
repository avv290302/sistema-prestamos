import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Roles } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { ListClientsDto } from "./dto/list-clients.dto";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles("ADMIN")
  @Header("Cache-Control", "no-store")
  create(
    @Body() dto: CreateClientDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.authUser) {
      throw new UnauthorizedException("Sesión inválida o vencida.");
    }

    return this.clientsService.create(dto, request.authUser.id);
  }

  @Get()
  @Roles("ADMIN", "COLLECTOR", "VIEWER")
  @Header("Cache-Control", "no-store")
  findAll(@Query() query: ListClientsDto) {
    return this.clientsService.findAll(query);
  }

  @Get(":id")
  @Roles("ADMIN", "COLLECTOR", "VIEWER")
  @Header("Cache-Control", "no-store")
  findOne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.clientsService.findOne(id);
  }
}