# 🛠️ EJEMPLOS PRÁCTICOS - CÓMO USAR LAS NUEVAS HERRAMIENTAS

## 1. Cache Manager

### Ejemplo 1: Guardar y recuperar datos
```typescript
import { cacheManager } from './utils/cache';

// Guardar datos en caché (10 minutos de TTL)
const companies = await fetchCompanies();
cacheManager.set('companies-list', companies, 10 * 60 * 1000);

// Recuperar desde caché (null si expiró)
const cached = cacheManager.get('companies-list');
if (cached) {
  setCompanies(cached);
} else {
  // Fetch nuevamente
  const fresh = await fetchCompanies();
  cacheManager.set('companies-list', fresh);
}
```

### Ejemplo 2: Invalidar caché
```typescript
// Cuando se crea una nueva compañía
const newCompany = await createCompany(data);

// Invalidar caché de compañías
cacheManager.invalidate('companies');

// O invalidar todo
cacheManager.clear();
```

### Ejemplo 3: Ver estadísticas
```typescript
// En la consola:
logger.info('Cache Stats', JSON.stringify(cacheManager.getStats(), null, 2));

// Output:
// {
//   "hits": 45,
//   "misses": 12,
//   "size": 1024000,
//   "entries": 8,
//   "hitRate": "78.95%"
// }
```

---

## 2. Logger Centralizado

### Ejemplo 1: Logging básico
```typescript
import { logger } from './utils/logger';

// INFO
logger.info('handleLogin', 'Usuario encontrado', { username: 'admin' });

// WARNING
logger.warn('handleLogin', 'Múltiples intentos de login fallidos');

// ERROR
logger.error('handleLogin', 'Error conectando a BD', error);

// CRITICAL
logger.critical('handleLogin', 'Sistema de autenticación caído', error);
```

### Ejemplo 2: Obtener logs
```typescript
// Todos los logs
const allLogs = logger.getLogs();

// Solo errores
const errors = logger.getLogs('ERROR');

// Logs de un contexto específico
const loginLogs = logger.getLogs(undefined, 'handleLogin');
```

### Ejemplo 3: Exportar logs
```typescript
// Descargar como archivo JSON
logger.downloadLogs('sigvem-debug.json');

// O exportar como string
const jsonString = logger.export();
console.log(jsonString);
```

---

## 3. Validadores

### Ejemplo 1: Validar contraseña
```typescript
import { validatePassword, calculatePasswordStrength, getPasswordStrengthLabel } from './utils/validators';

const password = 'Mi$Password123';
const validation = validatePassword(password);

if (!validation.valid) {
  console.log('Errores:', validation.errors);
  // Output: []

  const strength = calculatePasswordStrength(password);
  // Output: 100

  const label = getPasswordStrengthLabel(strength);
  // Output: { label: 'Muy fuerte', color: '#16a34a' }
}
```

### Ejemplo 2: Validar usuario
```typescript
import { validateUsername } from './utils/validators';

const username = 'juan.gonzalez';
const result = validateUsername(username);

if (result.valid) {
  console.log('Usuario válido');
} else {
  console.log('Errores:', result.errors);
  // Output: ['El usuario debe tener al menos 3 caracteres']
}
```

### Ejemplo 3: Validación personalizada
```typescript
import { validateField } from './utils/validators';

const result = validateField('nuevo@email.com', {
  required: true,
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  errorMessage: 'Email inválido'
});

if (!result.valid) {
  console.log(result.errors);
}
```

---

## 4. Hook useFirestoreQuery

### Ejemplo 1: Query simple con caché
```typescript
import { useFirestoreQuery } from './hooks/useFirestoreQuery';
import { collection } from 'firebase/firestore';

function CompaniesComponent() {
  const { data: companies, loading, error, isCached } = useFirestoreQuery<Company>(
    'companies',
    [],
    {
      cacheKey: 'companies-list',
      cacheTTL: 10 * 60 * 1000 // 10 minutos
    }
  );

  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      {isCached && <span>📦 Datos en caché</span>}
      {companies?.map(c => (
        <div key={c.id}>{c.name}</div>
      ))}
    </div>
  );
}
```

### Ejemplo 2: Query con filtros
```typescript
import { useFirestoreQuery } from './hooks/useFirestoreQuery';
import { where, limit } from 'firebase/firestore';

function UsersComponent({ companyId }: { companyId: string }) {
  const { data: users, loading, error, refetch } = useFirestoreQuery<User>(
    'users',
    [
      where('companyId', '==', companyId),
      limit(100)
    ],
    {
      cacheKey: `users-${companyId}`,
      cacheTTL: 5 * 60 * 1000
    }
  );

  return (
    <div>
      <button onClick={refetch}>Actualizar</button>
      {users?.map(u => <div key={u.id}>{u.username}</div>)}
    </div>
  );
}
```

---

## 5. Hook usePasswordValidation

### Ejemplo 1: Validación memoizada
```typescript
import { usePasswordValidation } from './hooks/usePasswordValidation';

function PasswordForm() {
  const [password, setPassword] = useState('');
  
  // Se memoiza automáticamente - no recalcula si password no cambia
  const validation = usePasswordValidation(password);

  return (
    <div>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      
      <div className={validation.strength < 40 ? 'text-red-600' : 'text-green-600'}>
        Fortaleza: {validation.strengthLabel.label}
      </div>

      <ul>
        <li className={validation.requirements.length ? 'text-green-600' : 'text-red-600'}>
          ✓ 8+ caracteres
        </li>
        <li className={validation.requirements.uppercase ? 'text-green-600' : 'text-red-600'}>
          ✓ Mayúscula
        </li>
        {/* ... más requisitos ... */}
      </ul>
    </div>
  );
}
```

### Ejemplo 2: Validación de coincidencia
```typescript
import { usePasswordMatch } from './hooks/usePasswordValidation';

function RegisterForm() {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const validation = usePasswordMatch(password, passwordConfirm);

  return (
    <div>
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      
      <input
        type="password"
        placeholder="Confirmar"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
      />

      {validation.matchError && (
        <p className="text-red-600">{validation.matchError}</p>
      )}

      <button
        disabled={!validation.isValid || !validation.passwordsMatch}
        onClick={handleRegister}
      >
        Registrar
      </button>
    </div>
  );
}
```

---

## 6. Hook useDebounce

### Ejemplo 1: Búsqueda en tiempo real
```typescript
import { useDebounce } from './hooks/useOptimization';

function VehicleSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Solo actualiza cada 500ms
  const debouncedSearch = useDebounce(searchTerm, 500);

  useEffect(() => {
    // Esta query solo se ejecuta cuando debouncedSearch cambia
    if (debouncedSearch.length > 0) {
      searchVehicles(debouncedSearch);
    }
  }, [debouncedSearch]); // ← No es searchTerm

  return (
    <input
      type="text"
      placeholder="Buscar vehículo..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
    />
  );
}
```

---

## 7. Hook useAsync

### Ejemplo 1: Operación asincrónica
```typescript
import { useAsync } from './hooks/useOptimization';

function UserProfile({ userId }: { userId: string }) {
  const { data: user, status, error } = useAsync(
    () => fetchUser(userId),
    [userId]
  );

  if (status === 'pending') return <div>Cargando...</div>;
  if (status === 'error') return <div>Error: {error?.message}</div>;
  if (status === 'success') return <div>Usuario: {user?.name}</div>;
  
  return null;
}
```

---

## 8. Hook useLocalStorage

### Ejemplo 1: Persistencia de preferencias
```typescript
import { useLocalStorage } from './hooks/useOptimization';

function Settings() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebarCollapsed', false);

  return (
    <div>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Tema: {theme}
      </button>
      
      <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
        {sidebarCollapsed ? 'Mostrar' : 'Ocultar'} sidebar
      </button>
    </div>
  );
}
```

---

## 9. Hook useFirestorePagination

### Ejemplo 1: Paginación de logs
```typescript
import { useFirestorePagination } from './hooks/useFirestoreQuery';
import { orderBy } from 'firebase/firestore';

function AuditLogs() {
  const {
    data: logs,
    loading,
    page,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage
  } = useFirestorePagination<SystemLog>(
    'auditLogs',
    [orderBy('timestamp', 'desc')],
    { pageSize: 20 }
  );

  return (
    <div>
      {logs?.map(log => (
        <div key={log.id}>{log.action}</div>
      ))}
      
      <div>
        Página {page + 1} de {totalPages}
      </div>
      
      <button disabled={!hasPreviousPage} onClick={previousPage}>
        ← Anterior
      </button>
      
      <button disabled={!hasNextPage} onClick={nextPage}>
        Siguiente →
      </button>
    </div>
  );
}
```

---

## 10. Combinaciones Prácticas

### Ejemplo: Formulario completo optimizado
```typescript
import { usePasswordValidation } from './hooks/usePasswordValidation';
import { useDebounce } from './hooks/useOptimization';
import { validateUsername, validateEmail } from './utils/validators';
import { logger } from './utils/logger';
import { cacheManager } from './utils/cache';

function RegisterForm() {
  // Estados
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // Debounce
  const debouncedUsername = useDebounce(username, 300);
  const debouncedEmail = useDebounce(email, 300);

  // Validaciones
  const usernameValidation = validateUsername(debouncedUsername);
  const emailValidation = validateEmail(debouncedEmail);
  const passwordValidation = usePasswordValidation(password);
  
  const passwordsMatch = password === passwordConfirm && password.length > 0;

  // Verificar si usuario existe (con caché)
  useEffect(() => {
    if (usernameValidation.valid) {
      checkUsernameAvailable(debouncedUsername)
        .then(available => {
          if (!available) {
            logger.warn('RegisterForm', 'Usuario ya existe');
          }
        })
        .catch(err => logger.error('RegisterForm', 'Error verificando usuario', err));
    }
  }, [debouncedUsername, usernameValidation.valid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!usernameValidation.valid || !emailValidation.valid || 
        !passwordValidation.isValid || !passwordsMatch) {
      logger.warn('RegisterForm', 'Validación fallida');
      return;
    }

    try {
      logger.info('RegisterForm', 'Registrando nuevo usuario');
      
      await createUser({
        username,
        email,
        password
      });

      // Invalidar caché de usuarios
      cacheManager.invalidate('users');

      logger.info('RegisterForm', 'Usuario registrado exitosamente');
    } catch (error) {
      logger.error('RegisterForm', 'Error registrando usuario', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      {!usernameValidation.valid && (
        <p className="error">{usernameValidation.errors[0]}</p>
      )}

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {!emailValidation.valid && (
        <p className="error">{emailValidation.errors[0]}</p>
      )}

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="strength" style={{ 
        background: passwordValidation.strengthLabel.color 
      }}>
        {passwordValidation.strengthLabel.label}
      </div>

      <input
        type="password"
        placeholder="Confirmar"
        value={passwordConfirm}
        onChange={(e) => setPasswordConfirm(e.target.value)}
      />
      {!passwordsMatch && passwordConfirm.length > 0 && (
        <p className="error">Las contraseñas no coinciden</p>
      )}

      <button
        disabled={
          !usernameValidation.valid || 
          !emailValidation.valid || 
          !passwordValidation.isValid || 
          !passwordsMatch
        }
      >
        Registrar
      </button>
    </form>
  );
}
```

---

## 📖 Más Información

Para más detalles, consulta:
- `src/ANALISIS_Y_OPTIMIZACIONES.md` - Análisis profundo
- `src/GUIA_IMPLEMENTACION.md` - Guía de implementación
- Comentarios en los archivos fuente

