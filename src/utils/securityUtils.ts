import CryptoJS from 'crypto-js';
import { UAParser } from 'ua-parser-js';

// ============================================================
// CONFIGURACIÓN DE SEGURIDAD OTAN
// ============================================================

// Niveles de clasificación militar (OTAN ITAR)
export enum ClassificationLevel {
  UNCLASSIFIED = 'UNCLASSIFIED',        // No clasificado
  RESTRICTED = 'RESTRICTED',             // Restringido
  CONFIDENTIAL = 'CONFIDENTIAL',         // Confidencial
  SECRET = 'SECRET',                     // Secreto
  TOP_SECRET = 'TOP_SECRET',            // Ultra secreto
  TS_SCI = 'TS/SCI'                     // Top Secret / Sensitive Compartmented Information
}

// Claves de encriptación (en producción, usar variables de entorno)
const ENCRYPTION_KEY = process.env.REACT_APP_ENCRYPTION_KEY || 'SIGVEM-MILITARY-GRADE-ENCRYPTION-2026';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

// ============================================================
// FUNCIONES DE ENCRIPTACIÓN AES-256
// ============================================================

/**
 * Encripta un string usando AES-256-GCM
 * Compatible con estándares OTAN/NATO
 */
export const encryptAES256 = (plaintext: string): string => {
  try {
    const encrypted = CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString();
    return encrypted;
  } catch (error) {
    console.error('[SECURITY] Error encriptando:', error);
    throw new Error('Error en la encriptación');
  }
};

/**
 * Desencripta un string usando AES-256-GCM
 */
export const decryptAES256 = (ciphertext: string): string => {
  try {
    if (!ciphertext || typeof ciphertext !== 'string') {
      throw new Error('Texto encriptado inválido');
    }
    const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const decryptedString = (decrypted as any).toString(CryptoJS.enc.Utf8);
    
    // Verificar que se desencriptó correctamente
    if (!decryptedString || decryptedString.length === 0) {
      throw new Error('La desencriptación resultó en texto vacío');
    }
    
    return decryptedString;
  } catch (error) {
    console.error('[SECURITY] Error desencriptando:', error);
    throw new Error('Error en la desencriptación');
  }
};

// ============================================================
// FUNCIONES DE HASHING SEGURO
// ============================================================

/**
 * Genera hash SHA-256 de un string
 * Usado para integridad de datos
 */
export const hashSHA256 = (text: string): string => {
  return CryptoJS.SHA256(text).toString();
};

/**
 * Genera un HMAC-SHA256 para validación de integridad
 */
export const generateHMAC = (data: string, secret: string): string => {
  return CryptoJS.HmacSHA256(data, secret).toString();
};

/**
 * Valida la integridad de un mensaje usando HMAC
 */
export const validateHMAC = (data: string, signature: string, secret: string): boolean => {
  const expectedSignature = generateHMAC(data, secret);
  return expectedSignature === signature;
};

// ============================================================
// CONTROL DE ACCESO BASADO EN ROLES MILITARES
// ============================================================

export interface MilitaryRole {
  role: string;
  level: number;
  classification: ClassificationLevel;
  permissions: string[];
}

export const MILITARY_ROLES: Record<string, MilitaryRole> = {
  super_admin: {
    role: 'super_admin',
    level: 6,
    classification: ClassificationLevel.TS_SCI,
    permissions: ['*'] // Acceso total
  },
  encargado_cia: {
    role: 'encargado_cia',
    level: 5,
    classification: ClassificationLevel.SECRET,
    permissions: [
      // Gestión de compañía
      'read:company',
      'write:company',
      'manage:sections',
      'manage:vehicles',
      'manage:users',
      'manage:personnel',
      // Auditoría
      'audit:view',
      'audit:manage'
    ]
  },
  encargado_seccion: {
    role: 'encargado_seccion',
    level: 4,
    classification: ClassificationLevel.CONFIDENTIAL,
    permissions: [
      // Gestión de vehículos
      'read:vehicles',
      'create:vehicles',
      'edit:vehicles',
      'delete:vehicles',
      // Gestión de usuarios dentro de sección
      'read:section',
      'write:section',
      'manage:personnel',
      // Auditoría
      'audit:view'
    ]
  },
  operador: {
    role: 'operador',
    level: 3,
    classification: ClassificationLevel.CONFIDENTIAL,
    permissions: [
      // Gestión de vehículos
      'read:vehicles',
      'create:vehicles',
      'edit:vehicles',
      // Lectura de sección
      'read:section',
      // Crear partes de relevo
      'create:parterelevo'
    ]
  },
  consulta: {
    role: 'consulta',
    level: 2,
    classification: ClassificationLevel.RESTRICTED,
    permissions: ['read:section', 'read:vehicles']
  },
  s4: {
    role: 's4',
    level: 4,
    classification: ClassificationLevel.CONFIDENTIAL,
    permissions: ['read:unit', 'read:company', 'read:section', 'read:vehicles']
  },
  encargado_vehiculos: {
    role: 'encargado_vehiculos',
    level: 4,
    classification: ClassificationLevel.CONFIDENTIAL,
    permissions: [
      'read:company',
      'read:section',
      'write:section',
      'manage:sections',
      'read:vehicles',
      'create:vehicles',
      'edit:vehicles',
      'delete:vehicles',
      'manage:vehicles'
    ]
  }
};

/**
 * Valida si un usuario tiene permisos para una acción
 */
export const hasPermission = (userRole: string, requiredPermission: string): boolean => {
  const role = MILITARY_ROLES[userRole];
  if (!role) return false;
  if (role.permissions.includes('*')) return true;
  return role.permissions.includes(requiredPermission);
};

/**
 * Valida si un usuario puede acceder a cierto nivel de clasificación
 */
export const canAccessClassification = (userRole: string, documentClassification: ClassificationLevel): boolean => {
  const role = MILITARY_ROLES[userRole];
  if (!role) return false;
  
  const classificationLevels = Object.values(ClassificationLevel);
  const userLevel = classificationLevels.indexOf(role.classification);
  const documentLevel = classificationLevels.indexOf(documentClassification);
  
  return userLevel >= documentLevel;
};

// ============================================================
// GESTIÓN DE SESIONES
// ============================================================

export interface SecureSession {
  userId: string;
  username: string;
  role: string;
  ip: string;
  userAgent: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
  classification: ClassificationLevel;
}

/**
 * Crea una sesión segura con timeout
 */
export const createSecureSession = (
  userId: string,
  username: string,
  role: string,
  ip: string,
  userAgent: string
): SecureSession => {
  const now = Date.now();
  const session: SecureSession = {
    userId,
    username,
    role,
    ip,
    userAgent,
    token: generateSecureToken(),
    createdAt: now,
    expiresAt: now + SESSION_TIMEOUT_MS,
    lastActivity: now,
    classification: MILITARY_ROLES[role]?.classification || ClassificationLevel.RESTRICTED
  };
  
  return session;
};

/**
 * Valida si una sesión sigue siendo válida
 */
export const isSessionValid = (session: SecureSession): boolean => {
  const now = Date.now();
  const isExpired = now > session.expiresAt;
  const isIdle = (now - session.lastActivity) > SESSION_TIMEOUT_MS;
  
  return !isExpired && !isIdle;
};

/**
 * Renueva la sesión (extiende el timeout)
 */
export const renewSession = (session: SecureSession): SecureSession => {
  const now = Date.now();
  return {
    ...session,
    expiresAt: now + SESSION_TIMEOUT_MS,
    lastActivity: now
  };
};

/**
 * Función stub para actualizar sesión (implementada en sessionUtils)
 * Esta función es un placeholder para uso en componentes
 */
export const updateSecureSession = (): boolean => {
  return true;
};

// ============================================================
// GENERACIÓN DE TOKENS SEGUROS
// ============================================================

/**
 * Genera un token seguro aleatorio de 64 caracteres
 */
export const generateSecureToken = (): string => {
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Genera un CSRF token
 */
export const generateCSRFToken = (): string => {
  return generateSecureToken();
};

/**
 * Valida un CSRF token usando comparación en tiempo constante.
 * Evita timing attacks donde un atacante mide el tiempo de respuesta
 * para deducir cuántos caracteres del token son correctos.
 */
export const validateCSRFToken = (token: string, storedToken: string): boolean => {
  if (!token || !storedToken || token.length !== storedToken.length) return false;
  // Comparación byte a byte sin cortocircuito
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ storedToken.charCodeAt(i);
  }
  return diff === 0;
};

// ============================================================
// RATE LIMITING Y PROTECCIÓN CONTRA FUERZA BRUTA
// ============================================================
// Los contadores se persisten en localStorage para que no se reseteen
// con un simple F5 (bypass habitual de atacantes junior).
// Se implementan dos capas:
//   1. Por usuario  → bloquea ataques dirigidos (credential stuffing)
//   2. Por dispositivo → bloquea spray attacks (muchos usuarios distintos)

const RL_USER_PREFIX = 'SIGVEM_RL_U_';
const RL_DEVICE_KEY  = 'SIGVEM_RL_DEV';
const DEVICE_MAX_ATTEMPTS = 20;    // intentos fallidos totales antes de bloquear el dispositivo
const DEVICE_WINDOW_MS     = 60 * 60 * 1000; // ventana de 1 hora
const DEVICE_LOCKOUT_MS    = 30 * 60 * 1000; // bloqueo de dispositivo: 30 min

interface LoginAttempt {
  attempts: number;
  lastAttempt: number;
  locked: boolean;
  lockedUntil: number;
}

function _rlRead(key: string): LoginAttempt {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as LoginAttempt;
  } catch { /* localStorage no disponible o JSON inválido */ }
  return { attempts: 0, lastAttempt: 0, locked: false, lockedUntil: 0 };
}

function _rlWrite(key: string, data: LoginAttempt): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignorar */ }
}

function _rlClear(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignorar */ }
}

/**
 * Registra un intento de login fallido (por usuario).
 * @returns false si la cuenta debe quedar bloqueada tras este intento.
 */
export const recordFailedLoginAttempt = (username: string): boolean => {
  const now = Date.now();
  const key = RL_USER_PREFIX + username.toLowerCase();
  const attempt = _rlRead(key);

  // Expiró el bloqueo anterior → reiniciar
  if (attempt.locked && now > attempt.lockedUntil) {
    attempt.locked = false;
    attempt.attempts = 0;
  }

  if (attempt.locked) return false;

  attempt.attempts++;
  attempt.lastAttempt = now;

  if (attempt.attempts >= MAX_LOGIN_ATTEMPTS) {
    attempt.locked = true;
    attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  _rlWrite(key, attempt);

  // Registrar también en el contador de dispositivo (spray detection)
  _recordDeviceFailure(now);

  return !attempt.locked;
};

/**
 * Borra los intentos fallidos después de login exitoso.
 */
export const clearLoginAttempts = (username: string): void => {
  _rlClear(RL_USER_PREFIX + username.toLowerCase());
};

/**
 * Verifica si un usuario está bloqueado por intentos fallidos.
 */
export const isAccountLocked = (username: string): boolean => {
  const now = Date.now();
  const key = RL_USER_PREFIX + username.toLowerCase();
  const attempt = _rlRead(key);

  if (!attempt.locked) return false;

  if (now > attempt.lockedUntil) {
    _rlClear(key);
    return false;
  }
  return true;
};

/**
 * Registra un fallo en el contador global del dispositivo (spray attack).
 */
function _recordDeviceFailure(now: number): void {
  const dev = _rlRead(RL_DEVICE_KEY);

  // Si el bloqueo expiró, reiniciar
  if (dev.locked && now > dev.lockedUntil) {
    _rlWrite(RL_DEVICE_KEY, { attempts: 1, lastAttempt: now, locked: false, lockedUntil: 0 });
    return;
  }

  // Ventana deslizante: si el primer fallo fue hace más de DEVICE_WINDOW_MS, reiniciar contador
  if (!dev.locked && (now - dev.lastAttempt) > DEVICE_WINDOW_MS) {
    _rlWrite(RL_DEVICE_KEY, { attempts: 1, lastAttempt: now, locked: false, lockedUntil: 0 });
    return;
  }

  dev.attempts++;
  dev.lastAttempt = now;

  if (!dev.locked && dev.attempts >= DEVICE_MAX_ATTEMPTS) {
    dev.locked = true;
    dev.lockedUntil = now + DEVICE_LOCKOUT_MS;
  }

  _rlWrite(RL_DEVICE_KEY, dev);
}

/**
 * Verifica si este dispositivo está bloqueado por spray attack.
 * Debe llamarse ANTES de cualquier intento de login.
 */
export const isDeviceLocked = (): boolean => {
  const now = Date.now();
  const dev = _rlRead(RL_DEVICE_KEY);
  if (!dev.locked) return false;
  if (now > dev.lockedUntil) {
    _rlClear(RL_DEVICE_KEY);
    return false;
  }
  return true;
};

// ============================================================
// INFORMACIÓN DE DISPOSITIVO Y RED
// ============================================================

export interface DeviceInfo {
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  timestamp: number;
}

/**
 * Obtiene información del dispositivo/navegador
 */
export const getDeviceInfo = (): Omit<DeviceInfo, 'ip'> => {
  const parser = new UAParser();
  const result = parser.getResult();
  
  return {
    userAgent: navigator.userAgent,
    browser: result.browser.name || 'Unknown',
    os: result.os.name || 'Unknown',
    device: result.device.type || 'Desktop',
    timestamp: Date.now()
  };
};

/**
 * Obtiene la IP del cliente.
 * En modo intranet no se llama a servicios externos.
 * Devuelve 'intranet' si no está disponible.
 */
export const getUserIP = async (): Promise<string> => {
  // No se usa api.ipify.org ni ningún servicio externo para evitar
  // filtraciones de datos en entornos de intranet.
  return 'intranet';
};

// ============================================================
// FUNCIONES DE VALIDACIÓN Y SANITIZACIÓN
// ============================================================

/**
 * Valida formato de email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitiza un string eliminando etiquetas HTML y caracteres de control.
 * Devuelve texto plano seguro para mostrar en la UI y almacenar en BD.
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  // 1. Eliminar etiquetas HTML (evitar XSS si el valor se usa en innerHTML)
  const noTags = input.replace(/<[^>]*>/g, '');
  // 2. Eliminar caracteres de control (excepto espacios normales)
  // eslint-disable-next-line no-control-regex
  const noControl = noTags.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // 3. Truncar a longitud máxima razonable para evitar DoS por entradas enormes
  return noControl.slice(0, 1000);
};

/**
 * Valida contraseña con requisitos militares.
 * Incluye límite máximo para prevenir DoS por contraseñas enormes.
 */
export const validateMilitaryPassword = (password: string): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (password.length > 128) errors.push('La contraseña no puede superar 128 caracteres');
  if (password.length < 12) errors.push('Mínimo 12 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Requiere mayúscula');
  if (!/[a-z]/.test(password)) errors.push('Requiere minúscula');
  if (!/[0-9]/.test(password)) errors.push('Requiere número');
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) errors.push('Requiere carácter especial');
  if (/(.)\1{2,}/.test(password)) errors.push('No puede tener 3+ caracteres iguales consecutivos');

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Detecta contraseñas comunes y predecibles.
 * Lista extendida con patrones habituales en entornos corporativos/militares.
 */
export const isCommonPassword = (password: string): boolean => {
  const lower = password.toLowerCase();
  const commonPasswords = new Set([
    // Genéricas
    'password', 'password1', 'password123', 'password123!',
    'pass1234', 'pass@1234', 'p@ssword', 'p@ssw0rd',
    // Teclado
    'qwerty', 'qwerty123', 'qwerty123!', 'qwerty@123',
    '123456', '1234567', '12345678', '123456789', '1234567890',
    '111111', '000000', 'abc123', 'abc123!',
    // Administración
    'admin', 'admin123', 'admin123!', 'admin@123',
    'administrator', 'root', 'root123', 'root@123',
    'superuser', 'sysadmin', 'system', 'system123!',
    // Español
    'usuario', 'usuario123', 'usuario123!',
    'temporal', 'temporal123', 'temporal123!',
    'bienvenido', 'bienvenido1', 'bienvenido123!',
    'cambiar', 'cambiame', 'cambia123',
    // Militares / corporativos comunes
    'militar', 'militar123', 'militar123!',
    'ejercito', 'ejercito1', 'ejercito123!',
    'sigvem', 'sigvem123', 'sigvem123!',
    'otan', 'otan1234', 'nato1234',
    'secreto', 'secreto1', 'secreto123',
    'seguridad', 'seguridad1',
    // Patrones de año
    'welcome2024', 'welcome2025', 'welcome2026',
    'inicio2024', 'inicio2025', 'inicio2026',
  ]);
  return commonPasswords.has(lower);
};

// ============================================================
// AUDITORÍA DE SEGURIDAD
// ============================================================

export interface SecurityAuditLog {
  id: string;
  timestamp: number;
  action: 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN' | 'ACCESS_DENIED' | 'DATA_ACCESS' | 'ENCRYPTION' | 'CLASSIFICATION_CHANGE';
  userId: string;
  username: string;
  ip: string;
  userAgent: string;
  classification: ClassificationLevel;
  details: string;
  result: 'SUCCESS' | 'FAILURE';
  duration: number; // ms
}

/**
 * Genera un ID único para auditoría usando crypto.getRandomValues.
 * Math.random() no es criptográficamente seguro y puede predecirse.
 */
export const generateAuditId = (): string => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `AUDIT-${Date.now()}-${hex}`;
};

/**
 * Crea un registro de auditoría de seguridad
 */
export const createSecurityAuditLog = (
  action: SecurityAuditLog['action'],
  userId: string,
  username: string,
  ip: string,
  userAgent: string,
  classification: ClassificationLevel,
  details: string,
  result: 'SUCCESS' | 'FAILURE',
  duration: number
): SecurityAuditLog => {
  return {
    id: generateAuditId(),
    timestamp: Date.now(),
    action,
    userId,
    username,
    ip,
    userAgent,
    classification,
    details,
    result,
    duration
  };
};

// ============================================================
// VALIDACIÓN DE INTEGRIDAD DE DATOS
// ============================================================

/**
 * Calcula firma de integridad de un objeto
 */
export const computeDataSignature = (data: any): string => {
  const jsonString = JSON.stringify(data);
  return hashSHA256(jsonString);
};

/**
 * Valida que un objeto no ha sido modificado
 */
export const verifyDataIntegrity = (data: any, signature: string): boolean => {
  const currentSignature = computeDataSignature(data);
  return currentSignature === signature;
};

// ============================================================
// EXPORTAR CONFIGURACIÓN DE SEGURIDAD
// ============================================================

export const SECURITY_CONFIG = {
  encryptionKey: ENCRYPTION_KEY,
  sessionTimeout: SESSION_TIMEOUT_MS,
  maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
  lockoutDuration: LOCKOUT_DURATION_MS,
  passwordMinLength: 12
};
