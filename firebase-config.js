// Configuración Firebase para MonoLLADOS Multiplayer
// ✅ Configuración real para el proyecto monollados-multiplayer

const firebaseConfig = {
    // 🔥 Obtén estos valores desde la consola de Firebase
    // https://console.firebase.google.com/
    apiKey: "AIzaSyB7d7jeHpLdgxQEUt82ytczPmEFtQXqasM",
    authDomain: "monollados-multiplayer.firebaseapp.com", 
    databaseURL: "https://monollados-multiplayer-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "monollados-multiplayer",
    storageBucket: "monollados-multiplayer.firebasestorage.app",
    messagingSenderId: "901038461801",
    appId: "1:901038461801:web:c5a40096f070efc96023f8"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Obtener referencia a la base de datos
const database = firebase.database();

// Estados de conexión
let isFirebaseConnected = false;

// Monitor de conexión
database.ref('.info/connected').on('value', (snapshot) => {
    isFirebaseConnected = snapshot.val() === true;
    const status = isFirebaseConnected ? 
        '🟢 Conectado a Firebase Online' : 
        '🔴 Reconectando a Firebase...';
    
    if (window.updateConnectionStatus) {
        updateConnectionStatus(status);
    }
    
    console.log('🔥 Firebase:', status);
});

console.log('🔥 Firebase configurado para MonoLLADOS Multiplayer Online'); 