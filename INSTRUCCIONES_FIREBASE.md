# 🔥 Configuración Firebase para MonoLLADOS Multiplayer

## 📋 Pasos para configurar Firebase

### 1. Crear proyecto Firebase
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en "Crear un proyecto"
3. Nombra tu proyecto (ej: "monollados-multiplayer")
4. Desactiva Google Analytics (opcional)
5. Haz clic en "Crear proyecto"

### 2. Configurar Realtime Database
1. En el panel izquierdo, haz clic en "Realtime Database"
2. Haz clic en "Crear base de datos"
3. Selecciona tu ubicación (Europe para menor latencia)
4. Selecciona "Empezar en modo de prueba" (por ahora)
5. Haz clic en "Listo"

### 3. Obtener configuración
1. Ve a "Configuración del proyecto" (ícono de engranaje)
2. Baja hasta "Tus apps" 
3. Haz clic en "Agregar app" > Selecciona el ícono web (</>)
4. Registra tu app (ej: "MonoLLADOS Web")
5. **¡Copia la configuración que aparece!**

### 4. Configurar las reglas de seguridad
1. Ve a "Realtime Database" > "Reglas"
2. Reemplaza el contenido con:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        ".validate": "$roomId.matches(/^[A-Z0-9]{6}$/)"
      }
    }
  }
}
```

3. Haz clic en "Publicar"

### 5. Actualizar firebase-config.js
1. Abre `firebase-config.js`
2. Reemplaza los valores de ejemplo con tu configuración:

```javascript
const firebaseConfig = {
    apiKey: "TU_API_KEY_REAL",
    authDomain: "tu-proyecto-real.firebaseapp.com",
    databaseURL: "https://tu-proyecto-real-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "tu-proyecto-real",
    storageBucket: "tu-proyecto-real.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123def456"
};
```

### 6. ¡Listo para jugar online!
- Abre `monopollados_multiplayer.html`
- Crea una sala
- Comparte el código con amigos
- ¡Jueguen desde cualquier parte del mundo!

## 🎯 Características del multiplayer online

✅ **Juego en tiempo real** - Sincronización instantánea  
✅ **Hasta 4 jugadores** - Desde cualquier dispositivo  
✅ **Códigos de sala** - Fácil de compartir  
✅ **Reconexión automática** - Si se pierde la conexión  
✅ **Limpieza automática** - Las salas se eliminan tras 1 hora  

## 🔧 Solución de problemas

**"No hay conexión a Firebase"**
- Verifica tu conexión a internet
- Revisa que la configuración en `firebase-config.js` sea correcta

**"Error creando sala"**
- Verifica las reglas de la base de datos
- Asegúrate de que el proyecto Firebase esté activo

**"La sala no existe"**
- Las salas expiran después de 1 hora
- Verifica que el código sea correcto (6 caracteres)

## 💰 Costos Firebase

- **Gratis hasta**: 100,000 operaciones simultáneas
- **Para MonoLLADOS**: Completamente gratis para uso normal
- **Escalabilidad**: Puede manejar miles de jugadores

## 🚀 ¡Disfruta MonoLLADOS Online! 