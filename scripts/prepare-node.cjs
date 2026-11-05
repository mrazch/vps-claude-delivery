'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { QrCode } = require('./vendor/qrcodegen-v1.8.0.cjs');
const { renderNewNodeArtifacts, renderClientArtifacts } = require('./xray/render.cjs');
const rules = require('./windows/default-rules.json');

const workspace = path.join(__dirname, '..', 'runtime', 'node-materials');

function checkWorkspace() {
  for (const directory of [path.dirname(workspace), workspace]) {
    const entry = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!entry?.isDirectory() || entry.isSymbolicLink()) throw new Error('LOCAL_INPUT_DIRECTORY_REQUIRED');
  }
}

function loadInput() {
  checkWorkspace();
  const file = path.join(workspace, 'input.json');
  const entry = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!entry?.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || entry.size > 8192) {
    throw new Error('LOCAL_INPUT_FILE_REQUIRED');
  }
  let input;
  try { input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('INVALID_INPUT_JSON'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== 'node,route'
    || !['new', 'reuse'].includes(input.route)) throw new Error('INVALID_INPUT_ROUTE');
  const phone = Object.hasOwn(input.node ?? {}, 'android') ? 'android' : 'iphone';
  const common = ['address', 'port', 'serverName', 'windows', phone];
  const fields = input.route === 'new' ? [...common, 'target', 'privateKey'] : [...common, 'publicKey'];
  if (!input.node || typeof input.node !== 'object' || Array.isArray(input.node)
    || Object.keys(input.node).sort().join(',') !== fields.sort().join(',')) {
    throw new Error('INVALID_NODE_FIELDS');
  }
  return { ...input, phone };
}

function makeQrSvg(payload) {
  const qr = QrCode.encodeText(payload, QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + 2 * border;
  const modules = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) modules.push('M' + (x + border) + ',' + (y + border) + 'h1v1h-1z');
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 ' + size
    + ' ' + size + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/>'
    + '<path fill="black" d="' + modules.join('') + '"/></svg>\n';
}

function writeMaterials(route, phone, result) {
  const output = path.join(workspace, 'output');
  try { fs.mkdirSync(output, { mode: 0o700 }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('OUTPUT_ALREADY_EXISTS');
    throw error;
  }
  const profile = {
    mode: 'rule', 'allow-lan': false,
    proxies: [result.windows],
    'proxy-groups': [{ name: 'DELIVERY', type: 'select', proxies: [result.windows.name] }],
    rules
  };
  const devices = {
    windows: { 'profile.yaml': JSON.stringify(profile, null, 2) + '\n' },
    [phone]: {
      'qr.svg': makeQrSvg(result[phone].qrPayload),
      'share.txt': result[phone].qrPayload + '\n'
    }
  };
  if (result.server) devices.server = { 'config.json': JSON.stringify(result.server, null, 2) + '\n' };
  for (const [name, files] of Object.entries(devices)) {
    const folder = path.join(output, name);
    fs.mkdirSync(folder, { mode: 0o700 });
    for (const [filename, data] of Object.entries(files)) {
      fs.writeFileSync(path.join(folder, filename), data, { flag: 'wx', mode: 0o600 });
    }
  }
  // Publish the marker only after all of the output files are written.
  const draft = path.join(output, 'ready.tmp');
  fs.writeFileSync(draft, JSON.stringify({ schemaVersion: 1, route,
    status: 'prepared-locally', networkVerified: false }) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(draft, path.join(output, 'ready.json'));
}

function run(args) {
  if (args.length !== 1 || !['check', 'prepare'].includes(args[0])) throw new Error('USE_CHECK_OR_PREPARE');
  const { route, node, phone } = loadInput();
  let result;
  try { result = route === 'new' ? renderNewNodeArtifacts(node) : renderClientArtifacts(node); }
  catch { throw new Error('INVALID_NODE_FIELDS'); }
  if (args[0] === 'prepare') writeMaterials(route, phone, result);
  return {
    route, status: args[0] === 'prepare' ? 'prepared-locally' : 'input-valid',
    networkVerified: false,
    ...(args[0] === 'prepare' && { output: 'runtime/node-materials/output' })
  };
}

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(run(process.argv.slice(2))) + '\n'); }
  catch (error) {
    const message = /^[A-Z_]+$/.test(error.message) ? error.message : 'NODE_MATERIALS_IO_ERROR';
    const hints = {
      LOCAL_INPUT_DIRECTORY_REQUIRED: '先从交付文件夹运行 PowerShell：New-Item -ItemType Directory -Force -Path runtime/node-materials | Out-Null，再按 guides/materials.md 保存 input.json。',
      LOCAL_INPUT_FILE_REQUIRED: '请客户按 guides/materials.md 在本机保存 runtime/node-materials/input.json；不要把凭据发到聊天中。',
      OUTPUT_ALREADY_EXISTS: '已有输出已保留。先由客户保管旧材料，再用独立版本文件夹生成；不要覆盖或删除原凭据。',
      INVALID_INPUT_JSON: 'input.json 格式不正确，请在本机检查 JSON 标点；不要上传原文件。',
      INVALID_NODE_FIELDS: '按 guides/materials.md 核对 new/reuse 字段、独立设备身份和密钥格式，手机只能选一种。'
    };
    process.stderr.write(message + '\n' + (hints[message] ?? '操作未完成。请按 guides/materials.md 核对命令与输入，保留已有文件。') + '\n');
    process.exitCode = 1;
  }
}
