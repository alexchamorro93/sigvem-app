import {
  SecureSession,
  isSessionValid,
  renewSession,
  encryptAES256,
  decryptAES256
} from './securityUtils';

const SESSION_STORAGE_KEY = 'SIGVEM_SESSION';
const SESSION_CHECK_INTERVAL = 60000; // Verificar sesión cada 60s

/**
 * Almacena una sesión de forma segura (encriptada en localStorage)
 */
export const storeSecureSession = (session: SecureSession): void => {
  try {
    const encrypted = encryptAES256(JSON.stringify(session));
    localStorage.setItem(SESSION_STORAGE_KEY, encrypted);
  } catch (error) {
    console.error('[SESSION] Error almacenando sesión:', error);
  }
};

/**
 * Recupera la sesión almacenada
 */
export const retrieveSecureSession = (): SecureSession | null => {
  try {
    const encrypted = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!encrypted) return null;
    
    try {
      const decrypted = decryptAES256(encrypted);
      if (!decrypted) return null;
      
      const session: SecureSession = JSON.parse(decrypted);
      
      // Validar que la sesión sigue siendo válida
      if (!isSessionValid(session)) {
        clearSecureSession();
        return null;
      }
      
      return session;
    } catch (decryptError) {
      console.warn('[SESSION] No se pudo desencriptar sesión, limpiando...');
      clearSecureSession();
      return null;
    }
  } catch (error) {
    console.error('[SESSION] Error recuperando sesión:', error);
    clearSecureSession();
    return null;
  }
};

/**
 * Limpia la sesión
 */
export const clearSecureSession = (): void => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('[SESSION] Error limpiando sesión:', error);
  }
};

/**
 * Renueva/actualiza la sesión actual
 */
export const updateSecureSession = (): boolean => {
  try {
    const session = retrieveSecureSession();
    if (!session) return false;
    
    const renewed = renewSession(session);
    storeSecureSession(renewed);
    return true;
  } catch (error) {
    console.error('[SESSION] Error renovando sesión:', error);
    return false;
  }
};

/**
 * Inicia la verificación periódica de sesión
 */
export const startSessionMonitoring = (onSessionExpired: () => void): () => void => {
  const interval = setInterval(() => {
    const session = retrieveSecureSession();
    if (!session) {
      onSessionExpired();
      clearInterval(interval);
    }
  }, SESSION_CHECK_INTERVAL);
  
  return () => clearInterval(interval);
};

/**
 * Valida que los datos de sesión sean consistentes
 */
export const validateSessionIntegrity = (session: SecureSession, ip: string, userAgent: string): boolean => {
  // Verificar que IP y User-Agent no hayan cambiado (indicaría session hijacking)
  if (session.ip !== ip) {
    console.warn('[SECURITY] IP cambió - posible session hijacking');
    return false;
  }
  
  if (session.userAgent !== userAgent) {
    console.warn('[SECURITY] User-Agent cambió - posible session hijacking');
    return false;
  }
  
  return true;
};
