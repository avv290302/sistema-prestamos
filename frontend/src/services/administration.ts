import { request } from './auth';
import type { UserRole } from './auth';
import type { LoanFrequency } from './loans';
export const roleLabels: Record<UserRole,string> = {ADMIN:'Administrador',COLLECTOR:'Cobrador',VIEWER:'Consulta'};
export const roleHelp: Record<UserRole,string> = {ADMIN:'Administra clientes, préstamos, pagos, usuarios y configuración; consulta cobranza y reportes.',COLLECTOR:'Consulta clientes, préstamos, cobranza y reportes; registra pagos.',VIEWER:'Consulta información y reportes; no puede registrar ni modificar datos.'};
export interface ManagedUser {id:string;fullName:string;email:string;role:UserRole;isActive:boolean;version:number;createdAt:string}
export interface UserValues {fullName:string;email:string;role:UserRole;password?:string;isActive?:boolean;version?:number}
export interface UserList {items:ManagedUser[];pagination:{page:number;total:number;totalPages:number}}
export interface Settings {businessPhone:string;businessAddress:string;receiptFooter:string;businessName:string;interestBps:number;installmentCount:number;frequency:Exclude<LoanFrequency,'CUSTOM'>;intervalDays:number;firstPaymentAfterDays:number;version:number}
export async function listUsers(search:string,page:number,signal:AbortSignal):Promise<UserList> {return (await request(`/users?${new URLSearchParams({search,page:String(page),limit:'20'})}`,{signal})).json();}
export async function saveUser(id:string|undefined,values:UserValues):Promise<ManagedUser> {return (await request(id?`/users/${encodeURIComponent(id)}`:'/users',{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)})).json();}
export async function getSettings(signal?:AbortSignal):Promise<Settings> {return (await request('/settings',{signal})).json();}
export async function saveSettings(values:Settings):Promise<Settings> {
  const {businessName,businessPhone,businessAddress,receiptFooter,interestBps,installmentCount,frequency,intervalDays,firstPaymentAfterDays,version}=values;
  return (await request('/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({businessName,businessPhone,businessAddress,receiptFooter,interestBps,installmentCount,frequency,intervalDays,firstPaymentAfterDays,version})})).json();
}
export async function getBranding(signal:AbortSignal):Promise<{businessName:string}> {return (await request('/settings/branding',{signal})).json();}

export async function deleteUser(id:string,version:number):Promise<void> {await request('/users/'+encodeURIComponent(id),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version})});}
