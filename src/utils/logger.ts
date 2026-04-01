/**
 * LOGGER CENTRALIZADO
 * ===================
 * Maneja logging estructurado con contextos,
 * severidad y envío a servicios externos.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  stack?: string;
}

interface LoggerConfig {
  enableConsole?: boolean;
  enableRemote?: boolean;
  minLevel?: LogLevel;
}

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

class Logger {
  private logs: LogEntry[] = [];
  private config: Required<LoggerConfig>;
  private maxLogs = 1000; // Máximo de logs en memoria

  constructor(config: LoggerConfig = {}) {
    this.config = {
      enableConsole: config.enableConsole !== false,
      enableRemote: config.enableRemote === true,
      minLevel: config.minLevel || 'DEBUG'
    };
  }

  /**
   * Log genérico con nivel
   */
  private log(level: LogLevel, context: string, message: string, data?: any): void {
    // Verificar nivel mínimo
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const entry: LogEntry = {
      timestamp,
      level,
      context,
      message,
      data
    };

    // Guardar en memoria
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Mostrar en consola
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Enviar a servicio remoto
    if (this.config.enableRemote && level !== 'DEBUG') {
      this.logToRemote(entry);
    }
  }

  /**
   * Log a consola con colores y formato
   */
  private logToConsole(entry: LogEntry): void {
    const colors = {
      DEBUG: 'color: #7c3aed',
      INFO: 'color: #0ea5e9',
      WARN: 'color: #f97316',
      ERROR: 'color: #ef4444',
      CRITICAL: 'background: #ef4444; color: white; font-weight: bold'
    };

    const prefix = `%c[${entry.level}] [${entry.context}]`;
    const message = `${entry.timestamp} ${entry.message}`;

    if (entry.data) {
      console.log(prefix, colors[entry.level], message, entry.data);
    } else {
      console.log(prefix, colors[entry.level], message);
    }
  }

  /**
   * Envía logs a servicio remoto (Firebase, Sentry, etc)
   */
  private async logToRemote(entry: LogEntry): Promise<void> {
    try {
      // TODO: Implementar envío a servicio de logging remoto
      // await fetch('/api/logs', { method: 'POST', body: JSON.stringify(entry) });
    } catch (err) {
      console.error('Error enviando log remoto:', err);
    }
  }

  // Métodos públicos de logging
  debug(context: string, message: string, data?: any): void {
    this.log('DEBUG', context, message, data);
  }

  info(context: string, message: string, data?: any): void {
    this.log('INFO', context, message, data);
  }

  warn(context: string, message: string, data?: any): void {
    this.log('WARN', context, message, data);
  }

  error(context: string, message: string, error?: Error | any, data?: any): void {
    const errorMessage = error?.message || undefined;
    this.log('ERROR', context, message, { error: errorMessage, ...data });
  }

  critical(context: string, message: string, error?: Error | any): void {
    this.log('CRITICAL', context, message, { error: error?.message });
  }

  /**
   * Obtiene todos los logs en memoria
   */
  getLogs(level?: LogLevel, context?: string): LogEntry[] {
    return this.logs.filter(log => {
      if (level && log.level !== level) return false;
      if (context && !log.context.includes(context)) return false;
      return true;
    });
  }

  /**
   * Limpia los logs en memoria
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Exporta logs en formato JSON
   */
  export(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Descarga logs como archivo
   */
  downloadLogs(filename: string = 'sigvem-logs.json'): void {
    const data = this.export();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Obtiene estadísticas de logs
   */
  getStats() {
    return {
      totalLogs: this.logs.length,
      byLevel: {
        DEBUG: this.logs.filter(l => l.level === 'DEBUG').length,
        INFO: this.logs.filter(l => l.level === 'INFO').length,
        WARN: this.logs.filter(l => l.level === 'WARN').length,
        ERROR: this.logs.filter(l => l.level === 'ERROR').length,
        CRITICAL: this.logs.filter(l => l.level === 'CRITICAL').length
      },
      lastLog: this.logs[this.logs.length - 1] || null
    };
  }
}

// Instancia global singleton
export const logger = new Logger({
  enableConsole: true,
  enableRemote: process.env.NODE_ENV === 'production',
  minLevel: process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG'
});

// Exportar clase para instancias personalizadas
export { Logger };
