import {test} from 'node:test';
import assert from 'node:assert/strict';
import {b64url,un64,dispatchPush} from '../src/push.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const concat=(...xs)=>{const out=new Uint8Array(xs.reduce((sum,x)=>sum+x.length,0));let offset=0;for(const x of xs){out.set(x,offset);offset+=x.length}return out};
async function hkdf(salt,ikm,info,length){const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8))}

test('Web Push criptografa payload e gera assinatura VAPID ES256 verificável',async()=>{
 const vapid=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',vapid.publicKey));
 const priv=await crypto.subtle.exportKey('jwk',vapid.privateKey);
 const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const clientPub=new Uint8Array(await crypto.subtle.exportKey('raw',client.publicKey));
 const auth=crypto.getRandomValues(new Uint8Array(16));
 const sub={id:'one',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:b64url(clientPub),auth:b64url(auth)};
 const env={VAPID_PUBLIC_KEY:b64url(pub),VAPID_PRIVATE_KEY:priv.d,VAPID_SUBJECT:'mailto:responsavel@example.org',DB:{prepare:()=>({all:async()=>({results:[sub]})})}};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,sub.endpoint);
  assert.equal(options.headers['Content-Encoding'],'aes128gcm');
  const token=options.headers.Authorization.match(/vapid t=([^,]+),/)[1];
  const parts=token.split('.');
  assert.equal(parts.length,3);
  const payload=JSON.parse(decoder.decode(un64(parts[1])));
  assert.equal(payload.aud,'https://fcm.googleapis.com');
  assert.equal(payload.sub,'mailto:responsavel@example.org');
  const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vapid.publicKey,un64(parts[2]),encoder.encode(parts[0]+'.'+parts[1]));
  assert.equal(valid,true);
  const raw=new Uint8Array(options.body);
  const salt=raw.slice(0,16),rs=new DataView(raw.buffer).getUint32(16),idlen=raw[20],serverPub=raw.slice(21,21+idlen),cipher=raw.slice(21+idlen);
  assert.equal(rs,4096);assert.equal(idlen,65);
  const imported=await crypto.subtle.importKey('raw',serverPub,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:imported},client.privateKey,256));
  const ikm=await hkdf(auth,secret,concat(encoder.encode('WebPush: info'),new Uint8Array([0]),clientPub,serverPub),32);
  const keyMaterial=await hkdf(salt,ikm,concat(encoder.encode('Content-Encoding: aes128gcm'),new Uint8Array([0])),16);
  const nonce=await hkdf(salt,ikm,concat(encoder.encode('Content-Encoding: nonce'),new Uint8Array([0])),12);
  const key=await crypto.subtle.importKey('raw',keyMaterial,'AES-GCM',false,['decrypt']);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,cipher));
  assert.equal(plain.at(-1),2);
  assert.deepEqual(JSON.parse(decoder.decode(plain.slice(0,-1))),{title:'Teste',body:'Venda recebida',url:'/'});
  return {ok:true,status:201};
 };
 try{const res=await dispatchPush(env,{title:'Teste',body:'Venda recebida',url:'/'});assert.deepEqual(res,{sent:1,configured:true})}
 finally{globalThis.fetch=original}
});
