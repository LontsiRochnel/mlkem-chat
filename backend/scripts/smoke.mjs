// Test de fumée de l'API REST. Lancer le serveur, puis : npm run smoke
// Les clés envoyées sont aléatoires : seule leur taille est vérifiée par le serveur.
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.API ?? 'http://localhost:3000';

async function call(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const suffix = Date.now().toString(36);
const alice = `alice${suffix}`;
const bob = `bob${suffix}`;
const password = 'motdepasse-test';

console.log('1. Connexion d\'un compte inexistant sans confirmation');
let r = await call('POST', '/auth/login', null, { username: alice, password });
assert.equal(r.status, 409);
assert.equal(r.data.code, 'USER_NOT_FOUND');
console.log('   OK : 409 USER_NOT_FOUND');

console.log('2. Création des comptes après confirmation');
r = await call('POST', '/auth/login', null, { username: alice, password, createIfMissing: true });
assert.equal(r.status, 200);
assert.equal(r.data.created, true);
const aliceToken = r.data.token;
r = await call('POST', '/auth/login', null, { username: bob, password, createIfMissing: true });
const bobToken = r.data.token;
console.log('   OK : comptes créés');

console.log('3. Alice publie sa clé publique (ML-KEM-768, 1184 octets)');
const ek = randomBytes(1184).toString('base64');
r = await call('PUT', '/me/public-key', aliceToken, { variant: 'ML-KEM-768', ek });
assert.equal(r.status, 200);
const fingerprint = createHash('sha3-256').update(Buffer.from(ek, 'base64')).digest('hex').slice(0, 16);
assert.equal(r.data.fingerprint, fingerprint);
console.log(`   OK : empreinte ${r.data.fingerprint}`);

console.log('4. Taille de clé incorrecte refusée');
r = await call('PUT', '/me/public-key', aliceToken, { variant: 'ML-KEM-512', ek });
assert.equal(r.status, 400);
console.log('   OK : 400');

console.log('5. Bob récupère la clé d\'Alice');
r = await call('GET', `/users/${alice}/public-key`, bobToken);
assert.equal(r.status, 200);
assert.equal(r.data.ek, ek);
console.log('   OK');

console.log('6. Bob envoie un texte encapsulé (c de 1088 octets)');
const c = randomBytes(1088).toString('base64');
r = await call('POST', '/messages', bobToken, {
  to: alice,
  kind: 'KEM_CIPHERTEXT',
  body: c,
  variant: 'ML-KEM-768',
  ekFingerprint: fingerprint,
});
assert.equal(r.status, 201);
console.log('   OK');

console.log('7. Un texte de mauvaise taille est refusé');
r = await call('POST', '/messages', bobToken, {
  to: alice,
  kind: 'KEM_CIPHERTEXT',
  body: randomBytes(10).toString('base64'),
  variant: 'ML-KEM-768',
  ekFingerprint: fingerprint,
});
assert.equal(r.status, 400);
console.log('   OK : 400');

console.log('8. Alice voit Bob dans ses conversations, avec le message');
r = await call('GET', '/conversations', aliceToken);
assert.equal(r.status, 200);
assert.ok(r.data.some((conv) => conv.username === bob));
r = await call('GET', `/conversations/${bob}/messages`, aliceToken);
assert.equal(r.data.length, 1);
assert.equal(r.data[0].kind, 'KEM_CIPHERTEXT');
console.log('   OK');

console.log('9. Accès sans jeton refusé');
r = await call('GET', '/conversations', null);
assert.equal(r.status, 401);
console.log('   OK : 401');

console.log('\nTous les contrôles de fumée sont passés.');
