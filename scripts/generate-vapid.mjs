import {generateKeyPairSync} from 'node:crypto';
// Run locally. Do not commit, print or log the private key outside setup.
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const pub=pair.publicKey.export({format:'jwk'});
const priv=pair.privateKey.export({format:'jwk'});
const raw=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,'base64url'),Buffer.from(pub.y,'base64url')]);
if(raw.length!==65||!priv.d)throw Error('Invalid VAPID keys');
process.stdout.write(JSON.stringify({public:raw.toString('base64url'),private:priv.d}));
