import Dialog from '../components/Dialog';
import ResponsiveTable from '../components/ResponsiveTable';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../services/auth';
import type { UserRole } from '../services/auth';
import { listUsers, saveUser, deleteUser, roleLabels, roleHelp } from '../services/administration';
import type { ManagedUser, UserList, UserValues } from '../services/administration';
import './Administration.css';
const errorMessage=(e:unknown)=>e instanceof ApiError?e.message:'No se pudo completar la operación. Intenta nuevamente.';
function UserForm({selected,currentId,onSaved,onCancel,onSessionExpired}:{selected:ManagedUser|null;currentId:string;onSaved:(user:ManagedUser)=>void;onCancel:()=>void;onSessionExpired:()=>void}) {
  const [fullName,setFullName]=useState(selected?.fullName??'');
  const [email,setEmail]=useState(selected?.email??'');
  const [role,setRole]=useState<UserRole>(selected?.role??'VIEWER');
  const [isActive,setActive]=useState(selected?.isActive??true);
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const lock=useRef(false);
  const self=selected?.id===currentId;
  async function submit(e:FormEvent) {
    e.preventDefault(); if(lock.current)return; setError('');
    if(password!==confirmPassword){setError('Las contraseñas no coinciden.');return;}
    lock.current=true;setBusy(true);
    const values:UserValues={fullName:fullName.trim(),email:email.trim().toLowerCase(),role,...(selected?{isActive,version:selected.version}:{}),...(password?{password}:{})};
    try {onSaved(await saveUser(selected?.id,values));setPassword('');setConfirmPassword('');}
    catch(err){if(err instanceof ApiError&&err.status===401)onSessionExpired();else setError(errorMessage(err));}
    finally{lock.current=false;setBusy(false);}
  }
  return <Dialog label={selected?"Editar usuario":"Nuevo usuario"} onClose={onCancel} busy={busy}><section className="client-panel"><div className="clients-heading"><h3>{selected?'Editar usuario':'Nuevo usuario'}</h3><button className="secondary-button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
    <form onSubmit={e=>void submit(e)}><div className="client-form-grid">
      <div className="form-field"><label htmlFor="user-name">Nombre completo</label><input id="user-name" required minLength={2} maxLength={150} value={fullName} disabled={busy} onChange={e=>setFullName(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="user-email">Correo de acceso</label><input id="user-email" type="email" autoComplete="off" required maxLength={254} value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="user-role">Rol</label><select id="user-role" value={role} disabled={busy||self} onChange={e=>setRole(e.target.value as UserRole)}>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><small>{roleHelp[role]}</small></div>
      {selected&&<div className="form-field"><label htmlFor="user-active">Estado</label><select id="user-active" value={String(isActive)} disabled={busy||self} onChange={e=>setActive(e.target.value==='true')}><option value="true">Activo</option><option value="false">Inactivo</option></select><small>Al desactivar la cuenta se cierra su acceso y se conserva su historial.</small></div>}
      <div className="form-field"><label htmlFor="user-password">{selected?'Nueva contraseña (opcional)':'Contraseña inicial'}</label><input id="user-password" type="password" autoComplete="new-password" required={!selected} minLength={12} maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/><small>Mínimo 12 caracteres.{selected?' Déjala vacía para conservar la actual.':''}</small></div>
      <div className="form-field"><label htmlFor="user-confirm">Repetir contraseña</label><input id="user-confirm" type="password" autoComplete="new-password" required={!!password||!selected} minLength={12} maxLength={128} value={confirmPassword} disabled={busy} onChange={e=>setConfirmPassword(e.target.value)}/></div>
    </div>{selected&&<p>Los cambios de rol, correo, contraseña o estado cierran las sesiones de esta cuenta.</p>}{self&&<p>Estás editando tu cuenta. Después de guardar, vuelve a iniciar sesión.</p>}
    {error&&<p className="error-message" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy?'Guardando…':selected?'Guardar cambios':'Crear usuario'}</button></form>
  </section></Dialog>;
}
export default function UsersPage({currentId,onSessionExpired}:{currentId:string;onSessionExpired:()=>void}) {
  const [query,setQuery]=useState('');const [filter,setFilter]=useState({search:'',page:1,revision:0});
  const [result,setResult]=useState<UserList|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [deleting,setDeleting]=useState<string|null>(null);const deleteLock=useRef(false);
  const [editor,setEditor]=useState<{user:ManagedUser|null}|null>(null);
  useEffect(()=>{const c=new AbortController();void listUsers(filter.search,filter.page,c.signal).then(data=>{if(!c.signal.aborted){setResult(data);setError('');}}).catch(err=>{if(c.signal.aborted)return;if(err instanceof ApiError&&err.status===401)onSessionExpired();else setError(errorMessage(err));}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[filter,onSessionExpired]);
  function refresh(page=filter.page,search=filter.search){setLoading(true);setError('');setFilter(f=>({page,search,revision:f.revision+1}));}
  async function remove(user:ManagedUser){
    if(deleteLock.current)return;
    if(!window.confirm('¿Eliminar a '+user.fullName+'? Se cerrarán sus sesiones y perderá el acceso. Sus pagos y préstamos conservarán el historial. Esta cuenta no podrá reactivarse desde el sistema.'))return;
    deleteLock.current=true;setDeleting(user.id);setError('');setNotice('');
    try{await deleteUser(user.id,user.version);setNotice('Usuario eliminado. Su historial se conserva.');refresh(result?.items.length===1?Math.max(1,filter.page-1):filter.page);}
    catch(err){if(err instanceof ApiError&&err.status===401)onSessionExpired();else setError(errorMessage(err));}
    finally{deleteLock.current=false;setDeleting(null);}
  }
  return <section className="clients-page administration-page"><header className="clients-heading"><div><h2>Usuarios y permisos</h2><p>Controla quién accede al sistema y qué operaciones puede realizar.</p></div>{!editor&&<button disabled={!!deleting} className="primary-button" onClick={()=>{setEditor({user:null});setNotice('');}}>Nuevo usuario</button>}</header>
    <div className="admin-role-grid">{Object.entries(roleLabels).map(([key,label])=><article key={key}><strong>{label}</strong><p>{roleHelp[key as UserRole]}</p></article>)}</div>
    {notice&&<p className="client-notice" role="status">{notice}</p>}
    {editor&&<UserForm key={editor.user?.id??'new'} selected={editor.user} currentId={currentId} onCancel={()=>setEditor(null)} onSessionExpired={onSessionExpired} onSaved={u=>{setEditor(null);if(u.id===currentId){onSessionExpired();return;}setNotice('Usuario guardado correctamente.');setQuery('');refresh(1,'');}}/>}
    <form className="client-search" onSubmit={e=>{e.preventDefault();refresh(1,query.trim());}}><div className="form-field"><label htmlFor="users-search">Buscar por nombre o correo</label><input id="users-search" type="search" maxLength={150} value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="secondary-button">Buscar</button></form>
    {loading&&<p role="status">Cargando usuarios…</p>}{error&&<div><p className="error-message" role="alert">{error}</p><button className="secondary-button" onClick={()=>refresh()}>Reintentar</button></div>}
    {!loading&&!error&&result&&<><p>{result.pagination.total} usuarios encontrados</p>{result.items.length===0?<p className="client-panel">No hay usuarios que coincidan con la búsqueda.</p>:<div className="client-table-wrap"><ResponsiveTable className="client-table"><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{result.items.map(u=><tr key={u.id}><td>{u.fullName}{u.id===currentId&&' (tú)'}</td><td>{u.email}</td><td>{roleLabels[u.role]}</td><td><span className={'admin-status '+(u.isActive?'active':'inactive')}>{u.isActive?'Activo':'Inactivo'}</span></td><td><button className="secondary-button" disabled={!!editor||!!deleting} onClick={()=>{setEditor({user:u});setNotice('');}} aria-label={`Editar a ${u.fullName}`}>Editar</button>{u.id!==currentId&&<button className="secondary-button" disabled={!!editor||!!deleting} onClick={()=>void remove(u)} aria-label={`Eliminar a ${u.fullName}`}>{deleting===u.id?'Eliminando…':'Eliminar'}</button>}</td></tr>)}</tbody></ResponsiveTable></div>}<nav className="client-pagination" aria-label="Páginas de usuarios"><button className="secondary-button" disabled={filter.page<=1} onClick={()=>refresh(filter.page-1)}>Anterior</button><span>Página {filter.page} de {Math.max(1,result.pagination.totalPages)}</span><button className="secondary-button" disabled={filter.page>=result.pagination.totalPages} onClick={()=>refresh(filter.page+1)}>Siguiente</button></nav></>}
  </section>;
}
