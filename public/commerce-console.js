/* CRM commerce cockpit: no business logic duplicated from the Worker. */
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(c)||0)/100);
const toCents=v=>{const s=String(v??'0').replace(/[^\d,.-]/g,'');const n=Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);return Number.isFinite(n)&&n>=0?Math.round(n*100):NaN};
const num=c=>((Number(c)||0)/100).toFixed(2).replace('.',',');
const tag=(text,tone='')=>'<span class="cm-tag '+tone+'">'+esc(text)+'</span>';
const CATEGORIES=[['sedas','Sedas & Blunts'],['piteiras','Piteiras'],['dichavadores','Dichavadores'],['isqueiros','Isqueiros'],['cases','Cases & Tabaqueiras'],['kits','Kits'],['acessorios','Acessórios']];
let modalCleanup=null;
async function request(path,method='GET',data){
 const options={method,credentials:'same-origin',cache:'no-store',headers:{}};
 if(data instanceof FormData)options.body=data;
 else if(data!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data)}
 const res=await fetch('/api/'+path,options);
 let body;try{body=await res.json()}catch{body={error:'Resposta inesperada do servidor.'}}
 if(!res.ok)throw new Error(body.error||'Não foi possível concluir.');
 return body;
}
function notice(text,type='ok'){
 const node=document.getElementById('toast');if(!node)return;
 node.className=type==='error'?'toast-error show':'toast-ok show';node.textContent=text;
 clearTimeout(notice.timer);notice.timer=setTimeout(()=>node.classList.remove('show'),4000);
}
function formField(label,name,value='',type='text',props=''){
 return '<label class="cm-field"><span>'+esc(label)+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+props+'></label>';
}
function checkField(label,name,checked){
 return '<label class="cm-check"><input type="checkbox" name="'+name+'" '+(checked?'checked':'')+'><span>'+esc(label)+'</span></label>';
}
function selectField(label,name,value,values){
 return '<label class="cm-field"><span>'+esc(label)+'</span><select name="'+name+'">'+values.map(([a,b])=>'<option value="'+esc(a)+'" '+(value===a?'selected':'')+'>'+esc(b)+'</option>').join('')+'</select></label>';
}
function openModal(title,content,onSubmit){
 closeModal();
 const layer=document.createElement('div');layer.id='cm-modal-layer';layer.className='cm-modal-backdrop';
 layer.innerHTML='<section class="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-modal-title"><header class="cm-modal-head"><div><span class="eyebrow">MACUMBIINHA / GESTÃO</span><h2 id="cm-modal-title">'+esc(title)+'</h2></div><button type="button" class="cm-close" aria-label="Fechar">×</button></header><form id="cm-form"><div class="cm-form-body">'+content+'</div><footer class="cm-form-foot"><button type="button" class="btn ghost cm-cancel">Cancelar</button><button class="btn primary cm-submit" type="submit">Salvar alterações</button></footer></form></section>';
 const close=()=>closeModal();
 layer.querySelector('.cm-close').onclick=close;layer.querySelector('.cm-cancel').onclick=close;
 layer.addEventListener('pointerdown',e=>{if(e.target===layer)close()});
 document.body.appendChild(layer);
 const escKey=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',escKey);
 modalCleanup=()=>document.removeEventListener('keydown',escKey);
 layer.querySelector('form').addEventListener('submit',async e=>{
  e.preventDefault();const button=layer.querySelector('.cm-submit');button.disabled=true;
  try{await onSubmit(new FormData(e.target));closeModal()}catch(err){notice(err.message,'error');button.disabled=false}
 });
 layer.querySelector('input,select,textarea,button')?.focus();
}
function closeModal(){modalCleanup?.();modalCleanup=null;document.getElementById('cm-modal-layer')?.remove()}
function productsTable(items,admin){
 if(!items.length)return '<div class="cm-empty">Nenhum produto encontrado. Cadastre um item ou altere os filtros.</div>';
 return '<div class="table-scroll"><table class="cm-table"><thead><tr><th>PRODUTO</th><th>VAREJO</th><th>ATACADO</th><th>ESTOQUE</th><th>SITE</th><th>GESTÃO</th></tr></thead><tbody>'+items.map(p=>{
  const pub=!!p.published&&!!p.active,stock=p.variants?.length?p.variants.reduce((n,v)=>n+Number(v.quantity||0),0):Number(p.quantity)||0;
  return '<tr><td><strong>'+esc(p.name)+'</strong><small>'+esc(p.sku)+' · '+esc(CATEGORIES.find(x=>x[0]===p.category)?.[1]||p.category)+'</small></td>'+
   '<td>'+ (p.retail_cents?fmt(p.retail_cents):'A definir')+'</td><td>'+(p.wholesale_cents?fmt(p.wholesale_cents):'A definir')+'</td>'+
   '<td>'+tag(stock+' un.',stock<=p.min_quantity?'warning':'ok')+'</td>'+
   '<td>'+tag(pub?'Publicado':'Rascunho',pub?'ok':'')+'</td>'+
   '<td><div class="cm-row-actions"><button data-cm="edit" data-id="'+esc(p.id)+'">Editar</button>'+ (admin?'<button data-cm="variants" data-id="'+esc(p.id)+'">Variações ('+(p.variants?.length||0)+')</button><button data-cm="gallery" data-id="'+esc(p.id)+'">Fotos ('+(p.photos?.length||0)+')</button>':'') +
   (admin?'<button data-cm="stock" data-id="'+esc(p.id)+'">Estoque</button><button data-cm="toggle" data-id="'+esc(p.id)+'">'+(pub?'Ocultar':'Publicar')+'</button>':'')+
   '</div></td></tr>';
 }).join('')+'</tbody></table></div>';
}
const productPayload=(form,p)=>{
 const get=name=>String(form.get(name)||'').trim();
 const data={
  name:get('name'),sku:get('sku').toUpperCase(),category:get('category'),description:get('description'),
  cost_cents:toCents(get('cost_real')),retail_cents:toCents(get('retail_real')),wholesale_cents:toCents(get('wholesale_real')),
  min_quantity:Number(get('min_quantity')),quantity:p?Number(p.quantity):Number(get('quantity')),
  active:form.has('active')?1:0,published:form.has('published')?1:0,featured:form.has('featured')?1:0,
  for_wholesale:form.has('for_wholesale')?1:0,
  image_url:get('image_url'),tags:get('tags').split(',').map(x=>x.trim()).filter(Boolean)
 };
 if(p&&p.slug)data.slug=p.slug;
 if(!data.name||!data.sku||[data.cost_cents,data.retail_cents,data.wholesale_cents].some(x=>Number.isNaN(x)))throw new Error('Verifique nome, SKU e preços.');
 return data;
};
function productEditor(p,done){
 const categories=[...CATEGORIES];
 if(p?.category&&!categories.some(x=>x[0]===p.category))categories.push([p.category,p.category]);
 const tags=(()=>{try{return JSON.parse(p?.tags_json||'[]').join(', ')}catch{return ''}})();
 const inner='<div class="cm-form-grid">'+formField('Nome do produto *','name',p?.name||'','text','required minlength="2" maxlength="170"')+
 formField('SKU / código *','sku',p?.sku||'','text','required minlength="2" maxlength="70"')+
 selectField('Categoria','category',p?.category||'acessorios',categories)+
 formField('Preço varejo (R$)','retail_real',num(p?.retail_cents),'text','inputmode="decimal"')+
 formField('Preço atacado (R$)','wholesale_real',num(p?.wholesale_cents),'text','inputmode="decimal"')+
 formField('Custo de compra (R$)','cost_real',num(p?.cost_cents),'text','inputmode="decimal"')+
 (!p?formField('Estoque inicial','quantity','0','number','min="0" max="1000000" required'):'')+
 formField('Estoque mínimo','min_quantity',p?.min_quantity??5,'number','min="0" max="1000000" required')+
 formField('Tags (separe por vírgula)','tags',tags,'text','maxlength="260"')+
 formField('URL de foto HTTPS (opcional)','image_url',p?.image_url||'','url','placeholder="https://..."')+
 '</div><label class="cm-field"><span>Descrição</span><textarea name="description" rows="3" maxlength="3000">'+esc(p?.description||'')+'</textarea></label>'+
 '<div class="cm-check-grid">'+checkField('Produto ativo', 'active',p?!!p.active:true)+checkField('Publicado na loja','published',!!p?.published)+
 checkField('Destaque da vitrine','featured',!!p?.featured)+checkField('Indicado para atacado','for_wholesale',!!p?.for_wholesale)+'</div>'+
 '<div class="cm-file-row"><label class="cm-field"><span>Imagens do produto (até 8, JPG, PNG ou WEBP · 850 KB cada)</span><input type="file" name="photos" multiple accept=".jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp"></label></div>'+ 
 '<p class="cm-hint">Estoque só muda em uma movimentação própria. Não informe preços inventados: zero aparece como “sob consulta” no site.</p>';
 openModal(p?'Editar produto':'Cadastrar produto',inner,async fd=>{
  const payload=productPayload(fd,p);
  const result=await request(p?'store/products/'+p.id:'store/catalog',p?'PATCH':'POST',payload);
  const id=p?.id||result.id;const files=fd.getAll('photos').filter(x=>x?.size);
  if(files.length){const imageData=new FormData();for(const file of files)imageData.append('files',file);await request('store/products/'+id+'/gallery','POST',imageData);}
  notice('Produto salvo e catálogo atualizado.');await done();
 });
}
function stockEditor(p,done){
 const inner='<p class="cm-context">'+esc(p.name)+' · Estoque atual: <strong>'+Number(p.quantity)+' unidades</strong></p>'+
 '<div class="cm-form-grid">'+selectField('Movimentação','direction','in',[['in','Entrada de estoque (+)'],['out','Saída / perda (-)']])+
 formField('Quantidade *','amount','1','number','required min="1" max="1000000"')+
 '</div>'+formField('Motivo / referência *','reason','compra_de_estoque','text','required maxlength="80"')+
 '<p class="cm-hint">A movimentação fica registrada no histórico. Pedidos confirmados também baixam o estoque automaticamente.</p>';
 openModal('Movimentar estoque',inner,async data=>{
  const amount=Number(data.get('amount'));if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Quantidade inválida.');
  const delta=data.get('direction')==='out'?-amount:amount;
  await request('store/products/'+p.id+'/stock','POST',{delta,reason:String(data.get('reason')||'ajuste')});
  notice('Estoque movimentado.');await done();
 });
}
function settingEditor(settings,done){
 const inner=formField('Faixa informativa','announcement',settings.announcement||'')+
 formField('Título principal da loja','hero_title',settings.hero_title||'')+
 '<label class="cm-field"><span>Descrição da página inicial</span><textarea name="hero_subtitle" rows="3" maxlength="500">'+esc(settings.hero_subtitle||'')+'</textarea></label>'+
 formField('WhatsApp comercial (apenas números)','whatsapp',settings.whatsapp||'','tel','pattern="[0-9]{10,15}" required')+
 '<p class="cm-hint">Esses textos e o telefone passam a ser servidos pelo CRM para a loja. Alterações não precisam de novo deploy do site.</p>';
 openModal('Configurações da loja',inner,async fd=>{
  await request('store/settings','PATCH',Object.fromEntries(fd.entries()));notice('Configurações publicadas.');await done();
 });
}
export async function renderCommerceScreen({root,admin}){
 root.innerHTML='<div class="cm-loading">Carregando produtos da loja…</div>';
 const response=await request('store/catalog');
 const products=response.items;
 root.innerHTML='<div class="page-heading"><div><span class="eyebrow">E-COMMERCE / CRM CENTRAL</span><h1>Gestão da loja</h1><p>O CRM controla publicação, preços e estoque da Macumbiinha. Produtos novos ficam disponíveis na vitrine sem editar o código do site.</p></div><div class="heading-actions">'+
 (admin?'<button class="btn ghost" data-cm="settings">Configurações</button><button class="btn primary" data-cm="new">+ Novo produto</button>':'')+
 '</div></div><div class="cm-stats"><article><span>Produtos</span><strong>'+response.summary.total+'</strong></article><article><span>Na vitrine</span><strong>'+response.summary.published+'</strong></article>'+
 '<article><span>Estoque crítico</span><strong>'+response.summary.low_stock+'</strong></article><article><span>Unidades no estoque</span><strong>'+response.summary.units+'</strong></article></div>'+
 '<div class="cm-help"><div><strong>Catálogo vinculado ao site</strong><p>Os produtos publicados aparecem em varejo e atacado. Estoque zero fica indisponível, e preço zero fica sob consulta.</p></div><a href="'+esc(response.site_url||'https://macumbiinha.pages.dev')+'" target="_blank" rel="noopener noreferrer">Ver loja ↗</a></div>'+
 '<section class="panel cm-panel"><div class="cm-toolbar"><label class="cm-search"><span>Buscar produtos</span><input id="cm-search" type="search" placeholder="Nome, SKU ou categoria"></label>'+
 '<label class="cm-filter"><span>Publicação</span><select id="cm-filter"><option value="all">Todos</option><option value="published">Publicados</option><option value="draft">Rascunhos</option><option value="low">Estoque baixo</option></select></label>'+
 '<button class="btn ghost" data-cm="reload">Atualizar</button></div><div id="cm-table">'+productsTable(products,admin)+'</div></section>'+
 '<p class="cm-hint cm-footer-note">Variações têm SKU, estoque e preço próprios, mas aparecem agrupadas em um único produto na loja. Custos e fornecedores nunca são exibidos no site.</p>';
 const refresh=()=>renderCommerceScreen({root,admin});
 const paint=()=>{
  const q=String(root.querySelector('#cm-search')?.value||'').toLowerCase().trim(),mode=root.querySelector('#cm-filter')?.value;
  const rows=products.filter(p=>(p.name+' '+p.sku+' '+p.category).toLowerCase().includes(q))
   .filter(p=>mode==='all'||(mode==='published'&&p.published&&p.active)||(mode==='draft'&&(!p.published||!p.active))||(mode==='low'&&p.quantity<=p.min_quantity));
  const box=root.querySelector('#cm-table');if(box)box.innerHTML=productsTable(rows,admin);
 };
 root.querySelector('#cm-search').addEventListener('input',paint);
 root.querySelector('#cm-filter').addEventListener('change',paint);
 root.onclick=async e=>{
  const btn=e.target.closest('[data-cm]');if(!btn)return;
  const action=btn.dataset.cm,p=products.find(x=>x.id===btn.dataset.id);
  try{
   if(action==='reload')return refresh();
   if(action==='new')return productEditor(null,refresh);
   if(action==='settings'){const data=await request('store/settings');return settingEditor(data.settings,refresh)}
   if(action==='edit'&&p)return productEditor(p,refresh);
   if(action==='variants'&&p)return variantManager(p,refresh);
   if(action==='gallery'&&p)return galleryManager(p,refresh);
   if(action==='stock'&&p)return stockEditor(p,refresh);
   if(action==='toggle'&&p){
    const tags=(()=>{try{return JSON.parse(p.tags_json||'[]')}catch{return []}})();
    await request('store/products/'+p.id,'PATCH',{...p,tags,published:p.published?0:1});
    notice(p.published?'Produto removido da vitrine.':'Produto publicado na loja.');return refresh();
   }
  }catch(err){notice(err.message,'error')}
 };
}
export async function renderInvoiceScreen({root,admin}){
 root.innerHTML='<div class="cm-loading">Carregando documentos…</div>';
 if(!admin){root.innerHTML='<div class="empty-state"><h3>Acesso restrito</h3><p>Somente administradores podem consultar documentos fiscais.</p></div>';return}
 const records=(await request('invoices')).items;
 root.innerHTML='<div class="page-heading"><div><span class="eyebrow">COMPRAS / DOCUMENTOS</span><h1>Notas e documentos</h1><p>Guarde XML de NF-e e DANFE em PDF com os dados do fornecedor. O envio não gera nem autoriza nota fiscal na SEFAZ.</p></div><div class="heading-actions"><button class="btn primary" data-cm="invoice-new">+ Enviar nota</button></div></div>'+
 '<div class="cm-help"><div><strong>Arquivo interno protegido</strong><p>Somente administradores autenticados podem enviar ou baixar arquivos. Limite atual: 1 MB por PDF/XML.</p></div><span>'+records.length+' documentos</span></div>'+
 '<section class="panel cm-panel"><div class="panel-head"><h3>Documentos arquivados</h3></div><div class="table-scroll"><table class="cm-table"><thead><tr><th>ARQUIVO</th><th>FORNECEDOR</th><th>EMISSÃO</th><th>VALOR</th><th>AÇÕES</th></tr></thead><tbody>'+
 (records.length?records.map(d=>'<tr><td><strong>'+esc(d.original_filename)+'</strong><small>'+esc(d.number||'Sem número')+' · '+(d.file_size/1024).toFixed(0)+' KB</small></td><td>'+esc(d.supplier_name||'—')+'</td><td>'+esc(d.issue_date||'—')+'</td><td>'+fmt(d.total_cents)+'</td><td class="cm-row-actions"><a href="/api/invoices/'+esc(d.id)+'/download">Baixar</a><button data-cm="invoice-delete" data-id="'+esc(d.id)+'">Excluir</button></td></tr>').join(''):'<tr><td colspan="5" class="cm-empty">Nenhum documento enviado ainda.</td></tr>')+
 '</tbody></table></div></section>';
 root.onclick=async e=>{
  const btn=e.target.closest('[data-cm]');if(!btn)return;
  if(btn.dataset.cm==='invoice-delete'){
   if(!confirm('Excluir este documento permanentemente?'))return;
   try{await request('invoices/'+btn.dataset.id,'DELETE');notice('Documento removido.');renderInvoiceScreen({root,admin})}catch(err){notice(err.message,'error')}return;
  }
  if(btn.dataset.cm==='invoice-new'){
   const content='<div class="cm-form-grid">'+formField('Número da nota','number','','text','maxlength="60"')+
    formField('Fornecedor','supplier_name','','text','maxlength="150"')+
    formField('Data de emissão','issue_date','','date')+
    formField('Valor total (R$)','amount_real','0,00','text','inputmode="decimal"')+'</div>'+
    '<label class="cm-field"><span>XML da NF-e ou DANFE PDF * (até 1 MB)</span><input name="file" type="file" accept=".pdf,.xml,application/pdf,application/xml" required></label>'+
    '<label class="cm-field"><span>Observações</span><textarea name="notes" rows="3" maxlength="700"></textarea></label>'+
    '<p class="cm-hint">Armazenamento privado. Para emissão, cancelamento e validação fiscal oficial é necessário um integrador fiscal com certificado e habilitação.</p>';
   openModal('Arquivar nota fiscal',content,async fd=>{
    const total=toCents(fd.get('amount_real'));if(Number.isNaN(total))throw new Error('Valor inválido.');
    fd.delete('amount_real');fd.set('total_cents',String(total));
    await request('invoices','POST',fd);notice('Documento arquivado com sucesso.');await renderInvoiceScreen({root,admin});
   });
  }
 };
}


/** Gallery manager is available even for draft products; previews use authenticated routes. */
async function galleryManager(p,done){
 const path='store/products/'+p.id+'/gallery';
 const {items}=await request(path);
 const list=items.length?'<div class="cm-gallery-grid">'+items.map((file,index)=>{
  const preview='/api/store/products/'+encodeURIComponent(p.id)+'/gallery/'+encodeURIComponent(file.id)+'/view';
  return '<article class="cm-gallery-tile"><img src="'+preview+'" alt="'+esc(file.file_name)+'" loading="lazy"><div><small>'+esc(file.file_name)+'</small>'+
  '<button type="button" data-gallery-action="cover" data-image="'+esc(file.id)+'" '+(index===0?'disabled':'')+'>'+(index===0?'Foto principal':'Definir capa')+'</button>'+
  '<button type="button" data-gallery-action="remove" data-image="'+esc(file.id)+'">Excluir</button></div></article>';
 }).join('')+'</div>':'<p class="cm-hint">Este produto ainda não tem fotos enviadas. Selecione as imagens abaixo para criar uma galeria.</p>';
 const form=list+'<div class="cm-file-row"><label class="cm-field"><span>Adicionar fotos (até 8 por produto, 850 KB cada)</span><input type="file" name="files" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple required></label></div>'+
 '<p class="cm-hint">As fotos só aparecem publicamente quando o produto principal estiver publicado. A primeira da lista é usada como capa.</p>';
 openModal('Fotos · '+p.name,form,async fd=>{
  const files=fd.getAll('files').filter(file=>file?.size);
  if(!files.length)throw new Error('Selecione uma ou mais imagens.');
  const data=new FormData();for(const file of files)data.append('files',file);
  await request(path,'POST',data);
  notice('Imagens enviadas com sucesso.');await done();
 });
 const layer=document.getElementById('cm-modal-layer');
 const submit=layer?.querySelector('.cm-submit');if(submit)submit.textContent='Enviar fotos';
 const rows=layer?.querySelector('.cm-form-body');if(!rows)return;
 rows.onclick=async event=>{
  const target=event.target.closest('[data-gallery-action]');if(!target)return;
  const action=target.dataset.galleryAction,photo=target.dataset.image;
  if(action==='remove'&&!confirm('Excluir essa foto da galeria?'))return;
  target.disabled=true;
  try{
   await request(path+'/'+photo+(action==='cover'?'/cover':''),action==='cover'?'POST':'DELETE');
   notice(action==='cover'?'Foto principal atualizada.':'Foto removida.');
   await done();
   await galleryManager(p,done);
  }catch(e){notice(e.message,'error');target.disabled=false}
 };
}
function variantInput(fd,p,current){
 const value=k=>String(fd.get(k)||'').trim();
 const sku=value('sku').toUpperCase(),label=value('label');
 const cents=key=>toCents(value(key));
 const retail=cents('retail_real'),wholesale=cents('wholesale_real'),cost=cents('cost_real');
 if(!sku||!label||[retail,wholesale,cost].some(n=>!Number.isFinite(n)))throw new Error('Preencha o SKU, a descrição e os preços corretamente.');
 return {label,sku,quantity:current?Number(current.quantity):Number(value('quantity')),
  min_quantity:Number(value('min_quantity')),retail_cents:retail,wholesale_cents:wholesale,cost_cents:cost,
  active:fd.has('active')?1:0,position:Number(value('position')||0)};
}
function variantEditor(parent,v,done){
 const inner='<p class="cm-context">Produto principal: <strong>'+esc(parent.name)+'</strong>. A variação terá SKU próprio e aparecerá dentro da mesma página no site.</p>'+
 '<div class="cm-form-grid">'+formField('Nome da variação *','label',v?.label||'','text','required maxlength="100" placeholder="Ex.: King Size / Black"')+
 formField('SKU exclusivo *','sku',v?.sku||parent.sku+'-','text','required minlength="2" maxlength="70"')+
 formField('Preço varejo (R$)','retail_real',num(v?.retail_cents??parent.retail_cents),'text','inputmode="decimal"')+
 formField('Preço atacado (R$)','wholesale_real',num(v?.wholesale_cents??parent.wholesale_cents),'text','inputmode="decimal"')+
 formField('Custo unitário (R$)','cost_real',num(v?.cost_cents??parent.cost_cents),'text','inputmode="decimal"')+
 (!v?formField('Estoque inicial','quantity','0','number','required min="0" max="1000000"'):'')+
 formField('Estoque mínimo','min_quantity',v?.min_quantity??parent.min_quantity,'number','required min="0" max="1000000"')+
 formField('Ordem de exibição','position',v?.position||0,'number','min="0" max="1000"')+
 '</div>'+checkField('Variação ativa','active',v?!!v.active:true)+
 '<div class="cm-file-row"><label class="cm-field"><span>Fotos desta variação (opcional, até 8)</span><input type="file" name="variantPhotos" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"></label></div>'+
 '<p class="cm-hint">Quantidade não pode ser alterada ao editar: use a movimentação de estoque, que registra o histórico. Quando um pedido usa o SKU desta opção, a baixa é feita nesta variação.</p>';
 openModal(v?'Editar variação':'Nova variação',inner,async fd=>{
  const data=variantInput(fd,parent,v);
  const base='store/products/'+parent.id+'/variants';
  const result=await request(v?base+'/'+v.id:base,v?'PATCH':'POST',data);
  const target=v?.id||result.id;
  const photos=fd.getAll('variantPhotos').filter(x=>x?.size);
  if(photos.length){const form=new FormData();for(const file of photos)form.append('files',file);await request('store/products/'+target+'/gallery','POST',form);}
  notice(v?'Variação atualizada.':'Variação criada com sucesso.');
  await done();
 });
}
async function variantManager(parent,done){
 const result=await request('store/products/'+parent.id+'/variants');
 const list=result.items;
 const inner='<p class="cm-context">Todas estas opções pertencem ao mesmo produto na vitrine, mas têm preço, código e estoque independentes.</p>'+
 '<div class="cm-variant-list">'+(list.length?list.map(v=>
  '<article class="cm-variant-row"><div><strong>'+esc(v.label)+'</strong><small>'+esc(v.sku)+' · '+v.quantity+' un. · '+fmt(v.retail_cents)+' varejo</small></div><div class="cm-row-actions">'+
  '<button type="button" data-var-action="edit" data-id="'+esc(v.id)+'">Editar</button>'+
  '<button type="button" data-var-action="stock" data-id="'+esc(v.id)+'">Estoque</button>'+
  '<button type="button" data-var-action="photos" data-id="'+esc(v.id)+'">Fotos</button></div></article>'
 ).join(''):'<p class="cm-hint">Este produto ainda não tem variações cadastradas.</p>')+'</div>'+
 '<button type="button" class="btn primary cm-add-variant" data-var-action="new">+ Adicionar variação</button>';
 openModal('Variações · '+parent.name,inner,async()=>{});
 const layer=document.getElementById('cm-modal-layer');if(!layer)return;
 layer.querySelector('.cm-submit')?.remove();
 layer.querySelector('.cm-form-body').onclick=async e=>{
  const target=e.target.closest('[data-var-action]');if(!target)return;
  const action=target.dataset.varAction,v=list.find(x=>x.id===target.dataset.id);
  try{
   if(action==='new')return variantEditor(parent,null,async()=>{await done();await variantManager(parent,done)});
   if(action==='edit'&&v)return variantEditor(parent,v,async()=>{await done();await variantManager(parent,done)});
   if(action==='stock'&&v)return stockEditor(v,async()=>{await done();await variantManager(parent,done)});
   if(action==='photos'&&v)return galleryManager(v,async()=>{await done();await variantManager(parent,done)});
  }catch(err){notice(err.message,'error')}
 };
}
