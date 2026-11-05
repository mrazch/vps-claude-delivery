'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function localCopy(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-customer-progress-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scripts = path.join(root, 'scripts');
  fs.mkdirSync(scripts);
  const script = path.join(scripts, 'progress.cjs');
  fs.copyFileSync(require.resolve('../scripts/progress.cjs'), script);

  function invoke(args, expectedError) {
    const result = spawnSync(process.execPath, [script, ...args],
      { cwd: root, encoding: 'utf8', windowsHide: true });
    if (expectedError) {
      assert.equal(result.status, 1);
      assert.equal(result.stderr.trim().split('\n')[0], expectedError);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /[\u4e00-\u9fff]/);
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  return { root, invoke, customer: (...args) => invoke(['--customer', ...args]) };
}

test('customer CLI stores partial checks, blocks on a dropped connection, and resumes with a fresh process', t => {
  const { root, customer, invoke } = localCopy(t);
  assert.equal(customer('status').mode, 'customer-reported');
  assert.equal(fs.existsSync(path.join(root, 'runtime')), false);
  const { stages } = customer('checks');
  const pass = (rev, stage, ...extra) => customer('pass', rev, stage, stages[stage].join(','), ...extra);
  pass('0', 'preflight', 'claude-windows');
  pass('1', 'vps', 'reuse');
  pass('2', 'recovery-ready');
  customer('record', '3', 'windows', 'tun-rule-mode,direct-sample');
  customer('fail', '4', 'windows', 'connection-lost');
  const blocked = customer('status');
  assert.equal(blocked.next, 'windows');
  assert.deepEqual(blocked.stages.windows, { status: 'failed',
    checks: ['tun-rule-mode', 'direct-sample'], reason: 'connection-lost', recovery: 'needed' });
  invoke(['--customer', 'pass', '5', 'windows', stages.windows.join(',')], 'RESTORE_REQUIRED');
  invoke(['--customer', 'invalidate', '5', 'windows'], 'RESTORE_REQUIRED');
  assert.equal(customer('restore', '5', 'windows').state.stages.windows.recovery, 'reported-restored');
  assert.deepEqual(customer('status').stages.windows.checks, []);
  assert.equal(customer('restore', '5', 'windows').replayed, true);
  pass('6', 'windows');
  pass('7', 'iphone');
  pass('8', 'claude-windows');
  assert.equal(pass('9', 'handoff').state.next, null);
  const recheck = customer('invalidate', '10', 'iphone').state;
  assert.equal(recheck.next, 'iphone');
  assert.equal(recheck.stages.windows.status, 'passed');
  assert.equal(recheck.stages['claude-windows'].status, 'passed');
});

test('customer and simulation storage stay separate and reject unsupported input', t => {
  const { root, customer, invoke } = localCopy(t);
  const checks = 'device-inventory,account-eligibility,scope-reviewed';
  invoke(['pass', '0', 'preflight', checks, 'claude-iphone']);
  assert.equal(customer('status').revision, 0);
  customer('record', '0', 'preflight', 'device-inventory');
  invoke(['--customer', 'record', '1', 'preflight', 'fixture@example.invalid'], 'INVALID_CHECKS');
  invoke(['--customer', 'restore', '1', 'preflight'], 'NO_PENDING_RESTORE');
  assert.deepEqual(customer('status').stages.preflight.checks, ['device-inventory']);
  assert.equal(invoke(['status']).stages.preflight.status, 'passed');
  const entry = path.join(root, 'runtime', 'customer-progress', '001.json');
  const written = JSON.parse(fs.readFileSync(entry, 'utf8'));
  assert.equal(written.mode, 'customer-reported');
  written.mode = 'simulation';
  fs.writeFileSync(entry, JSON.stringify(written));
  invoke(['--customer', 'status'], 'INVALID_PROGRESS_EVENT');
});

test('recovering from a Claude-stage device outage returns to that device check', t => {
  const { customer } = localCopy(t);
  const { stages } = customer('checks');
  const pass = (rev, stage, ...extra) => customer('pass', rev, stage, stages[stage].join(','), ...extra);
  pass('0', 'preflight', 'claude-iphone');
  pass('1', 'vps', 'reuse');
  pass('2', 'recovery-ready');
  pass('3', 'windows');
  pass('4', 'iphone');
  customer('fail', '5', 'claude-iphone', 'connection-lost');
  const recovered = customer('restore', '6', 'claude-iphone').state;
  assert.equal(recovered.next, 'iphone');
  assert.equal(recovered.stages.windows.status, 'passed');
  assert.equal(recovered.stages.iphone.recovery, 'reported-restored');
  assert.equal(recovered.stages['claude-iphone'], undefined);
  assert.equal(pass('7', 'iphone').state.next, 'claude-iphone');
});


test('Windows and Android reaches its own phone checks and resumes after Android restore', t => {
  const { customer, invoke } = localCopy(t);
  const { stages, phones } = customer('checks');
  assert.deepEqual(phones, ['iphone', 'android']);
  const pass = (rev, stage, ...extra) => customer('pass', rev, stage, stages[stage].join(','), ...extra);
  invoke(['--customer', 'pass', '0', 'preflight', stages.preflight.join(','), 'claude-iphone', 'android'], 'INVALID_CHECKS');
  pass('0', 'preflight', 'claude-windows,claude-android', 'android');
  pass('1', 'vps', 'reuse');
  pass('2', 'recovery-ready');
  assert.equal(pass('3', 'windows').state.next, 'android');
  invoke(['--customer', 'pass', '4', 'iphone', stages.iphone.join(',')], 'STAGE_OUT_OF_ORDER');
  customer('record', '4', 'android', 'device-qr,vpn-approved,wifi-exit');
  assert.equal(customer('fail', '5', 'android', 'connection-lost').state.stages.android.recovery, 'needed');
  const recovered = customer('restore', '6', 'android').state;
  assert.deepEqual(recovered.stages.android.checks, []);
  assert.equal(recovered.stages.windows.status, 'passed');
  assert.equal(pass('7', 'android').state.next, 'claude-windows');
  assert.equal(pass('8', 'claude-windows').state.next, 'claude-android');
  pass('9', 'claude-android');
  assert.equal(pass('10', 'handoff').state.next, null);
  const changed = customer('invalidate', '11', 'android').state;
  assert.equal(changed.next, 'android');
  assert.equal(changed.stages['claude-windows'].status, 'passed');
  assert.equal(changed.stages['claude-android'], undefined);
  assert.equal(changed.stages.iphone, undefined);
});
