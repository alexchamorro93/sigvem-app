/**
 * VALIDADORES CENTRALIZADOS
 * ==========================
 * Validaciones reutilizables para toda la app
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Valida un nombre de usuario
 */
export const validateUsername = (username: string): ValidationResult => {
  const errors: string[] = [];

  if (!username || username.trim().length === 0) {
    errors.push('El usuario es requerido');
    return { valid: false, errors };
  }

  if (username.length < 3) {
    errors.push('El usuario debe tener al menos 3 caracteres');
  }

  if (username.length > 20) {
    errors.push('El usuario no puede tener más de 20 caracteres');
  }

  // Solo letras, números, puntos y guiones
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    errors.push('El usuario solo puede contener letras, números, puntos y guiones');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida una contraseña
 */
export const validatePassword = (password: string): ValidationResult & { requirements: PasswordRequirements } => {
  const errors: string[] = [];
  const requirements = getPasswordRequirements(password);

  if (!password) {
    errors.push('La contraseña es requerida');
    return { valid: false, errors, requirements };
  }

  if (!requirements.length) {
    errors.push('La contraseña debe tener al menos 8 caracteres');
  }

  if (!requirements.uppercase) {
    errors.push('La contraseña debe contener al menos una mayúscula');
  }

  if (!requirements.lowercase) {
    errors.push('La contraseña debe contener al menos una minúscula');
  }

  if (!requirements.number) {
    errors.push('La contraseña debe contener al menos un número');
  }

  if (!requirements.special) {
    errors.push('La contraseña debe contener al menos un carácter especial (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
    requirements
  };
};

/**
 * Requisitos de contraseña
 */
export interface PasswordRequirements {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

/**
 * Obtiene el estado de cada requisito de contraseña
 */
export const getPasswordRequirements = (password: string): PasswordRequirements => ({
  length: password.length >= 8,
  uppercase: /[A-Z]/.test(password),
  lowercase: /[a-z]/.test(password),
  number: /[0-9]/.test(password),
  special: /[!@#$%^&*]/.test(password)
});

/**
 * Calcula la fortaleza de una contraseña (0-100)
 */
export const calculatePasswordStrength = (password: string): number => {
  let strength = 0;
  const requirements = getPasswordRequirements(password);

  if (requirements.length) strength += 20;
  if (requirements.uppercase) strength += 20;
  if (requirements.lowercase) strength += 20;
  if (requirements.number) strength += 20;
  if (requirements.special) strength += 20;

  // Bonificación por longitud extra
  if (password.length > 12) strength = Math.min(100, strength + 10);
  if (password.length > 16) strength = Math.min(100, strength + 10);

  return strength;
};

/**
 * Obtiene etiqueta de fortaleza
 */
export const getPasswordStrengthLabel = (strength: number): { label: string; color: string } => {
  if (strength < 20) return { label: 'Muy débil', color: '#ef4444' };
  if (strength < 40) return { label: 'Débil', color: '#f97316' };
  if (strength < 60) return { label: 'Regular', color: '#eab308' };
  if (strength < 80) return { label: 'Buena', color: '#22c55e' };
  return { label: 'Muy fuerte', color: '#16a34a' };
};

/**
 * Valida un email
 */
export const validateEmail = (email: string): ValidationResult => {
  const errors: string[] = [];

  if (!email) {
    errors.push('El email es requerido');
    return { valid: false, errors };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push('El email no es válido');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida una placa de vehículo
 */
export const validateVehiclePlate = (plate: string): ValidationResult => {
  const errors: string[] = [];

  if (!plate || plate.trim().length === 0) {
    errors.push('La placa es requerida');
    return { valid: false, errors };
  }

  if (plate.length < 3) {
    errors.push('La placa debe tener al menos 3 caracteres');
  }

  if (plate.length > 10) {
    errors.push('La placa no puede tener más de 10 caracteres');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida un nombre de compañía
 */
export const validateCompanyName = (name: string): ValidationResult => {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('El nombre de la compañía es requerido');
    return { valid: false, errors };
  }

  if (name.length < 2) {
    errors.push('El nombre debe tener al menos 2 caracteres');
  }

  if (name.length > 50) {
    errors.push('El nombre no puede tener más de 50 caracteres');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida un nombre de sección
 */
export const validateSectionName = (name: string): ValidationResult => {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('El nombre de la sección es requerido');
    return { valid: false, errors };
  }

  if (name.length < 2) {
    errors.push('El nombre debe tener al menos 2 caracteres');
  }

  if (name.length > 40) {
    errors.push('El nombre no puede tener más de 40 caracteres');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida un código de acceso
 */
export const validateAccessCode = (code: string): ValidationResult => {
  const errors: string[] = [];

  if (!code || code.trim().length === 0) {
    errors.push('El código de acceso es requerido');
    return { valid: false, errors };
  }

  if (code.length !== 10) {
    errors.push('El código debe tener exactamente 10 caracteres');
  }

  if (!/^\d{10}$/.test(code)) {
    errors.push('El código debe contener solo números');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validación genérica
 */
export const validateField = (
  value: string,
  rules: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: string) => boolean;
    errorMessage?: string;
  }
): ValidationResult => {
  const errors: string[] = [];

  if (rules.required && (!value || value.trim().length === 0)) {
    errors.push(rules.errorMessage || 'Este campo es requerido');
  }

  if (rules.minLength && value.length < rules.minLength) {
    errors.push(rules.errorMessage || `Mínimo ${rules.minLength} caracteres`);
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    errors.push(rules.errorMessage || `Máximo ${rules.maxLength} caracteres`);
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    errors.push(rules.errorMessage || 'Formato no válido');
  }

  if (rules.custom && !rules.custom(value)) {
    errors.push(rules.errorMessage || 'Validación personalizada fallida');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};
