#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const credentialsPath = path.join(__dirname, '../firebase-credentials.json');
if (!fs.existsSync(credentialsPath)) {
  console.error('❌ No se encontró firebase-credentials.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  const signature = signer.sign(privateKey)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    iat: now,
    exp: now + 3600
  };

  const assertion = signJwt(payload, serviceAccount.private_key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`No se pudo obtener access token: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getProjectNumber(accessToken, projectId) {
  const res = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo obtener project number: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.projectNumber;
}

async function enableIdentityToolkit(accessToken, projectNumber) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/identitytoolkit.googleapis.com:enable`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  if (res.status === 200) return;

  const text = await res.text();
  if (res.status === 409 || text.includes('already enabled')) return;

  if (res.status === 403) {
    console.warn('⚠️ Sin permiso para habilitar identitytoolkit API automáticamente. Se intentará continuar.');
    return;
  }

  throw new Error(`No se pudo habilitar identitytoolkit API: ${res.status} ${text}`);
}

async function enableEmailPassword(accessToken, projectId) {
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email`;
  const body = {
    signIn: {
      email: {
        enabled: true,
        passwordRequired: true
      }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`No se pudo activar Email/Password: ${res.status} ${text}`);
  }

  return res.json();
}

(async () => {
  try {
    const projectId = serviceAccount.project_id;
    if (!projectId) {
      throw new Error('project_id no encontrado en credenciales');
    }

    console.log(`🔧 Proyecto: ${projectId}`);
    const token = await getAccessToken();
    const projectNumber = await getProjectNumber(token, projectId);
    console.log(`ℹ️ Project number: ${projectNumber}`);

    await enableIdentityToolkit(token, projectNumber);
    console.log('✅ API identitytoolkit habilitada');

    await enableEmailPassword(token, projectId);
    console.log('✅ Email/Password habilitado en Firebase Auth');
  } catch (err) {
    console.error('❌ Error:', err.message || err);
    process.exit(1);
  }
})();
