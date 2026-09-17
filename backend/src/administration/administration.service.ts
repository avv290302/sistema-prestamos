import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateUserDto, UpdateUserDto, SettingsDto } from './administration.dto';
import type { ListClientsDto } from '../clients/dto/list-clients.dto';
const publicUser = {id:true, fullName:true, email:true, role:true, isActive:true, deletedAt:true, version:true, createdAt:true} as const;
@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}
  async listUsers(query: ListClientsDto) {
    const where: Prisma.UserWhereInput = {deletedAt:null,...(query.search ? {OR:[{fullName:{contains:query.search,mode:'insensitive' as const}},{email:{contains:query.search,mode:'insensitive' as const}}]} : {})};
    const [items,total] = await this.prisma.$transaction([
      this.prisma.user.findMany({where,select:publicUser,orderBy:[{fullName:'asc'},{id:'asc'}],skip:(query.page-1)*query.limit,take:query.limit}),
      this.prisma.user.count({where}),
    ], {isolationLevel:'RepeatableRead'});
    return {items,pagination:{page:query.page,total,totalPages:Math.ceil(total/query.limit)}};
  }
  private async lockAdministrator(tx: Prisma.TransactionClient, actorId: string) {
    // Serialize access changes, then recheck the actor after waiting for the lock.
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(7162001)) AS access_lock`;
    const actor = await tx.user.findUnique({where:{id:actorId},select:{role:true,isActive:true,deletedAt:true}});
    if (!actor?.isActive || actor.deletedAt || actor.role !== 'ADMIN') throw new ForbiddenException('Tu cuenta ya no tiene permisos de administración.');
  }
  async createUser(dto: CreateUserDto, actorId: string) {
    const passwordHash = await argon2.hash(dto.password,{type:argon2.argon2id});
    try {
      return await this.prisma.$transaction(async tx => {
        await this.lockAdministrator(tx,actorId);
        return tx.user.create({data:{fullName:dto.fullName,email:dto.email,role:dto.role,passwordHash},select:publicUser});
      });
    } catch(error) { this.rethrowDuplicate(error); }
  }
  async updateUser(id: string, dto: UpdateUserDto, actorId: string) {
    const passwordHash = dto.password === undefined ? undefined : await argon2.hash(dto.password,{type:argon2.argon2id});
    try {
      return await this.prisma.$transaction(async tx => {
        await this.lockAdministrator(tx,actorId);
        const existing = await tx.user.findUnique({where:{id},select:publicUser});
        if (!existing || existing.deletedAt) throw new NotFoundException('No se encontró el usuario.');
        if (existing.version !== dto.version) throw new ConflictException('El usuario cambió desde que lo abriste. Actualiza la lista antes de editarlo.');
        if (id === actorId && (!dto.isActive || dto.role !== 'ADMIN')) throw new BadRequestException('No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.');
        if (existing.isActive && existing.role === 'ADMIN' && (!dto.isActive || dto.role !== 'ADMIN') && await tx.user.count({where:{isActive:true,deletedAt:null,role:'ADMIN'}}) <= 1) throw new BadRequestException('Debe quedar al menos un administrador activo.');
        const user = await tx.user.update({where:{id},data:{fullName:dto.fullName,email:dto.email,role:dto.role,isActive:dto.isActive,passwordHash,version:{increment:1}},select:publicUser});
        if (id === actorId || !dto.isActive || dto.role !== existing.role || dto.email !== existing.email || passwordHash !== undefined) {
          await tx.session.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
        }
        return user;
      });
    } catch(error) { this.rethrowDuplicate(error); }
  }
  async deleteUser(id: string, version: number, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lockAdministrator(tx,actorId);
      const existing=await tx.user.findUnique({where:{id},select:publicUser});
      if(!existing || existing.deletedAt)throw new NotFoundException('No se encontró el usuario.');
      if(id===actorId)throw new BadRequestException('No puedes eliminar tu propia cuenta.');
      if(existing.version!==version)throw new ConflictException('El usuario cambió. Actualiza la lista antes de eliminarlo.');
      if(existing.isActive && existing.role==='ADMIN' && await tx.user.count({where:{isActive:true,deletedAt:null,role:'ADMIN'}})<=1)throw new BadRequestException('Debe quedar al menos un administrador activo.');
      // Preserve attribution and foreign keys in payments, loans and audit records.
      await tx.$executeRaw`UPDATE users SET deleted_at=CURRENT_TIMESTAMP, is_active=false, version=version+1 WHERE id=${id}::uuid`;
      await tx.session.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
      return {id,deleted:true};
    });
  }
  private rethrowDuplicate(error: unknown): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException('Ya existe una cuenta con ese correo.');
    throw error;
  }
  async settings() {
    return this.prisma.appSettings.findUniqueOrThrow({where:{id:1}});
  }
  async branding() {
    return this.prisma.appSettings.findUniqueOrThrow({where:{id:1},select:{businessName:true}});
  }
  async saveSettings(dto: SettingsDto, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lockAdministrator(tx,actorId);
      const {version,...values} = dto;
      const result = await tx.appSettings.updateMany({where:{id:1,version},data:{...values,version:{increment:1}}});
      if (!result.count) throw new ConflictException('La configuración cambió desde que la abriste. Recarga los valores antes de guardar.');
      return tx.appSettings.findUniqueOrThrow({where:{id:1}});
    });
  }
}
