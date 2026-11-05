/* Macumbiinha Commerce Hub: catalog owner, inventory controls, private fiscal archive. */
import {productFields,clean,integer} from './validators.js';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>json({error:message},status);
const uid=()=>crypto.randomUUID();
const allowedOrigin=(req,env)=>({'Vary':'Origin',...(env.SITE_ORIGIN&&req.headers.get('Origin')===env.SITE_ORIGIN?{'Access-Control-Allow-Origin':env.SITE_ORIGIN}:{})});
const bool=v=>v===true||v===1||v==='1';
const secureUrl=s=>{const raw=clean(s,500);if(!raw)return '';try{const url=new URL(raw);return url.protocol==='https:'&&!url.username&&!url.password?url.toString():''}catch{return ''}};
const blobMime=(name,b)=>{
 name=String(name).toLowerCase();const head=String.fromCharCode(...b.slice(0,12));
 if(name.endsWith('.png')&&b.length>8&&b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')return 'image/png';
 if(/\.(jpe?g)$/.test(name)&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(name.endsWith('.webp')&&head.slice(0,4)==='RIFF'&&head.slice(8,12)==='WEBP')return 'image/webp';
 return '';
};
const invoiceMime=(name,b)=>{
 name=String(name).toLowerCase();
 if(name.endsWith('.pdf')&&String.fromCharCode(...b.slice(0,5))==='%PDF-')return 'application/pdf';
 if(name.endsWith('.xml')){
  const text=new TextDecoder().decode(b.slice(0,600)).replace(/^\uFEFF/,'').trimStart();
  if(text.startsWith('<?xml')||text.startsWith('<NFe')||text.startsWith('<nfeProc')||text.startsWith('<procNFe'))return 'application/xml';
 }
 return '';
};
const admin=user=>user?.role==='admin';
async function audit(env,user,action,target){await env.DB.prepare('INSERT INTO audit_events(id,actor_id,action,target_id) VALUES(?,?,?,?)').bind(uid(),user.id,action,target).run()}
function listing(d,sku){
 const slug=clean(d.slug||sku.toLowerCase(),80).toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(slug))throw new Error('Identificador do produto inválido.');
 const image_url=secureUrl(d.image_url);
 if(d.image_url&&!image_url)throw new Error('Imagem: informe uma URL HTTPS válida.');
 const tags=(Array.isArray(d.tags)?d.tags:String(d.tags||'').split(',')).map(x=>clean(x,36)).filter(Boolean).slice(0,8);
 return {slug,image_url,published:bool(d.published)?1:0,featured:bool(d.featured)?1:0,for_wholesale:bool(d.for_wholesale)?1:0,tags_json:JSON.stringify(tags)};
}
export async function publicCatalog(req,env){
 const query=['SELECT p.id,p.sku,p.name,p.category,p.description,p.retail_cents,p.wholesale_cents,p.quantity,',
  'c.slug,c.image_url,c.featured,c.for_wholesale,c.tags_json,c.updated_at,',
  'EXISTS(SELECT 1 FROM product_media m WHERE m.product_id=p.id) AS has_image',
  'FROM products p JOIN catalog_listings c ON c.product_id=p.id',
  'WHERE c.published=1 AND p.active=1 ORDER BY c.featured DESC,p.name LIMIT 1500'].join(' ');
 const rows=await env.DB.prepare(query).all();
 return json({source:'macumbiinha-crm',version:'2.0',items:rows.results.map(p=>{
  let tags=[];try{tags=JSON.parse(p.tags_json||'[]')}catch{}
  return{id:p.id,slug:p.slug,sku:p.sku,name:p.name,category:p.category,description:p.description,
   image_url:p.has_image?new URL('/api/public/image/'+p.id,req.url).href:p.image_url,
   tags,featured:!!p.featured,for_wholesale:!!p.for_wholesale,retail_cents:p.retail_cents,
   wholesale_cents:p.wholesale_cents,available:p.quantity>0,quantity:p.quantity,updated_at:p.updated_at};
 })},200,allowedOrigin(req,env));
}
export async function publicSite(req,env){
 const rows=await env.DB.prepare('SELECT key,value FROM site_settings').all();
 return json({settings:Object.fromEntries(rows.results.map(r=>[r.key,r.value]))},200,allowedOrigin(req,env));
}
export async function publicImage(req,env,path){
 const product=path.match(/^\/api\/public\/image\/([0-9a-f-]{36})$/)?.[1];
 if(req.method!=='GET'||!product)return fail('Imagem não encontrada.',404);
 const sql=['SELECT m.body,m.mime_type FROM product_media m','JOIN products p ON p.id=m.product_id',
 'JOIN catalog_listings c ON c.product_id=p.id','WHERE p.id=? AND p.active=1 AND c.published=1'].join(' ');
 const row=await env.DB.prepare(sql).bind(product).first();
 if(!row)return fail('Imagem não encontrada.',404);
 return new Response(row.body,{headers:{'Content-Type':row.mime_type,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=120'}});
}
async function catalogAdmin(req,env,user){
 if(req.method==='GET'){
  const query=['SELECT p.*,c.slug,COALESCE(c.published,0) published,COALESCE(c.featured,0) featured,',
   'COALESCE(c.for_wholesale,0) for_wholesale,COALESCE(c.image_url,\'\') image_url,',
   'COALESCE(c.tags_json,\'[]\') tags_json,',
   'EXISTS(SELECT 1 FROM product_media m WHERE m.product_id=p.id) has_image',
   'FROM products p LEFT JOIN catalog_listings c ON c.product_id=p.id ORDER BY p.updated_at DESC,p.name LIMIT 1500'].join(' ');
  const result=await env.DB.prepare(query).all(),items=result.results;
  return json({items,summary:{total:items.length,published:items.filter(p=>p.published&&p.active).length,low_stock:items.filter(p=>p.active&&p.quantity<=p.min_quantity).length,units:items.reduce((n,p)=>n+p.quantity,0)},site_url:env.SITE_ORIGIN||''});
 }
 if(req.method!=='POST')return fail('Método não permitido.',405);
 if(!admin(user))return fail('Somente administradores podem cadastrar produtos.',403);
 const body=await req.json(),p=productFields(body),l=listing(body,p.sku),id=uid();
 const statements=[
  env.DB.prepare('INSERT INTO products(id,sku,name,category,description,cost_cents,retail_cents,wholesale_cents,quantity,min_quantity,supplier_id,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,p.sku,p.name,p.category,p.description,p.cost_cents,p.retail_cents,p.wholesale_cents,p.quantity,p.min_quantity,p.supplier_id,p.active),
  env.DB.prepare('INSERT INTO catalog_listings(product_id,slug,published,image_url,featured,for_wholesale,tags_json) VALUES(?,?,?,?,?,?,?)')
   .bind(id,l.slug,l.published,l.image_url,l.featured,l.for_wholesale,l.tags_json)
 ];
 if(p.quantity)statements.push(env.DB.prepare('INSERT INTO inventory_movements(id,product_id,delta,reason) VALUES(?,?,?,?)').bind(uid(),id,p.quantity,'estoque_inicial'));
 await env.DB.batch(statements);await audit(env,user,'store_product_create',id);return json({ok:true,id},201);
}
async function editProduct(req,env,user,id){
 if(!admin(user))return fail('Somente administradores podem editar produtos.',403);
 if(req.method!=='PATCH')return fail('Método não permitido.',405);
 const old=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();if(!old)return fail('Produto não encontrado.',404);
 const body=await req.json(),p=productFields({...old,...body,quantity:old.quantity}),l=listing(body,p.sku);
 const statements=[
  env.DB.prepare("UPDATE products SET sku=?,name=?,category=?,description=?,cost_cents=?,retail_cents=?,wholesale_cents=?,min_quantity=?,supplier_id=?,active=?,updated_at=datetime('now') WHERE id=?")
   .bind(p.sku,p.name,p.category,p.description,p.cost_cents,p.retail_cents,p.wholesale_cents,p.min_quantity,p.supplier_id,p.active,id),
  env.DB.prepare(["INSERT INTO catalog_listings(product_id,slug,published,image_url,featured,for_wholesale,tags_json) VALUES(?,?,?,?,?,?,?)",
  "ON CONFLICT(product_id) DO UPDATE SET slug=excluded.slug,published=excluded.published,image_url=excluded.image_url,",
  "featured=excluded.featured,for_wholesale=excluded.for_wholesale,tags_json=excluded.tags_json,updated_at=datetime('now')"].join(' '))
   .bind(id,l.slug,l.published,l.image_url,l.featured,l.for_wholesale,l.tags_json)
 ];
 await env.DB.batch(statements);await audit(env,user,'store_product_update',id);return json({ok:true});
}
async function stock(req,env,user,id){
 if(!admin(user))return fail('Somente administradores podem ajustar estoque.',403);
 if(req.method!=='POST')return fail('Método não permitido.',405);
 const body=await req.json(),delta=Number(body.delta),reason=clean(body.reason,80)||'ajuste_manual';
 if(!Number.isSafeInteger(delta)||!integer(Math.abs(delta),1,1000000))return fail('Quantidade inválida.');
 const result=await env.DB.prepare("UPDATE products SET quantity=quantity+?,updated_at=datetime('now') WHERE id=? AND quantity+?>=0").bind(delta,id,delta).run();
 if(!result.meta?.changes)return fail('Produto não encontrado ou estoque insuficiente.',409);
 await env.DB.prepare('INSERT INTO inventory_movements(id,product_id,delta,reason) VALUES(?,?,?,?)').bind(uid(),id,delta,reason).run();
 await audit(env,user,'store_stock',id);return json({ok:true});
}
async function imageUpload(req,env,user,id){
 if(!admin(user))return fail('Somente administradores podem enviar imagens.',403);
 if(req.method!=='POST')return fail('Método não permitido.',405);
 const data=await req.formData(),file=data.get('file');
 if(!file||typeof file.arrayBuffer!=='function'||file.size<1||file.size>850000)return fail('Imagem JPG, PNG ou WEBP até 850 KB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),mime=blobMime(file.name,bytes);
 if(!mime)return fail('Conteúdo da imagem inválido.');
 const row=await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first();
 if(!row)return fail('Produto não encontrado.',404);
 await env.DB.prepare(["INSERT INTO product_media(product_id,mime_type,file_size,body) VALUES(?,?,?,?)",
   "ON CONFLICT(product_id) DO UPDATE SET mime_type=excluded.mime_type,file_size=excluded.file_size,body=excluded.body,updated_at=datetime('now')"].join(' '))
  .bind(id,mime,bytes.length,bytes).run();
 await audit(env,user,'product_photo_upload',id);return json({ok:true,size:bytes.length});
}
export async function storeRoute(req,env,user,path){
 if(path==='/api/store/catalog')return catalogAdmin(req,env,user);
 if(path==='/api/store/settings'){
  if(req.method==='GET')return publicSite(req,env);
  if(req.method!=='PATCH')return fail('Método não permitido.',405);
  if(!admin(user))return fail('Somente administradores podem editar a loja.',403);
  const body=await req.json(),allowed=['announcement','hero_title','hero_subtitle','whatsapp'],updates=[];
  for(const [key,val] of Object.entries(body)){
   if(!allowed.includes(key))return fail('Campo de configuração inválido.');
   const value=clean(val,key==='hero_subtitle'?500:180);
   if(key==='whatsapp'&&!/^[0-9]{10,15}$/.test(value))return fail('Número do WhatsApp inválido.');
   updates.push(env.DB.prepare("INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')").bind(key,value));
  }
  if(!updates.length)return fail('Nenhum campo alterado.');
  await env.DB.batch(updates);await audit(env,user,'store_settings','site');return json({ok:true});
 }
 const match=path.match(/^\/api\/store\/products\/([0-9a-f-]{36})(?:\/(stock|image))?$/);
 if(!match)return fail('Rota da loja não encontrada.',404);
 const id=match[1];
 if(match[2]==='stock')return stock(req,env,user,id);
 if(match[2]==='image')return imageUpload(req,env,user,id);
 return editProduct(req,env,user,id);
}
export async function invoiceRoute(req,env,user,path){
 if(!admin(user))return fail('Somente administradores podem acessar notas.',403);
 if(path==='/api/invoices'&&req.method==='GET'){
  const sql='SELECT id,number,supplier_name,issue_date,total_cents,notes,original_filename,mime_type,file_size,sha256,created_at FROM invoice_documents ORDER BY created_at DESC LIMIT 200';
  const records=await env.DB.prepare(sql).all();return json({items:records.results});
 }
 if(path==='/api/invoices'&&req.method==='POST'){
  const form=await req.formData(),file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function'||file.size<1||file.size>1000000)return fail('Envie um PDF ou XML de até 1 MB.');
  const filename=clean(file.name,120).replace(/[\r\n\\]/g,'_');
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=invoiceMime(filename,bytes);
  if(!mime)return fail('Arquivo inválido: selecione PDF ou XML.');
  const number=clean(form.get('number'),60),supplier_name=clean(form.get('supplier_name'),150),
   issue_date=clean(form.get('issue_date'),10)||null,notes=clean(form.get('notes'),700),
   total_cents=Number(form.get('total_cents')||0);
  if(issue_date&&!/^\d{4}-\d{2}-\d{2}$/.test(issue_date))return fail('Data inválida.');
  if(!integer(total_cents,0,100000000000))return fail('Valor inválido.');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  const id=uid();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO invoice_documents(id,number,supplier_name,issue_date,total_cents,notes,original_filename,mime_type,file_size,sha256,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,number,supplier_name,issue_date,total_cents,notes,filename,mime,bytes.length,hash,user.id),
   env.DB.prepare('INSERT INTO invoice_files(invoice_id,body) VALUES(?,?)').bind(id,bytes)
  ]);
  await audit(env,user,'invoice_upload',id);return json({ok:true,id},201);
 }
 const match=path.match(/^\/api\/invoices\/([0-9a-f-]{36})(?:\/download)?$/);
 if(!match)return fail('Documento não encontrado.',404);
 const id=match[1];
 if(req.method==='GET'&&path.endsWith('/download')){
  const record=await env.DB.prepare('SELECT d.original_filename,f.body FROM invoice_documents d JOIN invoice_files f ON f.invoice_id=d.id WHERE d.id=?').bind(id).first();
  if(!record)return fail('Documento não encontrado.',404);
  return new Response(record.body,{headers:{'Content-Type':'application/octet-stream','X-Content-Type-Options':'nosniff',
   'Cache-Control':'private, no-store','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(record.original_filename)}});
 }
 if(req.method==='DELETE'){
  const deleted=await env.DB.prepare('DELETE FROM invoice_documents WHERE id=?').bind(id).run();
  if(!deleted.meta?.changes)return fail('Documento não encontrado.',404);
  await audit(env,user,'invoice_delete',id);return json({ok:true});
 }
 return fail('Método não permitido.',405);
}
export const __internal={secureUrl,listing,blobMime,invoiceMime};
