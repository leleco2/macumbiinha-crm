import {test} from 'node:test';
import assert from 'node:assert/strict';
import {__internal,publicCatalog,publicSite,storeRoute,invoiceRoute} from '../src/commerce-hub.js';

function mockDB(){
 const sql=[],args=[];
 const prepare=query=>{
  sql.push(query);
  const handle={
   bind(...items){args.push(items);return handle},
   async all(){
    if(query.includes('FROM products p JOIN catalog_listings'))return {results:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sku:'SKU-01',slug:'sku-01',name:'Produto de exemplo',category:'acessorios',description:'',retail_cents:1000,wholesale_cents:850,quantity:12,has_image:0,featured:0,for_wholesale:1,tags_json:'[]',image_url:'',cost_cents:999999}]};
    if(query.includes('FROM site_settings'))return{results:[{key:'whatsapp',value:'5521999999999'}]};
    return{results:[]};
   },
   async first(){return {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',quantity:12}},
   async run(){return {success:true,meta:{changes:1}}}
  };return handle;
 };
 return {sql,args,db:{prepare,async batch(queries){return queries.map(()=>({success:true,meta:{changes:1}}))}}};
}
function mkReq(path,method='GET',body,origin='https://macumbiinha.pages.dev'){
 const headers={Origin:origin};
 let requestBody;
 if(body instanceof FormData)requestBody=body;
 else if(body!==undefined){headers['Content-Type']='application/json';requestBody=JSON.stringify(body)}
 return new Request('https://crm.example.org'+path,{method,headers,body:requestBody});
}
const ADMIN={id:'u1',role:'admin'},OPERATOR={id:'u2',role:'operador'};
test('public catalog contains publishable inventory data but never cost/fornecedor',async()=>{
 const {db}=mockDB();
 const res=await publicCatalog(mkReq('/api/public/catalog'),{DB:db,SITE_ORIGIN:'https://macumbiinha.pages.dev'});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://macumbiinha.pages.dev');
 const data=await res.json();assert.equal(data.source,'macumbiinha-crm');
 assert.equal(data.items[0].sku,'SKU-01');assert.equal(data.items[0].retail_cents,1000);
 assert.ok(!JSON.stringify(data).includes('999999'));
 assert.ok(!JSON.stringify(data).includes('cost_cents'));
});
test('public settings expose only configured entries',async()=>{
 const {db}=mockDB();const res=await publicSite(mkReq('/api/public/site'),{DB:db});
 assert.equal((await res.json()).settings.whatsapp,'5521999999999');
});
test('only admins can change stock and upload invoice',async()=>{
 const {db}=mockDB();const env={DB:db};
 const res=await storeRoute(mkReq('/api/store/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/stock','POST',{delta:6,reason:'compra'}),env,OPERATOR,'/api/store/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/stock');
 assert.equal(res.status,403);
 const invoice=await invoiceRoute(mkReq('/api/invoices','GET'),env,OPERATOR,'/api/invoices');
 assert.equal(invoice.status,403);
});
test('admin stock adjustment writes movement and audit',async()=>{
 const {db,sql}=mockDB();const env={DB:db};
 const path='/api/store/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/stock';
 const res=await storeRoute(mkReq(path,'POST',{delta:4,reason:'entrada de nota'}),env,ADMIN,path);
 assert.equal(res.status,200);
 assert.ok(sql.some(s=>s.includes('UPDATE products SET quantity')));
 assert.ok(sql.some(s=>s.includes('inventory_movements')));
});
test('product listing rejects insecure URLs and malformed slug',()=>{
 assert.throws(()=>__internal.listing({slug:'sem espaço',published:1},'SKU-01'));
 assert.throws(()=>__internal.listing({slug:'seguro',image_url:'http://host/image.jpg'},'SKU-01'));
 assert.equal(__internal.listing({slug:'sku-01',published:1,featured:true,tags:['promoção']},'SKU-01').published,1);
});
test('uploads validate magic bytes, extensions, never trust provided MIME',()=>{
 assert.equal(__internal.invoiceMime('nota.pdf',new Uint8Array([37,80,68,70,45,49,46,55])),'application/pdf');
 assert.equal(__internal.invoiceMime('nota.pdf',new Uint8Array([60,63,120,109,108])), '');
 assert.equal(__internal.invoiceMime('arquivo.xml',new TextEncoder().encode('<?xml version="1.0"?><NFe/>')),'application/xml');
 assert.equal(__internal.blobMime('foto.png',new Uint8Array([137,80,78,71,13,10,26,10,0])), 'image/png');
 assert.equal(__internal.blobMime('foto.jpg',new Uint8Array([60,63,120,109,108])), '');
});
