import React, { createContext, useContext, useEffect, useState } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Revisar localStorage primero
    try {
      const saved = localStorage.getItem('theme');
      if (saved) {
        return saved === 'dark';
      }
    } catch {
      // Si localStorage falla, continuar con preferencia del sistema
    }
    // Si no hay guardado, usar preferencia del sistema
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Actualizar el DOM y localStorage cuando cambie el tema
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      try {
        localStorage.setItem('theme', 'dark');
      } catch {
        // Ignorar errores de almacenamiento
      }
    } else {
      root.classList.remove('dark');
      try {
        localStorage.setItem('theme', 'light');
      } catch {
        // Ignorar errores de almacenamiento
      }
    }
  }, [isDark]);

  // Escuchar cambios en la preferencia del sistema
  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    try {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }

    const handleChange = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem('theme');
      } catch {
        saved = null;
      }
      if (!saved) {
        // Solo cambiar si el usuario no ha seleccionado manualmente un tema
        setIsDark(e.matches);
      }
    };

    try {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery?.removeEventListener('change', handleChange);
    } catch {
      // Fallback para navegadores antiguos
      mediaQuery.addListener(handleChange);
      return () => mediaQuery?.removeListener(handleChange);
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return context;
};
