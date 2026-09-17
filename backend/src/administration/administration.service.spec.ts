import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdministrationService } from './administration.service';
import type { PrismaService } from '../database/prisma.service';
jest.mock('../database/prisma.service',()=>({PrismaService:jest.fn()}));
describe('Administration access changes',()=>{
  const base={fullName:'Administrador',email:'test@example.invalid',role:'ADMIN' as const,isActive:true,version:1};
  it('rechecks the actor after obtaining the transaction lock',async()=>{
    const order:string[]=[];
    const tx={$queryRaw:jest.fn(async()=>{order.push('lock');return [{one:1}];}),user:{findUnique:jest.fn(async()=>{order.push('actor');return {role:'VIEWER',isActive:true};}),update:jest.fn()}};
    const service=new AdministrationService({$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)} as unknown as PrismaService);
    await expect(service.updateUser('target',base,'actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(order).toEqual(['lock','actor']);expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('protects the final active administrator',async()=>{
    const tx={$queryRaw:jest.fn(async()=>[]),user:{findUnique:jest.fn().mockResolvedValueOnce({role:'ADMIN',isActive:true}).mockResolvedValueOnce(base),count:jest.fn(async()=>1),update:jest.fn()}};
    const service=new AdministrationService({$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)} as unknown as PrismaService);
    await expect(service.updateUser('target',{...base,role:'VIEWER'},'actor')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
