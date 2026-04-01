// src/firebaseConfig.ts
/**
 * CONFIGURACIÓN DE FIREBASE
 * =========================
 * Inicializa Firebase con caché persistente y
 * configuración optimizada para rendimiento.
 */

import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { logger } from './utils/logger';

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDbV7xJAsZRn8Q8THjoAI2iAVpxgxiEgOs",
  authDomain: "sigvem-2.firebaseapp.com",
  projectId: "sigvem-2",
  storageBucket: "sigvem-2.firebasestorage.app",
  messagingSenderId: "1016332727173",
  appId: "1:1016332727173:web:69fb9b88676dff4da00aec"
};

// Verificar que la configuración esté completa
if (!firebaseConfig.projectId) {
  throw new Error('Firebase configuration is incomplete');
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

logger.info('Firebase', 'App inicializada', { projectId: firebaseConfig.projectId });

// Inicializar Firestore con caché persistente
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

logger.info('Firestore', 'Inicializado con caché persistente');

// Obtener instancia de autenticación
export const auth = getAuth(app);

logger.info('Auth', 'Autenticación inicializada');

// Exportar app para usar en otros lugares si es necesario
export { app };
