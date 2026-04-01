/**
 * HOOKS DE OPTIMIZACIÓN
 * =====================
 * Colección de hooks para mejorar rendimiento
 * y evitar re-renders innecesarios.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * useDebounce - Debouncing para búsquedas y filtros
 * Espera a que el usuario deje de escribir antes de ejecutar la acción
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useMemoCallback - Memoizar callbacks
 * Evita re-crear funciones en cada render
 */
export function useMemoCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: any[]
): T {
  return useCallback(callback, deps) as T;
}

/**
 * useThrottle - Throttling para eventos frecuentes (scroll, resize)
 * Ejecuta la acción máximo una vez cada X ms
 */
export function useThrottle<T>(value: T, delay: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRanRef = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRanRef.current >= delay) {
        setThrottledValue(value);
        lastRanRef.current = Date.now();
      }
    }, delay - (Date.now() - lastRanRef.current));

    return () => clearTimeout(handler);
  }, [value, delay]);

  return throttledValue;
}

/**
 * usePrevious - Obtiene el valor previo de una variable
 * Útil para detectar cambios
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * useAsync - Ejecuta operaciones asincrónicas
 * Maneja loading, error y success states automáticamente
 */
export interface UseAsyncState<T> {
  status: 'idle' | 'pending' | 'success' | 'error';
  data: T | null;
  error: Error | null;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: any[] = []
): UseAsyncState<T> & { execute: () => Promise<void> } {
  const [state, setState] = useState<UseAsyncState<T>>({
    status: 'idle',
    data: null,
    error: null
  });

  const execute = useCallback(async () => {
    setState({ status: 'pending', data: null, error: null });
    try {
      const result = await fn();
      setState({ status: 'success', data: result, error: null });
    } catch (error) {
      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }, [fn]);

  useEffect(() => {
    execute();
  }, deps);

  return { ...state, execute };
}

/**
 * useLocalStorage - Sincroniza estado con localStorage
 * Persiste datos entre sesiones
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue];
}

/**
 * useWindowSize - Obtiene el tamaño de la ventana
 * Útil para responsive design
 */
export interface WindowSize {
  width: number | undefined;
  height: number | undefined;
}

export function useWindowSize(): WindowSize {
  const [windowSize, setWindowSize] = useState<WindowSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : undefined,
    height: typeof window !== 'undefined' ? window.innerHeight : undefined
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}

/**
 * useOnClickOutside - Detecta clicks fuera de un elemento
 * Útil para cerrar modales y dropdowns
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: () => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler();
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

/**
 * useMemoizedValue - Memoiza valores complejos
 * Evita cambios innecesarios en dependencias
 */
export function useMemoizedValue<T>(value: T, isEqual?: (a: T, b: T) => boolean): T {
  const ref = useRef<T>(value);
  const prevValueRef = useRef<T>(value);

  const defaultIsEqual = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const compare = isEqual || defaultIsEqual;

  return useMemo(() => {
    if (!compare(value, prevValueRef.current)) {
      ref.current = value;
      prevValueRef.current = value;
    }
    return ref.current;
  }, [value, compare]);
}