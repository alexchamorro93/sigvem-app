/**
 * HOOK PERSONALIZADO: useFirestoreQuery
 * ======================================
 * Gestiona queries a Firestore con caché,
 * manejo de errores y loading states automáticos.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  query as firestoreQuery,
  onSnapshot,
  Query,
  QueryConstraint,
  QueryCompositeFilterConstraint,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { cacheManager } from '../utils/cache';
import { logger } from '../utils/logger';

export interface UseFirestoreQueryOptions {
  cacheKey?: string;
  cacheTTL?: number;
  skip?: boolean;
  onError?: (error: Error) => void;
  logErrors?: boolean;
}

interface UseFirestoreQueryReturn<T> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  isCached: boolean;
}

/**
 * Hook para queries con caché automático
 */
export function useFirestoreQuery<T extends { id?: string }>(
  collectionName: string,
  constraints?: QueryConstraint[] | QueryCompositeFilterConstraint[],
  options: UseFirestoreQueryOptions = {}
): UseFirestoreQueryReturn<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isCached, setIsCached] = useState(false);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  const {
    cacheKey = `query:${collectionName}`,
    cacheTTL = 5 * 60 * 1000, // 5 minutos por defecto
    skip = false,
    onError,
    logErrors = true
  } = options;

  const executeQuery = useCallback(() => {
    // Revisar caché primero
    const cached = cacheManager.get<T[]>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      setIsCached(true);
      if (logErrors) {
        logger.debug('useFirestoreQuery', `Datos obtenidos del caché: ${cacheKey}`);
      }
      return;
    }

    setLoading(true);
    setIsCached(false);

    try {
      const collectionRef = collection(db, collectionName);
      const q = constraints && constraints.length > 0
        ? firestoreQuery(collectionRef, ...(constraints as QueryConstraint[]))
        : collectionRef;

      // Limpiar suscripción anterior
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      // Nueva suscripción
      unsubscribeRef.current = onSnapshot(
        q as Query<T>,
        snapshot => {
          const docs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as T));

          // Guardar en caché
          cacheManager.set(cacheKey, docs, cacheTTL);

          setData(docs);
          setLoading(false);
          setError(null);

          if (logErrors) {
            logger.debug(
              'useFirestoreQuery',
              `Query exitosa: ${collectionName}`,
              { count: docs.length }
            );
          }
        },
        err => {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          setLoading(false);

          if (logErrors) {
            logger.error(
              'useFirestoreQuery',
              `Error en query: ${collectionName}`,
              error
            );
          }

          if (onError) {
            onError(error);
          }
        }
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setLoading(false);

      if (logErrors) {
        logger.error(
          'useFirestoreQuery',
          `Error creando query: ${collectionName}`,
          error
        );
      }

      if (onError) {
        onError(error);
      }
    }
  }, [collectionName, constraints, cacheKey, cacheTTL, onError, logErrors]);

  useEffect(() => {
    if (skip) {
      setData(null);
      setLoading(false);
      return;
    }

    executeQuery();

    // Cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [skip, executeQuery]);

  const refetch = useCallback(() => {
    // Invalidar caché y re-ejecutar
    cacheManager.invalidate(cacheKey.split(':')[1] || cacheKey);
    executeQuery();
  }, [cacheKey, executeQuery]);

  return {
    data,
    loading,
    error,
    refetch,
    isCached
  };
}

/**
 * Hook para paginar resultados de Firestore
 */
export interface UsePaginationOptions extends UseFirestoreQueryOptions {
  pageSize?: number;
}

interface UsePaginationReturn<T> extends UseFirestoreQueryReturn<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
}

export function useFirestorePagination<T extends { id?: string }>(
  collectionName: string,
  constraints?: QueryConstraint[] | QueryCompositeFilterConstraint[],
  options: UsePaginationOptions = {}
): UsePaginationReturn<T> {
  const { pageSize = 20, ...queryOptions } = options;
  const [page, setPage] = useState(0);
  const [allData, setAllData] = useState<T[]>([]);

  const { data: rawData, loading, error, refetch, isCached } = useFirestoreQuery(
    collectionName,
    constraints,
    queryOptions
  );

  useEffect(() => {
    if (rawData && Array.isArray(rawData)) {
      setAllData(rawData as T[]);
      setPage(0); // Reset a primera página cuando los datos cambian
    }
  }, [rawData]);

  const paginatedData = allData.slice(
    page * pageSize,
    (page + 1) * pageSize
  );

  const totalPages = Math.ceil(allData.length / pageSize);

  return {
    data: paginatedData,
    loading,
    error,
    refetch,
    isCached,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages - 1,
    hasPreviousPage: page > 0,
    goToPage: (newPage: number) => {
      if (newPage >= 0 && newPage < totalPages) {
        setPage(newPage);
      }
    },
    nextPage: () => {
      if (page < totalPages - 1) {
        setPage(page + 1);
      }
    },
    previousPage: () => {
      if (page > 0) {
        setPage(page - 1);
      }
    }
  };
}
