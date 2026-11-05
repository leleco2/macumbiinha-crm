import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const payload={
 'auth/me':{user:{id:'u',email:'teste@example.org',role:'admin'}},
 'auth/login':{user:{id:'u',email:'teste@example.org',role:'admin'}},
 'dashboard':{contacts:{total:2,atacado:1,clientes:1},orders:{total:1,novos:0,confirmados:1,vendas_confirmadas:124900},products:{total:2,low:1,units:30},finance:{received:0,spent:0,receivable:124900,payable:0},deals:[],tasks:{pending:1,overdue:0},recent:[],alerts:{unread:0}},
 'orders':{items:[{id:'o1',order_number:'MC-TESTE-01',contact_id:'c1',contact_name:'Cliente Teste',status:'novo',segment:'varejo',payment_status:'pendente',total_cents:8990,created_at:'2026-11-05'}]},
 'contacts':{items:[{id:'c1',name:'Cliente Teste',phone:'21999999999',email:'cliente@example.org',segment:'varejo',status:'cliente',origin:'manual',notes:'',created_at:'2026-11-05'}]},
 'products':{items:[{id:'p1',name:'Produto de Teste',sku:'SKU-01',category:'Acessórios',quantity:20,min_quantity:5,active:1,retail_cents:8990,wholesale_cents:5990,cost_cents:3000}]},
 'deals':{items:[]},'finance':{items:[]},'tasks':{items:[]},'suppliers':{items:[]},'activities':{items:[]},
 'alerts':{items:[]},'reports/financial':{months:[],expense_categories:[],period_balance_cents:0,stock_value_cents:10000,margin_cents:0,receivables:{receivable:0,payable:0}},
 'push/public-key':{configured:false}
};
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const requests=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
   const key=url.pathname.slice(5);
   requests.push({method:req.method,key});
   res.setHeader('content-type','application/json');
   if(key==='auth/me' && (req.headers.cookie||'').includes('mock-login=1')){
     res.statusCode=401;res.end(JSON.stringify({error:'Faça login'}));return;
   }
   res.end(JSON.stringify(payload[key]||{needs_setup:false,ok:true,id:'new-id'}));
   return;
 }
 const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
 const file=resolve(ROOT,rel);
 if(!file.startsWith(ROOT+'/')){res.statusCode=403;return res.end('Forbidden')}
 try{
   const content=await readFile(file);
   res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');
   res.end(content)
 }catch {res.statusCode=404;res.end('Not Found')}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const addr='http://127.0.0.1:'+server.address().port;
let browser;
try{
 const executable=process.env.CHROME_BIN||'/usr/bin/google-chrome';
 browser=await chromium.launch({headless:true,executablePath:executable,args:['--no-sandbox']});
 for(const v of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:v.width,height:v.height},serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('fonts.googleapis.com'))errors.push('Console: '+msg.text())});
  await page.goto(addr,{waitUntil:'domcontentloaded'});
  await page.locator('.page-heading').waitFor({timeout:12000});
  assert.equal(await page.locator('.nav-item').count(),10,'Navigation should load');
  assert.match(await page.locator('#workspace').innerText(),/Visão geral/);
  const sections=['orders','products','contacts','deals','finance','tasks','suppliers','activity','settings'];
  const names={orders:'Pedidos',products:'Produtos e estoque',contacts:'Clientes e leads',deals:'Funil de vendas',finance:'Financeiro',tasks:'Tarefas',suppliers:'Fornecedores',activity:'Histórico',settings:'Configurações'};
  for(const section of sections){
   if(v.name==='mobile')await page.locator('#menu-toggle').click();
   await page.locator('.nav-item[data-nav="'+section+'"]').click();
   try{
     await page.waitForFunction(name=>document.querySelector('#workspace h1')?.textContent?.trim()===name,names[section],{timeout:3500});
   }catch(err){
     console.error('FAILED SECTION',v.name,section,'breadcrumb:',await page.locator('#breadcrumb').innerText(),'content:',(await page.locator('#workspace').innerText()).slice(0,800),'errors:',errors,'requests:',requests.slice(-8));
     throw err;
   }
   console.log(v.name+' navigation '+section+': '+(await page.locator('#workspace h1').innerText()));
   const snapshot=(await page.locator('#workspace').innerText()).slice(0,350);
   assert.ok(!snapshot.includes('Erro ao carregar'),'Section '+section+' failed: '+snapshot);
   assert.equal(await page.locator('.page-heading').count(),1,'No heading: '+section);
  }
  if(v.name==='desktop'){
   await page.locator('.nav-item[data-nav="contacts"]').click();
   await page.waitForFunction(()=>document.querySelector('#workspace h1')?.textContent?.trim()==='Clientes e leads');
   console.log('contacts actions '+JSON.stringify(await page.locator('button[data-action]').evaluateAll(nodes=>nodes.map(n=>n.dataset.action))));
   await page.locator('button[data-action="contact-new"]').first().click({timeout:8000});
   await page.locator('#modal-layer .modal').waitFor();
   await page.locator('#entry-form [name="name"]').fill('Contato validado');
   await page.locator('#entry-form button[type="submit"]').click();
   await page.locator('#modal-layer .modal').waitFor({state:'hidden'});
   assert.ok(requests.some(r=>r.method==='POST'&&r.key==='contacts'),'Contact creation should submit to API');
   await page.locator('#modal-layer .modal').waitFor({state:'hidden'});
   await page.locator('.nav-item[data-nav="products"]').click();
   await page.waitForFunction(()=>document.querySelector('#workspace h1')?.textContent?.trim()==='Produtos e estoque');
   await page.locator('button[data-action="product-new"]').first().click({timeout:8000});
   await page.locator('#modal-layer .modal').waitFor();
   await page.locator('#entry-form [name="name"]').fill('Produto validado');
   await page.locator('#entry-form [name="sku"]').fill('VALIDADO-01');
   await page.locator('#entry-form button[type="submit"]').click();
   await page.locator('#modal-layer .modal').waitFor({state:'hidden'});
   assert.ok(requests.some(r=>r.method==='POST'&&r.key==='products'),'Product creation should submit to API');
   await page.locator('[data-command-open]').click();
   await page.locator('#cmd-input').fill('financeiro');
   await page.locator('.cmd-row').first().click();
   assert.match(await page.locator('#breadcrumb').innerText(),/Financeiro/);
   await page.locator('button[data-action="finance-new"]').first().click();
   await page.locator('#entry-form [name="title"]').fill('Financeiro validado');
   await page.locator('#entry-form [name="amount_real"]').fill('189,90');
   await page.locator('#entry-form button[type="submit"]').click();
   await page.locator('#modal-layer .modal').waitFor({state:'hidden'});
   assert.ok(requests.some(r=>r.method==='POST'&&r.key==='finance'),'Finance creation should submit to API');
   await page.locator('[data-experience="theme"]').first().click();
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
   await page.locator('.quick-create').click();
   await page.locator('#modal-layer .modal').waitFor();
   console.log('order form validity',await page.locator('#order-form').evaluate(n=>({valid:n.checkValidity(),invalid:[...n.querySelectorAll(':invalid')].map(x=>({name:x.name,message:x.validationMessage})),fields:[...n.querySelectorAll('input,select')].map(x=>({name:x.name,value:x.value}))})));
   await page.locator('#order-form button[type="submit"]').click();
   await page.waitForTimeout(350);
   console.log('order requests',JSON.stringify(requests.slice(-12)),'modal still exists',await page.locator('#order-form').count());
   assert.ok(requests.some(r=>r.method==='POST'&&r.key==='orders'),'Order creation should submit to API: '+JSON.stringify(requests.slice(-12)));
   await page.locator('#modal-layer .modal').waitFor({state:'hidden'});
  }
  assert.deepEqual(errors,[],v.name+' browser errors');
  console.log(v.name+': 9 menus, form actions, theme, command palette, quick-create passed; API calls '+requests.length);
  await context.close();
 }
 const loginContext=await browser.newContext({serviceWorkers:'block'});
 await loginContext.addCookies([{name:'mock-login',value:'1',url:addr}]);
 const loginPage=await loginContext.newPage();
 await loginPage.goto(addr,{waitUntil:'domcontentloaded'});
 await loginPage.locator('#login-form').waitFor({timeout:12000});
 await loginPage.locator('#login-form [name=email]').fill('teste@example.org');
 await loginPage.locator('#login-form [name=password]').fill('senha-de-teste');
 await loginPage.locator('#login-form button[type=submit]').click();
 await loginPage.locator('.page-heading').waitFor({timeout:12000});
 console.log('login submitted and returned to dashboard');
 await loginContext.close();
}catch(e){console.error(e);process.exitCode=1}
finally{await browser?.close();await new Promise(done=>server.close(done))}
