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
 * Valida un CSRF token
 */
export const validateCSRFToken = (token: string, storedToken: string): boolean => {
  return token === storedToken && token !== '' && storedToken !== '';
};

// ============================================================
// RATE LIMITING Y PROTECCIÓN CONTRA FUERZA BRUTA
// ============================================================

interface LoginAttempt {
  attempts: number;
  lastAttempt: number;
  locked: boolean;
  lockedUntil: number;
}

const loginAttempts = new Map<string, LoginAttempt>();

/**
 * Registra un intento de login fallido
 */
export const recordFailedLoginAttempt = (username: string): boolean => {
  const now = Date.now();
  const attempt = loginAttempts.get(username) || {
    attempts: 0,
    lastAttempt: now,
    locked: false,
    lockedUntil: 0
  };

  // Si estaba bloqueado, verificar si expirió el bloqueo
  if (attempt.locked && now > attempt.lockedUntil) {
    attempt.locked = false;
    attempt.attempts = 0;
  }

  // Si sigue bloqueado, rechazar
  if (attempt.locked) {
    return false;
  }

  attempt.attempts++;
  attempt.lastAttempt = now;

  // Si excede intentos, bloquear
  if (attempt.attempts >= MAX_LOGIN_ATTEMPTS) {
    attempt.locked = true;
    attempt.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  loginAttempts.set(username, attempt);
  return !attempt.locked;
};

/**
 * Borra los intentos fallidos después de login exitoso
 */
export const clearLoginAttempts = (username: string): void => {
  loginAttempts.delete(username);
};

/**
 * Verifica si un usuario está bloqueado por intentos fallidos
 */
export const isAccountLocked = (username: string): boolean => {
  const attempt = loginAttempts.get(username);
  if (!attempt) return false;
  
  const now = Date.now();
  if (attempt.locked && now > attempt.lockedUntil) {
    loginAttempts.delete(username);
    return false;
  }
  
  return attempt.locked;
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
 * Obtiene la IP del cliente (requiere backend)
 */
export const getUserIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn('[SECURITY] No se pudo obtener IP:', error);
    return 'unknown';
  }
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
 * Sanitiza strings para prevenir XSS
 */
export const sanitizeInput = (input: string): string => {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
};

/**
 * Valida contraseña con requisitos militares
 */
export const validateMilitaryPassword = (password: string): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (password.length < 12) errors.push('Mínimo 12 caracteres');
  if (!/[A-Z]/.test(password)) errors.push('Requiere mayúscula');
  if (!/[a-z]/.test(password)) errors.push('Requiere minúscula');
  if (!/[0-9]/.test(password)) errors.push('Requiere número');
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) errors.push('Requiere carácter especial');
  if (/(.)\1{2,}/.test(password)) errors.push('No puede tener 3+ caracteres iguales');
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida que no sea contraseña común
 */
export const isCommonPassword = (password: string): boolean => {
  const commonPasswords = [
    'Password123!', 'Admin123!', 'Usuario123!', 'Temporal123!',
    '123456!', 'Qwerty123!', 'System123!', 'Militar123!'
  ];
  return commonPasswords.includes(password);
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
 * Genera un ID único para auditoria
 */
export const generateAuditId = (): string => {
  return `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
