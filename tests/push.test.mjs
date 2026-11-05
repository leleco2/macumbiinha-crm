import {test} from 'node:test';import assert from 'node:assert/strict';
import {b64url,un64,validateSubscription} from '../src/push.js';
const bytes=new Uint8Array([0,32,252,253,254,255]);
test('base64url codifica chave binária sem padding',()=>assert.deepEqual([...un64(b64url(bytes))],[...bytes]));
test('rejeita inscrições SSRF e chaves inválidas',()=>{
 assert.throws(()=>validateSubscription({endpoint:'http://127.0.0.1:4000',keys:{}}),/não permitido/);
 assert.throws(()=>validateSubscription({endpoint:'https://example.org/send',keys:{}}),/não permitido/);
 assert.throws(()=>validateSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'wrong',auth:'x'}}),/inválidas/);
});
test('aceita formato correto do endpoint e chaves',()=>{
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:b64url(new Uint8Array(65).fill(2)),auth:b64url(new Uint8Array(16).fill(3))}};
 assert.deepEqual(validateSubscription(sub),{endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth:sub.keys.auth});
});
