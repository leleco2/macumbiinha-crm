import threading, http.server, pathlib, json, socketserver, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]/'public'
DATA={
 'contacts': {'items':[{'id':'c1','name':'Lucas Martins','phone':'(21) 99999-1111','email':'lucas@example.org','segment':'varejo','status':'cliente','origin':'manual','notes':'','created_at':'2026-11-05'}, {'id':'c2','name':'Fernanda Silva','phone':'(21) 99999-2222','email':'fernanda@example.org','segment':'atacado','status':'lead','origin':'site','notes':'','created_at':'2026-11-05'}]},
 'products': {'items':[{'id':'p1','name':'Case Impermeável Slim','sku':'CASE-01','category':'cases','quantity':28,'min_quantity':5,'active':1,'retail_cents':8990,'wholesale_cents':5990,'cost_cents':3400}, {'id':'p2','name':'Dichavador Metal 4 Partes','sku':'DIC-02','category':'dichavadores','quantity':2,'min_quantity':6,'active':1,'retail_cents':4990,'wholesale_cents':3100,'cost_cents':1700}]},
 'orders': {'items':[{'id':'o1','order_number':'MC-2601-ABCDE','contact_id':'c2','contact_name':'Fernanda Silva','status':'confirmado','segment':'atacado','payment_status':'pendente','total_cents':124900,'created_at':'2026-11-05'}]},
 'deals': {'items':[{'id':'d1','title':'Revenda de kits','contact_id':'c2','contact_name':'Fernanda Silva','stage':'negociacao','segment':'atacado','amount_cents':275000,'origin':'site'}]},
 'finance': {'items':[{'id':'f1','title':'Pedido MC-2601-ABCDE','category':'vendas','amount_cents':124900,'type':'receita','status':'pendente','due_date':'2026-11-12','method':'pix'}]},
 'tasks': {'items':[{'id':'t1','title':'Confirmar reposição','description':'Cases impermeáveis','due_date':'2026-11-09','completed':0}]},
 'suppliers': {'items':[]},'activities':{'items':[]},'alerts':{'items':[]},'reports/financial':{'months':[{'month':'2026-11','income_cents':150000,'expense_cents':60000}],'margin_cents':120000,'stock_value_cents':144000,'receivables':{'receivable':124900,'payable':0}},
 'dashboard':{'contacts':{'total':2,'atacado':1,'clientes':1},'orders':{'total':1,'novos':0,'confirmados':1,'vendas_confirmadas':124900},'products':{'total':2,'low':1,'units':30},'finance':{'received':0,'spent':0,'receivable':124900,'payable':0},'deals':[{'stage':'negociacao','total':1,'value_cents':275000}],'tasks':{'pending':1,'overdue':0},'recent':[{'kind':'pedido','summary':'Pedido confirmado de Fernanda Silva','created_at':'2026-11-05'}],'alerts':{'unread':1}}
}
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  path=urlparse(self.path).path
  if path.startswith('/api/'):
   name=path[5:]
   payload= {'user':{'id':'u','email':'gestao@macumbiinha.com.br','role':'admin'}} if name=='auth/me' else DATA.get(name,{'error':'not found'})
   data=json.dumps(payload).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if path=='/':path='/index.html'
  file=(ROOT/path.lstrip('/')).resolve()
  if not file.is_relative_to(ROOT) or not file.exists():self.send_error(404);return
  types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
  data=file.read_bytes();self.send_response(200);self.send_header('Content-Type',types.get(file.suffix,'application/octet-stream'));self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):self.handle_write()
 def do_PATCH(self):self.handle_write()
 def handle_write(self):
  data=b'{"ok":true,"id":"new-id"}';self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
class ThreadingHTTPServer(socketserver.ThreadingMixIn,http.server.HTTPServer):daemon_threads=True
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_address[1]}'
html=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="/app.css">','<style>'+ (ROOT/'app.css').read_text() +'</style>').replace('<script type="module" src="/app.js"></script>','<script>'+ (ROOT/'app.js').read_text().replace('</script>','<\/script>') +'</script>')
mock_js="""window.fetch=async function(url,opts={}){
 const key=String(url).replace(/^\/api\//,'').split('?')[0];
 const payload=key==='auth/me'?{user:{id:'u',email:'gestao@macumbiinha.com.br',role:'admin'}}:(window.__mockData[key]||{ok:true,id:'new-id'});
 return {ok:true,status:200,json:async()=>payload};
};"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-web-security'])
 for label,width,height in [('desktop',1440,980),('mobile',390,844)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto('about:blank')
  page.evaluate('window.__mockData = '+json.dumps(DATA))
  page.evaluate(mock_js)
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('.page-heading').wait_for(timeout=10000)
  page.screenshot(path=str(ROOT.parent/f'preview-{label}.png'),full_page=True)
  for section in ['orders','products','contacts','deals','finance','tasks','suppliers','settings']:
   if label=='mobile':page.locator('#menu-toggle').click();page.wait_for_timeout(100)
   page.locator(f'button[data-nav="{section}"]').first.click()
   page.locator('.page-heading').wait_for(timeout=10000)
  if label=='desktop':
   page.locator('button[data-nav="products"]').first.click()
   page.locator('button[data-action="product-new"]').first.click()
   page.locator('#entry-form').wait_for(timeout=10000)
   page.screenshot(path=str(ROOT.parent/'preview-product-form.png'),full_page=False)
  print(label,'JS errors:',errors[:6],'title:',page.title())
  assert not errors,errors
  page.close()
 browser.close()
