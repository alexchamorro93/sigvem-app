import React from 'react';
import AppWeb from './AppWeb';
import ErrorBoundary from './ErrorBoundary';
import { ThemeProvider } from './ThemeContext';

// Por ahora, solo exportamos AppWeb (versión web)
// Para móvil, se usará AppNative cuando se configure Expo adecuadamente
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppWeb />
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
