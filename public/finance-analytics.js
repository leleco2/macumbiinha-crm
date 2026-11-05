/** Read-only visualizations. All values originate in authenticated financial reports. */
const BRL = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'});
const BR_COMPACT = new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1});
const valid = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const currency = cents => BRL.format(valid(cents)/100);
const monthLabel = month => {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return '—';
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}).replace('.','');
};
const fullMonthLabel=month=> /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)) ? new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}) : 'Mês';
const escapeHTML = value => String(value??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeMonth = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)) ? month : null;

export function normalizeFinancialMonths(months, period=6, today=new Date()) {
  const length=[3,6,12].includes(Number(period))?Number(period):6;
  const safe=Array.isArray(months)?months:[];
  const map=new Map(safe.filter(entry=>safeMonth(entry?.month)).map(entry=>[entry.month,entry]));
  const result=[];
  const year=today.getUTCFullYear(),month=today.getUTCMonth();
  for(let index=length-1;index>=0;index--){
    const date=new Date(Date.UTC(year,month-index,1));
    const key=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
    const entry=map.get(key);
    result.push({month:key,income_cents:valid(entry?.income_cents),expense_cents:valid(entry?.expense_cents)});
  }
  return result;
}

export function financialChart(months,period=6,today=new Date()) {
  const data=normalizeFinancialMonths(months,period,today);
  const width=860,height=316,top=24,base=251,left=66,right=18;
  const plotWidth=width-left-right,plotHeight=base-top;
  const max=Math.max(1,...data.flatMap(x=>[x.income_cents,x.expense_cents]));
  const rounded=Math.ceil(max/10000)*10000 || 1;
  const step=plotWidth/data.length;
  const barWidth=Math.min(24,Math.max(9,step*.23));
  const axis=Array.from({length:5},(_,i)=>{
    const fraction=i/4,y=base-fraction*plotHeight;
    return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-gridline"/><text x="${left-11}" y="${y+4}" text-anchor="end" class="chart-axis-label">${BR_COMPACT.format((rounded*fraction)/100)}</text>`;
  }).join('');
  const groups=data.map((item,i)=>{
    const cx=left+(i+.5)*step;
    const inc=Math.max(0,item.income_cents/rounded*plotHeight);
    const exp=Math.max(0,item.expense_cents/rounded*plotHeight);
    const name=fullMonthLabel(item.month);
    const y=base+24;
    return `<g class="cash-month" tabindex="0" role="img" aria-label="${name}: entradas ${currency(item.income_cents)}, saídas ${currency(item.expense_cents)}">
      <title>${name} · Entradas: ${currency(item.income_cents)} · Saídas: ${currency(item.expense_cents)}</title>
      <rect x="${(cx-barWidth-3).toFixed(1)}" y="${(base-inc).toFixed(1)}" width="${barWidth}" height="${inc.toFixed(1)}" rx="${Math.min(5,barWidth/2)}" class="cash-bar cash-income"/>
      <rect x="${(cx+3).toFixed(1)}" y="${(base-exp).toFixed(1)}" width="${barWidth}" height="${exp.toFixed(1)}" rx="${Math.min(5,barWidth/2)}" class="cash-bar cash-expense"/>
      <text x="${cx}" y="${y}" text-anchor="middle" class="chart-month-label">${monthLabel(item.month)}</text>
    </g>`;
  }).join('');
  const totalIn=data.reduce((sum,x)=>sum+x.income_cents,0),totalOut=data.reduce((sum,x)=>sum+x.expense_cents,0);
  const table=`<details class="chart-accessible-table"><summary>Ver valores mês a mês</summary><div class="table-scroll"><table><thead><tr><th>Mês</th><th>Entradas recebidas</th><th>Despesas pagas</th><th>Saldo</th></tr></thead><tbody>${data.map(row=>`<tr><td>${fullMonthLabel(row.month)}</td><td>${currency(row.income_cents)}</td><td>${currency(row.expense_cents)}</td><td>${BRL.format((row.income_cents-row.expense_cents)/100)}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<div class="cashflow-summary"><div><span>ENTRADAS NO PERÍODO</span><strong class="positive">${currency(totalIn)}</strong></div><div><span>SAÍDAS NO PERÍODO</span><strong>${currency(totalOut)}</strong></div><div><span>SALDO REALIZADO</span><strong class="${totalIn-totalOut>=0?'positive':'negative'}">${BRL.format((totalIn-totalOut)/100)}</strong></div></div><div class="cashflow-plot"><svg viewBox="0 0 ${width} ${height}" role="group" aria-label="Gráfico de entradas recebidas e despesas pagas nos últimos ${data.length} meses">${axis}${groups}</svg></div><div class="cashflow-scroll-hint">Deslize o gráfico para ver todos os meses →</div><div class="chart-legend"><span><i class="cash-income"></i> Entradas recebidas</span><span><i class="cash-expense"></i> Despesas pagas</span></div>${totalIn+totalOut===0?'<p class="chart-hint">Ainda não há movimentações pagas neste período. O gráfico será atualizado com seus lançamentos.</p>':''}${table}`;
}
const colors=['#8abc82','#f1aa6a','#aaa1e5','#68b8bc','#e3c86e','#d881a8'];
export function expenseDonutChart(categories){
 const clean=(Array.isArray(categories)?categories:[]).filter(x=>valid(x.amount_cents)>0).map(x=>({name:String(x.category||'Outros').slice(0,50),value:valid(x.amount_cents)}));
 if(!clean.length)return `<div class="expense-empty"><div class="expense-empty-icon">◌</div><strong>Nenhuma despesa paga</strong><p>As categorias das despesas aparecerão aqui após registrar pagamentos.</p></div>`;
 const total=clean.reduce((a,b)=>a+b.value,0);
 let offset=0;
 const segments=clean.map((x,i)=>{const frac=x.value/total,segment=`<circle cx="100" cy="100" r="69" fill="none" stroke="${colors[i%colors.length]}" stroke-width="22" stroke-dasharray="${(frac*433.54).toFixed(2)} 433.54" stroke-dashoffset="${(-offset*433.54).toFixed(2)}" transform="rotate(-90 100 100)"><title>${escapeHTML(x.name)}: ${currency(x.value)}</title></circle>`;offset+=frac;return segment}).join('');
 return `<div class="expense-chart"><svg viewBox="0 0 200 200" role="img" aria-label="Distribuição das despesas pagas por categoria"><circle cx="100" cy="100" r="69" stroke="var(--border-soft)" stroke-width="22" fill="none"/>${segments}<text x="100" y="96" text-anchor="middle" class="donut-center-label">TOTAL PAGO</text><text x="100" y="117" text-anchor="middle" class="donut-center-value">${BR_COMPACT.format(total/100)}</text></svg><div class="expense-legend">${clean.map((x,i)=>`<div class="expense-legend-line"><i style="background:${colors[i%colors.length]}"></i><span title="${escapeHTML(x.name)}">${escapeHTML(x.name)}</span><strong>${currency(x.value)}</strong></div>`).join('')}</div></div>`;
}
