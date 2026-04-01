import React from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface SecurityAlertProps {
  alerts: string[];
  onDismiss: (index: number) => void;
}

export const SecurityAlert: React.FC<SecurityAlertProps> = ({ alerts, onDismiss }) => {
  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {alerts.map((alert, index) => (
        <div
          key={index}
          className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-start gap-3 shadow-lg"
        >
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
              ALERTA DE SEGURIDAD
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {alert}
            </p>
          </div>
          <button
            onClick={() => onDismiss(index)}
            className="flex-shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
};
