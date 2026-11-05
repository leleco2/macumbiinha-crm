import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const originalFetch=globalThis.fetch;
function dbMock(){
 const events=[],sql=[];
 const db={prepare(statement){sql.push(statement);return {bind(...args){this.args=args;return this;},async first(){
   if(statement.includes('public_form_limits'))return null;
   if(statement.includes('integration_events'))return events.find(x=>x.id===this.args?.[0])||null;
   if(statement.includes('SELECT id FROM contacts'))return null;
   return null;
  },async all(){return {results:[]}},async run(){if(statement.includes('INSERT OR IGNORE INTO integration_events'))events.push({id:this.args[0]});return {success:true}}}},async batch(){return[]}};
 return {db,sql,events};
}
const baseEnv={SITE_ORIGIN:'https://macumbiinha.pages.dev',TURNSTILE_SECRET:'local-test-secret',TURNSTILE_SITE_KEY:'public-test-key',FORM_SALT:'local-test-salt'};
function req(path,method='GET',body,origin=baseEnv.SITE_ORIGIN){return new Request('https://crm.example.net'+path,{method,headers:{...(origin?{'Origin':origin}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})}

test('config: permite consulta pública sem divulgar segredos',async()=>{
 const {db}=dbMock();const res=await worker.fetch(req('/api/public/config'),{...baseEnv,DB:db});
 assert.equal(res.status,200);assert.equal(res.headers.get('Access-Control-Allow-Origin'),baseEnv.SITE_ORIGIN);
 const body=await res.json();assert.equal(body.site_key,'public-test-key');assert.equal(body.form_enabled,true);assert.equal(JSON.stringify(body).includes('local-test-secret'),false);
});
test('lead público: Turnstile obrigatório e origem restrita',async()=>{
 const {db}=dbMock();const env={...baseEnv,DB:db};
 const wrong=await worker.fetch(req('/api/public/lead','POST',{consent:true,turnstile_token:'some-token'},'https://evil.example'),env);
 assert.equal(wrong.status,403);
 const missing=await worker.fetch(req('/api/public/lead','POST',{consent:true,turnstile_token:'some-token'}),{...env,TURNSTILE_SECRET:''});
 assert.equal(missing.status,503);
});
test('lead público: registra interesse, não confirma venda nem altera estoque',async()=>{
 const {db,sql,events}=dbMock();const env={...baseEnv,DB:db};
 globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:'macumbiinha.pages.dev',action:'crm_request'}),{headers:{'Content-Type':'application/json'}});
 try {
 const data={request_id:'3c034a4c-7d50-4988-b1ba-8f92104f2cc9',name:'Cliente Teste',phone:'21999999999',email:'',segment:'atacado',message:'Quero orçamento',items:[{sku:'SEDA-ELEMENTS',quantity:4}],turnstile_token:'token-valido',consent:true};
 const res=await worker.fetch(req('/api/public/lead','POST',data),env);
 assert.equal(res.status,202,await res.clone().text());
 assert.equal(events.length,1);
 assert.ok(sql.some(s=>s.includes('INSERT INTO deals')));
 assert.equal(sql.some(s=>s.includes('INSERT INTO orders')),false);
 assert.equal(sql.some(s=>s.includes('UPDATE products')),false);
 const duplicate=await worker.fetch(req('/api/public/lead','POST',data),env);
 assert.equal(duplicate.status,200);
 } finally {globalThis.fetch=originalFetch}
});
