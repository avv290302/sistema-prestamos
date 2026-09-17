import ResponsiveTable from '../components/ResponsiveTable';
import { useEffect, useState } from 'react';
import { ApiError } from '../services/auth';
import { getReport } from '../services/reports';
import type { ReportData, ReportGroup } from '../services/reports';
import { displayDate, methodLabels, money, today } from '../services/payments';
import type { PaymentMethod } from '../services/payments';
import { PortfolioDonut, TrendChart } from './ReportCharts';
import { downloadReportCsv } from './report-export';
import './ReportsPage.css';
const agingLabels:Record<string,string>={ '1_7':'1–7 días','8_14':'8–14 días','15_30':'15–30 días','31_PLUS':'31 días o más' };
function shiftDate(value:string, days:number) { const d=new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
function Delta({current, previous}:{current:number;previous:number}) {
  if(previous===0) return <span className="report-delta neutral">{current===0?'Sin variación':'Sin base anterior'}</span>;
  const percent=(current-previous)/previous*100;
  return <span className={'report-delta '+(percent>0?'up':percent<0?'down':'neutral')}>{percent>0?'↗':percent<0?'↘':'—'} {Math.abs(percent).toFixed(1)}% <span>vs. anterior</span></span>;
}
function Metric({title,value,note,current,previous,icon}:{title:string;value:string;note:string;current:number;previous:number;icon:string}) {
  return <article className="report-metric"><div className="metric-top"><span>{title}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div><strong className="metric-value">{value}</strong><div className="metric-bottom"><Delta current={current} previous={previous}/><small>{note}</small></div></article>;
}
export default function ReportsPage({active,refreshVersion,onSessionExpired,onOpenCollections}:{active:boolean;refreshVersion:number;onSessionExpired:()=>void;onOpenCollections:()=>void}) {
  const currentDay=today();
  const [from,setFrom]=useState(`${currentDay.slice(0,7)}-01`);
  const [to,setTo]=useState(currentDay);
  const [query,setQuery]=useState({from:`${currentDay.slice(0,7)}-01`,to:currentDay,groupBy:'DAY' as ReportGroup,revision:0});
  const [result,setResult]=useState<{key:string;data?:ReportData;error?:string}|null>(null);
  const [validation,setValidation]=useState('');
  const key=JSON.stringify([query,refreshVersion]);
  useEffect(()=>{
    if(!active) return;
    const controller=new AbortController();
    void getReport(query.from,query.to,query.groupBy,controller.signal).then(data=>{if(!controller.signal.aborted) setResult({key,data});}).catch((error:unknown)=>{
      if(controller.signal.aborted) return;
      if(error instanceof ApiError && error.status===401) onSessionExpired(); else setResult({key,error:error instanceof ApiError?error.message:'No se pudo cargar el reporte. Intenta nuevamente.'});
    });
    return ()=>controller.abort();
  },[query,refreshVersion,key,active,onSessionExpired]);
  const data=result?.key===key?result.data:undefined;
  const error=result?.key===key?result.error:undefined;
  function apply(start=from,end=to) {
    if(!start||!end||start>end||end>currentDay) {setValidation('Revisa el rango: la fecha inicial debe ser anterior o igual a la final y no se admiten fechas futuras.');return;}
    if((Date.parse(end)-Date.parse(start))/86400000>=366) {setValidation('Selecciona hasta 366 días por reporte.');return;}
    setValidation('');setFrom(start);setTo(end);
    const days=(Date.parse(end)-Date.parse(start))/86400000+1;
    setQuery(q=>({from:start,to:end,groupBy:days>90?'MONTH':days>31?'WEEK':'DAY',revision:q.revision+1}));
  }
  function preset(value:string) {
    if(value==='today') apply(currentDay,currentDay);
    else if(value==='week') apply(shiftDate(currentDay,-6),currentDay);
    else if(value==='month') apply(`${currentDay.slice(0,7)}-01`,currentDay);
    else if(value==='previous') { const end=shiftDate(`${currentDay.slice(0,7)}-01`,-1); apply(`${end.slice(0,7)}-01`,end); }
    else apply(`${currentDay.slice(0,4)}-01-01`,currentDay);
  }
  function printReport() {document.body.classList.add('printing-report');try{window.print();}finally{document.body.classList.remove('printing-report');}}
  const overdueRate=data&&data.portfolio.outstandingCents?data.portfolio.overdueCents/data.portfolio.outstandingCents*100:0;
  return <section className="reports-page">
    <header className="report-hero"><div><span className="report-eyebrow">INTELIGENCIA DEL NEGOCIO</span><h2>El panorama de tu cartera.</h2><p>Colocación, cobros y vencimientos en un solo lugar.</p><span className="report-live"><i/>Datos del sistema · MXN</span></div><div className="report-hero-actions"><button disabled={!data} onClick={()=>data&&downloadReportCsv(data)}>↓ Descargar CSV</button><button disabled={!data} onClick={printReport}>Imprimir / PDF</button></div></header>
    <section className="report-controls" aria-label="Periodo del reporte"><div className="report-presets"><span>Periodo</span><button onClick={()=>preset('today')}>Hoy</button><button onClick={()=>preset('week')}>7 días</button><button onClick={()=>preset('month')}>Este mes</button><button onClick={()=>preset('previous')}>Mes anterior</button><button onClick={()=>preset('year')}>Este año</button></div><form onSubmit={e=>{e.preventDefault();apply();}}><div><label htmlFor="report-from">Desde</label><input id="report-from" type="date" min="2000-01-01" max={currentDay} required value={from} onChange={e=>setFrom(e.target.value)}/></div><div><label htmlFor="report-to">Hasta</label><input id="report-to" type="date" min={from} max={currentDay} required value={to} onChange={e=>setTo(e.target.value)}/></div><button className="report-apply">Aplicar periodo</button><button type="button" className="report-refresh" onClick={()=>setQuery(q=>({...q,revision:q.revision+1}))} aria-label="Actualizar reporte">↻</button></form></section>
    {validation&&<p className="error-message" role="alert">{validation}</p>}
    {error?<div className="report-panel"><p className="error-message" role="alert">{error}</p><button className="secondary-button" onClick={()=>setQuery(q=>({...q,revision:q.revision+1}))}>Reintentar</button></div>:!data?<div className="report-loading" role="status"><p>Preparando indicadores y gráficas…</p><div className="report-kpis">{[1,2,3,4].map(i=><div key={i} className="report-skeleton"/>)}</div></div>:<>
      <div className="report-section-heading"><div><span className="report-section-kicker">01 / MOVIMIENTOS</span><h3>Resultados del periodo</h3></div><p>{displayDate(data.range.from)} — {displayDate(data.range.to)}<small>Comparado con {displayDate(data.range.previousFrom)} — {displayDate(data.range.previousTo)}</small></p></div>
      <div className="report-kpis"><Metric title="Capital colocado" value={money(data.current.principalCents)} note={`${data.current.loanCount} préstamos nuevos`} current={data.current.principalCents} previous={data.previous.principalCents} icon="↗"/><Metric title="Cobros recibidos" value={money(data.current.collectedCents)} note={`${data.current.paymentCount} pagos vigentes (excluye cancelados)`} current={data.current.collectedCents} previous={data.previous.collectedCents} icon="↓"/><Metric title="Interés pactado" value={money(data.current.interestCents)} note="De los préstamos nuevos" current={data.current.interestCents} previous={data.previous.interestCents} icon="%"/><Metric title="Préstamos nuevos" value={String(data.current.loanCount)} note="Registrados en el periodo" current={data.current.loanCount} previous={data.previous.loanCount} icon="▤"/></div>
      <div className="report-chart-grid"><section className="report-panel report-trend-panel"><div className="report-panel-heading"><div><h3>Colocación y cobros</h3><p>Movimientos por {data.range.groupBy==='DAY'?'día':data.range.groupBy==='WEEK'?'semana':'mes'}.</p></div><div className="report-group" role="group" aria-label="Agrupar gráfica">{(['DAY','WEEK','MONTH'] as ReportGroup[]).map((g,i)=><button key={g} aria-pressed={query.groupBy===g} onClick={()=>setQuery(q=>({...q,groupBy:g}))}>{['Día','Semana','Mes'][i]}</button>)}</div></div><TrendChart key={`${data.range.from}-${data.range.to}-${data.range.groupBy}`} series={data.series}/>{data.range.groupBy!=='DAY'&&<p className="report-footnote">Cada punto se etiqueta con el inicio de la semana o mes e incluye únicamente los movimientos dentro del rango elegido.</p>}</section>
      <section className="report-panel"><div className="report-panel-heading"><div><h3>Cómo se recibió el dinero</h3><p>Métodos de pago del periodo.</p></div></div><div className="report-method-total"><strong>{money(data.current.collectedCents)}</strong><span>{data.current.paymentCount} pagos en total</span></div><div className="report-methods">{data.methods.map((m,i)=>{const percent=data.current.collectedCents?m.amountCents/data.current.collectedCents*100:0;return <div key={m.method}><div className="report-bar-label"><span><i className={`dot method-${i}`}/>{methodLabels[m.method as PaymentMethod]}</span><strong>{money(m.amountCents)}</strong></div><div className="report-bar-track"><span className={`method-${i}`} style={{width:`${percent}%`}}/></div><small>{m.count} pagos · {percent.toFixed(1)}%</small></div>;})}</div>{!data.current.paymentCount&&<p className="report-empty-note">Todavía no hay cobros en este periodo.</p>}</section></div>
      <div className="report-section-heading portfolio-heading"><div><span className="report-section-kicker">02 / CARTERA ACTUAL</span><h3>Lo que queda por recuperar</h3></div><p>Al {displayDate(data.asOf)}<small>Este bloque muestra el saldo actual, independiente del filtro de fechas.</small></p></div>
      <div className="report-portfolio-strip"><div><span>Saldo pendiente</span><strong>{money(data.portfolio.outstandingCents)}</strong></div><div><span>Saldo vencido</span><strong className="report-coral">{money(data.portfolio.overdueCents)}</strong></div><div><span>Vence hoy</span><strong>{money(data.portfolio.dueTodayCents)}</strong></div><div><span>Clientes con saldo</span><strong>{data.portfolio.clientsWithBalance}</strong></div></div>
      <div className="report-chart-grid report-risk-grid"><section className="report-panel"><div className="report-panel-heading"><div><h3>Composición de la cartera</h3><p>Proporción del saldo que ya venció.</p></div></div><PortfolioDonut outstanding={data.portfolio.outstandingCents} overdue={data.portfolio.overdueCents}/><div className="report-loan-status"><span><strong>{data.portfolio.activeLoans}</strong> con saldo</span><span><strong>{data.portfolio.overdueLoans}</strong> con atraso</span><span><strong>{data.portfolio.paidLoans}</strong> liquidados</span></div><p className="report-footnote">Los préstamos con atraso forman parte de los préstamos con saldo.</p></section>
      <section className="report-panel"><div className="report-panel-heading"><div><h3>Antigüedad del atraso</h3><p>Saldo pendiente de las cuotas vencidas.</p></div><span className="report-risk-chip">{overdueRate.toFixed(1)}% vencido</span></div><div className="report-aging">{data.aging.map((row,i)=>{const max=Math.max(1,...data.aging.map(r=>r.amountCents));return <div className="aging-row" key={row.bucket}><div><strong>{agingLabels[row.bucket]}</strong><small>{row.installmentCount} cuotas</small></div><div className="report-bar-track"><span className={`aging-${i}`} style={{width:`${row.amountCents/max*100}%`}}/></div><strong>{money(row.amountCents)}</strong></div>;})}</div><div className="report-aging-footer"><span>{data.portfolio.overdueLoans?`${data.portfolio.overdueLoans} préstamos requieren seguimiento.`:'No hay cuotas vencidas pendientes.'}</span><button onClick={onOpenCollections}>Abrir Cobranza →</button></div></section></div>
      <div className="report-chart-grid report-tables"><section className="report-panel"><div className="report-panel-heading"><div><h3>Cobros por responsable</h3><p>Los 10 mayores importes registrados en el periodo.</p></div><span className="report-table-tag">PERIODO</span></div>{data.responsibles.length?<div className="report-table-scroll"><ResponsiveTable className="client-table"><thead><tr><th>Responsable</th><th>Pagos</th><th>Cobrado</th></tr></thead><tbody>{data.responsibles.map((r,i)=><tr key={r.id}><td><span className="report-rank">{String(i+1).padStart(2,'0')}</span>{r.fullName}</td><td>{r.count}</td><td><strong>{money(r.amountCents)}</strong></td></tr>)}</tbody></ResponsiveTable></div>:<p className="report-empty-note">No hay pagos registrados en este periodo.</p>}</section>
      <section className="report-panel"><div className="report-panel-heading"><div><h3>Prioridades de cobranza</h3><p>Los 5 clientes con mayor saldo vencido actual.</p></div><span className="report-table-tag">ACTUAL</span></div>{data.debtors.length?<div className="report-table-scroll"><ResponsiveTable className="client-table"><thead><tr><th>Cliente</th><th>Mayor atraso</th><th>Vencido</th></tr></thead><tbody>{data.debtors.map(r=><tr key={r.id}><td>{r.fullName}<small className="report-cell-note">{r.overdueInstallments} cuotas vencidas</small></td><td>{r.daysOverdue} días</td><td><strong className="report-coral">{money(r.overdueCents)}</strong></td></tr>)}</tbody></ResponsiveTable></div>:<p className="report-empty-note">Sin clientes con cuotas vencidas pendientes.</p>}</section></div>
      <footer className="report-notes"><strong>Cómo leer este reporte</strong><p>Capital colocado: monto de los préstamos según su fecha de registro. Cobros: pagos vigentes según la fecha de recepción registrada; los cancelados no se suman. Interés pactado: interés acordado de los préstamos nuevos; no equivale a utilidad ni a interés ya cobrado. La cartera actual incluye capital e interés pendientes. Los préstamos eliminados se excluyen de la colocación y de la cartera; sus cobros registrados permanecen en el historial.</p><div><span>Zona horaria: Ciudad de México · Importes en MXN</span><span>Actualizado: {new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(data.generatedAt))}</span></div></footer>
    </>}
  </section>;
}
