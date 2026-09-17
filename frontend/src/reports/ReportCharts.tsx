import ResponsiveTable from '../components/ResponsiveTable';
import { useId, useState } from 'react';
import type { ReportSeries } from '../services/reports';
import { money } from '../services/payments';
const compactMoney = (cents: number) => new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'MXN' }).format(cents / 100);
const shortDate = (value: string) => new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(value));
export function TrendChart({ series }: { series: ReportSeries[] }) {
  const gradient = useId().replaceAll(':','');
  const [index, setIndex] = useState<number | null>(null);
  const width=780, height=285, left=64, right=22, top=22, bottom=40;
  const plotW=width-left-right, plotH=height-top-bottom;
  const maximum=Math.max(100, ...series.flatMap(row => [row.principalCents,row.collectedCents]));
  const power=10**Math.floor(Math.log10(maximum));
  const ceiling=Math.ceil(maximum/power)*power;
  const x=(i:number) => left + (series.length===1 ? plotW/2 : i*plotW/Math.max(1,series.length-1));
  const y=(v:number) => top+plotH*(1-v/ceiling);
  const line=(key:'principalCents'|'collectedCents') => series.map((row,i) => `${i===0?'M':'L'} ${x(i)} ${y(row[key])}`).join(' ');
  const active=index===null?null:series[Math.min(index,series.length-1)];
  const selected=index===null?0:Math.min(index,series.length-1);
  const empty=series.every(row => row.principalCents===0 && row.collectedCents===0);
  return <div className="report-trend">
    <div className="report-chart-legend"><span><i className="dot teal"/>Capital colocado</span><span><i className="dot blue"/>Cobros recibidos</span></div>
    {empty && <p className="report-empty-note">No hay movimientos en este periodo.</p>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución de capital colocado y cobros recibidos. Los valores también están disponibles en Ver datos." onPointerLeave={() => setIndex(null)}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#168976" stopOpacity=".16"/><stop offset="100%" stopColor="#168976" stopOpacity="0"/></linearGradient></defs>
      {[0,1,2,3,4].map(tick => { const value=ceiling*tick/4; return <g key={tick}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="#e8edf0" strokeDasharray={tick===0?undefined:'4 5'}/><text x={left-12} y={y(value)+4} textAnchor="end" className="chart-label">{compactMoney(value)}</text></g>; })}
      {series.length>0 && <><path d={`${line('principalCents')} L ${x(series.length-1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#${gradient})`}/><path d={line('principalCents')} fill="none" stroke="#168976" strokeWidth="3" strokeLinejoin="round"/><path d={line('collectedCents')} fill="none" stroke="#527bd7" strokeWidth="3" strokeLinejoin="round"/>
      {series.map((row,i) => (i===0 || i===series.length-1 || i%Math.max(1,Math.ceil(series.length/6))===0) && <text key={row.date} x={x(i)} y={height-12} textAnchor="middle" className="chart-label">{shortDate(row.date)}</text>)}
      {series.length===1 && <><circle cx={x(0)} cy={y(series[0].principalCents)} r="4" fill="#168976"/><circle cx={x(0)} cy={y(series[0].collectedCents)} r="4" fill="#527bd7"/></>}
      {active && <g><line x1={x(selected)} x2={x(selected)} y1={top} y2={y(0)} stroke="#b8c9d1" strokeDasharray="4 4"/><circle cx={x(selected)} cy={y(active.principalCents)} r="5" fill="#168976" stroke="white" strokeWidth="2"/><circle cx={x(selected)} cy={y(active.collectedCents)} r="5" fill="#527bd7" stroke="white" strokeWidth="2"/></g>}
      {series.map((row,i) => <rect key={row.date} x={series.length===1?left:Math.max(left,x(i)-plotW/Math.max(1,series.length-1)/2)} y={top} width={series.length===1?plotW:plotW/Math.max(1,series.length-1)} height={plotH} fill="transparent" tabIndex={0} role="button" aria-label={`${shortDate(row.date)}: capital ${money(row.principalCents)}, cobros ${money(row.collectedCents)}`} onPointerEnter={() => setIndex(i)} onFocus={() => setIndex(i)} onBlur={() => setIndex(null)} onKeyDown={e => { if(e.key==='Enter'||e.key===' ') { e.preventDefault(); setIndex(i); } }}/>)}</>}
    </svg>
    <div className="chart-readout" aria-live="polite">{active ? <><strong>{shortDate(active.date)}</strong><span>Colocado: {money(active.principalCents)}</span><span>Cobrado: {money(active.collectedCents)}</span></> : <span>Pasa el cursor o selecciona un punto para consultar sus importes.</span>}</div>
    <details className="report-data"><summary>Ver datos de la gráfica</summary><div className="report-table-scroll"><ResponsiveTable className="client-table"><thead><tr><th>Inicio del intervalo</th><th>Capital colocado</th><th>Cobros</th><th>Préstamos</th><th>Pagos</th></tr></thead><tbody>{series.map(row => <tr key={row.date}><td>{shortDate(row.date)}</td><td>{money(row.principalCents)}</td><td>{money(row.collectedCents)}</td><td>{row.loanCount}</td><td>{row.paymentCount}</td></tr>)}</tbody></ResponsiveTable></div></details>
  </div>;
}
export function PortfolioDonut({ outstanding, overdue }: { outstanding:number; overdue:number }) {
  const percent=outstanding>0?overdue/outstanding*100:0;
  return <div className="report-donut-wrap"><svg viewBox="0 0 220 220" role="img" aria-label={`Cartera pendiente ${money(outstanding)}. Vencida ${money(overdue)}, ${percent.toFixed(1)} por ciento.`}><circle cx="110" cy="110" r="82" fill="none" stroke={outstanding?'#168976':'#e8edf0'} strokeWidth="23"/>{outstanding>0 && <circle cx="110" cy="110" r="82" fill="none" stroke="#dd8067" strokeWidth="23" pathLength="100" strokeDasharray={`${percent} ${100-percent}`} transform="rotate(-90 110 110)"/>}<text x="110" y="105" textAnchor="middle" className="donut-number">{outstanding?`${percent.toFixed(1)}%`:'—'}</text><text x="110" y="129" textAnchor="middle" className="donut-caption">{outstanding?'saldo vencido':'sin cartera'}</text></svg><div className="donut-legend"><div><span><i className="dot teal"/>Sin vencer</span><strong>{money(outstanding-overdue)}</strong></div><div><span><i className="dot coral"/>Vencido</span><strong>{money(overdue)}</strong></div></div></div>;
}
