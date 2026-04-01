/**
 * HOOK: usePasswordValidation
 * ============================
 * Valida contraseñas con memoización para
 * mejor rendimiento en formularios.
 */

import { useMemo, useCallback } from 'react';
import {
  validatePassword,
  getPasswordRequirements,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  PasswordRequirements
} from '../utils/validators';

export interface PasswordValidationResult {
  password: string;
  isValid: boolean;
  errors: string[];
  requirements: PasswordRequirements;
  strength: number;
  strengthLabel: { label: string; color: string };
}

/**
 * Hook para validación de contraseña con memoización
 */
export function usePasswordValidation(password: string): PasswordValidationResult {
  // Memoizar validación para evitar recálculos innecesarios
  const validation = useMemo(() => {
    const result = validatePassword(password);
    const strength = calculatePasswordStrength(password);
    const strengthLabel = getPasswordStrengthLabel(strength);

    return {
      password,
      isValid: result.valid,
      errors: result.errors,
      requirements: result.requirements,
      strength,
      strengthLabel
    };
  }, [password]);

  return validation;
}

/**
 * Hook para validación de dos contraseñas (original y confirmación)
 */
export interface PasswordMatchResult extends PasswordValidationResult {
  passwordConfirm: string;
  passwordsMatch: boolean;
  matchError?: string;
}

export function usePasswordMatch(
  password: string,
  passwordConfirm: string
): PasswordMatchResult {
  const passwordValidation = usePasswordValidation(password);

  const matchResult = useMemo(() => {
    const passwordsMatch = password.length > 0 && password === passwordConfirm;
    let matchError: string | undefined;

    if (passwordConfirm.length > 0 && !passwordsMatch) {
      matchError = 'Las contraseñas no coinciden';
    }

    return {
      ...passwordValidation,
      passwordConfirm,
      passwordsMatch,
      matchError
    };
  }, [password, passwordConfirm, passwordValidation]);

  return matchResult;
}

/**
 * Hook para generar sugerencias de contraseña
 */
export interface PasswordSuggestion {
  password: string;
  strength: number;
  requirements: PasswordRequirements;
}

export function usePasswordSuggestion(length: number = 16): PasswordSuggestion {
  const generatePassword = useCallback(() => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    const allChars = uppercase + lowercase + numbers + special;
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Mezclar caracteres
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }, [length]);

  const suggestion = useMemo(() => {
    const pwd = generatePassword();
    return {
      password: pwd,
      strength: calculatePasswordStrength(pwd),
      requirements: getPasswordRequirements(pwd)
    };
  }, [generatePassword]);

  return suggestion;
}