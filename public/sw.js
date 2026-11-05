/* Macumbiinha CRM service worker.
   Network-first UI, cache-only fallback when offline; APIs are never cached. */
const CACHE='macumbiinha-crm-shell-v4';
const STATIC=[
  '/', '/app.css','/studio.css','/refined.css','/app.js','/interface.js',
  '/experience.js','/finance-analytics.js','/icon.svg','/icon-192.png',
  '/icon-512.png','/manifest.webmanifest'
];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok&&STATIC.includes(url.pathname)){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}
  return response;
 }).catch(async()=>{
  const stored=await caches.match(event.request);
  return stored||new Response('Sem conexão. Reconecte-se à internet para continuar.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }));
});
self.addEventListener('push',event=>{
 let payload={title:'Macumbiinha CRM',body:'Uma atualização precisa da sua atenção.',url:'/'};
 try{if(event.data)payload={...payload,...event.data.json()}}catch{}
 event.waitUntil(self.registration.showNotification(payload.title,{
  body:payload.body,icon:'/icon-192.png',badge:'/icon-192.png',
  tag:payload.tag||'crm-alert',data:{url:payload.url||'/'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
  const target=clients.find(client=>new URL(client.url).origin===self.location.origin);
  if(target){target.focus();return target.navigate(event.notification.data?.url||'/')}
  return self.clients.openWindow(event.notification.data?.url||'/');
 }));
});
