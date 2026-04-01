# SIGVEM - Configuración de Responsividad y Dark Mode

## Cambios Realizados

### 1. **Dark Mode (Tema Claro/Oscuro)**
- ✅ Implementado Context `ThemeContext` para gestionar el tema globalmente
- ✅ Detecta automáticamente la preferencia del sistema (`prefers-color-scheme`)
- ✅ Guarda la preferencia del usuario en localStorage
- ✅ Botón de toggle en la navbar para cambiar entre temas
- ✅ Todos los componentes actualizados con clases Tailwind dark:*

### 2. **Responsividad Móvil**
- ✅ Meta tags viewport configurados (el archivo public/index.html necesita estos meta tags)
- ✅ Breakpoints de Tailwind aplicados:
  - `sm:` (640px) - Tablets pequeñas
  - `md:` (768px) - Tablets
  - `lg:` (1024px) - Desktop
- ✅ Padding y márgenes adaptivos usando `px-4 sm:px-6 lg:px-8`
- ✅ Texto responsive con `clamp()` en responsive.css
- ✅ Botones con min-height de 44px (iOS standard)

### 3. **Orientación de Pantalla**
- ✅ Media queries para orientación landscape
- ✅ Flex layouts que se adaptan automáticamente
- ✅ Grid que cambia columnas según tamaño de pantalla (2 cols móvil, 3 tablets, 4 desktop)

### 4. **Optimizaciones para Dispositivos Móviles**
- ✅ Font-size de inputs en 16px (previene zoom en iOS)
- ✅ Touch targets de 44x44px mínimo
- ✅ Safe area insets para dispositivos con notch
- ✅ Soporte para prefers-reduced-motion

## Archivos Modificados

1. **src/ThemeContext.tsx** (Nuevo)
   - Context Provider para gestionar dark/light mode
   - Hook `useTheme()` para acceder al tema

2. **src/App.tsx**
   - Agregado ThemeProvider wrapper

3. **src/AppWeb.tsx**
   - Actualizado Navbar con botón de tema
   - Todos los componentes con clases dark:*
   - Padding responsive (px-4 sm:px-6 lg:px-8)
   - Tamaños de texto responsivos

4. **src/index.css**
   - Agregado soporte para dark mode
   - Media queries para diferentes tamaños
   - Transiciones suaves

5. **src/responsive.css** (Nuevo)
   - Estilos específicos para responsividad
   - Viewport units y clamp()
   - Soporte para landscape
   - Safe areas

## Configuración del Meta Viewport (IMPORTANTE)

El archivo `public/index.html` debe incluir estos meta tags en el `<head>`:

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=yes" />
    <meta name="theme-color" content="#2563eb" />
    <meta name="description" content="SIGVEM - Sistema de Gestión de Flota de Vehículos" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="SIGVEM" />
    
    <!-- Favicon y Icons -->
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/apple-touch-icon.png" />
    
    <title>SIGVEM - Gestión de Flota</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

## Cómo Usar Dark Mode

Los usuarios pueden:
1. **Hacer clic en el ícono Sol/Luna** en la navbar para cambiar manualmente
2. **El sistema respeta la preferencia del SO** (Windows 10+, macOS, iOS, Android)
3. **La preferencia se guarda** en localStorage

## Testing en Diferentes Dispositivos

### En Chrome DevTools:
1. F12 → Ctrl+Shift+P
2. Buscar "Rendering" → "Emulate CSS media feature prefers-color-scheme"
3. Seleccionar "dark" o "light"

### Para Orientación:
1. F12 → Ctrl+Shift+M (Toggle device toolbar)
2. Girar el dispositivo (Ctrl+Shift+G o clic en el ícono)

### Breakpoints Clave:
- **xs**: 0px - 320px (iPhones viejos)
- **sm**: 640px - Tablets pequeñas
- **md**: 768px - Tablets
- **lg**: 1024px - iPad Pro, Desktops
- **xl**: 1280px - Desktops grandes

## Próximas Mejoras (Opcional)

1. PWA (Progressive Web App) - Instalar como app en móviles
2. Service Workers para offline
3. Más refinamientos de UX para móvil
4. Animaciones optimizadas para pantallas táctiles

---

**Status**: ✅ Completado - La app es completamente responsive y soporta dark mode.
