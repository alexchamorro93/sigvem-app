/**
 * CACHE MANAGER MEJORADO CON TTL Y MONITOREO
 * ============================================
 * Gestiona caché en memoria con expiración automática,
 * estadísticas de rendimiento y límites de tamaño.
 */

export type Fetcher<T> = () => Promise<T>;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  hits: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  entries: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, entries: 0 };
  private maxSize = 50 * 1024 * 1024; // 50MB máximo
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Limpiar cache expirado cada 5 minutos
    this.startCleanupTimer();
  }

  /**
   * Obtiene un valor del caché
   */
  public get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Verificar si ha expirado
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Establece un valor en caché
   */
  public set<T>(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void {
    // Evitar entradas duplicadas
    this.cache.delete(key);

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
      hits: 0
    };

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;

    // Limpiar si excede límite de tamaño
    if (this.getApproximateSize() > this.maxSize) {
      this.evictLeastUsed();
    }
  }

  /**
   * Invalida entradas por prefijo
   */
  public invalidate(keyPrefix: string): number {
    let count = 0;
    Array.from(this.cache.keys()).forEach(key => {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
        count++;
      }
    });
    this.stats.entries = this.cache.size;
    return count;
  }

  /**
   * Limpia todo el caché
   */
  public clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0, entries: 0 };
  }

  /**
   * Obtiene estadísticas de caché
   */
  public getStats(): CacheStats & { hitRate: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total === 0 ? '0%' : ((this.stats.hits / total) * 100).toFixed(2) + '%';
    return { ...this.stats, hitRate };
  }

  /**
   * Obtiene el tamaño aproximado en bytes
   */
  private getApproximateSize(): number {
    let size = 0;
    Array.from(this.cache.values()).forEach(entry => {
      size += JSON.stringify(entry.value).length;
    });
    return size;
  }

  /**
   * Elimina las entradas menos utilizadas
   */
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].hits - b[1].hits)
      .slice(0, Math.floor(this.cache.size * 0.2)); // Elimina 20% menos usados

    for (const [key] of entries) {
      this.cache.delete(key);
    }
    this.stats.entries = this.cache.size;
  }

  /**
   * Inicia limpieza automática de entradas expiradas
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      const before = this.cache.size;
      const now = Date.now();

      Array.from(this.cache.entries()).forEach(([key, entry]) => {
        if (entry.expiresAt < now) {
          this.cache.delete(key);
        }
      });

      const removed = before - this.cache.size;
      if (removed > 0) {
        console.log(`[Cache] Limpiadas ${removed} entradas expiradas`);
      }
      this.stats.entries = this.cache.size;
    }, 5 * 60 * 1000); // Cada 5 minutos
  }

  /**
   * Detiene la limpieza automática
   */
  public stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Destruye el manager (limpieza)
   */
  public destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// Instancia global singleton
const cacheManager = new CacheManager();

export { cacheManager };

/**
 * Función helper para usar caché con fetcher
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: Fetcher<T>
): Promise<T> {
  const cached = cacheManager.get<T>(key);
  if (cached) return cached;

  const value = await fetcher();
  cacheManager.set(key, value, ttlMs);
  return value;
}

/**
 * Para compatibilidad con código antiguo
 */
export function invalidateCache(keyPrefix: string): void {
  cacheManager.invalidate(keyPrefix);
}

export function clearCache(): void {
  cacheManager.clear();
}
