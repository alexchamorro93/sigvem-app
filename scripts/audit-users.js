const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const credCandidates = [
  path.join(process.cwd(), 'firebase-credentials.json'),
  path.join(process.cwd(), '..', 'firebase-credentials.json'),
];

const credPath = credCandidates.find((candidate) => fs.existsSync(candidate));
if (!credPath) {
  console.error('Missing firebase-credentials.json in current or parent directory');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

function toAuthEmail(username) {
  const normalized = String(username || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');

  return `${normalized || 'usuario'}@sigvem.local`;
}

async function authUserExistsByUid(uid) {
  try {
    await admin.auth().getUser(uid);
    return true;
  } catch {
    return false;
  }
}

async function authUserExistsByEmail(email) {
  try {
    await admin.auth().getUserByEmail(email);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const summary = {
    total: users.length,
    missingUsername: 0,
    missingEmail: 0,
    missingAuthUid: 0,
    emailMismatchWithUsername: 0,
    authUserNotFound: 0,
  };

  const findings = [];

  for (const user of users) {
    const username = String(user.username || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const authUid = String(user.authUid || '').trim();
    const expectedEmail = toAuthEmail(username);

    if (!username) summary.missingUsername += 1;
    if (!email) summary.missingEmail += 1;
    if (!authUid) summary.missingAuthUid += 1;
    if (email && email !== expectedEmail) summary.emailMismatchWithUsername += 1;

    let authExists = false;
    let authLookup = 'none';

    if (authUid) {
      authExists = await authUserExistsByUid(authUid);
      authLookup = 'uid';
    }

    if (!authExists && email) {
      authExists = await authUserExistsByEmail(email);
      if (authExists) {
        authLookup = 'email';
      }
    }

    if (!authExists) summary.authUserNotFound += 1;

    const shouldReport =
      !username ||
      !email ||
      !authUid ||
      !authExists ||
      email !== expectedEmail ||
      /chamorro/i.test(username);

    if (shouldReport) {
      findings.push({
        id: user.id,
        username: username || '(vacio)',
        role: user.role || '(sin rol)',
        email: email || '(vacio)',
        expectedEmail,
        authUid: authUid || '(vacio)',
        authExists,
        authLookup,
      });
    }
  }

  const chamorro = findings.filter((f) => /chamorro/i.test(f.username));

  console.log(JSON.stringify({ summary, chamorro, findings }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
