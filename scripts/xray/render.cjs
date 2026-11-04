'use strict';

const { createPrivateKey, createPublicKey } = require('node:crypto');
const { isIP } = require('node:net');

const flow = 'xtls-rprx-vision';
const fingerprint = 'chrome';
// RFC 8410 PKCS#8 wrapper for a 32-byte X25519 private key.
const x25519Prefix = Buffer.from('302e020100300506032b656e04220420', 'hex');
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function checkedHost(value, field, dnsOnly = false) {
  if (typeof value === 'string' && !/\s/.test(value)) {
    if (!dnsOnly && isIP(value) === 4) return value;
    if (!dnsOnly && !value.includes('%') && isIP(value) === 6) {
      return new URL(`http://[${value}]`).hostname.slice(1, -1);
    }
    const labels = value.split('.');
    if (value.length <= 253 && labels.length >= 2 && /^[a-z]/i.test(labels.at(-1)) &&
        labels.every(label => dnsLabel.test(label))) return value.toLowerCase();
  }
  throw new TypeError(`Invalid ${field} host`);
}

function checkedPort(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new TypeError(`Invalid ${field} port`);
  }
  return value;
}

function checkedDevice(device, name) {
  const { id, shortId } = device ?? {};
  if (typeof id !== 'string' || id.length !== 36 || !uuid.test(id) ||
      id === '00000000-0000-0000-0000-000000000000') {
    throw new TypeError(`Invalid ${name} UUID`);
  }
  if (typeof shortId !== 'string' || shortId.trim() !== shortId ||
      !/^(?:[a-f0-9]{2}){1,8}$/i.test(shortId)) {
    throw new TypeError(`Invalid ${name} short ID`);
  }
  return { id: id.toLowerCase(), shortId: shortId.toLowerCase() };
}

function checkedKey(value, field) {
  if (typeof value === 'string' && value.length === 43 && /^[a-z0-9_-]+$/i.test(value)) {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length === 32 && bytes.toString('base64url') === value) return bytes;
  }
  throw new TypeError(`Invalid REALITY ${field} encoding`);
}

function authority(host, port) {
  return isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
}

function checkedClientInputs(input) {
  const address = checkedHost(input?.address, 'node');
  const port = checkedPort(input.port, 'node');
  const serverName = checkedHost(input.serverName, 'REALITY server name', true);
  const windows = checkedDevice(input.windows, 'Windows');
  const hasIphone = Object.hasOwn(input, 'iphone');
  if (hasIphone === Object.hasOwn(input, 'android')) {
    throw new TypeError('Provide exactly one phone: iphone or android');
  }
  const phoneType = hasIphone ? 'iphone' : 'android';
  const phoneLabel = hasIphone ? 'iPhone' : 'Android';
  const phone = checkedDevice(input[phoneType], phoneLabel);
  if (windows.id === phone.id || windows.shortId.padEnd(16, '0') === phone.shortId.padEnd(16, '0')) {
    throw new TypeError(`Windows and ${phoneLabel} must have distinct UUIDs and short IDs`);
  }
  return { address, port, serverName, windows, phone, phoneType, phoneLabel };
}

function clientArtifacts({ address, port, serverName, windows, phone, phoneType, phoneLabel }, publicKey) {
  const parameters = new URLSearchParams({
    encryption: 'none', type: 'tcp', security: 'reality', flow,
    sni: serverName, fp: fingerprint, pbk: publicKey, sid: phone.shortId
  });
  return {
    windows: {
      name: 'VPS-Windows',
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
    [phoneType]: {
      qrPayload: `vless://${phone.id}@${authority(address, port)}?${parameters}#VPS-${phoneLabel}`
    }
  };
}

function renderClientArtifacts(input) {
  const checked = checkedClientInputs(input);
  checkedKey(input.publicKey, 'public key');
  return clientArtifacts(checked, input.publicKey);
}

function renderNewNodeArtifacts(input) {
  const checked = checkedClientInputs(input);
  const { address, port, serverName, windows, phone, phoneType } = checked;
  const targetHost = checkedHost(input.target?.host, 'REALITY target');
  const targetPort = checkedPort(input.target.port, 'REALITY target');
  if (targetHost === address && targetPort === port) {
    throw new TypeError('REALITY target must differ from the node endpoint');
  }
  const keyBytes = checkedKey(input.privateKey, 'private key');
  const privateKey = createPrivateKey({
    key: Buffer.concat([x25519Prefix, keyBytes]), format: 'der', type: 'pkcs8'
  });
  const publicKey = createPublicKey(privateKey).export({ format: 'jwk' }).x;

  return {
    server: {
      inbounds: [{
        listen: '::',
        port,
        protocol: 'vless',
        settings: {
          decryption: 'none',
          clients: [
            { email: 'windows', id: windows.id, flow },
            { email: phoneType, id: phone.id, flow }
          ]
        },
        streamSettings: {
          network: 'raw',
          security: 'reality',
          realitySettings: {
            target: authority(targetHost, targetPort),
            serverNames: [serverName],
            privateKey: input.privateKey,
            shortIds: [windows.shortId, phone.shortId]
          }
        }
      }],
      outbounds: [{ protocol: 'freedom' }]
    },
    ...clientArtifacts(checked, publicKey)
  };
}

module.exports = { renderNewNodeArtifacts, renderClientArtifacts };
