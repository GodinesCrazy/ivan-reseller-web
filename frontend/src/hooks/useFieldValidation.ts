import { useState, useEffect } from 'react';

export interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
}

export function useFieldValidation(
  value: string,
  rules: ValidationRule[],
  required: boolean = false
) {
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    // Si está vacío y es requerido
    if (required && !value.trim()) {
      setError('Este campo es requerido');
      setIsValid(false);
      return;
    }

    // Si está vacío y no es requerido, es válido
    if (!value.trim() && !required) {
      setError(null);
      setIsValid(true);
      return;
    }

    // Validar con las reglas
    for (const rule of rules) {
      if (!rule.test(value)) {
        setError(rule.message);
        setIsValid(false);
        return;
      }
    }

    // Si pasa todas las validaciones
    setError(null);
    setIsValid(true);
  }, [value, required, rules]);

  return { error, isValid };
}

// Helpers para crear reglas comunes
export const validationRules = {
  required: (message: string = 'Este campo es requerido'): ValidationRule => ({
    test: (value) => value.trim().length > 0,
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    test: (value) => value.length >= min,
    message: message || `Mínimo ${min} caracteres`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    test: (value) => value.length <= max,
    message: message || `Máximo ${max} caracteres`,
  }),

  pattern: (pattern: RegExp, message: string): ValidationRule => ({
    test: (value) => pattern.test(value),
    message,
  }),

  email: (message: string = 'Email inválido'): ValidationRule => ({
    test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message,
  }),

  url: (message: string = 'URL inválida'): ValidationRule => ({
    test: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message,
  }),

  custom: (test: (value: string) => boolean, message: string): ValidationRule => ({
    test,
    message,
  }),
};

