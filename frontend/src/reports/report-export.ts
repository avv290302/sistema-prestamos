import type { ReportData } from '../services/reports';
const cell = (value: string | number) => {
  const text=String(value); const safe=/^[=+\-@\t\r]/.test(text)?`'${text}`:text;
  return `"${safe.replaceAll('"','""')}"`;
};
export function downloadReportCsv(report:ReportData) {
  const rows:(string|number)[][]=[
    ['REPORTE DE PRESTAMOS Y COBRANZA'], ['Periodo',report.range.from,report.range.to], ['Fecha de cartera actual',report.asOf], ['Zona horaria',report.timeZone], ['Importes en pesos MXN'], [],
    ['INDICADORES DEL PERIODO','Actual','Periodo anterior'],
    ['Capital colocado',report.current.principalCents/100,report.previous.principalCents/100],
    ['Cobros recibidos',report.current.collectedCents/100,report.previous.collectedCents/100],
    ['Interes pactado en prestamos nuevos',report.current.interestCents/100,report.previous.interestCents/100],
    ['Prestamos registrados',report.current.loanCount,report.previous.loanCount],
    ['Pagos registrados',report.current.paymentCount,report.previous.paymentCount], [],
    ['EVOLUCION','Capital colocado','Cobros','Prestamos','Pagos'],
    ...report.series.map(r=>[r.date,r.principalCents/100,r.collectedCents/100,r.loanCount,r.paymentCount]), [],
    ['CARTERA ACTUAL','Importe'],['Saldo pendiente',report.portfolio.outstandingCents/100],['Saldo vencido',report.portfolio.overdueCents/100],['Vence hoy',report.portfolio.dueTodayCents/100],['Vencimientos futuros',report.portfolio.upcomingCents/100],[],
    ['ANTIGUEDAD DEL ATRASO','Importe','Cuotas'],...report.aging.map(r=>[r.bucket,r.amountCents/100,r.installmentCount]),[],
    ['METODO','Cobrado','Pagos'],...report.methods.map(r=>[r.method,r.amountCents/100,r.count]),[],
    ['COBROS POR RESPONSABLE (TOP 10)','Cobrado','Pagos'],...report.responsibles.map(r=>[r.fullName,r.amountCents/100,r.count]),[],
    ['CLIENTES CON MAYOR SALDO VENCIDO (TOP 5)','Vencido','Cuotas','Dias de atraso'],...report.debtors.map(r=>[r.fullName,r.overdueCents/100,r.overdueInstallments,r.daysOverdue]),
  ];
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const link=document.createElement('a');
  link.href=url; link.download=`reporte-${report.range.from}-${report.range.to}.csv`; document.body.append(link); link.click(); link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
