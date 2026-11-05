import {test} from 'node:test';
import assert from 'node:assert/strict';
import {variantRoute,galleryRoute,publicOptions,__internal} from '../src/product-options.js';

const PID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN={id:'admin-id',role:'admin'};
const OP={id:'operator-id',role:'operador'};
const parent={id:PID,sku:'SEDA-MODELO',name:'Seda Modelo',category:'sedas',description:'Seda',quantity:0,cost_cents:100,retail_cents:450,wholesale_cents:300,min_quantity:5,active:1};
function fixture(){
 const statements=[],args=[];
 const db={
  prepare(sql){
   statements.push(sql);
   const q={bind(...a){args.push(a);q.args=a;return q},
    async first(){
     if(sql.includes('SELECT * FROM products WHERE id=?'))return parent;
     if(sql.includes('SELECT variant_product_id FROM product_variants'))return null;
     if(sql.includes('COUNT(*) total'))return {total:0};
     return {id:PID,quantity:5};
    },
    async all(){
     if(sql.includes('FROM product_variants v JOIN products'))return {results:[{parent_product_id:PID,id:VID,label:'King Size',sku:'SEDA-KS',quantity:5,active:1,retail_cents:450,wholesale_cents:300}]};
     if(sql.includes('FROM product_gallery'))return {results:[]};
     return {results:[]};
    },
    async run(){return {success:true,meta:{changes:1}}}
   };
   return q;
  },
  async batch(values){return values.map(()=>({success:true,meta:{changes:1}}))}
 };
 return {db,statements,args};
}
function request(path,method='GET',body){
 return new Request('https://crm.example.test'+path,{method,headers:body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{},body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});
}
test('create variation inserts a unique product SKU and attached parent relation',async()=>{
 const {db,statements,args}=fixture();
 const path='/api/store/products/'+PID+'/variants';
 const res=await variantRoute(request(path,'POST',{label:'King Size',sku:'SEDA-KING',quantity:12,min_quantity:3,retail_cents:750,wholesale_cents:520,cost_cents:330}),{DB:db},ADMIN,path);
 assert.equal(res.status,201,await res.clone().text());
 assert.ok(statements.some(s=>s.includes('INSERT INTO products')));
 assert.ok(statements.some(s=>s.includes('INSERT INTO product_variants')));
 assert.ok(statements.some(s=>s.includes('inventory_movements')));
 assert.ok(args.some(a=>a.includes('SEDA-KING')));
});
test('unauthorized operator cannot add options or upload photos',async()=>{
 const {db}=fixture(),path='/api/store/products/'+PID+'/variants';
 const res=await variantRoute(request(path,'POST',{sku:'SEDA-X',label:'Slim'}),{DB:db},OP,path);
 assert.equal(res.status,403);
 const pic='/api/store/products/'+PID+'/gallery',fd=new FormData();
 fd.append('files',new Blob([new Uint8Array([137,80,78,71,13,10,26,10,12])]),'image.png');
 const photo=await galleryRoute(request(pic,'POST',fd),{DB:db},OP,pic);
 assert.equal(photo.status,403);
});
test('public variation metadata is grouped under a single parent product',async()=>{
 const {db}=fixture();
 const map=await publicOptions({DB:db},request('/api/public/catalog'),[parent]);
 const first=map.get(PID);
 assert.equal(first.variants.length,1);
 assert.equal(first.variants[0].sku,'SEDA-KS');
 assert.equal(first.variants[0].quantity,5);
});
test('gallery upload validates magic bytes and limits to 8 real photos',async()=>{
 const {db,statements}=fixture(),path='/api/store/products/'+PID+'/gallery';
 const data=new FormData();
 data.append('files',new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0])]),'photo.png');
 const response=await galleryRoute(request(path,'POST',data),{DB:db},ADMIN,path);
 assert.equal(response.status,201,await response.clone().text());
 assert.ok(statements.some(s=>s.includes('INSERT INTO product_gallery')));
 const invalid=new FormData();
 invalid.append('files',new Blob([new Uint8Array([60,62,120])]),'fake.png');
 const denied=await galleryRoute(request(path,'POST',invalid),{DB:db},ADMIN,path);
 assert.equal(denied.status,400);
});
test('validation rejects invalid variant label and SKU',()=>{
 assert.ok(__internal.variationInput({label:'',sku:'SKU-01'},parent).error);
 assert.throws(()=>__internal.variationInput({label:'Slim',sku:'SKU com espaço'},parent));
});
