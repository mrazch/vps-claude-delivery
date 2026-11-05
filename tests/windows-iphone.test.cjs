'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProgressStore } = require('../scripts/progress.cjs');
const { planNode, buildArtifacts, validateArtifacts, createReceipt, readReceipt } = require('../scripts/xray/contract.cjs');
const upstream = require('../scripts/xray/upstream.json');

const checks = {
  preflight: ['device-inventory', 'account-eligibility', 'scope-reviewed'],
  vps: ['listener-readback', 'client-handshake', 'expected-exit'],
  'recovery-ready': ['baseline-recorded', 'offline-guide-available'],
  windows: ['tun-rule-mode', 'direct-sample', 'vps-exit', 'app-vps-route', 'agent-connected', 'reboot-verified'],
  iphone: ['device-qr', 'vpn-approved', 'wifi-exit', 'cellular-exit', 'reconnect-verified'],
  'claude-windows': ['official-client-reply'],
  'claude-iphone': ['official-client-reply'],
  handoff: ['agent-loss', 'local-recovery', 'new-agent-resume'],
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-delivery-route-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: createProgressStore(root) };
}

function pass(store, stage, extra = {}) {
  return store.apply(store.status().revision, { type: 'pass', stage, checks: checks[stage], ...extra }).state;
}

function passNode(store, plan) {
  const { port } = plan;
  const receipt = readReceipt(createReceipt({
    plan,
    listener: { port, transport: 'tcp', state: 'listening', version: upstream.core.version },
    handshake: { port, protocol: 'vless', security: 'reality', flow: 'xtls-rprx-vision', result: 'passed' },
    exit: { via: 'tunnel', result: 'matches-vps' },
  }));
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.mode, 'simulation');
  return pass(store, 'vps', { route: plan.route });
}

function alternateProcessStatus(root) {
  const worker = 'process.stdout.write(JSON.stringify(require(process.argv[1]).createProgressStore(process.argv[2]).status()))';
  const result = spawnSync(process.execPath, ['-e', worker, require.resolve('../scripts/progress.cjs'), root],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('new VPS simulation reaches separate device results, recovery and another Agent', t => {
  const { root, store } = fixture(t);
  pass(store, 'preflight', { targets: ['claude-windows', 'claude-iphone'] });
  const plan = planNode({ mode: 'simulation', existingNode: null,
    ports: [{ port: 443, listener: 'free', hostFirewall: 'allowed', cloudFirewall: 'allowed', handshake: 'untested' }] });
  assert.equal(plan.route, 'new');
  assert.equal(validateArtifacts(buildArtifacts({ port: plan.port })), true);
  assert.equal(readReceipt(createReceipt({ plan })).status, 'pending');
  passNode(store, plan);
  assert.throws(() => pass(store, 'windows'), /STAGE_OUT_OF_ORDER/);
  pass(store, 'recovery-ready');
  const afterDrop = store.apply(3, { type: 'fail', stage: 'windows', reason: 'connection-lost' }).state;
  assert.equal(afterDrop.stages.windows.status, 'failed');
  assert.deepEqual(alternateProcessStatus(root), afterDrop);
  const resumed = createProgressStore(root);
  assert.equal(pass(resumed, 'windows').next, 'iphone');
  assert.throws(() => resumed.apply(5, { type: 'pass', stage: 'iphone',
    checks: checks.iphone.filter(check => check !== 'cellular-exit') }), /MISSING_REQUIRED_CHECK/);
  pass(resumed, 'iphone');
  pass(resumed, 'claude-windows');
  pass(resumed, 'claude-iphone');
  const complete = pass(resumed, 'handoff');
  assert.equal(complete.next, null);
  assert.equal(complete.mode, 'simulation');
  assert.equal(complete.stages.handoff.status, 'passed');

  const changed = resumed.apply(complete.revision, { type: 'invalidate', scope: 'iphone' }).state;
  assert.equal(changed.next, 'iphone');
  assert.equal(changed.stages.iphone, undefined);
  assert.equal(changed.stages['claude-iphone'], undefined);
  assert.equal(changed.stages['claude-windows'].status, 'passed');
  assert.equal(changed.stages.windows.status, 'passed');
  assert.equal(changed.stages.handoff, undefined);
});

test('compatible existing node is recorded separately and a single Claude target is allowed', t => {
  const { store } = fixture(t);
  pass(store, 'preflight', { targets: ['claude-windows'] });
  const existingNode = { port: 443, transport: 'tcp', protocol: 'vless', security: 'reality',
    flow: 'xtls-rprx-vision', listener: 'xray', hostFirewall: 'allowed', cloudFirewall: 'allowed',
    handshake: 'passed', deviceIsolation: 'confirmed' };
  const plan = planNode({ mode: 'simulation', existingNode, ports: [] });
  assert.equal(passNode(store, plan).stages.vps.route, 'reuse');
  pass(store, 'recovery-ready');
  pass(store, 'windows');
  pass(store, 'iphone');
  assert.equal(pass(store, 'claude-windows').next, 'handoff');
  pass(store, 'handoff');
  const changed = store.apply(store.status().revision, { type: 'invalidate', scope: 'node' }).state;
  assert.equal(changed.next, 'vps');
  assert.deepEqual(Object.keys(changed.stages), ['preflight']);
});
