import React from 'react';
import { logger } from './utils/logger';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: Error; info?: { componentStack: string } };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.setState({ error, info });
    
    // Log a través del logger centralizado
    logger.error(
      'ErrorBoundary',
      'Se capturó un error en el componente',
      error,
      {
        componentStack: info?.componentStack,
        errorMessage: error.message
      }
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
          <div style={{ maxWidth: 600, padding: 24, border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <h1 style={{ fontSize: 20, marginBottom: 12, color: '#ef4444', fontWeight: 'bold' }}>⚠️ Se ha producido un error</h1>
            <p style={{ color: '#6b7280', marginBottom: 12 }}>{this.state.error?.message || 'Error desconocido'}</p>
            {this.state.info?.componentStack && (
              <details style={{ marginBottom: 16 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#666' }}>Detalles del error</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#6b7280', marginTop: 8, background: '#f9fafb', padding: 8, borderRadius: 4 }}>{this.state.info.componentStack}</pre>
              </details>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={() => window.location.reload()} 
                style={{ 
                  flex: 1,
                  background: '#2563eb', 
                  color: '#fff', 
                  padding: '10px 16px', 
                  borderRadius: 8, 
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                🔄 Recargar página
              </button>
              <button 
                onClick={() => window.history.back()} 
                style={{ 
                  flex: 1,
                  background: '#6b7280', 
                  color: '#fff', 
                  padding: '10px 16px', 
                  borderRadius: 8, 
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ← Volver
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
