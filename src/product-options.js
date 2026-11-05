/* Variant inventory and photo galleries for Macumbiinha.
   Each variant is a real SKU in products so ERP order triggers debit the correct stock. */
import {productFields,clean,integer} from './validators.js';

const out=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const error=(message,status=400)=>out({error:message},status);
const id=()=>crypto.randomUUID();
const isAdmin=user=>user?.role==='admin';
const validId=s=>/^[a-f0-9-]{36}$/.test(s);
const mimeOf=(name,b)=>{
 const ext=String(name).toLowerCase();
 if(ext.endsWith('.png')&&b.length>=8&&b.slice(0,8).join(',')==='137,80,78,71,13,10,26,10')return 'image/png';
 if(/\.(jpg|jpeg)$/.test(ext)&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(ext.endsWith('.webp')&&b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
 return '';
};
const audit=(env,user,action,target)=>env.DB.prepare('INSERT INTO audit_events(id,actor_id,action,target_id) VALUES(?,?,?,?)').bind(id(),user.id,action,target).run();
const photoUrl=(req,idValue)=>new URL('/api/public/gallery/'+idValue,req.url).href;
function variationInput(body,parent,old=null){
 const label=clean(body.label??old?.label,100);
 if(!label)return {error:'Informe o nome da variação (ex.: King Size, Slim ou sabor).'};
 const sku=String(body.sku??old?.sku??'').trim().toUpperCase();
 const fields=productFields({
  sku,name:(parent.name+' - '+label).slice(0,170),category:parent.category,
  description:parent.description,cost_cents:body.cost_cents??old?.cost_cents??parent.cost_cents,
  retail_cents:body.retail_cents??old?.retail_cents??parent.retail_cents,
  wholesale_cents:body.wholesale_cents??old?.wholesale_cents??parent.wholesale_cents,
  quantity:old?.quantity??body.quantity??0,min_quantity:body.min_quantity??old?.min_quantity??parent.min_quantity,
  active:body.active??old?.active??1
 });
 const position=Number(body.position??old?.position??0);
 if(!integer(position,0,1000))return {error:'Ordem da variação inválida.'};
 return {label,sku:fields.sku,fields,position};
}
async function parentRecord(env,parentId){
 const parent=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(parentId).first();
 if(!parent)return null;
 const nested=await env.DB.prepare('SELECT variant_product_id FROM product_variants WHERE variant_product_id=?').bind(parentId).first();
 return nested?null:parent;
}
async function childRecord(env,parentId,variantId){
 return env.DB.prepare('SELECT p.*,v.label,v.position FROM product_variants v JOIN products p ON p.id=v.variant_product_id WHERE v.parent_product_id=? AND p.id=?').bind(parentId,variantId).first();
}
export async function variantRoute(req,env,user,path){
 const route=path.match(/^\/api\/store\/products\/([a-f0-9-]{36})\/variants(?:\/([a-f0-9-]{36})(?:\/stock)?)?$/);
 if(!route)return error('Variação não encontrada.',404);
 const parentId=route[1],variantId=route[2],parent=await parentRecord(env,parentId);
 if(!parent)return error('Produto principal não encontrado.',404);
 if(!variantId&&req.method==='GET'){
  const result=await env.DB.prepare('SELECT p.*,v.label,v.position FROM product_variants v JOIN products p ON p.id=v.variant_product_id WHERE v.parent_product_id=? ORDER BY v.position,v.label LIMIT 50').bind(parentId).all();
  return out({items:result.results});
 }
 if(!isAdmin(user))return error('Somente administradores podem alterar variações.',403);
 if(!variantId&&req.method==='POST'){
  const count=await env.DB.prepare('SELECT count(*) total FROM product_variants WHERE parent_product_id=?').bind(parentId).first();
  if(count?.total>=30)return error('Limite de 30 variações por produto.',409);
  const data=variationInput(await req.json(),parent);
  if(data.error)return error(data.error);
  const vid=id(),p=data.fields;
  const batch=[
   env.DB.prepare('INSERT INTO products(id,sku,name,category,description,cost_cents,retail_cents,wholesale_cents,quantity,min_quantity,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(vid,p.sku,p.name,p.category,p.description,p.cost_cents,p.retail_cents,p.wholesale_cents,p.quantity,p.min_quantity,p.active),
   env.DB.prepare('INSERT INTO product_variants(variant_product_id,parent_product_id,label,position) VALUES(?,?,?,?)').bind(vid,parentId,data.label,data.position)
  ];
  if(p.quantity>0)batch.push(env.DB.prepare('INSERT INTO inventory_movements(id,product_id,delta,reason) VALUES(?,?,?,?)').bind(id(),vid,p.quantity,'estoque_inicial_variacao'));
  await env.DB.batch(batch);await audit(env,user,'variant_create',vid);
  return out({ok:true,id:vid},201);
 }
 if(!variantId)return error('Método não permitido.',405);
 const current=await childRecord(env,parentId,variantId);
 if(!current)return error('Variação não encontrada.',404);
 if(req.method==='POST'&&path.endsWith('/stock')){
  const body=await req.json(),delta=Number(body.delta),reason=clean(body.reason,80)||'ajuste_variacao';
  if(!Number.isSafeInteger(delta)||!integer(Math.abs(delta),1,1000000))return error('Quantidade inválida.');
  const changed=await env.DB.prepare("UPDATE products SET quantity=quantity+?,updated_at=datetime('now') WHERE id=? AND quantity+?>=0").bind(delta,variantId,delta).run();
  if(!changed.meta?.changes)return error('Estoque insuficiente.',409);
  await env.DB.prepare('INSERT INTO inventory_movements(id,product_id,delta,reason) VALUES(?,?,?,?)').bind(id(),variantId,delta,reason).run();
  await audit(env,user,'variant_stock',variantId);return out({ok:true});
 }
 if(req.method==='PATCH'&&path.endsWith('/'+variantId)){
  const data=variationInput(await req.json(),parent,current);
  if(data.error)return error(data.error);
  const p=data.fields;
  await env.DB.batch([
   env.DB.prepare("UPDATE products SET sku=?,name=?,category=?,description=?,cost_cents=?,retail_cents=?,wholesale_cents=?,min_quantity=?,active=?,updated_at=datetime('now') WHERE id=?")
    .bind(p.sku,p.name,p.category,p.description,p.cost_cents,p.retail_cents,p.wholesale_cents,p.min_quantity,p.active,variantId),
   env.DB.prepare('UPDATE product_variants SET label=?,position=? WHERE variant_product_id=? AND parent_product_id=?').bind(data.label,data.position,variantId,parentId)
  ]);
  await audit(env,user,'variant_update',variantId);return out({ok:true});
 }
 return error('Método não permitido.',405);
}
export async function galleryRoute(req,env,user,path){
 const match=path.match(/^\/api\/store\/products\/([a-f0-9-]{36})\/gallery(?:\/([a-f0-9-]{36})(?:\/cover)?)?$/);
 if(!match)return error('Galeria não encontrada.',404);
 const productId=match[1],imageId=match[2];
 const product=await env.DB.prepare('SELECT id FROM products WHERE id=?').bind(productId).first();
 if(!product)return error('Produto não encontrado.',404);
 if(req.method==='GET'&&!imageId){
  const records=await env.DB.prepare('SELECT id,file_name,mime_type,file_size,sort_order,created_at FROM product_gallery WHERE product_id=? ORDER BY sort_order,created_at').bind(productId).all();
  return out({items:records.results});
 }
 if(!isAdmin(user))return error('Somente administradores podem enviar fotos.',403);
 if(req.method==='POST'&&!imageId){
  const form=await req.formData(),files=form.getAll('files').filter(file=>file&&typeof file.arrayBuffer==='function'&&file.size);
  if(!files.length||files.length>8)return error('Selecione de 1 a 8 imagens por envio.');
  const count=await env.DB.prepare('SELECT COUNT(*) total FROM product_gallery WHERE product_id=?').bind(productId).first();
  if((count?.total||0)+files.length>8)return error('Máximo de 8 fotos por produto/variação.',409);
  const statements=[];
  for(let index=0;index<files.length;index++){
   const file=files[index];if(file.size>850000)return error('Cada imagem deve ter até 850 KB.');
   const bytes=new Uint8Array(await file.arrayBuffer()),mime=mimeOf(file.name,bytes);
   if(!mime)return error('Formato inválido. Use imagens JPG, PNG ou WEBP reais.');
   statements.push(env.DB.prepare('INSERT INTO product_gallery(id,product_id,file_name,mime_type,file_size,sort_order,body) VALUES(?,?,?,?,?,?,?)')
    .bind(id(),productId,clean(file.name,150),mime,bytes.length,(count?.total||0)+index,bytes));
  }
  await env.DB.batch(statements);await audit(env,user,'product_gallery_upload',productId);
  return out({ok:true,count:files.length},201);
 }
 const entry=await env.DB.prepare('SELECT id FROM product_gallery WHERE id=? AND product_id=?').bind(imageId,productId).first();
 if(!entry)return error('Foto não encontrada.',404);
 if(req.method==='DELETE'&&!path.endsWith('/cover')){
  await env.DB.prepare('DELETE FROM product_gallery WHERE id=? AND product_id=?').bind(imageId,productId).run();
  await audit(env,user,'product_gallery_delete',imageId);return out({ok:true});
 }
 if(req.method==='POST'&&path.endsWith('/cover')){
  await env.DB.batch([
   env.DB.prepare('UPDATE product_gallery SET sort_order=sort_order+1 WHERE product_id=?').bind(productId),
   env.DB.prepare('UPDATE product_gallery SET sort_order=0 WHERE id=? AND product_id=?').bind(imageId,productId)
  ]);
  await audit(env,user,'product_gallery_cover',imageId);return out({ok:true});
 }
 return error('Método não permitido.',405);
}
export async function publicGalleryPhoto(req,env,path){
 const match=path.match(/^\/api\/public\/gallery\/([a-f0-9-]{36})$/);
 if(!match||req.method!=='GET')return error('Foto não encontrada.',404);
 const sql=[
  'SELECT g.body,g.mime_type FROM product_gallery g',
  'JOIN products p ON p.id=g.product_id',
  'LEFT JOIN product_variants v ON v.variant_product_id=p.id',
  'JOIN products parent ON parent.id=COALESCE(v.parent_product_id,p.id)',
  'JOIN catalog_listings c ON c.product_id=parent.id',
  'WHERE g.id=? AND c.published=1 AND p.active=1 AND parent.active=1'
 ].join(' ');
 const row=await env.DB.prepare(sql).bind(match[1]).first();
 if(!row)return error('Foto não encontrada.',404);
 return new Response(row.body,{headers:{'Content-Type':row.mime_type,'Cache-Control':'public, max-age=120','X-Content-Type-Options':'nosniff'}});
}
export async function publicOptions(env,req,parents){
 if(!parents.length)return new Map();
 const variants=await env.DB.prepare('SELECT v.parent_product_id,v.variant_product_id AS id,v.label,v.position,p.sku,p.retail_cents,p.wholesale_cents,p.quantity,p.active FROM product_variants v JOIN products p ON p.id=v.variant_product_id ORDER BY v.position,v.label LIMIT 2500').all();
 const galleries=await env.DB.prepare('SELECT id,product_id,file_name,sort_order FROM product_gallery ORDER BY sort_order,created_at LIMIT 8000').all();
 const galleryBy=new Map();
 for(const media of galleries.results){
  if(!galleryBy.has(media.product_id))galleryBy.set(media.product_id,[]);
  galleryBy.get(media.product_id).push(photoUrl(req,media.id));
 }
 const group=new Map();
 for(const item of variants.results){
  if(!group.has(item.parent_product_id))group.set(item.parent_product_id,[]);
  group.get(item.parent_product_id).push({...item,available:item.active===1&&item.quantity>0,image_url:galleryBy.get(item.id)?.[0]||'',gallery:galleryBy.get(item.id)||[]});
 }
 const result=new Map();
 for(const parent of parents){
  result.set(parent.id,{variants:group.get(parent.id)||[],gallery:galleryBy.get(parent.id)||[]});
 }
 return result;
}
export async function adminOptions(env){
 const [variants,galleries]=await Promise.all([
  env.DB.prepare('SELECT v.parent_product_id,v.variant_product_id AS id,v.label,v.position,p.* FROM product_variants v JOIN products p ON p.id=v.variant_product_id ORDER BY v.position,v.label LIMIT 2500').all(),
  env.DB.prepare('SELECT id,product_id,file_name,file_size,sort_order FROM product_gallery ORDER BY sort_order,created_at LIMIT 8000').all()
 ]);
 return {variants:variants.results,galleries:galleries.results};
}
export const __internal={mimeOf,variationInput};
