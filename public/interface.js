/* Macumbiinha CRM / client-side navigation palette.
   Zero analytics, zero external calls, reuses existing authenticated actions. */
const COMMANDS=[
 {section:'dashboard',label:'Visão geral',terms:'inicio indicadores painel',group:'Navegação'},
 {section:'orders',label:'Pedidos',terms:'encomendas compras vendas',group:'Navegação'},
 {section:'products',label:'Produtos e estoque',terms:'catalogo inventario sku',group:'Navegação'},
 {section:'store',label:'Loja online',terms:'publicar vitrine precos catalogo site',group:'Navegação'},
 {section:'invoices',label:'Notas e documentos',terms:'nota fiscal xml pdf compras entrada',group:'Navegação',admin:true},
 {section:'contacts',label:'Clientes e leads',terms:'relacionamento telefone',group:'Navegação'},
 {section:'deals',label:'Funil de vendas',terms:'negociacao oportunidades',group:'Navegação'},
 {section:'finance',label:'Financeiro',terms:'receitas despesas fluxo caixa',group:'Navegação',admin:true},
 {section:'tasks',label:'Tarefas',terms:'pendencias fazer',group:'Navegação'},
 {section:'suppliers',label:'Fornecedores',terms:'compras parceiros',group:'Navegação'},
 {section:'activity',label:'Histórico',terms:'atividade auditoria',group:'Navegação'},
 {section:'settings',label:'Configurações',terms:'conta perfil senha',group:'Navegação'},
 {action:'order-new',label:'Criar pedido',terms:'novo pedido venda',group:'Ações rápidas'},
 {action:'contact-new',label:'Cadastrar contato',terms:'novo cliente lead',group:'Ações rápidas'},
 {section:'store',label:'Gerenciar publicação de produtos',terms:'cadastrar produto no site estoque varejo atacado',group:'Ações rápidas'},
 {action:'task-new',label:'Criar tarefa',terms:'nova pendencia',group:'Ações rápidas'},
 {action:'finance-new',label:'Registrar lançamento financeiro',terms:'despesa receita',group:'Ações rápidas',admin:true}
];
const magnifier='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.8"/><path d="m16 16 5 5"/></svg>';
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
let selected=0;
let matches=[];
let lastFocused=null;
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
function authenticated(){return Boolean(document.querySelector('.shell #workspace'))}
function accessible(command){
 if(command.admin&&!document.querySelector('[data-nav="finance"]'))return false;
 return true;
}
function dismiss(){
 document.querySelector('#cmd-backdrop')?.remove();
 lastFocused?.focus?.();
 lastFocused=null;
}
function run(command){
 if(!command)return;
 dismiss();
 if(command.section){document.querySelector('[data-nav="'+command.section+'"]')?.click();return}
 if(command.action){
  const proxy=document.createElement('button');
  proxy.dataset.action=command.action;
  proxy.hidden=true;document.body.append(proxy);
  proxy.click();proxy.remove();
 }
}
function refresh(query=''){
 const results=document.getElementById('cmd-results');if(!results)return;
 const q=normalize(query.trim());
 matches=COMMANDS.filter(accessible).filter(c=>!q||normalize(c.label+' '+c.terms).includes(q));
 selected=0;
 paint();
}
function paint(){
 const results=document.getElementById('cmd-results');if(!results)return;
 results.replaceChildren();
 if(!matches.length){const empty=document.createElement('p');empty.className='cmd-empty';empty.textContent='Nenhum resultado. Experimente buscar por pedido, estoque ou cliente.';results.append(empty);return}
 let group='';
 matches.forEach((c,index)=>{
  if(c.group!==group){group=c.group;const h=document.createElement('div');h.className='cmd-group';h.textContent=group;results.append(h)}
  const row=document.createElement('button');row.type='button';row.className='cmd-row'+(index===selected?' is-selected':'');
  row.setAttribute('role','option');row.setAttribute('aria-selected',String(index===selected));row.dataset.index=String(index);
  const glyph=document.createElement('span');glyph.className='glyph';glyph.innerHTML=c.section?magnifier:arrow;
  const label=document.createElement('span');label.textContent=c.label;
  const kind=document.createElement('small');kind.textContent=c.section?'Abrir':'Executar';
  row.append(glyph,label,kind);
  row.addEventListener('mouseenter',()=>{selected=index;results.querySelectorAll('.cmd-row').forEach((node,i)=>{node.classList.toggle('is-selected',Number(node.dataset.index)===selected);node.setAttribute('aria-selected',String(Number(node.dataset.index)===selected))})});
  row.addEventListener('click',()=>run(c));
  results.append(row);
 });
}
export function openCommandPalette(){
 if(!authenticated())return;
 if(document.getElementById('cmd-backdrop'))return;
 lastFocused=document.activeElement;
 const overlay=document.createElement('div');
 overlay.id='cmd-backdrop';overlay.className='cmd-backdrop';
 overlay.innerHTML='<section class="cmd-dialog" role="dialog" aria-modal="true" aria-label="Buscar no CRM"><div class="cmd-input-wrap">'+magnifier+'<input class="cmd-input" id="cmd-input" type="search" autocomplete="off" spellcheck="false" placeholder="Ir para uma tela ou criar um registro..." aria-label="Buscar telas e ações rápidas"><span class="cmd-esc">ESC</span></div><div id="cmd-results" class="cmd-results" role="listbox" aria-label="Resultados da busca"></div><footer class="cmd-footer"><span>↑ ↓ para navegar · Enter para abrir</span><span>Macumbiinha CRM</span></footer></section>';
 overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)dismiss()});
 document.body.append(overlay);
 const input=document.getElementById('cmd-input');
 input.addEventListener('input',()=>refresh(input.value));
 input.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();if(!matches.length)return;
   selected=(selected+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;
   paint();document.querySelector('.cmd-row.is-selected')?.scrollIntoView({block:'nearest'});
  }else if(e.key==='Enter'){e.preventDefault();run(matches[selected])}
  else if(e.key==='Escape'){e.preventDefault();dismiss()}
 });
 refresh();
 input.focus();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-command-open]'))openCommandPalette()});
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
  e.preventDefault();document.querySelector('#cmd-backdrop')?dismiss():openCommandPalette();
 }else if(e.key==='Escape'&&document.getElementById('cmd-backdrop'))dismiss();
 else if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&!e.target.closest('input,textarea,[contenteditable],select')&&authenticated()){
  e.preventDefault();openCommandPalette();
 }
});
