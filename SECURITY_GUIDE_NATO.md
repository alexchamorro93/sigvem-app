## 🔐 GUÍA DE SEGURIDAD SIGVEM - ESTÁNDARES OTAN

### 📋 CLASIFICACIÓN DE INFORMACIÓN

La aplicación implementa niveles de clasificación OTAN:
- **UNCLASSIFIED**: Información no clasificada
- **RESTRICTED**: Restringida a personal autorizado
- **CONFIDENTIAL**: Confidencial (requiere nivel de acceso 4+)
- **SECRET**: Secreto (requiere nivel de acceso 5+)
- **TOP SECRET**: Ultra secreto (requiere nivel de acceso 6)
- **TS/SCI**: Top Secret / Sensitive Compartmented Information (solo super_admin)

### 🔑 CONTROL DE ACCESO BASADO EN ROLES MILITARES

**Niveles de Acceso:**

1. **super_admin** (Nivel 6 - TS/SCI)
   - Acceso total a todos los datos
   - Permiso para eliminar usuarios/compañías
   - Acceso a logs de seguridad
   - Acceso a auditoria completa

2. **encargado_cia** (Nivel 5 - SECRET)
   - Gestionar su compañía
   - Crear/modificar secciones
   - Gestionar usuarios de su compañía
   - Ver auditoría de su compañía

3. **encargado_seccion** (Nivel 4 - CONFIDENTIAL)
   - Gestionar su sección
   - Crear/modificar vehículos
   - Gestionar personal de su sección
   - Ver auditoría de su sección

4. **operador** (Nivel 3 - CONFIDENTIAL)
   - Leer datos de su sección
   - Crear/editar vehículos
   - Generar reportes (Parte Relevo)

5. **consulta** (Nivel 2 - RESTRICTED)
   - Lectura solamente de datos de su sección

### 🔒 MEDIDAS DE ENCRIPTACIÓN

- **AES-256**: Encriptación de datos sensibles (contraseñas, documentos clasificados)
- **SHA-256**: Hashing de contraseñas para integridad
- **HMAC-SHA256**: Validación de integridad de mensajes
- **Sesiones Encriptadas**: Las sesiones de usuario se almacenan encriptadas en localStorage

### 🛡️ PROTECCIONES CONTRA ATAQUES

**Rate Limiting:**
- Máximo 5 intentos fallidos de login
- Bloqueo de cuenta por 15 minutos después de 5 intentos
- Logs detallados de intentos fallidos

**Validaciones de Contraseña (Estándares OTAN):**
- Mínimo 12 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial (!@#$%^&*)
- No permitir 3+ caracteres repetidos
- No usar contraseñas comunes

**Prevención de CSRF:**
- Token CSRF generado por sesión
- Validación de token en operaciones críticas

**Prevención de XSS:**
- Sanitización de inputs
- Validación de longitud de campos
- Encoding de datos en respuestas

**Session Hijacking:**
- Validación de IP durante la sesión
- Validación de User-Agent
- Timeout automático por inactividad (30 minutos)
- Monitoreo continuo de actividad

### 📊 AUDITORÍA Y LOGS

Todos los eventos se registran en `securityAuditLogs`:

```
{
  id: "AUDIT-timestamp-random",
  timestamp: Date,
  action: "LOGIN" | "LOGOUT" | "FAILED_LOGIN" | "ACCESS_DENIED" | "DATA_ACCESS",
  userId: string,
  username: string,
  ip: string,
  userAgent: string,
  classification: ClassificationLevel,
  details: string,
  result: "SUCCESS" | "FAILURE",
  duration: number (ms)
}
```

**Eventos Registrados:**
- Login/Logout de usuarios
- Intentos fallidos de acceso
- Acceso denegado por clasificación
- Cambios de datos
- Acceso a documentos clasificados
- Creación/modificación/eliminación de usuarios

### ⏱️ SESIONES SEGURAS

**Configuración:**
- Duración: 30 minutos
- Timeout por inactividad: 30 minutos
- Renovación automática con actividad (mouse, teclado, click)
- Monitoreo continuo de validez

**Almacenamiento:**
- Encriptado con AES-256
- Validación de integridad
- IP y User-Agent verificados

### 🔔 ALERTAS DE SEGURIDAD

La aplicación muestra alertas en tiempo real para:
- Cuenta bloqueada por intentos fallidos
- Acceso denegado por clasificación
- Cambio de IP o User-Agent (posible hijacking)
- Sesión expirada
- Violaciones de política de seguridad

### 📱 INFORMACIÓN DE DISPOSITIVO

Se registra:
- Navegador y versión
- Sistema operativo
- Tipo de dispositivo (Desktop, Mobile, Tablet)
- User-Agent completo
- IP de conexión
- Timestamp exacto

### 🔐 DATOS SENSIBLES ENCRIPTADOS

- Contraseñas de usuarios (AES-256)
- Documentos clasificados (AES-256)
- Sesiones de usuario (AES-256)
- Información de clasificación

### ✅ VALIDACIONES DE INTEGRIDAD

- Hash SHA-256 de documentos importantes
- HMAC-SHA256 para validar mensajes
- Detección de modificaciones no autorizadas
- Logs de cambios con timestamp y usuario

### 🚨 PROCEDIMIENTOS DE INCIDENTE

**Si se detecta compromiso:**

1. **Inmediatamente:**
   - Bloquear la cuenta del usuario
   - Registrar el incidente con máximo detalle
   - Notificar a administrador

2. **Investigación:**
   - Revisar securityAuditLogs
   - Verificar acceso a datos sensibles
   - Analizar patrones sospechosos

3. **Contención:**
   - Cambiar contraseñas de usuarios afectados
   - Revocar sesiones activas
   - Revisar permisos de acceso

4. **Recuperación:**
   - Restaurar de backup si es necesario
   - Verificar integridad de datos
   - Actualizar logs de auditoría

### 📝 REQUISITOS DE CUMPLIMIENTO

Esta implementación cumple con:
- ✅ NIST SP 800-171 (parcial)
- ✅ NATO Security Policy (parcial)
- ✅ ITAR Compliance (parcial)
- ✅ ISO 27001 Principles (parcial)

**NOTA:** Implementación completa de OTAN requiere:
- Certificados de seguridad OTAN
- Auditoría independiente
- Infraestructura segura (HTTPS, PKI)
- Separación de redes (SIPRNET, NIPRNET)
- Cumplimiento de políticas locales

### 🔧 CONFIGURACIÓN

Las siguientes variables pueden configurarse en `.env`:

```
REACT_APP_ENCRYPTION_KEY=your-encryption-key
REACT_APP_SESSION_TIMEOUT=1800000 (ms)
REACT_APP_MAX_LOGIN_ATTEMPTS=5
REACT_APP_LOCKOUT_DURATION=900000 (ms)
```

### 📞 REPORTAR PROBLEMAS DE SEGURIDAD

Si descubre una vulnerabilidad:
1. NO la publique públicamente
2. Reporte inmediatamente al administrador de seguridad
3. Proporcione detalles técnicos específicos
4. Espere confirmación antes de divulgar

---

**Versión:** 1.0  
**Última actualización:** 27 Enero 2026  
**Clasificación:** CONFIDENTIAL
