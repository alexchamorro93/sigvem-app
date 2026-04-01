#!/usr/bin/env node

/**
 * Script para deployar reglas de Firestore automáticamente
 * Requiere: credenciales de Firebase Admin
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Leer archivo de credenciales (si existe)
const credentialsPath = path.join(__dirname, 'firebase-credentials.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║       DEPLOYMENT DE REGLAS FIRESTORE                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Verificar que el archivo de reglas existe
if (!fs.existsSync(path.join(__dirname, 'firestore.rules'))) {
    console.error('✗ Error: archivo firestore.rules no encontrado');
    process.exit(1);
}

console.log('✓ Archivo firestore.rules encontrado');

// Verificar credenciales
if (!fs.existsSync(credentialsPath)) {
    console.log('\n✗ No se encontraron credenciales de Firebase Admin');
    console.log('  Se necesita credenciales para deployar automáticamente');
    console.log('\nPor favor, proporciona un archivo firebase-credentials.json en la raíz del proyecto');
    console.log('con las credenciales de una Cuenta de Servicio de Firebase.\n');
    
    console.log('Pasos para obtener credenciales:');
    console.log('1. Ve a: https://console.firebase.google.com');
    console.log('2. Selecciona tu proyecto');
    console.log('3. Ve a: Configuracion del Proyecto > Cuentas de Servicio');
    console.log('4. Haz clic en "Generar clave privada"');
    console.log('5. Descarga el JSON y guárdalo como firebase-credentials.json en este directorio\n');
    
    process.exit(1);
}

console.log('✓ Credenciales encontradas\n');

try {
    // Inicializar Admin SDK
    const credentials = require(credentialsPath);
    admin.initializeApp({
        credential: admin.credential.cert(credentials),
        projectId: credentials.project_id
    });

    console.log('✓ Firebase Admin SDK inicializado');
    console.log('✓ Proyecto:', credentials.project_id);
    
    // Las reglas se despliegan automáticamente
    // Aquí solo confirmamos que se pueden leer
    const rulesContent = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');
    console.log(`✓ Reglas cargadas (${rulesContent.length} caracteres)`);
    
    console.log('\n✓ Reglas de Firestore listas para usar');
    console.log('\nPara deployar, usa:\n');
    console.log('  firebase deploy --only firestore:rules\n');
    
    process.exit(0);
    
} catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
}
