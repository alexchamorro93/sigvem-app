# 🚀 APLICAR REGLAS DE FIRESTORE - GUÍA RÁPIDA

## ⏱️ Tiempo estimado: 3 minutos

Las reglas están **100% listas**. Solo necesitas copiarlas a Firebase Console.

### 📋 Paso 1: Abrir Firebase Console

1. Abre tu navegador
2. Ve a: **https://console.firebase.google.com**
3. Selecciona tu proyecto **sigvem-app**

### 🔐 Paso 2: Navegar a las Reglas

1. En el menú izquierdo, busca **"Firestore Database"**
2. Haz clic en la pestaña **"Rules"** (es la segunda pestaña)

### 📄 Paso 3: Copiar las Reglas

1. Abre el archivo `firestore.rules` de este proyecto (está en la raíz)
2. **Selecciona TODO el contenido** (Ctrl+A)
3. **Copia** (Ctrl+C)

O simplemente copia esto:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    
    function isSuperAdmin() {
      return getUserRole() == 'super_admin';
    }
    
    function belongsToCompany(companyId) {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == companyId;
    }

    match /companies/{companyId} {
      allow read: if isAuthenticated() && (isSuperAdmin() || belongsToCompany(companyId));
      allow create: if isAuthenticated() && isSuperAdmin();
      allow update: if isAuthenticated() && (isSuperAdmin() || (belongsToCompany(companyId) && getUserRole() == 'encargado_cia'));
      allow delete: if isAuthenticated() && isSuperAdmin();
    }

    match /sections/{sectionId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && (isSuperAdmin() || getUserRole() == 'encargado_cia');
      allow update: if isAuthenticated() && (isSuperAdmin() || getUserRole() == 'encargado_cia');
      allow delete: if isAuthenticated() && (isSuperAdmin() || getUserRole() == 'encargado_cia');
    }

    match /vehicles/{vehicleId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && (isSuperAdmin() || getUserRole() in ['operador', 'encargado_seccion', 'encargado_cia']);
      allow update: if isAuthenticated() && (isSuperAdmin() || getUserRole() in ['operador', 'encargado_seccion', 'encargado_cia']);
      allow delete: if isAuthenticated() && (isSuperAdmin() || getUserRole() in ['encargado_seccion', 'encargado_cia']);
    }

    match /users/{userId} {
      allow read: if isAuthenticated() && (isSuperAdmin() || request.auth.uid == userId);
      allow create: if isAuthenticated() && isSuperAdmin();
      allow update: if isAuthenticated() && (isSuperAdmin() || request.auth.uid == userId);
      allow delete: if isAuthenticated() && isSuperAdmin();
    }

    match /auditLogs/{logId} {
      allow read: if isAuthenticated() && isSuperAdmin();
      allow create: if isAuthenticated();
      allow delete: if false;
    }

  }
}
```

### 🖱️ Paso 4: Pegar en Firebase Console

1. En Firebase Console > Rules, verás un editor de texto
2. **Selecciona TODO lo que hay** (Ctrl+A)
3. **Pega las reglas** (Ctrl+V)

### ✅ Paso 5: Publicar

1. Busca el botón **"Publicar"** o **"Publish"** (arriba a la derecha)
2. Haz clic en él
3. Espera a que termine (tardará 5-10 segundos)

### ✨ ¡Listo!

Una vez publicado:
- ✅ Botones de ELIMINAR funcionarán
- ✅ ELIMINAR PRUEBAS funcionará
- ✅ Auditoría se registrará correctamente

## 🆘 Si algo no funciona

### Problema: No encuentro la pestaña "Rules"

**Solución:**
1. En Firestore Database, mira la parte superior
2. Deberías ver: **"Datos | Índices | Rules"**
3. Haz clic en "Rules"

### Problema: Me dice "El contenido es inválido"

**Solución:**
1. Asegúrate de copiar TODO el contenido desde `rules_version` hasta la última `}`
2. No dejes espacios en blanco al principio
3. Comprueba que no falten llaves `{` o `}`

### Problema: Publication failed

**Solución:**
1. Comprueba que estés logueado en Firebase
2. Comprueba que seas propietario o editor del proyecto
3. Intenta publicar de nuevo

---

**¿Necesitas ayuda?** Abre la consola del navegador (F12) en http://localhost:3000 e intenta eliminar algo. Si hay errores, te lo dirá ahí.
