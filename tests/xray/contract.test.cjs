'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  planNode, buildArtifacts, validateArtifacts, createReceipt, readReceipt
} = require('../../scripts/xray/contract.cjs');
const upstream = require('../../scripts/xray/upstream.json');

const stack = {
  protocol: 'vless', security: 'reality', flow: 'xtls-rprx-vision'
};
const allowed = { hostFirewall: 'allowed', cloudFirewall: 'allowed' };

function candidate(port, changes = {}) {
  return { port, listener: 'free', ...allowed, handshake: 'untested', ...changes };
}

function planNew(...ports) {
  return planNode({ mode: 'simulation', existingNode: null, ports });
}

function passedEvidence(plan) {
  return {
    plan,
    listener: {
      port: plan.port, transport: 'tcp', state: 'listening', version: upstream.core.version
    },
    handshake: { port: plan.port, ...stack, result: 'passed' },
    exit: { via: 'tunnel', result: 'matches-vps' }
  };
}

test('an eligible TCP 443 takes precedence over earlier explicit fallback ports', () => {
  assert.deepEqual(planNew(candidate(8443), candidate(443)), {
    mode: 'simulation', route: 'new', port: 443, reason: 'preferred-443'
  });
});

test('occupied TCP 443, either firewall denial, or failed handshake prevents selection', () => {
  for (const facts of [
    { listener: 'occupied' }, { hostFirewall: 'denied' }, { cloudFirewall: 'unknown' },
    { handshake: 'failed' }
  ]) {
    assert.equal(planNew(candidate(443, facts), candidate(8443)).port, 8443);
    assert.equal(planNew(candidate(443, facts)).reason, 'no-eligible-port');
  }
});

test('only explicitly absent existing nodes take the new-node path', () => {
  const compatible = {
    port: 24443, transport: 'tcp', ...stack, listener: 'xray', ...allowed,
    handshake: 'passed', deviceIsolation: 'confirmed'
  };
  function planExisting(existingNode) {
    return planNode({ mode: 'simulation', existingNode, ports: [candidate(443)] });
  }
  assert.equal(planExisting(compatible).port, 24443);
  assert.equal(planExisting(compatible).route, 'reuse');
  for (const facts of [
    { transport: 'udp' }, { security: 'tls' }, { protocol: 'vmess' }, { flow: 'none' },
    { listener: 'unknown' }, { cloudFirewall: 'unknown' }, { handshake: 'untested' },
    { deviceIsolation: 'unknown' }
  ]) {
    assert.equal(planExisting({ ...compatible, ...facts }).route, 'blocked');
  }
  assert.equal(planExisting(undefined).route, 'blocked');
});

test('non-simulation input, invalid ports and duplicate ports are rejected', () => {
  assert.throws(() => planNode({ mode: 'production' }), /simulation/);
  assert.throws(() => planNew(candidate(443), candidate(443)), /duplicate/);
  assert.throws(() => planNew(candidate('443')), /Invalid/);
  assert.throws(() => buildArtifacts({ port: 65536 }), /Invalid/);
});

test('synthetic fixtures have matching but separate Windows and iPhone identities', () => {
  const bundle = buildArtifacts({ port: 8443 });
  const { windows, iphone } = bundle;
  const inbound = bundle.server.inbounds[0];
  assert.equal(bundle.mode, 'simulation');
  assert.equal(inbound.port, windows.port);
  assert.equal(inbound.port, iphone.port);
  assert.equal(inbound.streamSettings.network, 'raw');
  assert.equal(windows.network, 'tcp');
  assert.equal(iphone.parameters.type, 'tcp');
  assert.deepEqual(inbound.settings.clients.map(client => client.id), [windows.uuid, iphone.id]);
  assert.notEqual(windows.uuid, iphone.id);
  assert.notEqual(windows['reality-opts']['short-id'], iphone.parameters.sid);
  assert.equal(validateArtifacts(JSON.parse(JSON.stringify(bundle))), true);
});

test('fixture validation refuses duplicates, inconsistent fields, extras and external addresses', () => {
  const bundle = buildArtifacts({ port: 443 });
  for (const mutate of [
    value => { value.iphone.id = value.windows.uuid; },
    value => { value.iphone.port = 8443; },
    value => { value.windows.server = 'example.com'; },
    value => { value.server.inbounds[0].streamSettings.realitySettings.privateKey = 'custom'; },
    value => { value.iphone.link = 'extra'; }
  ]) {
    const mutated = structuredClone(bundle);
    mutate(mutated);
    assert.equal(validateArtifacts(mutated), false);
  }
  assert.equal(validateArtifacts(null), false);
});

test('receipt requires all three bound checks and distinguishes missing checks', () => {
  const plan = planNew(candidate(443));
  const input = passedEvidence(plan);
  assert.equal(createReceipt({ plan }).status, 'pending');
  assert.equal(createReceipt({ ...input, exit: undefined }).status, 'pending');
  const receipt = createReceipt(input);
  assert.equal(receipt.status, 'passed');
  assert.deepEqual(readReceipt(JSON.parse(JSON.stringify(receipt))), receipt);
});

test('mismatched port, version, protocol, path or exit fail the receipt', () => {
  const plan = planNew(candidate(443));
  const input = passedEvidence(plan);
  for (const mismatch of [
    { listener: { ...input.listener, port: 8443 } },
    { listener: { ...input.listener, version: 'v26.10.29' } },
    { handshake: { ...input.handshake, flow: 'none' } },
    { exit: { ...input.exit, via: 'direct' } },
    { exit: { ...input.exit, result: 'mismatch' } }
  ]) {
    assert.equal(createReceipt({ ...input, ...mismatch }).status, 'failed');
  }
});

test('reuse receipts accept observed versions without imposing the new install pin', () => {
  const plan = planNode({
    mode: 'simulation',
    existingNode: {
      port: 24443, transport: 'tcp', ...stack, listener: 'xray', ...allowed,
      handshake: 'passed', deviceIsolation: 'confirmed'
    }
  });
  const input = passedEvidence(plan);
  input.listener.version = 'v26.10.21';
  assert.equal(createReceipt(input).status, 'passed');
});

test('blocked or inconsistent receipts cannot be read as passed', () => {
  const blocked = createReceipt({ plan: planNew(candidate(443, { listener: 'occupied' })) });
  assert.equal(readReceipt(blocked).status, 'failed');
  assert.throws(() => readReceipt({ ...blocked, status: 'passed' }), /Invalid simulation receipt/);
  assert.throws(() => readReceipt({ ...blocked, schemaVersion: 2 }), /Invalid simulation receipt/);
  assert.throws(() => readReceipt({
    ...blocked, evidence: { ...blocked.evidence, exit: 'passed' }
  }), /Invalid simulation receipt/);
});

test('the writer omits raw observation fields and the reader refuses unexpected data', () => {
  const plan = planNew(candidate(443));
  const input = passedEvidence(plan);
  input.exit.raw = 'raw-field-sentinel';
  input.listener.raw = 'raw-field-sentinel';
  input.handshake.raw = 'raw-field-sentinel';
  const receipt = createReceipt(input);
  assert.equal(receipt.status, 'passed');
  assert.doesNotMatch(JSON.stringify(receipt), /raw-field-sentinel/);
  assert.throws(() => readReceipt({ ...receipt, raw: 'raw-field-sentinel' }), /Invalid/);
  assert.throws(() => readReceipt({
    ...receipt, evidence: { ...receipt.evidence, raw: 'raw-field-sentinel' }
  }), /Invalid/);
});
