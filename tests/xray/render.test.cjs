'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderNewNodeArtifacts, renderClientArtifacts } = require('../../scripts/xray/render.cjs');

// Published RFC 7748 test vector and reserved addresses for offline tests.
const privateKey = Buffer.from(
  '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a', 'hex'
).toString('base64url');
const publicKey = Buffer.from(
  '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a', 'hex'
).toString('base64url');

function sample() {
  return {
    address: 'vps.example.invalid',
    port: 8443,
    serverName: 'reality.example.invalid',
    target: { host: 'reality.example.invalid', port: 443 },
    privateKey,
    windows: { id: '00000000-0000-4000-8000-000000000001', shortId: '01' },
    iphone: { id: '00000000-0000-4000-8000-000000000002', shortId: '02' }
  };
}

test('new node aligns listener, transport, public key, SNI and separate device credentials', () => {
  const input = sample();
  const { server, windows, iphone } = renderNewNodeArtifacts(input);
  const [listener] = server.inbounds;
  const { realitySettings } = listener.streamSettings;
  const share = new URL(iphone.qrPayload);

  assert.equal(listener.port, input.port);
  assert.equal(listener.protocol, 'vless');
  assert.equal(listener.settings.decryption, 'none');
  assert.equal(listener.streamSettings.network, 'raw');
  assert.equal(listener.streamSettings.security, 'reality');
  assert.equal(realitySettings.target, 'reality.example.invalid:443');
  assert.deepEqual(realitySettings.serverNames, [input.serverName]);
  assert.equal(realitySettings.privateKey, privateKey);
  assert.deepEqual(realitySettings.shortIds, [input.windows.shortId, input.iphone.shortId]);
  assert.deepEqual(listener.settings.clients.map(client => client.id), [windows.uuid, share.username]);
  assert.ok(listener.settings.clients.every(client => client.flow === windows.flow));
  assert.equal(windows.port, input.port);
  assert.equal(windows.network, 'tcp');
  assert.equal(windows.tls, true);
  assert.equal(windows.servername, input.serverName);
  assert.deepEqual(windows['reality-opts'], { 'public-key': publicKey, 'short-id': '01' });
  assert.equal(share.protocol, 'vless:');
  assert.equal(share.hostname, input.address);
  assert.equal(Number(share.port), input.port);
  assert.equal(share.hash, '#VPS-iPhone');
  assert.deepEqual(Object.fromEntries(share.searchParams), {
    encryption: 'none', type: 'tcp', security: 'reality', flow: windows.flow,
    sni: input.serverName, fp: windows['client-fingerprint'], pbk: publicKey, sid: '02'
  });
  assert.ok(!JSON.stringify({ windows, iphone }).includes(privateKey));
  assert.ok(!JSON.stringify(windows).includes(input.iphone.id));
  assert.ok(!iphone.qrPayload.includes(input.windows.id));
});

test('compatible-node clients render with only a public key', () => {
  const { privateKey: omittedKey, target, ...input } = sample();
  assert.deepEqual(renderClientArtifacts({ ...input, publicKey }), {
    windows: renderNewNodeArtifacts(sample()).windows,
    iphone: renderNewNodeArtifacts(sample()).iphone
  });
});

test('Android new and reuse routes produce the same Android-only VLESS QR payload', () => {
  const { iphone, target, privateKey: key, ...common } = sample();
  const android = { id: '00000000-0000-4000-8000-000000000003', shortId: '03' };
  const { server, ...clients } = renderNewNodeArtifacts({ ...common, android, target, privateKey: key });
  const reused = renderClientArtifacts({ ...common, android, publicKey });
  assert.deepEqual(Object.keys(clients), ['windows', 'android']);
  assert.deepEqual(clients, reused);
  const [listener] = server.inbounds;
  assert.deepEqual(listener.settings.clients.map(({ email, id }) => ({ email, id })), [
    { email: 'windows', id: common.windows.id }, { email: 'android', id: android.id }
  ]);
  assert.deepEqual(listener.streamSettings.realitySettings.shortIds, [common.windows.shortId, '03']);
  const uri = new URL(clients.android.qrPayload);
  assert.equal(uri.protocol, 'vless:');
  assert.equal(uri.username, android.id);
  assert.equal(uri.hash, '#VPS-Android');
  assert.deepEqual(Object.fromEntries(uri.searchParams), {
    encryption: 'none', type: 'tcp', security: 'reality', flow: 'xtls-rprx-vision',
    sni: common.serverName, fp: 'chrome', pbk: publicKey, sid: '03'
  });
  assert.ok(!JSON.stringify(clients).includes(privateKey));
  assert.ok(!clients.android.qrPayload.includes(common.windows.id));
});

test('both renderer routes reject missing, mixed or shared Android credentials', () => {
  const input = sample();
  const { iphone, ...common } = input;
  for (const render of [renderNewNodeArtifacts, renderClientArtifacts]) {
    assert.throws(() => render({ ...common, publicKey }), /exactly one phone/);
    assert.throws(() => render({ ...input, android: undefined, publicKey }), /exactly one phone/);
    assert.throws(() => render({ ...common, android: null, publicKey }), /Android UUID/);
    assert.throws(() => render({
      ...common, android: { ...iphone, id: common.windows.id }, publicKey
    }), /distinct UUIDs and short IDs/);
    assert.throws(() => render({
      ...common, android: { ...iphone, shortId: '0100' }, publicKey
    }), /distinct UUIDs and short IDs/);
  }
});

test('bare IPv6 addresses are bracketed only in authorities and TCP 443 remains explicit', () => {
  const input = sample();
  input.address = '2001:db8::1';
  input.port = 443;
  input.target.host = '2001:db8::2';
  const { server, windows, iphone } = renderNewNodeArtifacts(input);
  assert.equal(server.inbounds[0].streamSettings.realitySettings.target, '[2001:db8::2]:443');
  assert.equal(windows.server, '2001:db8::1');
  assert.equal(new URL(iphone.qrPayload).host, '[2001:db8::1]:443');
});

test('shared UUIDs and equivalent short IDs are rejected', () => {
  const input = sample();
  input.windows.id = 'A0000000-0000-4000-8000-000000000001';
  assert.throws(() => renderNewNodeArtifacts({
    ...input, iphone: { ...input.iphone, id: input.windows.id.toLowerCase() }
  }), /distinct/);
  assert.throws(() => renderNewNodeArtifacts({
    ...input, iphone: { ...input.iphone, shortId: '0100' }
  }), /distinct/);
});

test('invalid or ambiguous inputs are rejected without including input data in errors', () => {
  for (const [changes, message] of [
    [{ address: 'https://vps.example.invalid' }, 'Invalid node host'],
    [{ address: 'vps\n.example.invalid' }, 'Invalid node host'],
    [{ address: '127.1' }, 'Invalid node host'],
    [{ address: 'fe80::1%interface' }, 'Invalid node host'],
    [{ port: '443' }, 'Invalid node port'],
    [{ serverName: '192.0.2.1' }, 'Invalid REALITY server name host'],
    [{ target: { host: 'VPS.EXAMPLE.INVALID', port: 8443 } }, 'REALITY target must differ from the node endpoint'],
    [{ target: { host: 'example.invalid', port: 65536 } }, 'Invalid REALITY target port'],
    [{ privateKey: 'sensitive-invalid-sentinel' }, 'Invalid REALITY private key encoding'],
    [{ iphone: { ...sample().iphone, shortId: 'a' } }, 'Invalid iPhone short ID'],
    [{ windows: { ...sample().windows, id: 'sensitive-invalid-sentinel' } }, 'Invalid Windows UUID']
  ]) {
    assert.throws(() => renderNewNodeArtifacts({ ...sample(), ...changes }), { message });
  }
  assert.throws(() => renderClientArtifacts({ ...sample(), publicKey: `${publicKey}=` }), {
    message: 'Invalid REALITY public key encoding'
  });
});
