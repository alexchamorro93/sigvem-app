import React from 'react';
import { ShieldCheckIcon, LockClosedIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export const SecurityGuide: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-lg">
      <div className="flex items-center gap-3 mb-8">
        <ShieldCheckIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          GUÍA DE SEGURIDAD OTAN
        </h1>
      </div>

      <div className="prose dark:prose-invert max-w-none space-y-6">
        {/* Clasificación de Información */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-300 mb-4">
            📊 Niveles de Clasificación
          </h2>
          <div className="space-y-3">
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded font-bold text-sm">
                UNCLASSIFIED
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Información no clasificada. Acceso público autorizado.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded font-bold text-sm">
                RESTRICTED
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Información restringida. Acceso limitado a personal autorizado.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded font-bold text-sm">
                CONFIDENTIAL
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Confidencial. Protección especial requerida. Encriptado en tránsito.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded font-bold text-sm">
                SECRET
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Secreto. Divulgación podría causar daño grave. Encriptado en reposo.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded font-bold text-sm">
                TOP SECRET
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Ultra secreto. Acceso extremadamente limitado. Múltiples capas de encriptación.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="px-3 py-1 bg-red-200 dark:bg-red-900/50 text-red-900 dark:text-red-200 rounded font-bold text-sm border-2 border-red-600">
                TS/SCI
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Top Secret / Sensitive Compartmented Information. Máximo nivel de protección.
              </p>
            </div>
          </div>
        </div>

        {/* Seguridad de Contraseñas */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-green-900 dark:text-green-300 mb-4">
            🔐 Requisitos de Contraseña OTAN
          </h2>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>Mínimo 12 caracteres</strong> (superior al estándar militar)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>Mayúsculas y minúsculas</strong> (diversidad de casos)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>Números y caracteres especiales</strong> (!@#$%^&*)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>NO permitidas contraseñas comunes</strong> (evitar patrones obvios)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>Bloqueo automático</strong> tras 5 intentos fallidos (15 minutos)</span>
            </li>
          </ul>
        </div>

        {/* Control de Acceso */}
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-purple-900 dark:text-purple-300 mb-4">
            👥 Control de Acceso Basado en Roles (RBAC)
          </h2>
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <div>
              <p className="font-bold text-purple-900 dark:text-purple-300">Super Administrador</p>
              <p>Acceso total al sistema. Nivel de clasificación: TS/SCI</p>
            </div>
            <div>
              <p className="font-bold text-purple-900 dark:text-purple-300">Encargado de Compañía</p>
              <p>Gestión de compañía y secciones. Nivel de clasificación: SECRET</p>
            </div>
            <div>
              <p className="font-bold text-purple-900 dark:text-purple-300">Encargado de Sección</p>
              <p>Gestión de vehículos y personal. Nivel de clasificación: CONFIDENTIAL</p>
            </div>
            <div>
              <p className="font-bold text-purple-900 dark:text-purple-300">Operador</p>
              <p>Operaciones vehiculares y reportes. Nivel de clasificación: CONFIDENTIAL</p>
            </div>
            <div>
              <p className="font-bold text-purple-900 dark:text-purple-300">Consulta</p>
              <p>Lectura de información. Nivel de clasificación: RESTRICTED</p>
            </div>
          </div>
        </div>

        {/* Encriptación */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-indigo-900 dark:text-indigo-300 mb-4">
            <LockClosedIcon className="h-6 w-6 inline mr-2" />
            Encriptación de Datos
          </h2>
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <div>
              <p className="font-bold text-indigo-900 dark:text-indigo-300">En Tránsito (TLS 1.3)</p>
              <p>HTTPS obligatorio. Certificados válidos. Soporta PFS (Perfect Forward Secrecy)</p>
            </div>
            <div>
              <p className="font-bold text-indigo-900 dark:text-indigo-300">En Reposo (AES-256-GCM)</p>
              <p>Datos sensibles encriptados con AES-256. Clave única por usuario. Rotación trimestral.</p>
            </div>
            <div>
              <p className="font-bold text-indigo-900 dark:text-indigo-300">Contraseñas</p>
              <p>Almacenadas con hash SHA-256 + AES-256. Nunca en texto plano.</p>
            </div>
            <div>
              <p className="font-bold text-indigo-900 dark:text-indigo-300">Sesiones</p>
              <p>Token de sesión encriptado. Timeout: 30 minutos de inactividad.</p>
            </div>
          </div>
        </div>

        {/* Auditoría */}
        <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-cyan-900 dark:text-cyan-300 mb-4">
            📋 Auditoría y Logging
          </h2>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>Se registran todos los logins exitosos y fallidos</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>Se captura IP, navegador y dispositivo en cada acceso</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>Todas las modificaciones de datos registradas con usuario y timestamp</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>Logs inmutables con firma de integridad (HMAC-SHA256)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>Retención: 1 año de histórico de auditoría</span>
            </li>
          </ul>
        </div>

        {/* Recomendaciones */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-300 mb-4">
            ⚠️ Recomendaciones de Seguridad
          </h2>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>✓ Nunca compartir credenciales. Una cuenta por persona.</li>
            <li>✓ Logout después de cada sesión. Especialmente en equipos compartidos.</li>
            <li>✓ Cambiar contraseña cada 90 días.</li>
            <li>✓ Reportar accesos sospechosos inmediatamente.</li>
            <li>✓ Usar HTTPS en redes públicas. Evitar WiFi inseguro.</li>
            <li>✓ No guardar contraseñas en navegador. Usar gestor seguro.</li>
            <li>✓ Verificar URL correcta antes de ingresar credenciales (phishing).</li>
            <li>✓ Limpiar caché/cookies regularmente.</li>
          </ul>
        </div>

        {/* Cumplimiento OTAN */}
        <div className="bg-slate-100 dark:bg-slate-700 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">
            📜 Estándares OTAN Implementados
          </h2>
          <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
            <li>✓ NATO AEP-1 (Information Security Policy)</li>
            <li>✓ NATO INFOSEC Technical Guidance</li>
            <li>✓ NIST SP 800-171 (Cybersecurity Control)</li>
            <li>✓ FIPS 140-2 (Cryptographic Modules)</li>
            <li>✓ ISO/IEC 27001 (Information Security Management)</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 p-4 bg-gray-100 dark:bg-slate-700 rounded-lg text-center text-xs text-gray-600 dark:text-gray-400">
        <p>Última actualización: {new Date().toLocaleDateString('es-ES')}</p>
        <p>Versión: 1.0 - Cumple OTAN INFOSEC</p>
      </div>
    </div>
  );
};
