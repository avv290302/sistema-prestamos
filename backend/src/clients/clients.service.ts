import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto, ClientDirectoryDto } from './dto/update-client.dto';
import { businessDate } from '../payments/payment-allocation';
import { paymentRisk, riskCte } from './payment-risk';
import { validateDocument } from './client-document';
import type { ClientUpload } from './client-document';
const clientSelect={id:true,fullName:true,phone:true,address:true,notes:true,referenceName:true,referencePhone:true,isActive:true,createdAt:true,updatedAt:true,createdById:true,version:true,deletedAt:true,
 documents:{select:{kind:true,fileName:true,mimeType:true,size:true}}} satisfies Prisma.ClientSelect;
type RiskRow={id:string;current_days:number;history_days:number;observations:number;overdue_cents:number};
const decorate=(client:Prisma.ClientGetPayload<{select:typeof clientSelect}>,score?:RiskRow)=>({...client,risk:paymentRisk(score?.current_days??0,score?.history_days??0,score?.observations??0,score?.overdue_cents??0)});
@Injectable()
export class ClientsService {
 constructor(private readonly prisma:PrismaService){}
 async create(dto:CreateClientDto,createdById:string){return decorate(await this.prisma.client.create({data:{...dto,createdById},select:clientSelect}));}
 async findAll(query:ClientDirectoryDto){
  const pattern=`%${(query.search??'').replace(/[\\%_]/g,'\\$&')}%`;
  const base=riskCte(businessDate());
  const filter=Prisma.sql`(c.deleted_at IS NOT NULL)=${query.archived==='true'} AND (c.full_name ILIKE ${pattern} OR c.phone ILIKE ${pattern})
    AND (${query.traffic??'ALL'}='ALL' OR r.color=${query.traffic??'ALL'} OR (${query.traffic??'ALL'}='LATE' AND r.color IN ('YELLOW','RED')))`;
  return this.prisma.$transaction(async tx=>{
   const rows=await tx.$queryRaw<RiskRow[]>(Prisma.sql`${base} SELECT r.* FROM risk r JOIN clients c ON c.id=r.id WHERE ${filter} ORDER BY c.created_at DESC,c.id DESC LIMIT ${query.limit} OFFSET ${(query.page-1)*query.limit}`);
   const [count]=await tx.$queryRaw<{total:number}[]>(Prisma.sql`${base} SELECT COUNT(*)::integer AS total FROM risk r JOIN clients c ON c.id=r.id WHERE ${filter}`);
   const clients=await tx.client.findMany({where:{id:{in:rows.map(r=>r.id)}},select:clientSelect});
   return {items:rows.map(r=>decorate(clients.find(c=>c.id===r.id)!,r)),pagination:{page:query.page,limit:query.limit,total:count.total,totalPages:Math.ceil(count.total/query.limit)}};
  },{isolationLevel:'RepeatableRead'});
 }
 async findOne(id:string){
  return this.prisma.$transaction(async tx=>{
   const client=await tx.client.findUnique({where:{id},select:clientSelect});if(!client)throw new NotFoundException('No se encontró el cliente.');
   const [score]=await tx.$queryRaw<RiskRow[]>(Prisma.sql`${riskCte(businessDate())} SELECT * FROM risk WHERE id=${id}::uuid`);
   return decorate(client,score);
  },{isolationLevel:'RepeatableRead'});
 }
 private async lock(tx:Prisma.TransactionClient,id:string,version:number){
  await tx.$queryRaw`SELECT id FROM clients WHERE id=${id}::uuid FOR UPDATE`;
  const c=await tx.client.findUnique({where:{id},select:clientSelect});if(!c)throw new NotFoundException('No se encontró el cliente.');
  if(c.version!==version)throw new ConflictException('El cliente cambió. Vuelve a abrir su ficha antes de guardar.');return c;
 }
 async update(id:string,dto:UpdateClientDto){
  await this.prisma.$transaction(async tx=>{const c=await this.lock(tx,id,dto.version);if(c.deletedAt)throw new ConflictException('Restaura el cliente antes de editarlo.');
   const {version:_version,...data}=dto;
   await tx.client.update({where:{id},data:{...data,notes:dto.notes??null,referenceName:dto.referenceName??null,referencePhone:dto.referencePhone??null,version:{increment:1}}});
  });return this.findOne(id);
 }
 async archive(id:string,version:number,restore=false){
  await this.prisma.$transaction(async tx=>{await this.lock(tx,id,version);await tx.client.update({where:{id},data:{deletedAt:restore?null:new Date(),isActive:restore,version:{increment:1}}});});return this.findOne(id);
 }
 async saveDocument(id:string,kind:string,version:number,file:ClientUpload|undefined){
  const data=validateDocument(kind,file);
  await this.prisma.$transaction(async tx=>{const c=await this.lock(tx,id,version);if(c.deletedAt)throw new ConflictException('Restaura el cliente antes de adjuntar archivos.');
   await tx.clientDocument.upsert({where:{clientId_kind:{clientId:id,kind}},create:{clientId:id,kind,...data},update:data});
   await tx.client.update({where:{id},data:{version:{increment:1}}});
  });return this.findOne(id);
 }
 async removeDocument(id:string,kind:string,version:number){
  await this.prisma.$transaction(async tx=>{await this.lock(tx,id,version);await tx.clientDocument.deleteMany({where:{clientId:id,kind}});await tx.client.update({where:{id},data:{version:{increment:1}}});});return this.findOne(id);
 }
 async document(id:string,kind:string){const file=await this.prisma.clientDocument.findUnique({where:{clientId_kind:{clientId:id,kind}}});if(!file)throw new NotFoundException('No se encontró el archivo.');return file;}
}
