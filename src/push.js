/** Web Push, RFC 8291 / RFC 8188 (aes128gcm), ES256 VAPID (RFC 8292).
 * The Worker only sends to authenticated subscribers. All keys are secrets.
 * If keys are missing, alerts stay in the database and in-app.
 */
const enc=new TextEncoder();
export function b64url(bytes){let result='';const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);for(const v of u)result+=String.fromCharCode(v);return btoa(result).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}
export function un64(value){const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const str=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(str,c=>c.charCodeAt(0))}
function concat(...arrays){const out=new Uint8Array(arrays.reduce((sum,a)=>sum+a.length,0));let index=0;for(const a of arrays){out.set(a,index);index+=a.length}return out}
async function hkdf(salt,ikm,info,length){
 const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));
}
function allowedEndpoint(endpoint){
 try{
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return false;
  const h=u.hostname.toLowerCase();
  return h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='push.services.mozilla.com'||h.endsWith('.push.apple.com')||h==='web.push.apple.com'||h==='push.apple.com'||h.endsWith('.notify.windows.com')||h.endsWith('.windows.com')&&h.includes('notify');
 }catch{return false}
}
export function validateSubscription(sub){
 if(!sub||typeof sub!=='object'||!allowedEndpoint(sub.endpoint))throw new Error('Endpoint push não permitido.');
 const auth=sub.keys?.auth,p256dh=sub.keys?.p256dh;
 if(typeof auth!=='string'||typeof p256dh!=='string')throw new Error('Chaves push inválidas.');
 try{if(un64(auth).length!==16||un64(p256dh).length!==65)throw new Error('Invalid length');}catch{throw new Error('Chaves de inscrição push inválidas.');}
 return {endpoint:sub.endpoint,auth,p256dh};
}
async function vapidToken(env,endpoint){
 const publicBytes=un64(env.VAPID_PUBLIC_KEY),secret=un64(env.VAPID_PRIVATE_KEY);
 if(publicBytes.length!==65||secret.length!==32)throw new Error('Configuração VAPID inválida.');
 const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:b64url(publicBytes.slice(1,33)),y:b64url(publicBytes.slice(33)),d:b64url(secret)}, {name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const header=b64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const body=b64url(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+8*3600,sub:env.VAPID_SUBJECT||'mailto:admin@example.com'})));
 const signature=b64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(header+'.'+body)));
 return header+'.'+body+'.'+signature;
}
async function encryptedPayload(auth,p256dh,payload){
 const clientPublic=un64(p256dh),authenticationSecret=un64(auth);
 const server=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',server.publicKey));
 const receiverPublic=await crypto.subtle.importKey('raw',clientPublic,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverPublic},server.privateKey,256));
 const info=concat(enc.encode('WebPush: info'),new Uint8Array([0]),clientPublic,serverPublic);
 const ikm=await hkdf(authenticationSecret,secret,info,32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const keyBytes=await hkdf(salt,ikm,concat(enc.encode('Content-Encoding: aes128gcm'),new Uint8Array([0])),16);
 const nonce=await hkdf(salt,ikm,concat(enc.encode('Content-Encoding: nonce'),new Uint8Array([0])),12);
 const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
 const text=enc.encode(JSON.stringify(payload));
 if(text.length>3200)throw new Error('Notificação muito grande.');
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,concat(text,new Uint8Array([2]))));
 const rs=4096;
 const header=new Uint8Array([rs>>>24,(rs>>>16)&255,(rs>>>8)&255,rs&255,serverPublic.length]);
 return concat(salt,header,serverPublic,ciphertext);
}
export async function dispatchPush(env,payload){
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return {sent:0,configured:false};
 const list=await env.DB.prepare('SELECT id,endpoint,p256dh,auth FROM push_subscriptions ORDER BY created_at DESC LIMIT 75').all();
 let sent=0;
 for(const sub of list.results){
  try{
   if(!allowedEndpoint(sub.endpoint))continue;
   const body=await encryptedPayload(sub.auth,sub.p256dh,payload);
   const jwt=await vapidToken(env,sub.endpoint);
   const res=await fetch(sub.endpoint,{method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm','TTL':'3600','Authorization':`vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`},body});
   if(res.ok)sent++;
   else if(res.status===404||res.status===410)await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(sub.id).run();
  }catch(err){console.warn('Web Push failed',String(err).slice(0,130))}
 }
 return {sent,configured:true};
}
