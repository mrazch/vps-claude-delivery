'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { QrCode } = require('../scripts/vendor/qrcodegen-v1.8.0.cjs');

const node = {
  address: 'node.example.invalid',
  port: 443,
  serverName: 'target.example.invalid',
  windows: { id: '00000000-0000-4000-8000-000000000001', shortId: '0000000000000001' },
  iphone: { id: '00000000-0000-4000-8000-000000000002', shortId: '0000000000000002' },
};
const privateKey = Buffer.alloc(32, 7).toString('base64url');
const publicKey = Buffer.alloc(32, 11).toString('base64url');
const inputs = {
  new: { ...node, target: { host: 'target.example.invalid', port: 443 }, privateKey },
  reuse: { ...node, publicKey },
};

function isolatedPackage(t, route) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-materials-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['prepare-node.cjs', 'xray/render.cjs',
    'vendor/qrcodegen-v1.8.0.cjs', 'windows/default-rules.json']) {
    const source = path.join(__dirname, '..', 'scripts', name);
    const dest = path.join(root, 'scripts', name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
  }
  const workspace = path.join(root, 'runtime', 'node-materials');
  fs.mkdirSync(workspace, { recursive: true });
  const inputFile = path.join(workspace, 'input.json');
  fs.writeFileSync(inputFile, JSON.stringify({ route, node: inputs[route] }));
  const invoke = (...args) => spawnSync(process.execPath, ['scripts/prepare-node.cjs', ...args],
    { cwd: root, encoding: 'utf8', windowsHide: true });
  return { output: path.join(workspace, 'output'), inputFile, invoke };
}

test('new-node command prepares independent artifacts and keeps the private key out of client files and stdout', t => {
  const { output, invoke } = isolatedPackage(t, 'new');
  const check = invoke('check');
  assert.equal(check.status, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).networkVerified, false);
  assert.equal(fs.existsSync(output), false);
  const prepare = invoke('prepare');
  assert.equal(prepare.status, 0, prepare.stderr);
  assert.equal(JSON.parse(prepare.stdout).status, 'prepared-locally');
  assert.doesNotMatch(prepare.stdout, /example\.invalid|vless:|00000000/);
  assert.equal(prepare.stdout.includes(privateKey), false);
  const read = name => fs.readFileSync(path.join(output, name), 'utf8');
  const server = JSON.parse(read('server/config.json')).inbounds[0];
  const profile = JSON.parse(read('windows/profile.yaml'));
  const share = read('iphone/share.txt').trim();
  const uri = new URL(share);
  assert.equal(server.streamSettings.realitySettings.privateKey, privateKey);
  assert.equal(profile.proxies[0].uuid, node.windows.id);
  assert.equal(profile.rules.at(-1), 'MATCH,DELIVERY');
  assert.equal(uri.username, node.iphone.id);
  assert.equal(uri.searchParams.get('sid'), node.iphone.shortId);
  assert.equal(uri.searchParams.get('pbk'), profile.proxies[0]['reality-opts']['public-key']);
  assert.equal(read('windows/profile.yaml').includes(privateKey), false);
  assert.equal(share.includes(privateKey), false);

  const qr = QrCode.encodeText(share, QrCode.Ecc.MEDIUM);
  const svg = read('iphone/qr.svg');
  const dark = new Set(Array.from(svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g), match => match[1] + ',' + match[2]));
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      assert.equal(dark.has((x + 4) + ',' + (y + 4)), qr.getModule(x, y));
    }
  }
  assert.match(svg, new RegExp('viewBox="0 0 ' + (qr.size + 8) + ' ' + (qr.size + 8) + '"'));
  assert.equal(JSON.parse(read('ready.json')).networkVerified, false);
  const duplicate = invoke('prepare');
  assert.equal(duplicate.status, 1);
  assert.equal(duplicate.stderr.trim().split('\n')[0], 'OUTPUT_ALREADY_EXISTS');
  assert.equal(read('iphone/share.txt').trim(), share);
});

test('existing node only creates client materials, rejecting a request containing a server private key', t => {
  const { output, inputFile, invoke } = isolatedPackage(t, 'reuse');
  fs.writeFileSync(inputFile, JSON.stringify({ route: 'reuse', node: { ...inputs.reuse, privateKey } }));
  const invalid = invoke('prepare');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stderr.trim().split('\n')[0], 'INVALID_NODE_FIELDS');
  assert.equal(fs.existsSync(output), false);
  fs.writeFileSync(inputFile, JSON.stringify({ route: 'reuse', node: inputs.reuse }));
  const ready = invoke('prepare');
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(fs.existsSync(path.join(output, 'server')), false);
  assert.equal(fs.existsSync(path.join(output, 'iphone', 'qr.svg')), true);
});


test('Android material uses an independent v2rayNG share link for new and reused nodes', t => {
  for (const route of ['new', 'reuse']) {
    const { output, inputFile, invoke } = isolatedPackage(t, route);
    const { iphone, ...input } = inputs[route];
    fs.writeFileSync(inputFile, JSON.stringify({ route, node: { ...input, iphone, android: iphone } }));
    assert.equal(invoke('check').stderr.trim().split('\n')[0], 'INVALID_NODE_FIELDS');
    fs.writeFileSync(inputFile, JSON.stringify({ route, node: { ...input, android: iphone } }));
    const prepared = invoke('prepare');
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.equal(JSON.parse(prepared.stdout).networkVerified, false);
    const read = name => fs.readFileSync(path.join(output, name), 'utf8');
    const uri = new URL(read('android/share.txt').trim());
    assert.equal(uri.hash, '#VPS-Android');
    assert.equal(uri.username, iphone.id);
    assert.equal(uri.searchParams.get('sid'), iphone.shortId);
    assert.equal(uri.searchParams.get('type'), 'tcp');
    assert.equal(uri.searchParams.get('flow'), 'xtls-rprx-vision');
    assert.match(read('android/qr.svg'), /<svg /);
    assert.equal(JSON.parse(read('windows/profile.yaml')).proxies[0].uuid, node.windows.id);
    assert.equal(fs.existsSync(path.join(output, 'iphone')), false);
    assert.equal(fs.existsSync(path.join(output, 'server')), route === 'new');
  }
});


test('first run explains missing directory and input without printing credentials', t => {
  const { inputFile, invoke } = isolatedPackage(t, 'reuse');
  fs.rmSync(path.dirname(path.dirname(inputFile)), { recursive: true });
  const missing = invoke('check');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^LOCAL_INPUT_DIRECTORY_REQUIRED\n/);
  assert.match(missing.stderr, /New-Item.*runtime\/node-materials/);
  assert.equal(missing.stdout, '');
  fs.mkdirSync(path.dirname(inputFile), { recursive: true });
  const noFile = invoke('check');
  assert.match(noFile.stderr, /^LOCAL_INPUT_FILE_REQUIRED\n/);
  assert.match(noFile.stderr, /input.json/);
  assert.equal(noFile.stderr.includes(publicKey), false);
});
