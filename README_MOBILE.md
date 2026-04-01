# SIGVEM - Sistema de Gestión de Vehículos Militares

Una aplicación full-stack con React, Firebase y soporte para Web, Android e iOS.

## 🚀 Instalación y Configuración

### Requisitos Previos

- Node.js 16+ instalado
- npm o yarn
- Para iOS: Mac con Xcode instalado
- Para Android: Android Studio o Android SDK instalado
- Expo CLI (se instala con npm install)

### Pasos de Instalación

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar Firebase:**
   - El archivo `src/firebaseConfig.ts` ya está configurado con las credenciales del proyecto

## 📱 Ejecutar la Aplicación

### En Web (Navegador)
```bash
npm run start:web
```
Abrirá automáticamente la app en http://localhost:3000

### En iOS (simulador)
```bash
npm run start:ios
```
Requiere Mac con Xcode

### En Android (emulador)
```bash
npm run start:android
```
Requiere Android Studio o Android SDK

### En desarrollo (permite elegir plataforma)
```bash
npm start
```
Luego presiona:
- `w` para web
- `i` para iOS
- `a` para Android

## 🏗️ Estructura del Proyecto

```
src/
├── App.tsx              # Componente principal (web)
├── AppNative.tsx        # Componente para móvil (React Native)
├── index.tsx            # Entrada para Expo
├── index.web.tsx        # Entrada para web
├── firebaseConfig.ts    # Configuración de Firebase
├── types/
│   └── index.ts         # Tipos TypeScript
├── constants/
│   └── index.ts         # Constantes de la aplicación
└── ...
```

## 🔐 Autenticación

- Usuario: El sistema usa autenticación personalizada contra Firestore
- La validación se hace comparando credenciales guardadas en la colección `/users`

## 🗄️ Base de Datos

La app usa **Firebase/Firestore Cloud** con estas colecciones:

- **vehicles**: Lista de vehículos militares
- **users**: Usuarios del sistema
- **sections**: Secciones/compañías
- **logs**: Registro de auditoría

## 🎯 Características

- ✅ Gestión de vehículos (CRUD)
- ✅ Gestión de usuarios (admin)
- ✅ Gestión de secciones
- ✅ Auditoría completa
- ✅ Sincronización real-time con Firestore
- ✅ Interfaz responsiva para móvil y web
- ✅ Diseño profesional con Tailwind CSS

## 🛠️ Compilar para Producción

### Web
```bash
npm run build:web
```

### Android
```bash
npm run build:android
```
Requiere EAS CLI: `npm install -g eas-cli`

### iOS
```bash
npm run build:ios
```
Requiere EAS CLI y cuenta de Apple Developer

## 📚 Tecnologías Utilizadas

- **Frontend**: React 19, React Native, TypeScript
- **Diseño**: Tailwind CSS (web), React Native StyleSheet (móvil)
- **Base de Datos**: Firebase Firestore
- **Build**: Expo, Metro Bundler
- **Iconos**: Heroicons

## 📖 Scripts Disponibles

```json
{
  "start": "expo start",                    // Modo desarrollo (elige plataforma)
  "start:web": "expo start --web",           // Inicia solo en web
  "start:ios": "expo start --ios",           // Inicia iOS simulator
  "start:android": "expo start --android",   // Inicia Android emulator
  "build:web": "expo export --platform web", // Compila para web
  "build:android": "eas build --platform android",
  "build:ios": "eas build --platform ios"
}
```

## 🤝 Contribución

Para agregar nuevas funcionalidades:

1. Actualiza los tipos en `src/types/index.ts`
2. Implementa la lógica en `App.tsx` (web) y `AppNative.tsx` (móvil)
3. Prueba en ambas plataformas

## 📝 Notas Importantes

- La app actualmente soporta login y registro básicos
- Las características avanzadas (PDF, detalles de mantenimiento) están en desarrollo
- Todos los cambios se sincronizan en tiempo real con Firestore
