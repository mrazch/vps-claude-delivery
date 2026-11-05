'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const SCHEMA_VERSION = 1;
const STAGE_CHECKS = Object.freeze({
  preflight: ['device-inventory', 'account-eligibility', 'scope-reviewed'],
  vps: ['listener-readback', 'client-handshake', 'expected-exit'],
  'recovery-ready': ['baseline-recorded', 'offline-guide-available'],
  windows: ['tun-rule-mode', 'direct-sample', 'vps-exit', 'app-vps-route', 'agent-connected', 'reboot-verified'],
  iphone: ['device-qr', 'vpn-approved', 'wifi-exit', 'cellular-exit', 'reconnect-verified'],
  'claude-windows': ['official-client-reply'],
  'claude-iphone': ['official-client-reply'],
  handoff: ['agent-loss', 'local-recovery', 'new-agent-resume'],
});
const CUSTOMER_CHECKS = {
  ...STAGE_CHECKS,
  android: STAGE_CHECKS.iphone,
  'claude-android': STAGE_CHECKS['claude-iphone'],
  handoff: ['offline-guide-available', 'local-progress-saved', 'resume-instructions'],
};
const STAGES = Object.keys(STAGE_CHECKS);
const ANDROID_STAGES = STAGES.map(stage => stage.replace('iphone', 'android'));
const CLAUDE_STAGES = ['claude-windows', 'claude-iphone'];
const CUSTOMER_CLAUDE_STAGES = [...CLAUDE_STAGES, 'claude-android'];
const PHONES = ['iphone', 'android'];
const NODE_ROUTES = ['new', 'reuse'];
const REASONS = ['missing-evidence', 'incompatible', 'authorization-needed', 'check-failed', 'connection-lost'];
const INVALIDATION = Object.freeze({
  environment: STAGES,
  node: STAGES.slice(1),
  windows: ['recovery-ready', 'windows', 'claude-windows', 'handoff'],
  iphone: ['iphone', 'claude-iphone', 'handoff'],
});

const CUSTOMER_INVALIDATION = {
  ...INVALIDATION,
  environment: [...INVALIDATION.environment, 'android', 'claude-android'],
  node: [...INVALIDATION.node, 'android', 'claude-android'],
  android: ['android', 'claude-android', 'handoff'],
};

function hasFields(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}

function selectChecks(values, allowed) {
  if (!Array.isArray(values) || values.length === 0 || values.length > allowed.length
    || new Set(values).size !== values.length || values.some(value => !allowed.includes(value))) {
    throw new Error('INVALID_CHECKS');
  }
  return allowed.filter(value => values.includes(value));
}

function normalize(action, mode) {
  const customer = mode === 'customer-reported';
  const stages = customer ? CUSTOMER_CHECKS : STAGE_CHECKS;
  const scopes = customer ? CUSTOMER_INVALIDATION : INVALIDATION;
  if (action?.type === 'invalidate' && hasFields(action, ['type', 'scope'])
    && typeof action.scope === 'string' && Object.hasOwn(scopes, action.scope)) {
    return { type: 'invalidate', scope: action.scope };
  }
  if (typeof action?.stage !== 'string' || !Object.hasOwn(stages, action.stage)) throw new Error('INVALID_STAGE');
  const { type, stage } = action;
  if (type === 'fail' && hasFields(action, ['type', 'stage', 'reason']) && REASONS.includes(action.reason)) {
    return { type, stage, reason: action.reason };
  }
  const allowed = stages[stage];
  if (customer && type === 'record'
    && hasFields(action, ['type', 'stage', 'checks'])) {
    return { type, stage, checks: selectChecks(action.checks, allowed) };
  }
  if (customer && type === 'restore' && hasFields(action, ['type', 'stage'])) {
    return { type, stage };
  }
  if (type !== 'pass') throw new Error('INVALID_ACTION');

  const extra = stage === 'preflight' ? 'targets' : stage === 'vps' ? 'route' : null;
  const fields = ['type', 'stage', 'checks'];
  if (extra) fields.push(extra);
  const phoneSpecified = customer && stage === 'preflight' && Object.hasOwn(action, 'phone');
  if (phoneSpecified) fields.push('phone');
  if (!hasFields(action, fields)) throw new Error('INVALID_ACTION_FIELDS');
  const checks = selectChecks(action.checks, allowed);
  if (checks.length !== allowed.length) throw new Error('MISSING_REQUIRED_CHECK');
  const result = { type, stage, checks };
  if (stage === 'preflight') {
    if (phoneSpecified && !PHONES.includes(action.phone)) throw new Error('INVALID_PHONE');
    const targets = action.phone === 'android' ? ['claude-windows', 'claude-android'] : CLAUDE_STAGES;
    result.targets = selectChecks(action.targets, targets);
    if (phoneSpecified) result.phone = action.phone;
  }
  if (stage === 'vps') {
    if (!NODE_ROUTES.includes(action.route)) throw new Error('INVALID_NODE_ROUTE');
    result.route = action.route;
  }
  return result;
}

function createState(mode) {
  return { schemaVersion: SCHEMA_VERSION, mode, revision: 0, next: STAGES[0], stages: {} };
}

function nextStage(stages) {
  const targets = stages.preflight?.targets ?? [];
  const sequence = stages.preflight?.phone === 'android' ? ANDROID_STAGES : STAGES;
  return sequence.find(stage => (!CUSTOMER_CLAUDE_STAGES.includes(stage) || targets.includes(stage))
    && stages[stage]?.status !== 'passed') ?? null;
}

function advance(state, action) {
  const stages = { ...state.stages };
  const current = stages[state.next];
  if (current?.recovery === 'needed' && action.type !== 'restore') throw new Error('RESTORE_REQUIRED');
  if (action.type === 'invalidate') {
    const scopes = state.mode === 'customer-reported' ? CUSTOMER_INVALIDATION : INVALIDATION;
    const affected = scopes[action.scope];
    if (!affected.some(stage => Object.hasOwn(stages, stage))) throw new Error('NO_AFFECTED_PROGRESS');
    for (const stage of affected) delete stages[stage];
  } else {
    if (action.stage !== state.next) throw new Error('STAGE_OUT_OF_ORDER');
    if (state.mode === 'customer-reported') {
      const update = advanceCustomerStage(current, action);
      if (action.type === 'restore' && CUSTOMER_CLAUDE_STAGES.includes(action.stage)) {
        const device = action.stage.slice('claude-'.length);
        delete stages[action.stage];
        delete stages.handoff;
        stages[device] = update;
      } else {
        stages[action.stage] = update;
      }
    } else if (action.type === 'fail') {
      stages[action.stage] = { status: 'failed', reason: action.reason };
    } else {
      const { type, stage, ...evidence } = action;
      stages[stage] = { status: 'passed', ...evidence };
    }
  }
  return { ...state, revision: state.revision + 1, next: nextStage(stages), stages };
}

function advanceCustomerStage(current, action) {
  const { type, stage, ...evidence } = action;
  const checks = current?.checks ?? [];
  if (type === 'record') {
    const merged = CUSTOMER_CHECKS[stage].filter(check => checks.includes(check) || evidence.checks.includes(check));
    return { status: 'in-progress', checks: merged, ...(current?.recovery && { recovery: current.recovery }) };
  }
  if (type === 'fail') {
    const lostDeviceConnection = evidence.reason === 'connection-lost'
      && ['windows', ...PHONES, ...CUSTOMER_CLAUDE_STAGES].includes(stage);
    return { status: 'failed', checks, ...evidence, ...(lostDeviceConnection && { recovery: 'needed' }) };
  }
  if (type === 'restore') {
    if (current?.recovery !== 'needed') throw new Error('NO_PENDING_RESTORE');
    // The customer is back on the baseline. Checks from the interrupted cutover need to be repeated.
    return { status: 'in-progress', checks: [], recovery: 'reported-restored' };
  }
  return { status: 'passed', ...evidence, ...(current?.recovery && { recovery: current.recovery }) };
}

function assertDirectory(directory, create) {
  if (create) {
    try { fs.mkdirSync(directory); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat) return false;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNSAFE_PROGRESS_DIRECTORY');
  return true;
}

function eventName(revision) {
  return String(revision).padStart(3, '0') + '.json';
}

function createProgressStore(root, mode = 'simulation') {
  if (mode !== 'simulation' && mode !== 'customer-reported') throw new Error('INVALID_PROGRESS_MODE');
  const runtime = path.join(root, 'runtime');
  const directory = path.join(runtime, mode === 'simulation' ? 'progress' : 'customer-progress');

  function available(create = false) {
    return assertDirectory(runtime, create) && assertDirectory(directory, create);
  }

  function load() {
    let state = createState(mode);
    const events = [];
    if (!available()) return { state, events };
    const files = fs.readdirSync(directory).filter(name => /^[0-9]{3,}\.json$/.test(name)).sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
    for (const file of files) {
      if (file !== eventName(state.revision + 1)) throw new Error('PROGRESS_SEQUENCE_INVALID');
      const entry = path.join(directory, file);
      const stat = fs.lstatSync(entry);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2048) throw new Error('INVALID_PROGRESS_FILE');
      const event = JSON.parse(fs.readFileSync(entry, 'utf8'));
      if (!hasFields(event, ['schemaVersion', 'mode', 'revision', 'action'])
        || event.schemaVersion !== SCHEMA_VERSION || event.mode !== mode
        || event.revision !== state.revision + 1) {
        throw new Error('INVALID_PROGRESS_EVENT');
      }
      const action = normalize(event.action, mode);
      state = advance(state, action);
      events.push(action);
    }
    return { state, events };
  }

  function apply(expectedRevision, candidate) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('INVALID_REVISION');
    const action = normalize(candidate, mode);
    const { state, events } = load();
    if (expectedRevision < state.revision
      && JSON.stringify(events[expectedRevision]) === JSON.stringify(action)) {
      return { replayed: true, state };
    }
    if (expectedRevision !== state.revision) throw new Error('PROGRESS_CONFLICT');
    if (!Number.isSafeInteger(state.revision + 1)) throw new Error('INVALID_REVISION');
    const updated = advance(state, action);
    const event = { schemaVersion: SCHEMA_VERSION, mode, revision: updated.revision, action };

    available(true);
    const draft = path.join(directory, randomUUID() + '.pending');
    const destination = path.join(directory, eventName(updated.revision));
    const fd = fs.openSync(draft, 'wx', 0o600);
    try {
      try {
        fs.writeFileSync(fd, JSON.stringify(event) + '\n', 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      // Same-directory hard link publishes a fully written event without overwriting a competing writer.
      try { fs.linkSync(draft, destination); }
      catch (error) {
        if (error.code === 'EEXIST') throw new Error('PROGRESS_CONFLICT');
        throw error;
      }
    } finally {
      fs.unlinkSync(draft);
    }
    return { replayed: false, state: updated };
  }

  return { status: () => load().state, apply };
}

function run(input) {
  const customer = input[0] === '--customer';
  const mode = customer ? 'customer-reported' : 'simulation';
  const args = customer ? input.slice(1) : input;
  const [command, revision, subject, detail, extra, phone] = args;
  const store = createProgressStore(path.resolve(__dirname, '..'), mode);
  if (command === 'status' && args.length === 1) return store.status();
  if (command === 'checks' && args.length === 1) {
    return { mode, stages: customer ? CUSTOMER_CHECKS : STAGE_CHECKS,
      targets: customer ? CUSTOMER_CLAUDE_STAGES : CLAUDE_STAGES, routes: NODE_ROUTES,
      ...(customer && { phones: PHONES }),
      failureReasons: REASONS, changeScopes: Object.keys(customer ? CUSTOMER_INVALIDATION : INVALIDATION) };
  }
  if (!/^(0|[1-9][0-9]*)$/.test(revision ?? '')) throw new Error('INVALID_REVISION');
  let action;
  const withPhone = customer && args.length === 6 && subject === 'preflight';
  if (command === 'pass' && (args.length === 4 || args.length === 5 || withPhone)) {
    action = { type: 'pass', stage: subject, checks: detail.split(',') };
    if (subject === 'preflight' && extra !== undefined) action.targets = extra.split(',');
    else if (subject === 'vps' && extra !== undefined) action.route = extra;
    else if (extra !== undefined) throw new Error('INVALID_ACTION_FIELDS');
    if (withPhone) action.phone = phone;
  } else if (customer && command === 'record' && args.length === 4) {
    action = { type: 'record', stage: subject, checks: detail.split(',') };
  } else if (customer && command === 'restore' && args.length === 3) {
    action = { type: 'restore', stage: subject };
  } else if (command === 'fail' && args.length === 4) {
    action = { type: 'fail', stage: subject, reason: detail };
  } else if (command === 'invalidate' && args.length === 3) {
    action = { type: 'invalidate', scope: subject };
  } else {
    throw new Error('INVALID_COMMAND');
  }
  return store.apply(Number(revision), action);
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(run(process.argv.slice(2)), null, 2) + '\n');
  } catch (error) {
    const message = /^[A-Z_]+$/.test(error.message) ? error.message : 'PROGRESS_IO_OR_FORMAT_ERROR';
    const hints = {
      PROGRESS_CONFLICT: '进度已被另一条操作更新。先运行 status，按返回的 revision 和 next 继续，不要删除进度。',
      RESTORE_REQUIRED: '先按 guides/recovery.md 恢复原连接，确认可用后用 restore 记录，再重新验收当前设备。',
      STAGE_OUT_OF_ORDER: '先运行 status，使用 next 指定的阶段；可用检查项见 checks。',
      INVALID_REVISION: '先运行 status，使用返回的 revision 修订号。',
      NO_PENDING_RESTORE: '当前没有待恢复记录。先运行 status 确认阶段和下一步。',
      INVALID_CHECKS: '运行 checks 查看允许的检查项，仅记录已确认的结果。',
      INVALID_PROGRESS_EVENT: '进度文件异常。保留原目录和备份，改用本地反馈表，请 Agent 核对事件文件；不要删除重建。',
      PROGRESS_SEQUENCE_INVALID: '进度记录缺号或文件名异常。保留全部文件和备份，请 Agent 核对，不要跳过记录。'
    };
    process.stderr.write(message + '\n' + (hints[message] ?? '操作未完成。先运行 status 和 checks 核对参数；无法读取时保留原文件，参考 README.md 和本地反馈表续接。') + '\n');
    process.exitCode = 1;
  }
}

module.exports = { createProgressStore };
