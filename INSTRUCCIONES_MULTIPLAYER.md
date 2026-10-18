# 🎮 MonoLLADOS Multiplayer - Instrucciones de Uso

## 🚀 Cambios Realizados para Optimizar el Rendimiento

### ✅ Problemas Solucionados:

1. **Funciones de chat de voz faltantes** - Agregadas `joinVoiceChat()`, `leaveVoiceChat()`, `toggleMute()`
2. **Listeners duplicados** - Sistema de limpieza para prevenir listeners múltiples
3. **Webcams optimizadas** - Reducidas de 6 a 4 slots (máximo de jugadores)
4. **Recursos no liberados** - Función de limpieza mejorada
5. **Interceptores problemáticos** - Simplificados para evitar bucles infinitos

### 🔧 Optimizaciones Implementadas:

#### **Sistema de Chat de Voz:**
- ✅ Funciones básicas implementadas
- ✅ Manejo de permisos de micrófono
- ✅ Control de silenciar/activar
- ✅ Interfaz sincronizada entre lobby y juego
- ⚠️ **Nota:** Para chat de voz completo entre jugadores se necesitaría WebRTC

#### **Sistema de Webcams:**
- ✅ Reducido a 4 slots (2x2 grid)
- ✅ Optimizaciones CSS con `will-change: transform`
- ✅ Transiciones más rápidas (0.2s en lugar de 0.3s)
- ✅ Limpieza automática de streams al salir

#### **Gestión de Recursos:**
- ✅ Función `cleanupListeners()` para evitar duplicados
- ✅ Función `cleanupWebcams()` mejorada
- ✅ Limpieza automática al cerrar ventana
- ✅ Variables resetadas al salir de sala

## 🎯 Cómo Usar el Multiplayer Optimizado

### **1. Crear una Sala:**
```
1. Ingresa tu nombre
2. Haz clic en "🚀 Crear Sala Online"
3. Comparte el código de 6 dígitos con tus amigos
```

### **2. Unirse a una Sala:**
```
1. Ingresa tu nombre
2. Ingresa el código de 6 dígitos
3. Haz clic en "🌐 Unirse Online"
```

### **3. Chat de Voz (Básico):**
```
1. En el lobby, haz clic en "🎤 UNIRSE AL CHAT"
2. Permite acceso al micrófono
3. Usa "🔇 SILENCIAR" para silenciar/activar
4. Haz clic en "🔇 SALIR DEL CHAT" para desconectar
```

### **4. Webcams:**
```
1. Durante el juego, haz clic en el botón "📹" en cada slot
2. Permite acceso a la cámara
3. Solo se muestran 4 slots (máximo de jugadores)
4. Las webcams se limpian automáticamente al salir
```

## ⚠️ Limitaciones Actuales

### **Chat de Voz:**
- Solo funciona localmente (no entre jugadores)
- Para chat completo se necesita servidor WebRTC
- Actualmente solo verifica permisos de micrófono

### **Webcams:**
- Solo funciona localmente (no se comparten entre jugadores)
- Para video compartido se necesita servidor WebRTC
- Actualmente solo verifica permisos de cámara

## 🛠️ Solución de Problemas

### **Si el juego se ralentiza:**
1. Recarga la página
2. Cierra otras pestañas del navegador
3. Desactiva webcams no utilizadas
4. Sal y vuelve a entrar a la sala

### **Si no aparecen jugadores:**
1. Verifica la conexión a internet
2. Verifica que el código de sala sea correcto
3. Asegúrate de que el host no haya salido
4. Recarga la página si es necesario

### **Si no funciona el micrófono/cámara:**
1. Permite acceso en el navegador
2. Cierra otras aplicaciones que usen micrófono/cámara
3. Verifica que estén conectados correctamente
4. Recarga la página si es necesario

## 🔮 Mejoras Futuras Recomendadas

Para implementar chat de voz y video completo entre jugadores:

1. **Servidor WebRTC** - Para comunicación peer-to-peer
2. **Socket.io** - Para señalización en tiempo real
3. **TURN/STUN servers** - Para conexiones NAT
4. **Compresión de video** - Para reducir ancho de banda

## 📊 Rendimiento Optimizado

- ✅ Listeners sin duplicados
- ✅ Recursos liberados correctamente
- ✅ CSS optimizado con `will-change`
- ✅ Transiciones más rápidas
- ✅ Menos elementos DOM (4 webcams vs 6)
- ✅ Limpieza automática al salir

¡El multiplayer ahora debería funcionar mucho más fluido! 🚀 