#!/usr/bin/env node

/**
 * Firebase Admin Manager
 * Script para manejar Firestore desde Node.js
 * Uso: node scripts/firebase-admin.js [comando]
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const CryptoJS = require('crypto-js');

// Inicializar Firebase Admin
const credentialsPath = path.join(__dirname, '../firebase-credentials.json');

if (!fs.existsSync(credentialsPath)) {
  console.error('❌ Error: No se encontró firebase-credentials.json');
  console.error(`   Ruta esperada: ${credentialsPath}`);
  process.exit(1);
}

const serviceAccount = require(credentialsPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();
const ENCRYPTION_KEY = process.env.REACT_APP_ENCRYPTION_KEY || 'SIGVEM-MILITARY-GRADE-ENCRYPTION-2026';
const MAX_BACKUP_FILES = 10;

function toAuthEmail(username) {
  const safeLocalPart = String(username || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.');

  return `${safeLocalPart || 'usuario'}@sigvem.local`;
}

console.log('✅ Firebase Admin SDK inicializado\n');

// COMANDO: Aplicar reglas de seguridad
async function deployRules() {
  console.log('📋 Aplicando reglas de Firestore...');
  console.log('⚠️  Debes hacer esto manualmente en Firebase Console');
  console.log('    https://console.firebase.google.com/project/sigvem-2/firestore/rules\n');
  
  const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // MODO DESARROLLO - Permitir todo (usa esto temporalmente)
    match /{document=**} {
      allow read, write, delete: if true;
    }
  }
}`;

  console.log('Copia estas reglas:\n');
  console.log('═'.repeat(70));
  console.log(rules);
  console.log('═'.repeat(70));
  console.log('\n1. Ve a Firebase Console');
  console.log('2. Firestore Database > Rules');
  console.log('3. Copia y pega el código arriba');
  console.log('4. Haz clic en "Publish"\n');
}

// COMANDO: Crear índices
async function createIndexes() {
  console.log('🔍 Creando índices en Firestore...\n');
  
  const indexes = [
    { collection: 'auditLogs', field: 'timestamp', direction: 'descending' },
    { collection: 'users', fields: [{ path: 'companyId', direction: 'ascending' }, { path: 'role', direction: 'ascending' }] },
    { collection: 'users', fields: [{ path: 'sectionId', direction: 'ascending' }, { path: 'role', direction: 'ascending' }] },
    { collection: 'vehicles', fields: [{ path: 'sectionId', direction: 'ascending' }, { path: 'status', direction: 'ascending' }] },
    { collection: 'sections', fields: [{ path: 'companyId', direction: 'ascending' }, { path: 'isArchived', direction: 'ascending' }] }
  ];

  console.log('Índices necesarios:\n');
  indexes.forEach((idx, i) => {
    const fields = idx.fields ? 
      idx.fields.map(f => `${f.path} (${f.direction})`).join(', ') :
      `${idx.field} (${idx.direction})`;
    console.log(`  ${i + 1}. ${idx.collection}: ${fields}`);
  });

  console.log('\n⚠️  Los índices deben crearse manualmente en Firebase Console');
  console.log('    https://console.firebase.google.com/project/sigvem-2/firestore/indexes\n');
}

// COMANDO: Cargar datos de prueba
async function loadTestData() {
  console.log('🧪 Cargando datos de prueba...\n');
  
  try {
    // Crear compañía de prueba
    const companiesRef = db.collection('companies');
    const companyDoc = await companiesRef.add({
      name: 'TEST Company',
      createdAt: admin.firestore.Timestamp.now()
    });
    console.log(`✅ Compañía creada: ${companyDoc.id}`);

    // Crear sección de prueba
    const sectionsRef = db.collection('sections');
    const sectionDoc = await sectionsRef.add({
      name: 'TEST Section',
      companyId: companyDoc.id,
      accessCode: 'TEST123',
      createdAt: admin.firestore.Timestamp.now()
    });
    console.log(`✅ Sección creada: ${sectionDoc.id}`);

    // Crear usuario super_admin
    const usersRef = db.collection('users');
    const userDoc = await usersRef.add({
      username: 'admin_test',
      password: 'Test123!@#',
      role: 'super_admin',
      companyId: companyDoc.id,
      createdAt: admin.firestore.Timestamp.now()
    });
    console.log(`✅ Usuario creado: ${userDoc.id}`);

    // Crear vehículo de prueba
    const vehiclesRef = db.collection('vehicles');
    const vehicleDoc = await vehiclesRef.add({
      plate: 'TEST-001',
      brand: 'Toyota',
      model: 'Hiace',
      sectionId: sectionDoc.id,
      status: 'OPERATIVO',
      createdAt: admin.firestore.Timestamp.now()
    });
    console.log(`✅ Vehículo creado: ${vehicleDoc.id}`);

    console.log('\n✅ Datos de prueba cargados exitosamente!\n');
    
  } catch (err) {
    console.error('❌ Error cargando datos:', err.message);
  }
}

// COMANDO: Backup
async function backup() {
  console.log('💾 Creando backup...\n');
  
  try {
    const backup = {
      timestamp: new Date().toISOString(),
      collections: {},
      summary: {
        totalCollections: 0,
        totalDocuments: 0
      }
    };

    const collections = ['companies', 'sections', 'vehicles', 'users', 'auditLogs'];
    backup.summary.totalCollections = collections.length;
    
    for (const col of collections) {
      console.log(`  Haciendo backup de "${col}"...`);
      const snapshot = await db.collection(col).get();
      backup.collections[col] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`    ✓ ${snapshot.size} documentos`);
      backup.summary.totalDocuments += snapshot.size;
    }

    const backupPath = path.join(__dirname, `../backups/backup-${Date.now()}.json`);
    const backupDir = path.dirname(backupPath);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`\n✅ Backup guardado: ${backupPath}\n`);
    console.log(`📦 Total colecciones: ${backup.summary.totalCollections}`);
    console.log(`📄 Total documentos: ${backup.summary.totalDocuments}\n`);

    rotateBackups(backupDir, MAX_BACKUP_FILES);

  } catch (err) {
    console.error('❌ Error en backup:', err.message);
  }
}

function rotateBackups(backupDir, keepCount) {
  try {
    const backupFiles = fs
      .readdirSync(backupDir)
      .filter((name) => /^backup-\d+\.json$/i.test(name))
      .map((name) => ({
        name,
        path: path.join(backupDir, name),
        mtimeMs: fs.statSync(path.join(backupDir, name)).mtimeMs
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (backupFiles.length <= keepCount) {
      console.log(`🧹 Retención: ${backupFiles.length} backups (límite ${keepCount}), no hay archivos para borrar.\n`);
      return;
    }

    const filesToDelete = backupFiles.slice(keepCount);
    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
      console.log(`🗑️  Backup antiguo eliminado: ${file.name}`);
    }

    console.log(`✅ Retención aplicada: se conservan los ${keepCount} backups más recientes.\n`);
  } catch (err) {
    console.error('⚠️ Error aplicando retención de backups:', err.message || err);
  }
}

// COMANDO: Información de Firestore
async function info() {
  console.log('📊 Información de Firestore:\n');
  
  try {
    const collections = ['companies', 'sections', 'vehicles', 'users', 'auditLogs'];
    
    for (const col of collections) {
      const snapshot = await db.collection(col).count().get();
      console.log(`  ${col}: ${snapshot.data().count} documentos`);
    }
    console.log();

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// COMANDO: Migrar usuarios Firestore -> Firebase Auth + users/{uid}
async function migrateAuthUsers() {
  console.log('🔄 Migrando usuarios a Firebase Auth y users/{uid}...\n');

  try {
    const usersSnapshot = await db.collection('users').get();
    if (usersSnapshot.empty) {
      console.log('No hay usuarios para migrar.');
      return;
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data() || {};
      const username = String(userData.username || '').trim();
      if (!username) {
        console.log(`⚠️  Usuario sin username en doc ${userDoc.id}, omitido`);
        skipped++;
        continue;
      }

      const email = String(userData.email || toAuthEmail(username)).trim().toLowerCase();

      let plainPassword = '';
      const rawPassword = String(userData.password || '');
      if (rawPassword) {
        try {
          const decrypted = CryptoJS.AES.decrypt(rawPassword, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
          plainPassword = decrypted || rawPassword;
        } catch {
          plainPassword = rawPassword;
        }
      }

      if (!plainPassword || plainPassword.length < 8) {
        plainPassword = `Tmp-${Math.random().toString(36).slice(2, 6)}A1!`;
      }

      try {
        let authUser;
        try {
          authUser = await admin.auth().getUserByEmail(email);
        } catch (err) {
          if (err.code === 'auth/user-not-found') {
            authUser = await admin.auth().createUser({
              email,
              password: plainPassword,
              displayName: username
            });
          } else {
            throw err;
          }
        }

        const uid = authUser.uid;
        const targetRef = db.collection('users').doc(uid);

        const payload = {
          ...userData,
          username,
          email,
          authUid: uid,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          legacyDocId: userDoc.id
        };

        await targetRef.set(payload, { merge: true });

        if (userDoc.id !== uid) {
          await userDoc.ref.delete();
        }

        migrated++;
        console.log(`✅ ${username} -> ${uid}`);
      } catch (err) {
        failed++;
        const message = err.message || String(err);
        if (message.includes('There is no configuration corresponding to the provided identifier')) {
          console.error(`❌ Error migrando ${username}: proveedor Email/Password no habilitado en Firebase Auth.`);
          console.error('   Acción requerida: Firebase Console > Authentication > Sign-in method > Email/Password > Enable');
        } else {
          console.error(`❌ Error migrando ${username}:`, message);
        }
      }
    }

    console.log('\n📊 Resumen migración auth');
    console.log(`   Migrados: ${migrated}`);
    console.log(`   Omitidos: ${skipped}`);
    console.log(`   Fallidos: ${failed}\n`);
  } catch (err) {
    console.error('❌ Error en migración auth:', err.message || err);
  }
}

// Ejecutar comando
const command = process.argv[2] || 'help';

const commands = {
  'rules': deployRules,
  'indexes': createIndexes,
  'load-data': loadTestData,
  'backup': backup,
  'info': info,
  'migrate-auth': migrateAuthUsers,
  'help': () => {
    console.log(`
Comandos disponibles:

  npm run firebase:rules        - Mostrar reglas de seguridad
  npm run firebase:indexes      - Mostrar índices necesarios
  npm run firebase:load-data    - Cargar datos de prueba
  npm run firebase:backup       - Hacer backup de Firestore
  npm run firebase:info         - Información de Firestore
  npm run firebase:migrate-auth - Migrar usuarios a Firebase Auth

Ejemplo:
  npm run firebase:info
    `);
  }
};

if (commands[command]) {
  commands[command]().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else {
  console.error(`Comando desconocido: ${command}`);
  commands.help();
  process.exit(1);
}
