import React from 'react';
import { ClassificationLevel } from '../utils/securityUtils';
import { ShieldCheckIcon, LockClosedIcon } from '@heroicons/react/24/outline';

interface ClassificationBadgeProps {
  level: ClassificationLevel;
  size?: 'sm' | 'md' | 'lg';
}

export const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({ level, size = 'md' }) => {
  const classificationConfig: Record<ClassificationLevel, { color: string; bgColor: string; label: string }> = {
    [ClassificationLevel.UNCLASSIFIED]: {
      color: 'text-green-700 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700',
      label: 'NO CLASIFICADO'
    },
    [ClassificationLevel.RESTRICTED]: {
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700',
      label: 'RESTRINGIDO'
    },
    [ClassificationLevel.CONFIDENTIAL]: {
      color: 'text-yellow-700 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700',
      label: 'CONFIDENCIAL'
    },
    [ClassificationLevel.SECRET]: {
      color: 'text-orange-700 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700',
      label: 'SECRETO'
    },
    [ClassificationLevel.TOP_SECRET]: {
      color: 'text-red-700 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700',
      label: 'TOP SECRET'
    },
    [ClassificationLevel.TS_SCI]: {
      color: 'text-red-900 dark:text-red-300',
      bgColor: 'bg-red-100 dark:bg-red-900/40 border-2 border-red-500 dark:border-red-600',
      label: 'TS/SCI'
    }
  };

  const config = classificationConfig[level];
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  return (
    <div className={`${config.bgColor} ${sizeClasses[size]} rounded-lg inline-flex items-center gap-2`}>
      <LockClosedIcon className={`h-4 w-4 ${config.color}`} />
      <span className={`font-bold ${config.color}`}>{config.label}</span>
    </div>
  );
};

interface SecurityStatusProps {
  isEncrypted?: boolean;
  hasAuditLog?: boolean;
  sessionActive?: boolean;
}

export const SecurityStatus: React.FC<SecurityStatusProps> = ({
  isEncrypted = false,
  hasAuditLog = false,
  sessionActive = false
}) => {
  return (
    <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {isEncrypted ? '🔐 Encriptado' : '⚠️ No encriptado'}
        </span>
      </div>
      {hasAuditLog && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
            📋 Auditado
          </span>
        </div>
      )}
      {sessionActive && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-green-700 dark:text-green-400">
            ✓ Sesión activa
          </span>
        </div>
      )}
    </div>
  );
};
