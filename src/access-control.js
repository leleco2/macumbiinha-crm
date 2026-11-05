/** Server-side RBAC policy for Macumbiinha CRM.
 * Never trust client-selected permissions or legacy role strings.
 * A newly introduced users row without an access record falls back to the old role.
 */
export const PERMISSION_LABELS={
 'dashboard.view':'Visualizar painel',
 'orders.view':'Consultar pedidos',
 'orders.create':'Criar pedidos',
 'orders.manage':'Alterar situação dos pedidos',
 'orders.payments':'Registrar pagamentos e estornos',
 'contacts.view':'Consultar clientes',
 'contacts.manage':'Cadastrar e editar clientes',
 'deals.view':'Consultar oportunidades',
 'deals.manage':'Gerenciar oportunidades',
 'products.view':'Consultar produtos e preços',
 'products.manage':'Cadastrar e editar catálogo',
 'inventory.view':'Consultar estoque e movimentações',
 'inventory.adjust':'Fazer entradas e saídas no estoque',
 'store.view':'Consultar loja e publicações',
 'store.manage':'Publicar produtos, preços e configurações',
 'store.photos':'Enviar e organizar fotos de produtos',
 'finance.view':'Visualizar o financeiro',
 'finance.manage':'Gerenciar lançamentos financeiros',
 'invoices.view':'Consultar e baixar notas',
 'invoices.manage':'Enviar e excluir notas',
 'suppliers.view':'Consultar fornecedores',
 'suppliers.manage':'Cadastrar fornecedores',
 'tasks.view':'Consultar tarefas',
 'tasks.manage':'Criar e atualizar tarefas',
 'activity.view':'Consultar histórico operacional',
 'reports.view':'Consultar relatórios financeiros',
 'users.manage':'Gerenciar colaboradores e permissões',
 'settings.view':'Visualizar configurações',
 'alerts.view':'Consultar alertas',
 'alerts.manage':'Marcar alertas como lidos',
 'push.manage':'Configurar notificações no próprio dispositivo'
};
export const ALL_PERMISSIONS=Object.freeze(Object.keys(PERMISSION_LABELS));
const every=ALL_PERMISSIONS;
export const ROLE_PRESETS={
 administrador:{label:'Administrador',description:'Controle total do CRM, permissões e dados sensíveis.',permissions:every},
 gerente:{label:'Gerente',description:'Gerencia a operação, acompanha o financeiro e a loja, sem controlar usuários.',permissions:every.filter(p=>p!=='users.manage')},
 financeiro:{label:'Financeiro',description:'Recebimentos, despesas, pagamentos, notas e relatórios.',permissions:['dashboard.view','orders.view','orders.payments','contacts.view','finance.view','finance.manage','invoices.view','invoices.manage','suppliers.view','tasks.view','tasks.manage','activity.view','reports.view','settings.view','alerts.view','alerts.manage','push.manage']},
 estoque:{label:'Responsável pelo estoque',description:'Inventário, entradas, saídas, fotos e acompanhamento de pedidos.',permissions:['dashboard.view','orders.view','products.view','inventory.view','inventory.adjust','store.view','store.photos','suppliers.view','tasks.view','tasks.manage','activity.view','settings.view','alerts.view','alerts.manage','push.manage']},
 vendas:{label:'Vendas',description:'Atende clientes, negocia, cria e movimenta pedidos.',permissions:['dashboard.view','orders.view','orders.create','orders.manage','contacts.view','contacts.manage','deals.view','deals.manage','products.view','store.view','tasks.view','tasks.manage','activity.view','settings.view','alerts.view','alerts.manage','push.manage']},
 atendimento:{label:'Atendimento',description:'Clientes, solicitações, pedidos novos e tarefas.',permissions:['dashboard.view','orders.view','orders.create','contacts.view','contacts.manage','deals.view','tasks.view','tasks.manage','products.view','store.view','settings.view','alerts.view','alerts.manage','push.manage']},
 consulta:{label:'Somente leitura',description:'Consulta informações operacionais sem editar.',permissions:['dashboard.view','orders.view','contacts.view','products.view','inventory.view','store.view','tasks.view','activity.view','settings.view','alerts.view','push.manage']}
};
export const ROLE_KEYS=Object.freeze(Object.keys(ROLE_PRESETS));
export function normalizedRole(user){
 const key=user?.role_key;
 if(key&&Object.hasOwn(ROLE_PRESETS,key))return key;
 return user?.role==='admin'?'administrador':'vendas';
}
export function effectivePermissions(user){
 if(user?.active===0||user?.active===false)return [];
 const role=normalizedRole(user);
 const baseline=ROLE_PRESETS[role].permissions;
 if(role==='administrador')return [...ALL_PERMISSIONS];
 if(user?.permissions_json===null||user?.permissions_json===undefined||user.permissions_json==='')return [...baseline];
 try{
  const list=typeof user.permissions_json==='string'?JSON.parse(user.permissions_json):user.permissions_json;
  if(!Array.isArray(list))return [];
  return [...new Set(list.filter(p=>typeof p==='string'&&Object.hasOwn(PERMISSION_LABELS,p)&&p!=='users.manage'))];
 }catch{return []}
}
export function can(user,permission){return effectivePermissions(user).includes(permission)}
export function publicUser(user){
 return {id:user.id,email:user.email,name:user.name||user.email.split('@')[0],role:normalizedRole(user),role_label:ROLE_PRESETS[normalizedRole(user)].label,permissions:effectivePermissions(user),active:user.active!==0};
}
export function publicRoles(){return Object.entries(ROLE_PRESETS).map(([key,role])=>({key,label:role.label,description:role.description,permissions:[...role.permissions]}))}
export function validateAccessInput(body){
 const name=String(body?.name??'').trim().replace(/\s+/g,' ').slice(0,100);
 const role=String(body?.role||'vendas');
 if(!Object.hasOwn(ROLE_PRESETS,role))throw new Error('Cargo inválido.');
 if(name.length<2||name.length>100)throw new Error('Informe o nome do colaborador (2 a 100 caracteres).');
 const active=body?.active===false||body?.active===0?0:1;
 let permissions_json=null;
 if(body?.permissions!==undefined&&body.permissions!==null){
  const list=body.permissions;
  if(!Array.isArray(list)||list.length>ALL_PERMISSIONS.length||list.some(p=>typeof p!=='string'||!Object.hasOwn(PERMISSION_LABELS,p)))throw new Error('Permissões inválidas.');
  if(role!=='administrador'&&list.includes('users.manage'))throw new Error('Não é permitido conceder administração de usuários a este cargo.');
  permissions_json=role==='administrador'?null:JSON.stringify([...new Set(list)]);
 }
 return {name,role,active,permissions_json};
}

/** All authenticated API endpoints must be mapped before routing.
 * If there is no known endpoint, reject (the router will otherwise return 404).
 */
export function requiredPermission(path,method){
 if(path.startsWith('/api/auth/'))return null;
 if(path.startsWith('/api/users'))return 'users.manage';
 if(path==='/api/dashboard')return 'dashboard.view';
 if(path.startsWith('/api/push/'))return path==='/api/push/test'?'users.manage':'push.manage';
 if(path==='/api/alerts/read-all')return 'alerts.manage';
 if(path.startsWith('/api/alerts'))return 'alerts.view';
 if(path==='/api/activities')return 'activity.view';
 if(path==='/api/reports/financial')return 'reports.view';
 if(path.startsWith('/api/finance'))return method==='GET'?'finance.view':'finance.manage';
 if(path.startsWith('/api/invoices'))return method==='GET'?'invoices.view':'invoices.manage';
 if(path==='/api/suppliers')return method==='GET'?'suppliers.view':'suppliers.manage';
 if(path==='/api/inventory')return 'inventory.view';
 if(path.startsWith('/api/products')){
  if(method==='GET')return 'products.view';
  if(path.endsWith('/adjust'))return 'inventory.adjust';
  return 'products.manage';
 }
 if(path.startsWith('/api/store/')){
  if(path.endsWith('/stock'))return 'inventory.adjust';
  if(path.includes('/gallery')||path.endsWith('/image'))return method==='GET'?'store.view':'store.photos';
  if(path.includes('/variants'))return method==='GET'?'store.view':'store.manage';
  if(path==='/api/store/catalog'||path==='/api/store/settings')return method==='GET'?'store.view':'store.manage';
  return 'store.manage';
 }
 if(path.startsWith('/api/orders')){
  if(method==='GET')return 'orders.view';
  if(path.endsWith('/payment'))return 'orders.payments';
  if(path.endsWith('/status'))return 'orders.manage';
  return 'orders.create';
 }
 if(path.startsWith('/api/contacts'))return method==='GET'?'contacts.view':'contacts.manage';
 if(path.startsWith('/api/deals'))return method==='GET'?'deals.view':'deals.manage';
 if(path.startsWith('/api/tasks'))return method==='GET'?'tasks.view':'tasks.manage';
 return undefined;
}
export function redactProduct(product,showCost){
 if(showCost)return product;
 const {cost_cents:cost,supplier_id:supplier,supplier_name:supplierName,...safe}=product;
 return safe;
}
