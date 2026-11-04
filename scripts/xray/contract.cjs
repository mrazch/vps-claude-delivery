'use strict';

const { isDeepStrictEqual } = require('node:util');
const upstream = require('./upstream.json');

const mode = 'simulation';
const flow = 'xtls-rprx-vision';
const serverName = 'reality.example.invalid';
const address = 'vps.example.invalid';
const publicKey = '<simulation-public-key>';
const fingerprint = 'chrome';
const devices = {
  windows: { id: '00000000-0000-4000-8000-000000000001', shortId: '0000000000000001' },
  iphone: { id: '00000000-0000-4000-8000-000000000002', shortId: '0000000000000002' }
};

function validPort(port) {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isExpectedStack(evidence) {
  return evidence?.protocol === 'vless' && evidence.security === 'reality' &&
    evidence.flow === flow;
}

function firewallAllowed(evidence) {
  return evidence.hostFirewall === 'allowed' && evidence.cloudFirewall === 'allowed';
}

function makePlan(route, port, reason) {
  return { mode, route, port, reason };
}

function planNode(input) {
  if (input?.mode !== mode) throw new TypeError('Only simulation inputs are accepted');

  const { existingNode, ports } = input;
  if (existingNode !== null) {
    if (isExpectedStack(existingNode) && validPort(existingNode.port) &&
        existingNode.transport === 'tcp' && existingNode.listener === 'xray' &&
        firewallAllowed(existingNode) && existingNode.handshake === 'passed' &&
        existingNode.deviceIsolation === 'confirmed') {
      return makePlan('reuse', existingNode.port, 'existing-compatible');
    }
    return makePlan('blocked', null, 'existing-compatibility-unconfirmed');
  }

  if (!Array.isArray(ports) || Array.from(ports).some(candidate => !validPort(candidate?.port)) ||
      new Set(ports.map(candidate => candidate.port)).size !== ports.length) {
    throw new TypeError('Invalid or duplicate port candidates');
  }
  const eligible = ports.filter(candidate => candidate.listener === 'free' &&
    firewallAllowed(candidate) && ['untested', 'passed'].includes(candidate.handshake));
  const preferred = eligible.find(candidate => candidate.port === 443) ?? eligible[0];
  if (!preferred) return makePlan('blocked', null, 'no-eligible-port');
  return makePlan('new', preferred.port, preferred.port === 443 ? 'preferred-443' : 'fallback-port');
}

function buildArtifacts({ port }) {
  if (!validPort(port)) throw new TypeError('Invalid simulation port');

  const windows = devices.windows;
  const iphone = devices.iphone;
  return {
    mode,
    server: {
      inbounds: [{
        listen: '0.0.0.0',
        port,
        protocol: 'vless',
        settings: {
          decryption: 'none',
          clients: Object.entries(devices).map(([device, credentials]) => ({
            email: device, id: credentials.id, flow
          }))
        },
        streamSettings: {
          network: 'raw',
          security: 'reality',
          realitySettings: {
            target: `${serverName}:443`,
            serverNames: [serverName],
            privateKey: '<simulation-private-key>',
            shortIds: [windows.shortId, iphone.shortId]
          }
        }
      }],
      outbounds: [{ protocol: 'freedom' }]
    },
    windows: {
      name: 'simulation-windows',
      type: 'vless',
      server: address,
      port,
      uuid: windows.id,
      flow,
      tls: true,
      network: 'tcp',
      servername: serverName,
      'client-fingerprint': fingerprint,
      'reality-opts': { 'public-key': publicKey, 'short-id': windows.shortId }
    },
    iphone: {
      format: 'simulation-vless-uri-fields',
      label: 'simulation-iphone',
      protocol: 'vless',
      host: address,
      port,
      id: iphone.id,
      parameters: {
        encryption: 'none',
        type: 'tcp',
        security: 'reality',
        flow,
        sni: serverName,
        fp: fingerprint,
        pbk: publicKey,
        sid: iphone.shortId
      }
    }
  };
}

function validateArtifacts(bundle) {
  const port = bundle?.server?.inbounds?.[0]?.port;
  return validPort(port) && isDeepStrictEqual(bundle, buildArtifacts({ port }));
}

function checkedPlan(plan) {
  const { route, port, reason } = plan ?? {};
  const expected = makePlan(route, port, reason);
  const valid = isDeepStrictEqual(plan, expected) && (
    (route === 'new' && validPort(port) && reason === (port === 443 ? 'preferred-443' : 'fallback-port')) ||
    (route === 'reuse' && validPort(port) && reason === 'existing-compatible') ||
    (route === 'blocked' && port === null &&
      ['existing-compatibility-unconfirmed', 'no-eligible-port'].includes(reason))
  );
  if (!valid) throw new TypeError('Invalid simulation plan');
  return expected;
}

function evidenceStatus(value, matches) {
  if (value === undefined) return 'pending';
  return matches(value) ? 'passed' : 'failed';
}

function makeReceipt(plan, evidence) {
  const statuses = Object.values(evidence);
  let status = 'pending';
  if (plan.route === 'blocked' || statuses.includes('failed')) status = 'failed';
  else if (statuses.every(result => result === 'passed')) status = 'passed';
  return { schemaVersion: 1, mode, plan, evidence, status };
}

function createReceipt({ plan, listener, handshake, exit }) {
  plan = checkedPlan(plan);
  if (plan.route === 'blocked') {
    return makeReceipt(plan, { listener: 'pending', handshake: 'pending', exit: 'pending' });
  }
  const evidence = {
    listener: evidenceStatus(listener, observed =>
      observed?.port === plan.port && observed.transport === 'tcp' &&
      observed.state === 'listening' && (plan.route === 'new' ?
        observed.version === upstream.core.version :
        typeof observed.version === 'string' && /^v\d{1,4}\.\d{1,2}\.\d{1,2}$/.test(observed.version))),
    handshake: evidenceStatus(handshake, observed =>
      observed?.port === plan.port && isExpectedStack(observed) && observed.result === 'passed'),
    exit: evidenceStatus(exit, observed => observed?.via === 'tunnel' &&
      observed.result === 'matches-vps')
  };
  return makeReceipt(plan, evidence);
}

function readReceipt(receipt) {
  const plan = checkedPlan(receipt?.plan);
  const evidence = {
    listener: receipt.evidence?.listener,
    handshake: receipt.evidence?.handshake,
    exit: receipt.evidence?.exit
  };
  const validStatuses = plan.route === 'blocked' ? ['pending'] : ['pending', 'passed', 'failed'];
  const expected = makeReceipt(plan, evidence);
  if (!Object.values(evidence).every(status => validStatuses.includes(status)) ||
      !isDeepStrictEqual(receipt, expected)) throw new TypeError('Invalid simulation receipt');
  return expected;
}

module.exports = { planNode, buildArtifacts, validateArtifacts, createReceipt, readReceipt };
