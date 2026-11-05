import {STAGES,SEGMENTS,CONTACT_STATUSES,ORIGINS,ORDER_STATUSES,PAYMENTS,FINANCE_STATUSES,FINANCE_TYPES,integer,clean,choice,emailOk,phoneOk,contactFields,productFields,dealFields,taskFields,financeFields,orderStatusAllowed} from './validators.js';
import {dispatchPush,validateSubscription} from './push.js';

const encoder=new TextEncoder(),SESSION_SECONDS=8*60*60;
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const SECURITY_HEADERS={
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Strict-Transport-Security':'max-age=31536000; includeSubDomains','Cache-Control':'no-store'
};
const response=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{...JSON_HEADERS,...headers}});
const fail=(message,status=400)=>response({error:message},status);
const now=()=>Math.floor(Date.now()/1000);
function hex(bytes){return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('')}
async function sha(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))))}
async function passwordHash(password,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/.{2}/g),x=>parseInt(x,16)),hash:'SHA-256',iterations:180000},key,256);
 return hex(new Uint8Array(hash));
}
function constantEquals(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0}
function cookies(req,name){const value=req.headers.get('cookie')||'',match=value.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));return match?.[1]||''}
const sessionCookie=(token,seconds)=>`crm_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
function validOrigin(request){const origin=request.headers.get('Origin');if(!origin)return true;try{return new URL(origin).origin===new URL(request.url).origin}catch{return false}}
async function readInput(req){
 if(!req.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new Error('Envie conteúdo JSON.');
 if(Number(req.headers.get('content-length')||0)>24000)throw new Error('Formulário excede limite.');
 const text=await req.text();if(text.length>24000)throw new Error('Formulário excede limite.');
 let result;try{result=JSON.parse(text)}catch{throw new Error('JSON inválido.');}
 if(!result||Array.isArray(result)||typeof result!=='object')throw new Error('Objeto JSON inválido.');
 return result;
}
async function currentUser(request,env){
 const token=cookies(request,'crm_session');if(!token)return null;
 const token_hash=await sha(token);
 const user=await env.DB.prepare('SELECT u.id,u.email,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').bind(token_hash).first();
 if(!user||user.expires_at<=now())return null;
 return {...user,token_hash};
}
async function audit(env,user,action,target){await env.DB.prepare('INSERT INTO audit_events(id,actor_id,action,target_id) VALUES(?,?,?,?)').bind(crypto.randomUUID(),user||null,action,target||null).run()}
async function activity(env,user,kind,summary,contact=null,order=null){await env.DB.prepare('INSERT INTO activities(id,user_id,kind,summary,contact_id,order_id) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),user||null,kind,summary,contact,order).run()}
async function alert(env,kind,title,description,ref=null){
 await env.DB.prepare('INSERT INTO alerts(id,kind,title,description,ref_id) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),kind,title,description,ref).run();
 try{await dispatchPush(env,{title,body:description,url:'/',tag:kind+'-'+ref})}catch(err){console.warn('Push delivery deferred',String(err).slice(0,120))}
}
async function lowStockAlerts(env){
 const low=await env.DB.prepare('SELECT id,name,quantity,min_quantity FROM products WHERE active=1 AND quantity<=min_quantity AND NOT EXISTS(SELECT 1 FROM alerts WHERE kind=? AND ref_id=products.id AND created_at>=datetime(\'now\',\'-24 hours\')) LIMIT 40').bind('estoque').all();
 for(const p of low.results){await alert(env,'estoque','Estoque baixo: '+p.name,`${p.quantity} unidade(s); mínimo configurado: ${p.min_quantity}.`,p.id)}
}
async function setup(req,env){
 if(!env.SETUP_KEY)return fail('Configuração administrativa indisponível. Defina SETUP_KEY como segredo do Worker.',503);
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();
 if(count.total>0)return fail('A conta inicial já foi criada.',409);
 const data=await readInput(req),token=req.headers.get('x-setup-key')||'';
 if(!constantEquals(token,env.SETUP_KEY))return fail('Credencial de configuração inválida.',403);
 const email=clean(data.email,160).toLowerCase(),password=data.password;
 if(!emailOk(email)||!email||typeof password!=='string'||password.length<14||password.length>120)return fail('E-mail válido e senha de 14 a 120 caracteres são obrigatórios.');
 const salt=hex(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt),id=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO users(id,email,password_salt,password_hash,role) VALUES(?,?,?,?,?)').bind(id,email,salt,hash,'admin').run();
 await audit(env,id,'setup',id);
 return response({ok:true,message:'Administrador criado. Faça login.'},201);
}
async function login(req,env){
 const data=await readInput(req),email=clean(data.email,160).toLowerCase(),password=data.password;
 if(!email||typeof password!=='string'||password.length>200)return fail('Informe e-mail e senha.');
 const key=await sha(email+'|'+(req.headers.get('CF-Connecting-IP')||'local'));
 const attempts=await env.DB.prepare('SELECT attempts,first_attempt FROM login_limits WHERE id=?').bind(key).first();
 if(attempts&&attempts.attempts>=8&&now()-attempts.first_attempt<900)return fail('Muitas tentativas. Tente novamente após 15 minutos.',429);
 const user=await env.DB.prepare('SELECT id,email,role,password_hash,password_salt FROM users WHERE email=?').bind(email).first();
 const salt=user?.password_salt||'00112233445566778899aabbccddeeff';
 const candidate=await passwordHash(password,salt);
 if(!user||!constantEquals(candidate,user.password_hash)){
  await env.DB.prepare('INSERT INTO login_limits(id,attempts,first_attempt) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN first_attempt<? THEN 1 ELSE attempts+1 END,first_attempt=CASE WHEN first_attempt<? THEN excluded.first_attempt ELSE first_attempt END').bind(key,now(),now()-900,now()-900).run();
  return fail('E-mail ou senha incorretos.',401);
 }
 await env.DB.prepare('DELETE FROM login_limits WHERE id=?').bind(key).run();
 const raw=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await sha(raw);
 await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hash,user.id,now()+SESSION_SECONDS).run();
 await audit(env,user.id,'login',user.id);
 return response({user:{id:user.id,email:user.email,role:user.role}},200,{'Set-Cookie':sessionCookie(raw,SESSION_SECONDS)});
}
async function changePassword(req,env,user){
 const data=await readInput(req),current=data.current_password,next=data.new_password;
 if(typeof current!=='string'||typeof next!=='string'||next.length<14||next.length>120)return fail('Informe a senha atual e uma nova senha com 14 a 120 caracteres.');
 const stored=await env.DB.prepare('SELECT password_hash,password_salt FROM users WHERE id=?').bind(user.id).first();
 if(!constantEquals(await passwordHash(current,stored.password_salt),stored.password_hash))return fail('Senha atual incorreta.',403);
 const salt=hex(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(next,salt);
 await env.DB.prepare("UPDATE users SET password_salt=?,password_hash=?,updated_at=datetime('now') WHERE id=?").bind(salt,hash,user.id).run();
 await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(user.id,user.token_hash).run();
 await audit(env,user.id,'password_change',user.id);return response({ok:true});
}
async function dashboard(env){
 const [contacts,orders,products,finance,deals,tasks,recent,alerts]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(segment='atacado'),0) AS atacado,COALESCE(SUM(status='cliente'),0) AS clientes FROM contacts").first(),
  env.DB.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status='novo'),0) AS novos,COALESCE(SUM(status='confirmado'),0) AS confirmados,COALESCE(SUM(CASE WHEN status IN ('confirmado','separando','enviado','concluido') THEN total_cents ELSE 0 END),0) AS vendas_confirmadas FROM orders").first(),
  env.DB.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(active=1 AND quantity<=min_quantity),0) AS low,COALESCE(SUM(quantity),0) AS units FROM products').first(),
  env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN type='receita' AND status='pago' THEN amount_cents ELSE 0 END),0) AS received,COALESCE(SUM(CASE WHEN type='despesa' AND status='pago' THEN amount_cents ELSE 0 END),0) AS spent,COALESCE(SUM(CASE WHEN type='receita' AND status='pendente' THEN amount_cents ELSE 0 END),0) AS receivable,COALESCE(SUM(CASE WHEN type='despesa' AND status='pendente' THEN amount_cents ELSE 0 END),0) AS payable FROM financial_entries").first(),
  env.DB.prepare('SELECT stage,COUNT(*) AS total,COALESCE(SUM(amount_cents),0) AS value_cents FROM deals GROUP BY stage').all(),
  env.DB.prepare("SELECT COUNT(*) AS pending,COALESCE(SUM(due_date<date('now') AND due_date IS NOT NULL),0) AS overdue FROM tasks WHERE completed=0").first(),
  env.DB.prepare('SELECT kind,summary,created_at FROM activities ORDER BY created_at DESC LIMIT 10').all(),
  env.DB.prepare('SELECT COUNT(*) AS unread FROM alerts WHERE read_at IS NULL').first()
 ]);
 return {contacts,orders,products,finance,deals:deals.results,tasks,recent:recent.results,alerts};
}
async function contactsRoute(req,env,user,path){
 if(req.method==='POST'&&path==='/api/contacts/import'){
  const payload=await readInput(req),list=payload.items;
  if(!Array.isArray(list)||list.length<1||list.length>200)return fail('Envie de 1 a 200 contatos por lote.');
  let created=0,skipped=0;
  for(const item of list){
   const phone=clean(item?.phone||item?.telefone,24);
   const baseName=clean(item?.name||item?.nome,120)||phone;
   const d=contactFields({name:baseName,phone,email:item?.email||'',segment:item?.segment||'varejo',status:item?.status||'lead',origin:'manual'});
   if(d.phone){const present=await env.DB.prepare('SELECT id FROM contacts WHERE phone=? LIMIT 1').bind(d.phone).first();if(present){skipped++;continue}}
   if(d.email){const present=await env.DB.prepare('SELECT id FROM contacts WHERE email=? LIMIT 1').bind(d.email).first();if(present){skipped++;continue}}
   await env.DB.prepare('INSERT INTO contacts(id,name,phone,email,segment,status,origin,notes) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),d.name,d.phone,d.email,d.segment,d.status,d.origin,'Importação CSV').run();created++;
  }
  await audit(env,user.id,'contacts_import',String(created));return response({ok:true,created,skipped});
 }
 if(req.method==='GET'){
  const url=new URL(req.url),term=clean(url.searchParams.get('q'),100),segment=clean(url.searchParams.get('segment'),10);
  const where=['1=1'],args=[];
  if(term){where.push('(name LIKE ? OR phone LIKE ? OR email LIKE ?)');args.push(...Array(3).fill('%'+term+'%'))}
  if(SEGMENTS.includes(segment)){where.push('segment=?');args.push(segment)}
  const rows=await env.DB.prepare(`SELECT * FROM contacts WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 300`).bind(...args).all();return response({items:rows.results});
 }
 if(req.method==='POST'&&path==='/api/contacts'){
  const d=contactFields(await readInput(req)),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO contacts(id,name,phone,email,segment,status,origin,notes) VALUES(?,?,?,?,?,?,?,?)').bind(id,d.name,d.phone,d.email,d.segment,d.status,d.origin,d.notes).run();
  await activity(env,user.id,'cliente','Contato criado: '+d.name,id);return response({id},201);
 }
 if(req.method==='PATCH'&&/^\/api\/contacts\/[a-f0-9-]+$/.test(path)){
  const id=path.split('/').pop(),old=await env.DB.prepare('SELECT * FROM contacts WHERE id=?').bind(id).first();
  if(!old)return fail('Contato não encontrado.',404);
  const d=contactFields({...old,...await readInput(req)});
  await env.DB.prepare("UPDATE contacts SET name=?,phone=?,email=?,segment=?,status=?,origin=?,notes=?,updated_at=datetime('now') WHERE id=?").bind(d.name,d.phone,d.email,d.segment,d.status,d.origin,d.notes,id).run();
  await activity(env,user.id,'cliente','Contato atualizado: '+d.name,id);return response({ok:true});
 }
 return fail('Método não permitido.',405);
}
async function suppliersRoute(req,env,user){
 if(req.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM suppliers ORDER BY name LIMIT 200').all();return response({items:rows.results})}
 if(req.method==='POST'){
  const d=await readInput(req),name=clean(d.name,150),phone=clean(d.phone,24),email=clean(d.email,160).toLowerCase();
  if(name.length<2||!phoneOk(phone)||!emailOk(email))return fail('Dados do fornecedor inválidos.');
  const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO suppliers(id,name,phone,email,notes) VALUES(?,?,?,?,?)').bind(id,name,phone,email,clean(d.notes,1500)).run();
  await audit(env,user.id,'supplier_create',id);return response({id},201);
 }
 return fail('Método não permitido.',405);
}
async function productsRoute(req,env,user,path){
 if(req.method==='POST'&&path==='/api/products/import'){
  if(user.role!=='admin')return fail('Somente administradores podem importar catálogo.',403);
  const body=await readInput(req),list=body.items;
  if(!Array.isArray(list)||list.length<1||list.length>200)return fail('Envie de 1 a 200 produtos por lote.');
  const keys=new Set(),statements=[];
  for(const item of list){
   const p=productFields(item);
   if(keys.has(p.sku))return fail('SKU duplicado no arquivo: '+p.sku);
   keys.add(p.sku);
   // Keep existing prices and stock intact by never overwriting an existing SKU.
   statements.push(env.DB.prepare('INSERT OR IGNORE INTO products(id,sku,name,category,description,cost_cents,retail_cents,wholesale_cents,quantity,min_quantity,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),p.sku,p.name,p.category,p.description,p.cost_cents,p.retail_cents,p.wholesale_cents,p.quantity,p.min_quantity,p.active));
  }
  const results=await env.DB.batch(statements),created=results.reduce((sum,x)=>sum+(x.meta?.changes||0),0);
  await audit(env,user.id,'products_import',String(created));await lowStockAlerts(env);
  return response({ok:true,created,skipped:list.length-created});
 }
 if(req.method==='GET'){
  const query=clean(new URL(req.url).searchParams.get('q'),100),args=[];
  let sql='SELECT p.*,s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id';
  if(query){sql+=' WHERE p.name LIKE ? OR p.sku LIKE ?';args.push('%'+query+'%','%'+query+'%')}
  const rows=await env.DB.prepare(sql+' ORDER BY p.updated_at DESC LIMIT 400').bind(...args).all();return response({items:rows.results});
 }
 if(req.method==='POST'&&path==='/api/products'){
  if(user.role!=='admin')return fail('Apenas administradores podem alterar estoque.',403);
  const d=productFields(await readInput(req)),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO products(id,sku,name,category,description,cost_cents,retail_cents,wholesale_cents,quantity,min_quantity,supplier_id,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.sku,d.name,d.category,d.description,d.cost_cents,d.retail_cents,d.wholesale_cents,d.quantity,d.min_quantity,d.supplier_id,d.active).run();
  if(d.quantity)await env.DB.prepare('INSERT INTO inventory_movements(id,product_id,delta,reason) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,d.quantity,'estoque_inicial').run();
  await activity(env,user.id,'produto','Produto criado: '+d.name);await lowStockAlerts(env);return response({id},201);
 }
 const id=path.match(/^\/api\/products\/([a-f0-9-]+)(?:\/adjust)?$/)?.[1];
 if(!id||user.role!=='admin')return fail('Sem permissão.',403);
 const old=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();if(!old)return fail('Produto não encontrado.',404);
 if(req.method==='PATCH'&&path===`/api/products/${id}`){
  const input=await readInput(req),d=productFields({...old,...input,quantity:old.quantity});
  await env.DB.prepare("UPDATE products SET sku=?,name=?,category=?,description=?,cost_cents=?,retail_cents=?,wholesale_cents=?,min_quantity=?,supplier_id=?,active=?,updated_at=datetime('now') WHERE id=?").bind(d.sku,d.name,d.category,d.description,d.cost_cents,d.retail_cents,d.wholesale_cents,d.min_quantity,d.supplier_id,d.active,id).run();
  await audit(env,user.id,'product_update',id);await lowStockAlerts(env);return response({ok:true});
 }
 if(req.method==='POST'&&path===`/api/products/${id}/adjust`){
  const input=await readInput(req),delta=Number(input.delta),reason=clean(input.reason,100);
  if(!integer(Math.abs(delta),1,100000)||!Number.isSafeInteger(delta)||reason.length<4)return fail('Informe variação positiva ou negativa e motivo (mínimo 4 caracteres).');
  // A guarded UPDATE avoids negative stock even on concurrent requests.
  const updated=await env.DB.prepare("UPDATE products SET quantity=quantity+?,updated_at=datetime('now') WHERE id=? AND quantity+?>=0 RETURNING quantity,min_quantity").bind(delta,id,delta).first();
  if(!updated)return fail('Ajuste inválido ou estoque insuficiente.',409);
  await env.DB.prepare('INSERT INTO inventory_movements(id,product_id,delta,reason) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,delta,reason).run();
  await audit(env,user.id,'stock_adjust',id);await lowStockAlerts(env);return response({ok:true,quantity:updated.quantity});
 }
 return fail('Método não permitido.',405);
}
async function inventoryRoute(req,env){
 const rows=await env.DB.prepare('SELECT m.*,p.name AS product_name,p.sku FROM inventory_movements m JOIN products p ON p.id=m.product_id ORDER BY m.created_at DESC LIMIT 150').all();return response({items:rows.results});
}
async function ordersRoute(req,env,user,path){
 if(req.method==='GET'){
  const rows=await env.DB.prepare('SELECT o.*,c.name AS contact_name FROM orders o LEFT JOIN contacts c ON c.id=o.contact_id ORDER BY o.created_at DESC LIMIT 300').all();
  return response({items:rows.results});
 }
 if(req.method==='POST'&&path==='/api/orders'){
  const data=await readInput(req),items=data.items,contactId=clean(data.contact_id,40)||null,segment=choice(data.segment||'varejo',SEGMENTS,'Perfil'),origin=choice(data.origin||'manual',ORIGINS,'Origem');
  if(!Array.isArray(items)||items.length<1||items.length>60)return fail('Adicione entre 1 e 60 itens.');
  if(contactId){const contact=await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(contactId).first();if(!contact)return fail('Cliente não encontrado.',404)}
  const itemIds=new Set(),lines=[];
  for(const item of items){
    const id=clean(item?.product_id,40),qty=Number(item?.quantity);
    if(!id||itemIds.has(id)||!integer(qty,1,9999))return fail('Itens duplicados ou quantidades inválidas.');
    itemIds.add(id);
    const p=await env.DB.prepare('SELECT id,sku,name,cost_cents,retail_cents,wholesale_cents,active FROM products WHERE id=?').bind(id).first();
    if(!p||!p.active)return fail('Um dos produtos não está disponível.',400);
    const price=segment==='atacado'?p.wholesale_cents:p.retail_cents;
    lines.push({id:crypto.randomUUID(),product_id:p.id,sku:p.sku,name:p.name,quantity:qty,unit_price_cents:price,unit_cost_cents:p.cost_cents,line_total_cents:price*qty});
  }
  const shipping=Number(data.shipping_cents||0),discount=Number(data.discount_cents||0);
  if(!integer(shipping,0,100000000000)||!integer(discount,0,100000000000))return fail('Frete ou desconto inválidos.');
  const total=Math.max(0,lines.reduce((sum,item)=>sum+item.line_total_cents,0)+shipping-discount);
  if(!Number.isSafeInteger(total))return fail('Valor do pedido excede o limite permitido.');
  const id=crypto.randomUUID(),num='MC-'+new Date().toISOString().slice(2,10).replaceAll('-','')+'-'+id.slice(0,7).toUpperCase(),notes=clean(data.notes,1500);
  const statements=[env.DB.prepare('INSERT INTO orders(id,order_number,contact_id,segment,origin,shipping_cents,discount_cents,total_cents,notes) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,num,contactId,segment,origin,shipping,discount,total,notes),
   ...lines.map(i=>env.DB.prepare('INSERT INTO order_items(id,order_id,product_id,sku,name,quantity,unit_price_cents,line_total_cents,unit_cost_cents) VALUES(?,?,?,?,?,?,?,?,?)').bind(i.id,id,i.product_id,i.sku,i.name,i.quantity,i.unit_price_cents,i.line_total_cents,i.unit_cost_cents))];
  await env.DB.batch(statements);
  await activity(env,user.id,'pedido','Pedido recebido: '+num,contactId,id);await alert(env,'pedido','Novo pedido: '+num,`${lines.length} tipo(s) de produto; ${segment}.`,id);
  return response({id,order_number:num,total_cents:total},201);
 }
 const match=path.match(/^\/api\/orders\/([a-f0-9-]+)\/(status|payment)$/);
 if(!match||req.method!=='PATCH')return fail('Método não permitido.',405);
 const [,id,field]=match,order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 if(!order)return fail('Pedido não encontrado.',404);
 const data=await readInput(req);
 if(field==='status'){
  const status=choice(data.status,ORDER_STATUSES,'Situação');
  if(!orderStatusAllowed(order.status,status))return fail(`Não é possível mudar de ${order.status} para ${status}.`,409);
  if(status==='cancelado'&&order.payment_status==='pago')return fail('Pedido já pago: registre estorno antes de cancelar.',409);
  if(status==='confirmado'){
   if(order.total_cents<=0)return fail('Informe preços válidos dos produtos antes de confirmar esta venda.',409);
   const missing=await env.DB.prepare('SELECT COUNT(*) AS count FROM order_items WHERE order_id=? AND unit_price_cents=0').bind(id).first();
   if(missing?.count)return fail('Há produtos sem preço neste pedido. Configure os preços antes de confirmar.',409);
  }
  try{await env.DB.prepare("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?").bind(status,id).run()}
  catch(e){if(String(e).includes('ESTOQUE_INSUFICIENTE'))return fail('Estoque insuficiente para confirmar o pedido.',409);throw e}
  await activity(env,user.id,'pedido',`Pedido ${order.order_number}: ${status}`,order.contact_id,id);
  if(status==='confirmado'){await alert(env,'venda','Venda confirmada: '+order.order_number,`Valor R$ ${(order.total_cents/100).toFixed(2)}.`,id);await lowStockAlerts(env)}
  if(status==='cancelado')await lowStockAlerts(env);
  return response({ok:true,status});
 }
 if(user.role!=='admin')return fail('Sem permissão para atualizar pagamentos.',403);
 const payment=choice(data.payment_status,PAYMENTS,'Pagamento');
 if(payment==='pago'&&(order.status==='novo'||order.status==='cancelado'||order.payment_status!=='pendente'))return fail('O pagamento só pode ser registrado uma vez, após confirmar um pedido ativo.',409);
 if(payment==='estornado'&&order.payment_status!=='pago')return fail('Registre um pagamento antes de realizar um estorno.',409);
 await env.DB.prepare("UPDATE orders SET payment_status=?,updated_at=datetime('now') WHERE id=?").bind(payment,id).run();
 // Keep automatic receivable entry in sync for a fully paid or refunded order.
 if(payment==='pago')await env.DB.prepare("UPDATE financial_entries SET status='pago',paid_at=date('now') WHERE order_id=? AND category='vendas' AND status='pendente'").bind(id).run();
 if(payment==='estornado'){
  await env.DB.prepare('INSERT INTO financial_entries(id,type,category,title,amount_cents,status,paid_at,method,order_id,notes) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'despesa','estorno','Estorno '+order.order_number,order.total_cents,'pago',new Date().toISOString().slice(0,10),'outro',order.id,'Registro manual: confirme o estorno efetivo no provedor antes de marcar.').run();
 }
 await audit(env,user.id,'payment_'+payment,id);return response({ok:true,payment_status:payment});
}
async function orderDetail(req,env,id){
 const order=await env.DB.prepare('SELECT o.*,c.name AS contact_name,c.phone AS contact_phone FROM orders o LEFT JOIN contacts c ON c.id=o.contact_id WHERE o.id=?').bind(id).first();
 if(!order)return fail('Pedido não encontrado.',404);
 const items=await env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(id).all();return response({order,items:items.results});
}
async function dealsRoute(req,env,user,path){
 if(req.method==='GET'){
  const rows=await env.DB.prepare('SELECT d.*,c.name AS contact_name,c.segment FROM deals d JOIN contacts c ON c.id=d.contact_id ORDER BY d.updated_at DESC LIMIT 300').all();return response({items:rows.results});
 }
 if(req.method==='POST'&&path==='/api/deals'){
  const d=dealFields(await readInput(req)),id=crypto.randomUUID();
  const contact=await env.DB.prepare('SELECT id FROM contacts WHERE id=?').bind(d.contact_id).first();if(!contact)return fail('Contato não encontrado.',404);
  await env.DB.prepare('INSERT INTO deals(id,contact_id,title,amount_cents,stage,origin,notes) VALUES(?,?,?,?,?,?,?)').bind(id,d.contact_id,d.title,d.amount_cents,d.stage,d.origin,d.notes).run();
  await activity(env,user.id,'oportunidade','Oportunidade criada: '+d.title,d.contact_id);return response({id},201);
 }
 if(req.method==='PATCH'){
  const id=path.match(/^\/api\/deals\/([a-f0-9-]+)$/)?.[1];if(!id)return fail('Rota inválida.',404);
  const old=await env.DB.prepare('SELECT * FROM deals WHERE id=?').bind(id).first();if(!old)return fail('Oportunidade não encontrada.',404);
  const d=dealFields({...old,...await readInput(req)});
  await env.DB.prepare("UPDATE deals SET contact_id=?,title=?,amount_cents=?,stage=?,origin=?,notes=?,updated_at=datetime('now') WHERE id=?").bind(d.contact_id,d.title,d.amount_cents,d.stage,d.origin,d.notes,id).run();
  await activity(env,user.id,'oportunidade','Oportunidade atualizada: '+d.title,d.contact_id);return response({ok:true});
 }
 return fail('Método não permitido.',405);
}
async function tasksRoute(req,env,user,path){
 if(req.method==='GET'){
  const rows=await env.DB.prepare('SELECT t.*,c.name AS contact_name FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id ORDER BY t.completed,t.due_date IS NULL,t.due_date, t.created_at DESC LIMIT 300').all();return response({items:rows.results});
 }
 if(req.method==='POST'&&path==='/api/tasks'){
  const d=taskFields(await readInput(req)),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO tasks(id,title,description,due_date,contact_id,deal_id) VALUES(?,?,?,?,?,?)').bind(id,d.title,d.description,d.due_date,d.contact_id,d.deal_id).run();
  await activity(env,user.id,'tarefa','Tarefa criada: '+d.title,d.contact_id);return response({id},201);
 }
 if(req.method==='PATCH'){
  const id=path.match(/^\/api\/tasks\/([a-f0-9-]+)$/)?.[1];if(!id)return fail('Rota inválida.',404);
  const old=await env.DB.prepare('SELECT * FROM tasks WHERE id=?').bind(id).first();if(!old)return fail('Tarefa não encontrada.',404);
  const input=await readInput(req),d=taskFields({...old,...input}),done=input.completed===undefined?old.completed:(input.completed?1:0);
  await env.DB.prepare("UPDATE tasks SET title=?,description=?,due_date=?,contact_id=?,deal_id=?,completed=?,updated_at=datetime('now') WHERE id=?").bind(d.title,d.description,d.due_date,d.contact_id,d.deal_id,done,id).run();
  await audit(env,user.id,'task_update',id);return response({ok:true});
 }
 return fail('Método não permitido.',405);
}
async function financeRoute(req,env,user,path){
 if(user.role!=='admin')return fail('Acesso financeiro restrito ao administrador.',403);
 if(req.method==='GET'){
  const rows=await env.DB.prepare('SELECT f.*,s.name AS supplier_name FROM financial_entries f LEFT JOIN suppliers s ON s.id=f.supplier_id ORDER BY f.created_at DESC LIMIT 400').all();return response({items:rows.results});
 }
 if(req.method==='POST'&&path==='/api/finance'){
  const d=financeFields(await readInput(req)),id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO financial_entries(id,type,category,title,amount_cents,due_date,paid_at,status,method,supplier_id,order_id,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.type,d.category,d.title,d.amount_cents,d.due_date,d.status==='pago'?new Date().toISOString().slice(0,10):null,d.status,d.method,d.supplier_id,d.order_id,d.notes).run();
  await audit(env,user.id,'finance_create',id);return response({id},201);
 }
 if(req.method==='PATCH'){
  const id=path.match(/^\/api\/finance\/([a-f0-9-]+)$/)?.[1];if(!id)return fail('Rota inválida.',404);
  const old=await env.DB.prepare('SELECT * FROM financial_entries WHERE id=?').bind(id).first();if(!old)return fail('Lançamento não encontrado.',404);
  const input=await readInput(req),status=choice(input.status,FINANCE_STATUSES,'Situação');
  await env.DB.prepare('UPDATE financial_entries SET status=?,paid_at=? WHERE id=?').bind(status,status==='pago'?new Date().toISOString().slice(0,10):null,id).run();
  await audit(env,user.id,'finance_'+status,id);return response({ok:true});
 }
 return fail('Método não permitido.',405);
}
async function alertsRoute(req,env,user,path){
 if(req.method==='GET'){
  const rows=await env.DB.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100').all();return response({items:rows.results,server_time:new Date().toISOString()});
 }
 if(req.method==='PATCH'&&path==='/api/alerts/read-all'){
  await env.DB.prepare("UPDATE alerts SET read_at=datetime('now') WHERE read_at IS NULL").run();return response({ok:true});
 }
 return fail('Método não permitido.',405);
}
async function activitiesRoute(req,env){const data=await env.DB.prepare('SELECT a.*,c.name AS contact_name FROM activities a LEFT JOIN contacts c ON c.id=a.contact_id ORDER BY a.created_at DESC LIMIT 200').all();return response({items:data.results})}
async function reportsRoute(req,env,user){
 if(user.role!=='admin')return fail('Relatórios financeiros restritos ao administrador.',403);
 const [months,margin,stock,receivables]=await Promise.all([
  env.DB.prepare("SELECT substr(COALESCE(paid_at,created_at),1,7) AS month,COALESCE(SUM(CASE WHEN type='receita' THEN amount_cents ELSE 0 END),0) AS income_cents,COALESCE(SUM(CASE WHEN type='despesa' THEN amount_cents ELSE 0 END),0) AS expense_cents FROM financial_entries WHERE status='pago' AND substr(COALESCE(paid_at,created_at),1,7)>=strftime('%Y-%m','now','-5 months') GROUP BY month ORDER BY month").all(),
  env.DB.prepare("SELECT COALESCE((SELECT SUM((i.unit_price_cents-i.unit_cost_cents)*i.quantity) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status IN ('confirmado','separando','enviado','concluido')),0) - COALESCE((SELECT SUM(discount_cents) FROM orders WHERE status IN ('confirmado','separando','enviado','concluido')),0) AS margin_cents").first(),
  env.DB.prepare('SELECT COALESCE(SUM(quantity*cost_cents),0) AS value_cents FROM products WHERE active=1').first(),
  env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN type='receita' THEN amount_cents ELSE 0 END),0) AS receivable,COALESCE(SUM(CASE WHEN type='despesa' THEN amount_cents ELSE 0 END),0) AS payable FROM financial_entries WHERE status='pendente'").first()
 ]);
 return response({months:months.results,margin_cents:margin.margin_cents||0,stock_value_cents:stock.value_cents||0,receivables});
}
async function usersRoute(req,env,user){
 if(user.role!=='admin')return fail('Sem permissão.',403);
 if(req.method==='GET'){const result=await env.DB.prepare('SELECT id,email,role,created_at FROM users ORDER BY created_at DESC').all();return response({items:result.results})}
 if(req.method==='POST'){
  const d=await readInput(req),email=clean(d.email,160).toLowerCase(),password=d.password,role=choice(d.role||'operador',['admin','operador'],'Papel');
  if(!email||!emailOk(email)||typeof password!=='string'||password.length<14||password.length>120)return fail('E-mail e senha segura são obrigatórios (14 caracteres no mínimo).');
  const id=crypto.randomUUID(),salt=hex(crypto.getRandomValues(new Uint8Array(16))),hash=await passwordHash(password,salt);
  await env.DB.prepare('INSERT INTO users(id,email,password_salt,password_hash,role) VALUES(?,?,?,?,?)').bind(id,email,salt,hash,role).run();
  await audit(env,user.id,'user_create',id);return response({id},201);
 }
 return fail('Método não permitido.',405);
}
async function siteLead(req,env){
 // Never expose this endpoint without server-side Turnstile verification and a specific allowed Origin.
 if(!env.TURNSTILE_SECRET||!env.TURNSTILE_SITE_KEY||!env.FORM_SALT||!env.SITE_ORIGIN)return fail('Formulário público não habilitado.',503);
 const requestOrigin=req.headers.get('origin')||'';
 if(requestOrigin!==env.SITE_ORIGIN)return fail('Origem não autorizada.',403);
 const body=await readInput(req),token=clean(body.turnstile_token,2048),consent=body.consent===true;
 if(!consent||!token)return fail('Aceite o formulário e complete a verificação anti-spam.');
 const requestId=clean(body.request_id,70);
 if(requestId && !/^[a-f0-9-]{36}$/i.test(requestId))return fail('Identificador da solicitação inválido.');
 if(requestId){const prior=await env.DB.prepare('SELECT event_id FROM integration_events WHERE event_id=?').bind(requestId).first();if(prior)return response({ok:true,message:'Solicitação recebida anteriormente.'},200,{'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Vary':'Origin'});}
 let proof;
 try{
  const result=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10000),body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token,remoteip:req.headers.get('CF-Connecting-IP')||''})});
  if(!result.ok)throw new Error('siteverify '+result.status);
  proof=await result.json();
 }catch(error){
  console.error(JSON.stringify({message:'turnstile verification failed',error:error instanceof Error?error.message:String(error)}));
  return fail('Não foi possível validar o formulário.',403);
 }
 if(!proof.success||proof.hostname!==new URL(env.SITE_ORIGIN).hostname||proof.action!=='crm_request')return fail('Não foi possível validar o formulário.',403);
 const name=clean(body.name,120),phone=clean(body.phone,24),email=clean(body.email,160).toLowerCase(),segment=choice(body.segment||'varejo',SEGMENTS,'Perfil'),message=clean(body.message,1200);
 if(name.length<2||(!phone&&!email)||!phoneOk(phone)||!emailOk(email))return fail('Informe nome e um contato válido.');
 const ip=await sha((req.headers.get('CF-Connecting-IP')||'unknown')+'|'+env.FORM_SALT);
 const limit=await env.DB.prepare('SELECT count,started_at FROM public_form_limits WHERE id=?').bind(ip).first();
 if(limit&&limit.count>=5&&now()-limit.started_at<3600)return fail('Muitos formulários enviados. Tente novamente mais tarde.',429);
 await env.DB.prepare('INSERT INTO public_form_limits(id,count,started_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN started_at<? THEN 1 ELSE count+1 END,started_at=CASE WHEN started_at<? THEN excluded.started_at ELSE started_at END').bind(ip,now(),now()-3600,now()-3600).run();
 const selection=Array.isArray(body.items)?body.items:[];
 if(selection.length>60)return fail('Quantidade de produtos excedida.');
 const safeItems=[];const seen=new Set();
 for(const item of selection){
  const sku=clean(item?.sku,70).toUpperCase(),qty=item?.quantity;
  if(!/^[A-Z0-9][A-Z0-9._-]{1,69}$/.test(sku)||!Number.isSafeInteger(qty)||qty<1||qty>999||seen.has(sku))return fail('Itens do orçamento inválidos.');
  seen.add(sku);safeItems.push({sku,quantity:qty});
 }
 let lines=[];
 if(safeItems.length){
  const skus=safeItems.map(x=>x.sku);
  const foundProducts=await env.DB.prepare(`SELECT sku,name FROM products WHERE sku IN (${skus.map(()=>'?').join(',')})`).bind(...skus).all();
  const labels=new Map(foundProducts.results.map(x=>[x.sku,x.name]));
  lines=safeItems.map(x=>`${x.quantity} x ${labels.get(x.sku)||x.sku} [${x.sku}]`);
 }
 const quoteNotes=clean([message,lines.length?'Produtos solicitados: '+lines.join('; '):''].filter(Boolean).join(' | '),2400);
 const found=phone?await env.DB.prepare('SELECT id FROM contacts WHERE phone=? LIMIT 1').bind(phone).first():email?await env.DB.prepare('SELECT id FROM contacts WHERE email=? LIMIT 1').bind(email).first():null;
 let id=found?.id;if(!id){id=crypto.randomUUID();await env.DB.prepare("INSERT INTO contacts(id,name,phone,email,segment,origin,notes) VALUES(?,?,?,?,?,'site',?)").bind(id,name,phone,email,segment,quoteNotes).run()}
 const deal=crypto.randomUUID();await env.DB.prepare("INSERT INTO deals(id,contact_id,title,origin,notes) VALUES(?,?,?,'site',?)").bind(deal,id,lines.length?`Solicitação de ${lines.length} item(ns) — Macumbiinha`:'Solicitação via Macumbiinha',quoteNotes).run();
 if(requestId)await env.DB.prepare('INSERT OR IGNORE INTO integration_events(event_id,contact_id) VALUES(?,?)').bind(requestId,id).run();
 await activity(env,null,'integracao','Nova solicitação do site: '+name,id);await alert(env,'pedido','Nova solicitação do site',`${name}: ${lines.length} produto(s) para orçamento (${segment}).`,deal);
 return response({ok:true,message:'Solicitação recebida. A equipe entrará em contato.'},202,{'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Vary':'Origin'});
}
async function api(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(method!=='GET'&&method!=='HEAD'&&!validOrigin(req)&&!path.startsWith('/api/public/'))return fail('Origem não autorizada.',403);
 if(path==='/api/health'&&method==='GET')return response({ok:true,service:'Macumbiinha CRM',version:'1.0.0',timestamp:new Date().toISOString()});
 if(path==='/api/public/lead'&&method==='OPTIONS'){
  if(req.headers.get('Origin')!==env.SITE_ORIGIN||!env.TURNSTILE_SECRET)return fail('Origem não autorizada.',403);
  return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':env.SITE_ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
 }
 if(path==='/api/public/lead'&&method==='POST')return siteLead(req,env);
 if(path==='/api/public/config'&&method==='GET'){
  const headers={'Vary':'Origin','Cache-Control':'no-store'},origin=req.headers.get('Origin');
  if(env.SITE_ORIGIN&&origin===env.SITE_ORIGIN)headers['Access-Control-Allow-Origin']=env.SITE_ORIGIN;
  return response({form_enabled:!!(env.SITE_ORIGIN&&env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY&&env.FORM_SALT),site_key:env.TURNSTILE_SITE_KEY||'',version:'1.1.0'},200,headers);
 }
 if(path==='/api/public/catalog'&&method==='GET'){
  const rows=await env.DB.prepare('SELECT sku,name,category,retail_cents,quantity FROM products WHERE active=1 AND retail_cents>0 ORDER BY name LIMIT 1500').all();
  const origin=req.headers.get('Origin');
  const headers={'Cache-Control':'no-store','Vary':'Origin'};
  if(env.SITE_ORIGIN&&origin===env.SITE_ORIGIN)headers['Access-Control-Allow-Origin']=env.SITE_ORIGIN;
  return response({items:rows.results.map(p=>({sku:p.sku,name:p.name,category:p.category,retail_cents:p.retail_cents,available:p.quantity>0,quantity:p.quantity}))},200,headers);
 }
 if(path==='/api/setup/status'&&method==='GET'){const users=await env.DB.prepare('SELECT COUNT(*) AS total FROM users').first();return response({needs_setup:users.total===0})}
 if(path==='/api/setup'&&method==='POST')return setup(req,env);
 if(path==='/api/auth/login'&&method==='POST')return login(req,env);
 const user=await currentUser(req,env);
 if(!user)return fail('Sua sessão expirou. Entre novamente.',401);
 if(path==='/api/auth/me'&&method==='GET')return response({user:{id:user.id,email:user.email,role:user.role}});
 if(path==='/api/auth/logout'&&method==='POST'){
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();return response({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
 }
 if(path==='/api/auth/password'&&method==='POST')return changePassword(req,env,user);
 if(path==='/api/push/public-key'&&method==='GET')return response({configured:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT),public_key:env.VAPID_PUBLIC_KEY||''});
 if(path==='/api/push/subscribe'&&method==='POST'){
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return fail('Notificação push não configurada neste servidor.',503);
  const body=await readInput(req),sub=validateSubscription(body);
  await env.DB.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth').bind(crypto.randomUUID(),user.id,sub.endpoint,sub.p256dh,sub.auth).run();
  await audit(env,user.id,'push_subscription',user.id);
  return response({ok:true});
 }
 if(path==='/api/push/unsubscribe'&&method==='POST'){
  const body=await readInput(req),endpoint=clean(body.endpoint,1000);
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').bind(endpoint,user.id).run();return response({ok:true});
 }
 if(path==='/api/push/test'&&method==='POST'){
  await dispatchPush(env,{title:'Macumbiinha CRM',body:'Notificações push configuradas com sucesso.',url:'/',tag:'crm-test'});
  return response({ok:true});
 }
 if(path==='/api/dashboard'&&method==='GET')return response(await dashboard(env));
 if(path.startsWith('/api/contacts'))return contactsRoute(req,env,user,path);
 if(path==='/api/suppliers')return suppliersRoute(req,env,user);
 if(path.startsWith('/api/products'))return productsRoute(req,env,user,path);
 if(path==='/api/inventory'&&method==='GET')return inventoryRoute(req,env);
 if(/^\/api\/orders\/[a-f0-9-]+$/.test(path)&&method==='GET')return orderDetail(req,env,path.split('/').pop());
 if(path.startsWith('/api/orders'))return ordersRoute(req,env,user,path);
 if(path.startsWith('/api/deals'))return dealsRoute(req,env,user,path);
 if(path.startsWith('/api/tasks'))return tasksRoute(req,env,user,path);
 if(path.startsWith('/api/finance'))return financeRoute(req,env,user,path);
 if(path.startsWith('/api/alerts'))return alertsRoute(req,env,user,path);
 if(path==='/api/activities'&&method==='GET')return activitiesRoute(req,env);
 if(path==='/api/reports/financial'&&method==='GET')return reportsRoute(req,env,user);
 if(path==='/api/users')return usersRoute(req,env,user);
 return fail('Rota não encontrada.',404);
}
export default {async fetch(req,env){
 const pathname=new URL(req.url).pathname;
 try{
  if(pathname.startsWith('/api/')){
   if(!env.DB)return fail('Banco de dados não conectado. Configure a binding D1 chamada DB.',503);
   const res=await api(req,env);const h=new Headers(res.headers);
   Object.entries(SECURITY_HEADERS).forEach(([k,v])=>h.set(k,v));
   return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
  }
  const res=await env.ASSETS.fetch(req),h=new Headers(res.headers);
  h.set('X-Frame-Options','DENY');h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');
  h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if(pathname==='/'||pathname==='/index.html')h.set('Cache-Control','no-store');
  return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
 }catch(e){console.error('CRM failure',String(e));
  if(e instanceof Error&&(/^(D1_|Constraint failed|UNIQUE constraint)/i.test(e.message)))return fail('Conflito ou duplicidade. Revise os dados.',409);
  return fail(e instanceof Error&&(e.message.startsWith('Informe')||e.message.includes('inválid')||e.message.includes('obrigatório')||e.message.includes('excede')||e.message.includes('não encontrado')||e.message.includes('Formulário'))?e.message:'Não foi possível processar esta operação.',400);
 }
 },
 async scheduled(event,env,ctx){
  if(!env.DB)return;
  const cleanup=env.DB.batch([
   env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
   env.DB.prepare('DELETE FROM login_limits WHERE first_attempt<?').bind(now()-900),
   env.DB.prepare('DELETE FROM public_form_limits WHERE started_at<?').bind(now()-7200),
   env.DB.prepare("DELETE FROM alerts WHERE created_at<datetime('now','-90 days') AND read_at IS NOT NULL")
  ]);
  ctx.waitUntil(cleanup);
 }
};
