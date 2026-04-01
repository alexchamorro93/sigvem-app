import {
  ClassificationLevel,
  MILITARY_ROLES,
  canAccessClassification,
  encryptAES256,
  decryptAES256,
  computeDataSignature
} from './securityUtils';

/**
 * Interfaz para documentos clasificados
 */
export interface ClassifiedDocument {
  id: string;
  title: string;
  content: any;
  classification: ClassificationLevel;
  encryptedContent?: string;
  signature: string;
  createdBy: string;
  createdAt: number;
  lastModifiedBy: string;
  lastModifiedAt: number;
  accessLog: AccessLogEntry[];
  requiredClearance: ClassificationLevel;
}

export interface AccessLogEntry {
  userId: string;
  username: string;
  timestamp: number;
  action: 'VIEW' | 'EDIT' | 'DELETE' | 'DOWNLOAD' | 'PRINT' | 'SHARE';
  ip: string;
  userAgent: string;
  result: 'ALLOWED' | 'DENIED';
  reason?: string;
}

/**
 * Crea un documento clasificado
 */
export const createClassifiedDocument = (
  title: string,
  content: any,
  classification: ClassificationLevel,
  createdBy: string,
  encrypt: boolean = true
): ClassifiedDocument => {
  const signature = computeDataSignature(content);
  const encryptedContent = encrypt ? encryptAES256(JSON.stringify(content)) : undefined;
  
  return {
    id: `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    content: encrypt ? undefined : content,
    encryptedContent,
    classification,
    signature,
    createdBy,
    createdAt: Date.now(),
    lastModifiedBy: createdBy,
    lastModifiedAt: Date.now(),
    accessLog: [],
    requiredClearance: classification
  };
};

/**
 * Valida acceso a un documento clasificado
 */
export const canAccessDocument = (
  userRole: string,
  document: ClassifiedDocument
): { allowed: boolean; reason?: string } => {
  // Verificar que el usuario tiene permiso para este nivel de clasificación
  if (!canAccessClassification(userRole, document.classification)) {
    return {
      allowed: false,
      reason: `Nivel de clasificación requerido: ${document.classification}`
    };
  }
  
  return { allowed: true };
};

/**
 * Desencripta el contenido de un documento
 */
export const decryptDocumentContent = (document: ClassifiedDocument): any => {
  if (!document.encryptedContent) {
    return document.content;
  }
  
  try {
    const decrypted = decryptAES256(document.encryptedContent);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[CLASSIFICATION] Error desencriptando documento:', error);
    throw new Error('No se pudo desencriptar el documento');
  }
};

/**
 * Registra acceso a un documento
 */
export const logDocumentAccess = (
  document: ClassifiedDocument,
  userId: string,
  username: string,
  action: AccessLogEntry['action'],
  ip: string,
  userAgent: string,
  allowed: boolean,
  reason?: string
): ClassifiedDocument => {
  const entry: AccessLogEntry = {
    userId,
    username,
    timestamp: Date.now(),
    action,
    ip,
    userAgent,
    result: allowed ? 'ALLOWED' : 'DENIED',
    reason
  };
  
  return {
    ...document,
    accessLog: [...document.accessLog, entry]
  };
};

/**
 * Genera reporte de acceso a documento
 */
export const generateAccessReport = (document: ClassifiedDocument): string => {
  const lines = [
    `REPORTE DE ACCESO - DOCUMENTO CLASIFICADO`,
    `Documento: ${document.title}`,
    `ID: ${document.id}`,
    `Clasificación: ${document.classification}`,
    `Creado: ${new Date(document.createdAt).toLocaleString('es-ES')}`,
    `Última modificación: ${new Date(document.lastModifiedAt).toLocaleString('es-ES')}`,
    ``,
    `HISTORIAL DE ACCESO:`,
    ``,
    ...document.accessLog.map(entry => 
      `${entry.timestamp} | ${entry.username} | ${entry.action} | ${entry.result} | ${entry.ip}`
    )
  ];
  
  return lines.join('\n');
};

/**
 * Valida que el documento no ha sido alterado
 */
export const validateDocumentIntegrity = (
  document: ClassifiedDocument,
  originalSignature: string
): boolean => {
  const currentContent = document.encryptedContent ? 
    decryptDocumentContent(document) : 
    document.content;
  
  const currentSignature = computeDataSignature(currentContent);
  return currentSignature === originalSignature;
};

/**
 * Obtiene documentos clasificados en un nivel específico
 */
export const filterDocumentsByClassification = (
  documents: ClassifiedDocument[],
  userRole: string
): ClassifiedDocument[] => {
  return documents.filter(doc => {
    const access = canAccessDocument(userRole, doc);
    return access.allowed;
  });
};
