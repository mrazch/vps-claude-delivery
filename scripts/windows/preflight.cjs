'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const release = require('./release.json');

function windowsArchitecture({ platform, nativeArchitecture, processArchitecture }) {
  if (platform !== 'win32') return { platform, architecture: null };
  const names = { AMD64: 'x64', ARM64: 'arm64', X64: 'x64' };
  const key = (nativeArchitecture || processArchitecture).toUpperCase();
  return { platform, architecture: Object.hasOwn(names, key) ? names[key] : null };
}

async function verifyInstaller(file, expected) {
  if (/^(?:[\\/]{2})/.test(file)) return 'unsupported-path';
  if (path.basename(file) !== expected.name) return 'wrong-filename';
  let handle;
  try {
    const target = fs.lstatSync(file);
    if (!target.isFile() || target.isSymbolicLink()) return 'unsupported-path';
    handle = await fs.promises.open(file, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== target.dev || stat.ino !== target.ino) return 'unsupported-path';
    if (stat.size !== expected.bytes) return 'wrong-size';
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest('hex') === expected.sha256 ? 'matches' : 'digest-mismatch';
  } catch (error) {
    if (error.code === 'ENOENT') return 'file-missing';
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function run(args) {
  const [option, file] = args;
  if (args.length !== 0 && (args.length !== 2 || option !== '--installer')) throw new Error('INVALID_ARGUMENTS');
  const host = windowsArchitecture({ platform: process.platform,
    nativeArchitecture: process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE,
    processArchitecture: process.arch });
  const asset = host.architecture ? release.assets[host.architecture] : null;
  if (file && !asset) throw new Error('UNSUPPORTED_WINDOWS_ARCHITECTURE');
  const result = file ? await verifyInstaller(file, asset) : 'not-supplied';
  return { ...host, release: release.version, coreInReleaseNotes: release.coreInReleaseNotes, asset,
    digest: result, authenticode: 'not-checked' };
}

if (require.main === module) {
  run(process.argv.slice(2)).then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.digest !== 'not-supplied' && result.digest !== 'matches') process.exitCode = 1;
  }).catch(error => {
    process.stderr.write((/^[A-Z_]+$/.test(error.message) ? error.message : 'WINDOWS_PREFLIGHT_READ_ERROR') + '\n请按 guides/windows.md 核对架构、命令与本地安装包。校验失败时重新从官方来源取得匹配文件，不要运行安装器。\n');
    process.exitCode = 1;
  });
}

module.exports = { windowsArchitecture, verifyInstaller };
