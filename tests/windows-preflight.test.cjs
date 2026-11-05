'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { windowsArchitecture, verifyInstaller } = require('../scripts/windows/preflight.cjs');

test('Windows installer selection follows the native architecture when the process is emulated', () => {
  assert.equal(windowsArchitecture({ platform: 'win32',
    nativeArchitecture: 'ARM64', processArchitecture: 'x64' }).architecture, 'arm64');
  assert.equal(windowsArchitecture({ platform: 'win32', processArchitecture: 'x64' }).architecture, 'x64');
  assert.equal(windowsArchitecture({ platform: 'win32',
    nativeArchitecture: 'x86', processArchitecture: 'x64' }).architecture, null);
  assert.equal(windowsArchitecture({ platform: 'linux', processArchitecture: 'x64' }).architecture, null);
});

test('installer verification checks name, size and hash without loading the supplied program', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vps-windows-preflight-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const name = 'fixture-setup.exe';
  const good = Buffer.from('fixture contents');
  const expected = { name, bytes: good.length, sha256: createHash('sha256').update(good).digest('hex') };
  const file = path.join(root, name);
  assert.equal(await verifyInstaller(file, expected), 'file-missing');
  assert.equal(await verifyInstaller(path.join(root, 'other.exe'), expected), 'wrong-filename');
  fs.writeFileSync(file, good);
  assert.equal(await verifyInstaller(file, expected), 'matches');
  fs.writeFileSync(file, Buffer.alloc(good.length, 'z'));
  assert.equal(await verifyInstaller(file, expected), 'digest-mismatch');
  fs.writeFileSync(file, 'short');
  assert.equal(await verifyInstaller(file, expected), 'wrong-size');
  assert.equal(await verifyInstaller('\\\\server\\share\\fixture-setup.exe', expected), 'unsupported-path');
});
