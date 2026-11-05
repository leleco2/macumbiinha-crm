/* Macumbiinha — equipe e cargos: admin-only UI, enforcement lives in Worker. */
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const request=async(path,method='GET',data)=>{
 const res=await fetch('/api/'+path,{method,credentials:'same-origin',cache:'no-store',headers:data!==undefined?{'Content-Type':'application/json'}:{},body:data!==undefined?JSON.stringify(data):undefined});
 const json=await res.json().catch(()=>({error:'Resposta inválida do servidor.'}));
 if(!res.ok)throw new Error(json.error||'Não foi possível concluir a operação.');
 return json;
};
const zones=[
 ['Vendas e relacionamento',['dashboard.view','orders.view','orders.create','orders.manage','orders.payments','contacts.view','contacts.manage','deals.view','deals.manage']],
 ['Produtos e loja',['products.view','products.manage','inventory.view','inventory.adjust','store.view','store.manage','store.photos','suppliers.view','suppliers.manage']],
 ['Financeiro',['finance.view','finance.manage','reports.view','invoices.view','invoices.manage']],
 ['Operação e segurança',['tasks.view','tasks.manage','activity.view','alerts.view','alerts.manage','push.manage','settings.view','users.manage']]
];
const permissionLabels={
 'dashboard.view':'Ver painel','orders.view':'Consultar pedidos','orders.create':'Criar pedidos','orders.manage':'Atualizar pedidos','orders.payments':'Registrar pagamentos','contacts.view':'Ver clientes','contacts.manage':'Editar clientes','deals.view':'Ver negociações','deals.manage':'Gerenciar negociações',
 'products.view':'Consultar produtos','products.manage':'Editar produtos e preços','inventory.view':'Consultar movimentações','inventory.adjust':'Ajustar quantidades','store.view':'Ver gestão da loja','store.manage':'Publicar e configurar loja','store.photos':'Enviar e organizar imagens','suppliers.view':'Ver fornecedores','suppliers.manage':'Cadastrar fornecedores',
 'finance.view':'Ver financeiro','finance.manage':'Editar financeiro','reports.view':'Relatórios financeiros','invoices.view':'Consultar notas','invoices.manage':'Enviar e remover notas',
 'tasks.view':'Ver tarefas','tasks.manage':'Gerenciar tarefas','activity.view':'Ver histórico','alerts.view':'Consultar alertas','alerts.manage':'Marcar alertas como lidos','push.manage':'Ativar notificações','settings.view':'Configurações','users.manage':'Administrar usuários'
};
let roles=[];
let employees=[];
let currentUserId='';
let changeToast=()=>{};
let workspace=null;
function msg(text,type='ok'){
 const area=document.getElementById('team-message');
 if(area){area.textContent=text;area.dataset.type=type;area.hidden=false}
 changeToast(text,type==='error'?'error':'success');
}
const badge=(text,tone='')=>'<span class="team-badge '+tone+'">'+escape(text)+'</span>';
function initials(name){return escape(String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x.slice(0,1).toUpperCase()).join(''))}
function userRow(u){
 const role=roles.find(r=>r.key===u.role);
 return '<tr><td><div class="team-person"><span class="team-avatar">'+initials(u.name)+'</span><span><strong>'+escape(u.name)+'</strong><small>'+escape(u.email)+'</small></span></div></td>'+
 '<td>'+badge(role?.label||u.role)+'</td><td>'+badge(u.active?'Ativo':'Bloqueado',u.active?'active':'disabled')+'</td>'+
 '<td><span class="team-counter">'+u.permissions.length+' permissões'+(u.custom_permissions?' · Personalizadas':'')+'</span></td>'+
 '<td><div class="team-actions"><button data-team="edit" data-id="'+escape(u.id)+'">Editar acesso</button><button data-team="password" data-id="'+escape(u.id)+'">Redefinir senha</button>'+
 (u.id!==currentUserId?'<button class="danger" data-team="toggle" data-id="'+escape(u.id)+'">'+(u.active?'Bloquear':'Reativar')+'</button>':'')+'</div></td></tr>';
}
function table(){
 const list=document.getElementById('team-list');
 if(!list)return;
 const search=String(document.getElementById('team-search')?.value||'').toLowerCase(),filter=document.getElementById('team-status')?.value||'all';
 const visible=employees.filter(x=>(x.name+' '+x.email+' '+x.role).toLowerCase().includes(search)&&(filter==='all'||(filter==='active'?x.active:!x.active)));
 list.innerHTML=visible.length?visible.map(userRow).join(''):'<tr><td class="team-empty" colspan="5">Nenhum colaborador encontrado.</td></tr>';
}
function closeModal(){document.getElementById('team-modal-layer')?.remove()}
function modal(title,content,submitText,handler){
 closeModal();
 const layer=document.createElement('div');layer.id='team-modal-layer';layer.className='team-modal-backdrop';
 layer.innerHTML='<section class="team-modal" role="dialog" aria-modal="true" aria-labelledby="team-modal-title"><header><div><span class="eyebrow">MACUMBIINHA / SEGURANÇA</span><h2 id="team-modal-title">'+escape(title)+'</h2></div><button type="button" data-team-close aria-label="Fechar">×</button></header><form id="team-form"><div class="team-form-body">'+content+'</div><footer><button type="button" class="btn ghost" data-team-close>Cancelar</button><button class="btn primary" type="submit">'+escape(submitText)+'</button></footer></form></section>';
 layer.addEventListener('click',e=>{if(e.target===layer||e.target.closest('[data-team-close]'))closeModal()});
 const onKey=e=>{if(e.key==='Escape'){closeModal();document.removeEventListener('keydown',onKey)}};
 document.addEventListener('keydown',onKey,{once:false});
 layer.querySelector('form').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
  try{await handler(new FormData(e.target));document.removeEventListener('keydown',onKey);closeModal()}catch(err){msg(err.message,'error');btn.disabled=false}
 });
 document.body.appendChild(layer);
 layer.querySelector('input,select,button')?.focus();
}
function roleOptions(chosen){
 return roles.map(r=>'<option value="'+escape(r.key)+'"'+(chosen===r.key?' selected':'')+'>'+escape(r.label)+'</option>').join('');
}
function permissionControls(selected,role){
 const allowed=role==='administrador'?null:selected;
 return zones.map(([group,keys])=>'<fieldset class="team-permission-group"><legend>'+escape(group)+'</legend><div class="team-permissions">'+keys.map(key=>'<label class="team-permission"><input type="checkbox" name="permission" value="'+escape(key)+'"'+((allowed||[]).includes(key)?' checked':'')+(key==='users.manage'&&role!=='administrador'?' disabled':'')+'><span>'+escape(permissionLabels[key])+'</span></label>').join('')+'</div></fieldset>').join('');
}
function roleDefaults(role){return [...(roles.find(r=>r.key===role)?.permissions||[])]}
function editor(user,done){
 let selected=user?user.permissions:roleDefaults('vendas');
 let selectedRole=user?.role||'vendas',name=user?.name||'',email=user?.email||'';
 const content='<div class="team-fields"><label>Nome do colaborador *<input name="name" type="text" value="'+escape(name)+'" minlength="2" maxlength="100" required placeholder="Ex.: Maria Silva"></label>'+
 (!user?'<label>E-mail de acesso *<input name="email" type="email" maxlength="160" required placeholder="colaborador@empresa.com"></label>':'<div class="team-readonly"><span>E-mail</span><strong>'+escape(email)+'</strong></div>')+
 '<label>Cargo *<select name="role" id="team-role">'+roleOptions(selectedRole)+'</select></label>'+
 (!user?'<label>Senha inicial *<input name="password" type="password" minlength="14" maxlength="120" required autocomplete="new-password" placeholder="Mínimo de 14 caracteres"></label>':'')+
 '<label class="team-toggle"><input name="active" type="checkbox" '+(user&&!user.active?'':'checked')+'> Acesso ativo</label></div>'+
 '<div class="team-permission-header"><div><strong>Permissões deste cargo</strong><p>Personalize apenas o necessário. Restrições são aplicadas no servidor.</p></div><button type="button" data-reset-role class="btn ghost">Restaurar padrão do cargo</button></div>'+
 '<div id="team-permission-fields">'+permissionControls(selected,selectedRole)+'</div><p class="team-hint">Administrador sempre terá acesso total. Para os demais cargos, cada permissão marcada é concedida individualmente.</p>';
 modal(user?'Editar colaborador':'Novo colaborador',content,user?'Salvar acessos':'Criar acesso',async form=>{
  const role=String(form.get('role'));
  const permissions=role==='administrador'?null:form.getAll('permission');
  const data={name:String(form.get('name')||''),role,active:form.has('active'),permissions};
  if(!user){data.email=String(form.get('email')||'').trim().toLowerCase();data.password=String(form.get('password')||'')}
  await request(user?'users/'+user.id:'users',user?'PATCH':'POST',data);
  msg(user?'Permissões atualizadas. Sessões anteriores foram encerradas.':'Colaborador criado. Compartilhe a senha inicial por um canal seguro.');
  await done();
 });
 const layer=document.getElementById('team-modal-layer');
 const selection=layer.querySelector('#team-role');
 const fields=layer.querySelector('#team-permission-fields');
 const reset=layer.querySelector('[data-reset-role]');
 const show=(list,role)=>{fields.innerHTML=permissionControls(list,role)};
 selection.addEventListener('change',()=>{selectedRole=selection.value;selected=roleDefaults(selectedRole);show(selected,selectedRole)});
 reset.addEventListener('click',()=>{selected=roleDefaults(selection.value);show(selected,selection.value)});
}
function resetPassword(user,done){
 modal('Redefinir senha · '+user.name,'<p class="team-hint">A senha antiga deixará de funcionar e todas as sessões desse colaborador serão encerradas.</p><label class="team-one-field">Nova senha (14 a 120 caracteres)<input name="password" type="password" minlength="14" maxlength="120" autocomplete="new-password" required></label>','Atualizar senha',async form=>{
  await request('users/'+user.id+'/password','POST',{password:String(form.get('password')||'')});
  msg('Senha atualizada e sessões encerradas. Entregue a nova senha por um canal seguro.');await done();
 });
}
export async function renderUsersScreen({root,user,toast}){
 workspace=root;changeToast=toast;currentUserId=user.id;
 if(!user.permissions?.includes('users.manage')&&user.role!=='admin'&&user.role!=='administrador'){
  root.innerHTML='<div class="empty-state"><h3>Acesso restrito</h3><p>A administração de colaboradores exige permissão específica.</p></div>';return;
 }
 root.innerHTML='<div class="team-loading">Carregando colaboradores…</div>';
 const [people,definitions]=await Promise.all([request('users'),request('users/roles')]);
 employees=people.items;roles=definitions.roles;
 const active=employees.filter(x=>x.active).length,admins=employees.filter(x=>x.active&&x.role==='administrador').length;
 root.innerHTML='<div class="page-heading"><div><span class="eyebrow">ADMINISTRAÇÃO / ACESSOS</span><h1>Usuários e permissões</h1><p>Gerencie colaboradores, cargos, segurança e limites de cada função.</p></div><div class="heading-actions"><button class="btn primary" data-team="new">+ Adicionar colaborador</button></div></div>'+
 '<div class="team-stats"><article><span>Colaboradores</span><strong>'+employees.length+'</strong></article><article><span>Ativos</span><strong>'+active+'</strong></article><article><span>Administradores</span><strong>'+admins+'</strong></article><article><span>Cargos disponíveis</span><strong>'+roles.length+'</strong></article></div>'+
 '<div class="team-info"><div><strong>Permissões reais, não apenas visuais.</strong><p>Um colaborador do estoque não acessa o financeiro. Mudanças de cargo, bloqueio ou senha encerram as sessões anteriores automaticamente.</p></div></div>'+
 '<div class="panel team-panel"><div class="team-toolbar"><label>Buscar colaborador<input id="team-search" type="search" placeholder="Nome, e-mail ou cargo"></label><label>Situação<select id="team-status"><option value="all">Todos</option><option value="active">Ativos</option><option value="blocked">Bloqueados</option></select></label></div>'+
 '<div class="table-scroll"><table class="team-table"><thead><tr><th>COLABORADOR</th><th>CARGO</th><th>SITUAÇÃO</th><th>ACESSO</th><th>AÇÕES</th></tr></thead><tbody id="team-list"></tbody></table></div></div>'+
 '<div class="team-roles"><h2>Cargos e responsabilidades</h2><div>'+roles.map(r=>'<article><strong>'+escape(r.label)+'</strong><p>'+escape(r.description)+'</p><small>'+r.permissions.length+' permissões padrão</small></article>').join('')+'</div></div>'+
 '<p class="team-message" id="team-message" hidden role="status"></p>';
 table();
 root.querySelector('#team-search').addEventListener('input',table);
 root.querySelector('#team-status').addEventListener('change',table);
 const refresh=()=>renderUsersScreen({root,user,toast});
 root.onclick=async e=>{
  const button=e.target.closest('[data-team]');if(!button)return;
  const target=employees.find(x=>x.id===button.dataset.id);
  try{
   if(button.dataset.team==='new')return editor(null,refresh);
   if(!target)return;
   if(button.dataset.team==='edit')return editor(target,refresh);
   if(button.dataset.team==='password')return resetPassword(target,refresh);
   if(button.dataset.team==='toggle'){
    if(target.id===currentUserId)return msg('Você não pode bloquear a própria conta.','error');
    const active=target.active?'bloquear':'reativar';
    if(!confirm('Deseja '+active+' o acesso de '+target.name+'?'))return;
    await request('users/'+target.id,'PATCH',{name:target.name,role:target.role,active:!target.active,permissions:target.custom_permissions?target.permissions:null});
    msg('Acesso de '+target.name+' atualizado.');return refresh();
   }
  }catch(error){msg(error.message,'error')}
 };
}
