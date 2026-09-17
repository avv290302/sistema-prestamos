import { request } from "./auth";

export interface Client {
  version:number; deletedAt:string|null;
  documents:{kind:"PHOTO"|"INE";fileName:string;mimeType:string;size:number}[];
  risk:{color:"GREEN"|"YELLOW"|"RED"|"GRAY";currentDays:number;historyDays:number;observations:number;overdueCents:number;windowDays:number};
  id: string;
  fullName: string;
  phone: string;
  address: string;
  notes: string | null;
  referenceName: string | null;
  referencePhone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
}

export interface CreateClientInput {
  fullName: string;
  phone: string;
  address: string;
  notes?: string;
  referenceName?: string;
  referencePhone?: string;
}

export interface ClientsResponse {
  items: Client[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ListClientsOptions {
  archived?:boolean;traffic?:string;
  page?: number;
  limit?: number;
  search?: string;
  signal?: AbortSignal;
}

export async function listClients(
  options: ListClientsOptions = {},
): Promise<ClientsResponse> {
  const params = new URLSearchParams({
    archived:String(options.archived??false),traffic:options.traffic??"ALL",
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });

  const search = options.search?.trim();

  if (search) {
    params.set("search", search);
  }

  const response = await request(`/clients?${params.toString()}`, {
    method: "GET",
    signal: options.signal,
  });

  return response.json() as Promise<ClientsResponse>;
}

export async function createClient(
  data: CreateClientInput,
): Promise<Client> {
  const response = await request("/clients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName: data.fullName.trim(),
      phone: data.phone.trim(),
      address: data.address.trim(),
      notes: data.notes?.trim() || undefined,
      referenceName: data.referenceName?.trim() || undefined,
      referencePhone: data.referencePhone?.trim() || undefined,
    }),
  });

  return response.json() as Promise<Client>;
}

export async function getClient(id: string): Promise<Client> {
  const response = await request(`/clients/${encodeURIComponent(id)}`, {
    method: "GET",
  });

  return response.json() as Promise<Client>;
}
export async function updateClient(id:string,data:CreateClientInput,version:number,isActive:boolean):Promise<Client>{return(await request('/clients/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,version,isActive})})).json();}
export async function archiveClient(c:Client,restore=false):Promise<Client>{return(await request('/clients/'+encodeURIComponent(c.id)+(restore?'/restore':''),{method:restore?'POST':'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:c.version})})).json();}
export async function uploadClientFile(c:Client,kind:'PHOTO'|'INE',file:File):Promise<Client>{const body=new FormData();body.set('version',String(c.version));body.set('file',file);return(await request('/clients/'+encodeURIComponent(c.id)+'/documents/'+kind,{method:'POST',body})).json();}
export async function deleteClientFile(c:Client,kind:'PHOTO'|'INE'):Promise<Client>{return(await request('/clients/'+encodeURIComponent(c.id)+'/documents/'+kind,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:c.version})})).json();}
export async function clientFile(id:string,kind:'PHOTO'|'INE',signal?:AbortSignal):Promise<Blob>{return(await request('/clients/'+encodeURIComponent(id)+'/documents/'+kind,{signal})).blob();}
