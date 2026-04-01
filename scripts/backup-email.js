#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

action().catch((err) => {
  console.error('[backup-email] Fatal error:', err?.message || err);
  process.exit(1);
});

async function action() {
  const projectRoot = path.join(__dirname, '..');
  const backupsDir = path.join(projectRoot, 'backups');

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const backupResult = runBackup(projectRoot);
  const latestBackup = getLatestBackup(backupsDir);

  const recipient = process.env.BACKUP_TO_EMAIL || 'alex.12593@gmail.com';
  const smtpUser = process.env.BACKUP_SMTP_USER || '';
  const smtpPass = process.env.BACKUP_SMTP_PASS || '';

  if (!smtpUser || !smtpPass) {
    console.error('[backup-email] Missing BACKUP_SMTP_USER or BACKUP_SMTP_PASS in .env.local');
    console.error('[backup-email] Backup file was still generated locally.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const fromEmail = process.env.BACKUP_FROM_EMAIL || smtpUser;
  const backupName = latestBackup ? path.basename(latestBackup) : 'N/A';
  const backupSizeKb = latestBackup ? Math.round(fs.statSync(latestBackup).size / 1024) : 0;

  if (backupResult.status === 0 && latestBackup) {
    await transporter.sendMail({
      from: fromEmail,
      to: recipient,
      subject: '[SIGVEM] Backup diario OK',
      text: [
        'Backup diario completado correctamente.',
        `Archivo: ${backupName}`,
        `Tamano aproximado: ${backupSizeKb} KB`,
        `Fecha: ${new Date().toISOString()}`
      ].join('\n'),
      attachments: [
        {
          filename: backupName,
          path: latestBackup,
          contentType: 'application/json'
        }
      ]
    });

    console.log('[backup-email] Backup and email sent successfully.');
    return;
  }

  await transporter.sendMail({
    from: fromEmail,
    to: recipient,
    subject: '[SIGVEM] ERROR en backup diario',
    text: [
      'El backup diario ha fallado.',
      `Fecha: ${new Date().toISOString()}`,
      '',
      'Salida:',
      (backupResult.stdout || '').slice(-4000),
      '',
      'Error:',
      (backupResult.stderr || '').slice(-4000)
    ].join('\n')
  });

  console.error('[backup-email] Backup failed. Error email sent.');
  process.exit(1);
}

function runBackup(projectRoot) {
  return spawnSync('npm', ['run', 'firebase:backup'], {
    cwd: projectRoot,
    shell: true,
    encoding: 'utf8'
  });
}

function getLatestBackup(backupsDir) {
  const candidates = fs
    .readdirSync(backupsDir)
    .filter((name) => /^backup-\d+\.json$/i.test(name))
    .map((name) => path.join(backupsDir, name));

  if (!candidates.length) return null;

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}
