# 🔧 Configuración de Firestore para SIGVEM

## ⚠️ PASO CRÍTICO: Aplicar reglas de Firestore

El botón de eliminar no funcionará hasta que apliques estas reglas en Firebase Console.

### Instrucciones (5 minutos):

1. **Abre Firebase Console:**
   - Ve a: https://console.firebase.google.com/
   - Selecciona proyecto: **sigvem-2**
   - Entra en **Firestore Database**
   - Haz clic en pestaña **Rules**

2. **Copia estas reglas de DESARROLLO (temporales):**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // MODO DESARROLLO - Permitir todo
    match /{document=**} {
      allow read, write, delete: if true;
    }
  }
}
```

3. **Publica las reglas:**
   - Haz clic en botón **Publish**
   - Confirma los cambios

## ✅ Verificación

Después de publicar:
- Abre la app en http://localhost:3000
- Intenta eliminar una sección o compañía
- Abre DevTools (F12) > Console
- Deberías ver logs: `[deleteSection] Eliminando...`
- El botón debe funcionar sin errores

## 🔐 Para PRODUCCIÓN

Una vez que todo funcione, reemplaza las reglas con estas más seguras:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Super admin - acceso total
    match /{document=**} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
    }
    
    // USUARIOS
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
      allow create, update, delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
    }
    
    // COMPAÑÍAS
    match /companies/{companyId} {
      allow read, write, delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
    }
    
    // SECCIONES
    match /sections/{sectionId} {
      allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == resource.data.companyId;
      allow write, delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin' ||
                              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'encargado_cia';
    }
    
    // VEHÍCULOS
    match /vehicles/{vehicleId} {
      allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.sectionId == resource.data.sectionId;
      allow write, delete: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'operador' ||
                              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'encargado_seccion' ||
                              get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin';
    }
    
    // AUDIT LOGS
    match /auditLogs/{logId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}
```

## 📝 Notas

- Las reglas de DESARROLLO permiten acceso total (no usar en producción)
- Después de cambiar reglas, Firestore tarda 1-2 minutos en aplicarlas
- Para debug, abre Console (F12) y busca logs `[deleteSection]` o `[deleteCompany]`
