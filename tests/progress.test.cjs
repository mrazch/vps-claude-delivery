'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProgressStore } = require('../scripts/progress.cjs');

const preflight = {
  type: 'pass', stage: 'preflight',
  checks: ['device-inventory', 'account-eligibility', 'scope-reviewed'],
  targets: ['claude-windows', 'claude-iphone'],
};

function isolatedRoot(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-delivery-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function submitFromProcess(root, action) {
  const worker = `
    const { createProgressStore } = require(process.argv[1]);
    const store = createProgressStore(process.argv[2]);
    try { process.stdout.write(JSON.stringify(store.apply(0, JSON.parse(process.argv[3])))); }
    catch (error) { process.stdout.write(JSON.stringify({ error: error.message })); }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', worker, require.resolve('../scripts/progress.cjs'),
      root, JSON.stringify(action)], { windowsHide: true });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error('worker failed'));
      try { resolve(JSON.parse(output)); }
      catch (error) { reject(error); }
    });
  });
}

test('status is read-only and incomplete or out-of-order claims cannot be saved', t => {
  const root = isolatedRoot(t);
  const store = createProgressStore(root);
  assert.deepEqual(store.status(), { schemaVersion: 1, mode: 'simulation', revision: 0, next: 'preflight', stages: {} });
  assert.deepEqual(fs.readdirSync(root), []);
  assert.throws(() => store.apply(0, { ...preflight, checks: ['device-inventory'] }), /MISSING_REQUIRED_CHECK/);
  assert.throws(() => store.apply(0, { type: 'fail', stage: 'iphone', reason: 'check-failed' }), /STAGE_OUT_OF_ORDER/);
  assert.throws(() => store.apply(0, { ...preflight, email: 'fixture@example.invalid' }), /INVALID_ACTION_FIELDS/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('recorded failure survives a restart, then recovery from the failed stage can advance', async t => {
  const root = isolatedRoot(t);
  const original = createProgressStore(root);
  const failure = { type: 'fail', stage: 'preflight', reason: 'check-failed' };
  assert.equal((await submitFromProcess(root, failure)).state.next, 'preflight');
  assert.equal(original.status().stages.preflight.reason, 'check-failed');
  assert.equal(original.apply(1, preflight).state.next, 'vps');
  assert.equal((await submitFromProcess(root, failure)).replayed, true);
  assert.throws(() => original.apply(0, preflight), /PROGRESS_CONFLICT/);
});

test('two independent writers cannot overwrite the same revision', async t => {
  const root = isolatedRoot(t);
  const results = await Promise.all([submitFromProcess(root, preflight), submitFromProcess(root,
    { ...preflight, targets: ['claude-iphone'] })]);
  assert.equal(results.filter(result => result.error === 'PROGRESS_CONFLICT').length, 1);
  assert.equal(results.filter(result => result.state?.revision === 1).length, 1);
  assert.equal(createProgressStore(root).status().revision, 1);
});

test('an interrupted draft stays invisible and invalid event history fails closed', t => {
  const root = isolatedRoot(t);
  const store = createProgressStore(root);
  const directory = path.join(root, 'runtime', 'progress');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'fixture.pending'), '{"incomplete":');
  assert.equal(store.status().revision, 0);
  assert.equal(store.apply(0, preflight).state.revision, 1);
  const entry = path.join(directory, '001.json');
  fs.writeFileSync(entry, '{"schemaVersion":5,"mode":"simulation","revision":1,"action":{}}');
  assert.throws(() => store.status(), /INVALID_PROGRESS_EVENT/);
  assert.throws(() => store.apply(1, { type: 'fail', stage: 'vps', reason: 'check-failed' }), /INVALID_PROGRESS_EVENT/);
});


test('existing histories beyond 256 and 999 events remain readable, resumable and replay-safe', t => {
  const root = isolatedRoot(t);
  const folder = path.join(root, 'runtime', 'customer-progress');
  fs.mkdirSync(folder, { recursive: true });
  const action = { type: 'record', stage: 'preflight', checks: ['device-inventory'] };
  for (let revision = 1; revision <= 1000; revision++) {
    fs.writeFileSync(path.join(folder, String(revision).padStart(3, '0') + '.json'),
      JSON.stringify({ schemaVersion: 1, mode: 'customer-reported', revision, action }));
  }
  const store = createProgressStore(root, 'customer-reported');
  assert.equal(store.status().revision, 1000);
  assert.equal(store.apply(1000, preflight).state.next, 'vps');
  assert.equal(store.status().revision, 1001);
  assert.equal(store.apply(1000, preflight).replayed, true);
  assert.equal(fs.readdirSync(folder).length, 1001);
});
