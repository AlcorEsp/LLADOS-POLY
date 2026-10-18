// Variables globales del juego (cargadas desde theme-config.js si está disponible)
var THEME = window.GAME_THEME || {};
var currentPlayer = 1;
var gameState = 'setup';
var turnPhase = 'roll';
var lastRoll = 0;
var selectedPlayerCount = 3;
var players = [];
var playerAvatars = THEME.playerAvatars || ['🏋️', '📱', '🚗', '💰', '🧠', '🎯'];
var defaultNames = THEME.defaultNames || ['Alpha Macho', 'Influencer Pro', 'Coach Nómada', 'Crypto Guru', 'Mindset Master', 'Success Hunter'];

// Variables globales para carta pendiente
var cartaPendiente = null;
var tipoCartaPendiente = null;
var jugadorCartaPendiente = null;

// Variables globales para selección de objetos
var seleccionPendiente = null;
var tipoSeleccion = null; // 'perder-propiedad', 'robar-propiedad', 'perder-carta', 'robar-carta'
var jugadorObjetivo = null; // Para acciones sobre otros jugadores
var callbackSeleccion = null; // Función a ejecutar tras la selección

// Variables para control de dobles
var doblesConsecutivos = 0;
var debeSeguitTirando = false;

// Variables para nuevas funciones del Monopoly completo
var subastaActiva = false;
var propiedadEnSubasta = null;
var jugadoresSubasta = [];
var pujadorActual = 0;
var pujaActual = 0;

// Variables para intercambio/comercio
var intercambioActivo = false;
var jugadorIntercambio1 = null;
var jugadorIntercambio2 = null;
var ofertaIntercambio = null;

// Variables para cartas guardables
var cartasEspecialesGuardadas = {}; // {jugadorId: [cartas]}

// Variables para protecciones
var proteccionesActivas = {}; // {jugadorId: {tipo: 'negativas', cantidad: 2}}

// Variables para popup de renta
var rentaPendiente = null;

// Variables para sistema de deudas
var deudasPendientes = {}; // {jugadorId: [{acreedor: jugadorId, cantidad: amount, concepto: string}]}
var contadorBancarrotas = {}; // {jugadorId: numero_de_bancarrotas}

// ===== SISTEMAS DE TEMÁTICA (CARGADOS DESDE theme-config.js) =====

// Sistema de Rangos
var rankSystem = THEME.rankSystem || {
    ranks: [
        {name: "Novato del Sistema", min: 0, max: 2, icon: "🐣", color: "#95a5a6"},
        {name: "Alpha en Construcción", min: 3, max: 5, icon: "🔨", color: "#3498db"},
        {name: "Influencer Certificado", min: 6, max: 8, icon: "📱", color: "#9b59b6"},
        {name: "Mentor Digital", min: 9, max: 12, icon: "🧠", color: "#e67e22"},
        {name: "Alpha Supremo", min: 13, max: 999, icon: "👑", color: "#f1c40f"}
    ]
};

// Sistema de Seguidores (Followers)
var followersSystem = THEME.followersSystem || {
    gainReasons: {
        digitalStation: 50,
        menteAlfaCard: 25,
        completeVuelta: 30,
        winRent: 10,
        buildMentoria: 20
    },
    spendOptions: {
        propertyDiscount: {cost: 100, discount: 0.1},
        rentProtection: {cost: 150, turns: 3},
        extraRoll: {cost: 200},
        skipTax: {cost: 120}
    }
};

// Sistema de Logros
var achievementsSystem = {
    achievements: THEME.achievements ? JSON.parse(JSON.stringify(THEME.achievements)) : [
        {
            id: "primer_millonario",
            name: "Primer Millonario",
            description: "Primer jugador en llegar a €3000",
            icon: "💰",
            reward: {type: "money", amount: 500},
            completed: false,
            playerId: null
        },
        {
            id: "monopolista_digital",
            name: "Monopolista Digital",
            description: "Poseer todas las estaciones digitales",
            icon: "📱",
            reward: {type: "followers", amount: 200},
            completed: false,
            playerId: null
        },
        {
            id: "superviviente",
            name: "Superviviente",
            description: "Sobrevivir 3 bancarrotas",
            icon: "💪",
            reward: {type: "protection", turns: 5},
            completed: false,
            playerId: null
        },
        {
            id: "mentor_supremo",
            name: "Mentor Supremo",
            description: "Construir 10 mentorías",
            icon: "🏗️",
            reward: {type: "money", amount: 1000},
            completed: false,
            playerId: null
        },
        {
            id: "alpha_velocidad",
            name: "Alpha Velocidad",
            description: "Comprar 5 propiedades en 10 turnos",
            icon: "⚡",
            reward: {type: "followers", amount: 150},
            completed: false,
            playerId: null
        },
        {
            id: "influencer_viral",
            name: "Influencer Viral",
            description: "Acumular 500 seguidores",
            icon: "🔥",
            reward: {type: "money", amount: 800},
            completed: false,
            playerId: null
        }
    ],
    playerProgress: {} // {playerId: {achievementId: progress}}
};

// Sistema de Sonidos LLADOS
var soundSystem = {
    enabled: true,
    sounds: {
        // Sonidos BUENOS (duración recomendada: 1-3 segundos)
        good: {
            gainMoney: null,           // Cuando ganas dinero
            buyProperty: null,         // Cuando compras propiedad
            buildMentoria: null,       // Cuando construyes mentoría
            menteAlfaCard: null,       // Cuando sacas carta Mente Alfa
            achievement: null,         // Cuando logras un achievement
            rankUp: null,              // Cuando subes de rango
            gainFollowers: null,       // Cuando ganas seguidores
            winGame: null              // Cuando ganas el juego
        },
        // Sonidos MALOS (duración recomendada: 1-2 segundos)
        bad: {
            loseMoney: null,           // Cuando pierdes dinero
            realidadCard: null,        // Cuando sacas carta Realidad del Sistema
            payRent: null,             // Cuando pagas alquiler
            goToJail: null,            // Cuando vas a la cárcel
            bankruptcy: null,          // Cuando entras en bancarrota
            loseProperty: null         // Cuando pierdes una propiedad
        },
        // Sonidos NEUTRALES (duración recomendada: 0.5-1 segundo)
        neutral: {
            rollDice: null,            // Cuando tiras dados
            nextPlayer: null,          // Cuando cambia de turno
            cardFlip: null             // Cuando volteas una carta
        }
    }
};

// Variables de estado para los nuevos sistemas
var playerFollowers = {}; // {playerId: cantidad_seguidores}
var playerAchievements = {}; // {playerId: [achievementIds_completados]}
var proteccionesEspeciales = {}; // {playerId: {tipo: 'rent', turns: 3}}



// Variables para límite de construcciones
var casasDisponibles = 32;
var hotelesDisponibles = 12;

// Variables para utilities especiales
var utilitiesOwned = {}; // Para calcular alquiler progresivo

// Variables para monopolio de zonas
var monopoliosActivos = {}; // {zona: jugadorId}

// IMPORTANTE: Los dados mueven al jugador por DESPLAZAMIENTO, no por posición absoluta
// Es decir, si tiras 7, avanzas 7 casillas en sentido horario desde donde estés
// El tablero tiene 40 casillas en total (0-39) dispuestas en sentido horario

// Datos del tablero y configuración del juego (desde theme-config.js)
var zoneData = THEME.zoneData || {
    freelance: { mentorCost: 50, mentorRent: 50, maxRent: 200 },
    gym: { mentorCost: 75, mentorRent: 75, maxRent: 300 },
    hustler: { mentorCost: 100, mentorRent: 100, maxRent: 400 },
    cafe: { mentorCost: 125, mentorRent: 125, maxRent: 500 },
    mentoring: { mentorCost: 150, mentorRent: 150, maxRent: 600 },
    mindset: { mentorCost: 175, mentorRent: 175, maxRent: 700 },
    cancelacion: { mentorCost: 200, mentorRent: 200, maxRent: 800 },
    nomada: { mentorCost: 225, mentorRent: 225, maxRent: 900 },
    finalboss: { mentorCost: 250, mentorRent: 250, maxRent: 1000 }
};

// Datos para las estaciones digitales
var digitalStationData = THEME.digitalStationData || {
    stations: ["TIKTOK VIRAL", "WIFI PREMIUM", "YOUTUBE MONETIZADO", "INSTAGRAM VERIFICADO"],
    baseRent: [25, 50, 100, 200] // Alquiler según cantidad de estaciones
};

var boardCells = THEME.boardCells ? JSON.parse(JSON.stringify(THEME.boardCells)) : [
    // Fila superior (0-10) - FREELANCE (marrón) + GYM (rojo)
    {name: "DESPERTAR DEL SISTEMA", type: "corner", class: "corner"},
    {name: "INFOPRODUCTO BÁSICO", type: "property", zone: "freelance", price: 100, class: "freelance", constructions: 0},
    {name: "MENTE ALFA", type: "card", class: "special"},
    {name: "COACHING POR ZOOM", type: "property", zone: "freelance", price: 120, class: "freelance", constructions: 0},
    {name: "IMPUESTO MOTIVACIONAL", type: "tax", amount: 200, class: "special"},
    {name: "TIKTOK VIRAL", type: "digital-station", price: 200, class: "digital-station"},
    {name: "GIMNASIO 24H", type: "property", zone: "gym", price: 140, class: "gym", constructions: 0},
    {name: "REALIDAD DEL SISTEMA", type: "card", class: "special"},
    {name: "CONSULTORÍA ESTÉTICA", type: "property", zone: "gym", price: 140, class: "gym", constructions: 0},
    {name: "SELFIE MOTIVACIONAL", type: "property", zone: "gym", price: 160, class: "gym", constructions: 0},
    {name: "OSCURIDAD MENTAL", type: "jail", class: "corner"},
    
    // Lado derecho (11-20) - HUSTLER (naranja) + CAFE (amarillo)
    {name: "DROPSHIPPING SUPLEMENTOS", type: "property", zone: "hustler", price: 180, class: "hustler", constructions: 0},
    {name: "WIFI PREMIUM", type: "digital-station", price: 200, class: "digital-station"},
    {name: "YOUTUBE SIN MONETIZAR", type: "property", zone: "hustler", price: 180, class: "hustler", constructions: 0},
    {name: "CRIPTOS PUMP&DUMP", type: "property", zone: "hustler", price: 200, class: "hustler", constructions: 0},
    {name: "COWORKING GRATUITO", type: "corner", class: "corner"},
    {name: "CAFÉ DE 5€", type: "property", zone: "cafe", price: 220, class: "cafe", constructions: 0},
    {name: "REALIDAD DEL SISTEMA", type: "card", class: "special"},
    {name: "COMER EN EL COCHE", type: "property", zone: "cafe", price: 220, class: "cafe", constructions: 0},
    {name: "CORTADO CON AVENA", type: "property", zone: "cafe", price: 240, class: "cafe", constructions: 0},
    {name: "MULTA HACIENDA", type: "tax", amount: 100, class: "special"},
    
    // Fila inferior (21-30) - MENTORING (verde) + MINDSET (azul claro)
    {name: "CURSO DESPIERTA", type: "property", zone: "mentoring", price: 260, class: "mentoring", constructions: 0},
    {name: "MENTE ALFA", type: "card", class: "special"},
    {name: "CURSO TIBURÓN", type: "property", zone: "mentoring", price: 260, class: "mentoring", constructions: 0},
    {name: "MASTERCLASS EXCLUSIVA", type: "property", zone: "mentoring", price: 280, class: "mentoring", constructions: 0},
    {name: "YOUTUBE MONETIZADO", type: "digital-station", price: 200, class: "digital-station"},
    {name: "MEDITACIÓN GURÚ", type: "property", zone: "mindset", price: 300, class: "mindset", constructions: 0},
    {name: "CARTA MOTIVACIONAL", type: "property", zone: "mindset", price: 300, class: "mindset", constructions: 0},
    {name: "REALIDAD DEL SISTEMA", type: "card", class: "special"},
    {name: "AYUNO INTERMITENTE", type: "property", zone: "mindset", price: 320, class: "mindset", constructions: 0},
    {name: "IR AL SISTEMA", type: "corner", class: "corner"},
    
    // Lado izquierdo (31-39) - CANCELACION (violeta) + NOMADA (azul oscuro) + FINALBOSS (negro)
    {name: "POLÉMICA EN X", type: "property", zone: "cancelacion", price: 350, class: "cancelacion", constructions: 0},
    {name: "TE FUNAN EN REDES", type: "property", zone: "cancelacion", price: 350, class: "cancelacion", constructions: 0},
    {name: "MENTE ALFA", type: "card", class: "special"},
    {name: "AIRBNB PARA STORIES", type: "property", zone: "nomada", price: 400, class: "nomada", constructions: 0},
    {name: "INSTAGRAM VERIFICADO", type: "digital-station", price: 200, class: "digital-station"},
    {name: "HOSTAL COMPARTIDO", type: "property", zone: "nomada", price: 400, class: "nomada", constructions: 0},
    {name: "PISO EN ANDORRA", type: "property", zone: "finalboss", price: 500, class: "finalboss", constructions: 0},
    {name: "REALIDAD DEL SISTEMA", type: "card", class: "special"},
    {name: "VIDEOLLAMADA LLADOS", type: "property", zone: "finalboss", price: 600, class: "finalboss", constructions: 0}
];

var menteAlfaCards = THEME.menteAlfaCards ? THEME.menteAlfaCards.slice() : [
    "🚀 Has invertido €997 en un curso. Avanza 3 casillas y cobra €300 por tu nueva mentalidad.",
    "📱 Publicaste tu transformación en X. Cobra €400 por patrocinios y roba otra carta.",
    "👨‍🏫 Tu mentor te dio like. Cobra €500 por el boost de credibilidad.",
    "🪞 Dices 'soy el mejor' al espejo. Repite turno y cobra €200 por autoestima.",
    "📚 Compraste libro motivacional. Paga €150 pero avanza 2 casillas por conocimiento.",
    "💪 Rutina matutina perfecta. Cobra €350 y avanza 2 casillas por disciplina.",
    "🎯 Manifiestas abundancia. Todos los jugadores te pagan €100 por tu energía.",
    "🎥 Video viral: Avanza hasta la propiedad más cara disponible y cómprala con 50% descuento.",
    "🧠 'Despierta ya'. Sal de la cárcel (mental) gratis. [GUARDABLE]",
    "🎙️ Podcast exitoso. Cobra €600 y elige una propiedad de otro jugador para comprarla al precio original.",
    "🧑‍🏫 Ofreces mentoring de mindset: cobra €500 de cada jugador.",
    "📱 Reels virales: Tira 3 dados y muévete la suma total.",
    "💰 Inviertes en ti: Paga €300 pero duplica el alquiler de todas tus propiedades por 3 turnos.",
    "🏖️ Fotos en Dubai: Cobra €600 y intercambia posiciones con cualquier jugador.",
    "🔥 Motivación extrema: Avanza hasta la siguiente propiedad sin dueño y cómprala gratis.",
    "📖 Sabiduría ancestral: Avanza 4 casillas y cobra €200 por cada propiedad que poseas.",
    "🧘 Meditación trascendental: Repite turno y cobra €100 por cada jugador en el juego.",
    "💎 Mentalidad de diamante: Cobra €800 y eres inmune a la siguiente carta negativa.",
    "✨ Manifiestas riqueza: Cobra €1000 y construye una mentoría gratis en cualquier propiedad tuya.",
    "🎓 Curso 'Desbloqueo Cuántico': Paga €1200 pero roba 2 propiedades de otros jugadores.",
    "🤝 Grupo mastermind secreto: Avanza 6 casillas y cobra €300 por networking.",
    "📺 Live con 10K espectadores: Cobra €700 y todos los jugadores te pagan €50.",
    "🚗 Content desde el Lambo: Cobra €500 y avanza a la casilla más cara del tablero.",
    "🎪 Evento motivacional: Cobra €400 de cada jugador por inspirarlos.",
    "👑 Mentalidad de rey: Roba la propiedad más valiosa de otro jugador y cobra €300.",
    "📵 Detox digital exitoso: Cobra €600 y construye mentorías gratis en 2 propiedades.",
    "💬 Canal premium: Cobra €800 y elige el próximo movimiento de cualquier jugador.",
    "🎯 Focus extremo: Cobra €500 y muévete directamente a cualquier casilla que elijas.",
    "📢 Conferencia magistral: Cobra €300 de cada jugador y avanza 3 casillas.",
    "👑 Acceso 'Nivel Dios': Paga €2000 pero controlas los próximos 2 turnos de cualquier jugador.",
    "💉 Tatuaje 'Never Give Up': Avanza 3 casillas y eres inmune a perder propiedades por 2 turnos.",
    "📅 Constancia épica: Cobra €600 y duplica el valor de construcción de todas tus propiedades.",
    "🏠🎯 Imperio en expansión: Roba 2 propiedades de otros jugadores y cobra €400.",
    "🔥 Foco láser: Elige cualquier propiedad del tablero y cómprala al 50% de su valor.",
    "🗝️ Mentalidad ganadora: Cobra €500 y roba 1 carta especial de otro jugador. [GUARDABLE]",
    "🎯 Dominas la competencia: Roba 1 propiedad y 1 carta especial de cada jugador."
];

var realidadSistemaCards = THEME.realidadSistemaCards ? THEME.realidadSistemaCards.slice() : [
    "🏛️ Hacienda te persigue: Paga €800 y retrocede 3 casillas por estrés fiscal.",
    "👩 Tu madre te dice que consigas trabajo: Pierdes turno y paga €300 por crisis existencial.",
    "🚫 Te cancelan por comentario antiguo: Retrocede 5 casillas y pierde 1 propiedad por reputación.",
    "😤 Guerra en el coworking: Paga €400 a cada jugador por mal ambiente.",
    "📶 WiFi del coche se cae: Pierdes €600 en ingresos y no puedes tirar dados el próximo turno.",
    "💳 Stripe te bloquea la cuenta: Pierdes €1500 y da €200 a cada jugador.",
    "📉 Cripto crash total: Pierdes €1200 y retrocede 4 casillas por depresión.",
    "🚪 Te expulsan del coworking: Pierde 2 propiedades y paga €500 de penalización.",
    "😒 'Tu lifestyle es fake': Todos los jugadores te roban €150 cada uno.",
    "😴 Te despiertas tarde: Retrocede 3 casillas y paga €200 por perder oportunidades.",
    "⭐ Review bomb masiva: Paga €600 y pierde la propiedad más valiosa.",
    "🍽️ Familia te rechaza: Avanza 2 casillas pero paga €400 por soledad.",
    "🏠 Vuelves con tus padres: Pierdes €800 y todas las construcciones de tus propiedades.",
    "☕ Adicción al café rota: Pierdes 2 turnos y paga €300 por rehabilitación.",
    "📄 Piratean tus cursos: Pierdes €800 y da €100 a cada jugador por contenido gratis.",
    "👥 Tu mejor amigo te copia: Pierde 1 propiedad y €400 por traición.",
    "📷 Equipo técnico roto: Paga €500 y no puedes cobrar alquileres por 2 turnos.",
    "🎙️ Podcast te rechaza: Pierdes turno y paga €300 por ego herido.",
    "📚 Libro de finanzas te salva: Cobra €400 y protégete de la próxima carta negativa. [GUARDABLE]",
    "🖼️ NFTs a cero: Pierdes €1000 y retrocede 3 casillas por FOMO perdido.",
    "📺 YouTube te desmonetiza: Pierdes €600 y da €100 a cada jugador por contenido gratis.",
    "📱 Vuelves a Instagram: Cobra €300 pero pierde 1 propiedad por distracción.",
    "📞 Headhunter te llama: Elige: cobra €1200 pero pierde 2 propiedades, o rechaza y paga €200.",
    "✏️ Errores ortográficos virales: Paga €400 a cada jugador por vergüenza ajena.",
    "🔄 Rebrand fallido: Paga €600 y intercambia tu propiedad más cara con la más barata de otro jugador.",
    "💔 Mastermind se disuelve: Pierde 2 propiedades y paga €500 por networking perdido.",
    "📝 Te plagian todo el contenido: Todos los jugadores cobran €200 de tus ideas.",
    "🤝 Colaboración falsa: Paga €600 y da tu propiedad más barata a otro jugador.",
    "💻 Hackean tu web: Pierdes €800 y no puedes cobrar alquileres por 3 turnos.",
    "💼 Trabajo estable te tienta: Cobra €1500 pero pierde 3 propiedades por falta de tiempo.",
    "🚗 Embargo del Lambo: Pierde tu propiedad más valiosa y paga €700 de multas.",
    "💡 Inspiras sin querer: Cobra €200 pero todos los jugadores avanzan 2 casillas gratis.",
    "🏠💔 Crisis de los 30: Pierde 2 propiedades y paga €600 por terapia.",
    "🔄 Robas ideas ajenas: Roba 1 propiedad pero paga €500 a cada jugador por karma.",
    "🗝️ Encuentras mentor real: Cobra €600 y protégete de las próximas 2 cartas negativas. [GUARDABLE]",
    "🎯 Hackeas la matrix: Roba 1 propiedad de cada jugador pero ve a la cárcel por 2 turnos."
];

// FUNCIONES DE CONFIGURACIÓN
function selectPlayerCount(count) {
    selectedPlayerCount = count;
    var buttons = document.querySelectorAll('.count-btn');
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove('selected');
    }
    event.target.classList.add('selected');
    generatePlayerInputs(count);
}

function generatePlayerInputs(count) {
    var container = document.getElementById('players-setup');
    var html = '<h3>Configuración de jugadores:</h3>';
    
    for (var i = 1; i <= count; i++) {
        html += '<div class="player-input">';
        html += '<div class="player-number player' + i + '-color">' + i + '</div>';
        html += '<input type="text" class="player-name-input" id="player' + i + '-name" placeholder="Nombre del Jugador ' + i + '" value="' + defaultNames[i-1] + '">';
        html += '<div class="avatar-selector">';
        
        for (var j = 0; j < playerAvatars.length; j++) {
            var selected = j === (i-1) ? 'selected' : '';
            html += '<button class="avatar-btn ' + selected + '" onclick="selectAvatar(' + i + ', \'' + playerAvatars[j] + '\', this)">' + playerAvatars[j] + '</button>';
        }
        
        html += '</div></div>';
    }
    
    container.innerHTML = html;
    validateSetup();
}

function selectAvatar(playerId, avatar, button) {
    var container = button.parentNode;
    var avatarButtons = container.querySelectorAll('.avatar-btn');
    for (var i = 0; i < avatarButtons.length; i++) {
        avatarButtons[i].classList.remove('selected');
    }
    button.classList.add('selected');
    validateSetup();
}

function validateSetup() {
    var isValid = true;
    for (var i = 1; i <= selectedPlayerCount; i++) {
        var nameInput = document.getElementById('player' + i + '-name');
        if (!nameInput || nameInput.value.trim() === '') {
            isValid = false;
            break;
        }
    }
    document.getElementById('start-button').disabled = !isValid;
}

function startGame() {
    players = [];
    for (var i = 1; i <= selectedPlayerCount; i++) {
        var nameInput = document.getElementById('player' + i + '-name');
        var selectedAvatar = document.querySelector('#players-setup .player-input:nth-child(' + (i+1) + ') .avatar-btn.selected');
        
        players.push({
            id: i,
            name: selectedAvatar.textContent + ' ' + nameInput.value.trim(),
            money: 2500,
            position: 0,
            properties: [],
            constructions: 0,
            bankrupt: false,
            inJail: false,
            jailTurns: 0,
            getOutCards: 0,
            followers: 100,           // Seguidores iniciales
            rank: 0,                  // Índice del rango actual
            totalMentorias: 0,        // Total de mentorías construidas
            turnsPlayed: 0           // Turnos jugados (para logros)
        });
    }
    
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    gameState = 'playing';
    initializeProperties();
    initBoard();
    inicializarCartasGuardadas();
    proteccionesActivas = {}; // Inicializar protecciones
    deudasPendientes = {}; // Inicializar deudas
    contadorBancarrotas = {}; // Inicializar contador de bancarrotas
    
    // Inicializar nuevos sistemas LLADOS
    inicializarSistemasLlados();
    
    // Cargar sistema de sonidos
    loadSounds();
    
    updatePlayerDisplay();
    updatePlayerPieces();
    
    addLogEntry('🎮 ¡MonoLLADOS iniciado con ' + selectedPlayerCount + ' jugadores!');
    addLogEntry('💰 Cada jugador empieza con €2500');
    addLogEntry('🎯 ¡Objetivo: Convertirse en el Alpha Máximo!');
    addLogEntry('🎲 ' + players[0].name + ' puede empezar tirando los dados');
}

// FUNCIONES PRINCIPALES DEL JUEGO
function rollDice() {
    if (gameState !== 'playing' || turnPhase !== 'roll' || players[currentPlayer-1].bankrupt) return;
    
    var player = players[currentPlayer - 1];
    
    if (player.inJail) {
        // Mostrar opciones de cárcel en lugar de tirar automáticamente
        mostrarOpcionesCarcel(player);
        return;
    }
    
    var dice1 = Math.floor(Math.random() * 6) + 1;
    var dice2 = Math.floor(Math.random() * 6) + 1;
    var total = dice1 + dice2;
    var isDouble = dice1 === dice2;
    lastRoll = total;

    document.getElementById('dice1').textContent = dice1;
    document.getElementById('dice2').textContent = dice2;
    
    playSound('neutral', 'rollDice');
    
    if (isDouble) {
        doblesConsecutivos++;
        document.getElementById('dice-result').textContent = 'Total: ' + total + ' (¡Dobles! ' + doblesConsecutivos + '/3)';
        addLogEntry('🎲 ' + players[currentPlayer-1].name + ' tiró ' + dice1 + ' + ' + dice2 + ' = ' + total + ' (¡Dobles! ' + doblesConsecutivos + '/3)');
        
        // Regla: 3 dobles seguidos = ir a la cárcel
        if (doblesConsecutivos >= 3) {
            addLogEntry('🌑 ' + player.name + ' sacó 3 dobles seguidos y va a OSCURIDAD MENTAL');
            player.inJail = true;
            player.jailTurns = 0;
            player.position = 10; // Posición de OSCURIDAD MENTAL
            doblesConsecutivos = 0;
            debeSeguitTirando = false;
            updatePlayerPieces();
            turnPhase = 'action';
            document.getElementById('roll-btn').disabled = true;
            return;
        }
        
        debeSeguitTirando = true;
    } else {
        doblesConsecutivos = 0;
        debeSeguitTirando = false;
        document.getElementById('dice-result').textContent = 'Total: ' + total;
        addLogEntry('🎲 ' + players[currentPlayer-1].name + ' tiró ' + dice1 + ' + ' + dice2 + ' = ' + total);
    }

    movePlayer(currentPlayer, total);
    
    turnPhase = 'action';
    document.getElementById('roll-btn').disabled = true;
    updateButtonStates();
    
    if (isDouble && !player.inJail && doblesConsecutivos < 3) {
        setTimeout(function() {
            turnPhase = 'roll';
            document.getElementById('roll-btn').disabled = false;
            updateButtonStates();
            addLogEntry('🎲 ' + player.name + ' DEBE tirar otra vez por sacar dobles');
        }, 2000);
    }
}

function nextPlayer() {
    if (gameState !== 'playing') return;
    
    // Verificar si el jugador actual debe seguir tirando por dobles
    if (debeSeguitTirando) {
        addLogEntry('❌ ' + players[currentPlayer-1].name + ' debe seguir tirando por haber sacado dobles');
        return;
    }
    
    // Limpiar el estado anterior
    var cells = document.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) {
        cells[i].classList.remove('current-position');
    }
    
    // Resetear variables de dobles al cambiar de jugador
    doblesConsecutivos = 0;
    debeSeguitTirando = false;
    lastRoll = 0;
    
    do {
        currentPlayer = (currentPlayer % players.length) + 1;
    } while (players[currentPlayer - 1].bankrupt && !allPlayersExceptOneBankrupt());
    
    // Incrementar contador de turnos para el nuevo jugador
    players[currentPlayer - 1].turnsPlayed = (players[currentPlayer - 1].turnsPlayed || 0) + 1;
    
    turnPhase = 'roll';
    document.getElementById('roll-btn').disabled = false;
    
    playSound('neutral', 'nextPlayer');
    
    updatePlayerDisplay();
    highlightCurrentPosition();
    updateButtonStates();
    addLogEntry('🔄 Turno de ' + players[currentPlayer-1].name);
    
    checkWinCondition();
}

function buyProperty() {
    if (gameState !== 'playing') return;
    
    var player = players[currentPlayer - 1];
    if (!Array.isArray(player.properties)) player.properties = [];
    var cellData = boardCells[player.position];
    
    if (cellData.type === 'property' && !cellData.owner && player.money >= cellData.price) {
        player.money -= cellData.price;
        player.properties.push(player.position);
        cellData.owner = player.id;
        cellData.constructions = 0;
        
        var cell = document.querySelector('[data-index="' + player.position + '"]');
        if (cell) {
            cell.classList.add('property-owned');
            cell.classList.add('owner-' + player.id);
        }
        
        var zone = zoneData[cellData.zone];
        addLogEntry('🏠 ' + player.name + ' compró ' + cellData.name + ' por €' + cellData.price);
        if (zone) {
            addLogEntry('💡 Zona ' + cellData.zone + ': Mentoría cuesta €' + zone.mentorCost + ', renta €' + zone.mentorRent);
        }
        
        // Ganar seguidores por comprar propiedad
        giveFollowers(player.id, 15, 'Comprar propiedad');
        
        // Verificar logros
        checkAchievement(player.id, 'alpha_velocidad');
        checkAchievement(player.id, 'primer_millonario');
        
        playSound('good', 'buyProperty');
        
        verificarMonopolio(cellData.zone, player.id);
        updatePlayerDisplay();
    } else if (cellData.type === 'property' && cellData.owner) {
        addLogEntry('❌ Esta propiedad ya tiene dueño');
    } else if (cellData.type !== 'property') {
        addLogEntry('❌ No puedes comprar esta casilla');
    } else {
        addLogEntry('❌ No tienes suficiente dinero (necesitas €' + cellData.price + ')');
    }
}

function buildConstruction() {
    if (gameState !== 'playing') return;
    
    var player = players[currentPlayer - 1];
    var cellData = boardCells[player.position];
    
    if (cellData.type === 'property' && cellData.owner === player.id && cellData.zone) {
        var zone = zoneData[cellData.zone];
        var currentConstructions = cellData.constructions || 0;
        
        if (currentConstructions >= 4) {
            addLogEntry('❌ Ya tienes el Lanzamiento Final en esta propiedad');
            return;
        }
        
        var cost = zone.mentorCost;
        var tipoConstruccion = currentConstructions === 3 ? 'hotel' : 'casa';
        
        if (!verificarLimiteConstrucciones(tipoConstruccion)) {
            addLogEntry('❌ No hay ' + (tipoConstruccion === 'casa' ? 'casas' : 'hoteles') + ' disponibles');
            return;
        }
        
        if (player.money >= cost) {
            player.money -= cost;
            cellData.constructions = (cellData.constructions || 0) + 1;
            player.constructions++;
            usarConstruccion(tipoConstruccion);
            
            var constructionName = cellData.constructions === 4 ? 
                'Lanzamiento Final' : 
                'Mentoría ' + cellData.constructions;
            
            addLogEntry('🏗️ ' + player.name + ' construyó ' + constructionName + ' en ' + cellData.name + ' por €' + cost);
            addLogEntry('🏠 Quedan: ' + casasDisponibles + ' casas, ' + hotelesDisponibles + ' hoteles');
            
            // Incrementar contador de mentorías y ganar seguidores
            player.totalMentorias++;
            giveFollowers(player.id, 20, 'Construir mentoría');
            
            // Verificar logros
            checkAchievement(player.id, 'mentor_supremo');
            
            playSound('good', 'buildMentoria');
            
            updateCellDisplay(player.position);
            updatePlayerDisplay();
        } else {
            addLogEntry('❌ Necesitas €' + cost + ' para construir una mentoría');
        }
    } else {
        addLogEntry('❌ No puedes construir aquí');
    }
}



function showPlayerProperties() {
    var player = players[currentPlayer - 1];
    if (!Array.isArray(player.properties)) player.properties = [];
    var propertiesText = '📊 PROPIEDADES DE ' + player.name.toUpperCase() + ':\n\n';
    
    if (player.properties.length === 0) {
        propertiesText += '❌ No tienes propiedades\n';
    } else {
        for (var i = 0; i < player.properties.length; i++) {
            var index = player.properties[i];
            var cellData = boardCells[index];
            var zone = zoneData[cellData.zone];
            var constructions = cellData.constructions || 0;
            
            propertiesText += '🏠 ' + cellData.name + '\n';
            propertiesText += '   💰 Valor: €' + cellData.price + '\n';
            propertiesText += '   🏗️ Construcciones: ' + constructions;
            
            if (constructions === 4) {
                propertiesText += ' (🚀 Lanzamiento Final - Renta: €' + (zone ? zone.maxRent : 0) + ')';
            } else if (constructions > 0) {
                propertiesText += ' (Renta: €' + (zone ? zone.mentorRent * constructions : 0) + ')';
            }
            propertiesText += '\n';
            
            if (zone && constructions < 4) {
                propertiesText += '   💡 Próxima mentoría: €' + zone.mentorCost + '\n';
            }
            propertiesText += '\n';
        }
    }
    
    var totalValue = 0;
    for (var i = 0; i < player.properties.length; i++) {
        totalValue += boardCells[player.properties[i]].price || 0;
    }
    
    propertiesText += '📈 RESUMEN:\n';
    propertiesText += '💰 Dinero en efectivo: €' + player.money + '\n';
    propertiesText += '🏠 Valor en propiedades: €' + totalValue + '\n';
    propertiesText += '📊 Patrimonio total: €' + (player.money + totalValue) + '\n';
    propertiesText += '🏗️ Total construcciones: ' + player.constructions;
    
    alert(propertiesText);
}

function endGame() {
    if (confirm('¿Estás seguro de que quieres terminar el juego?')) {
        gameState = 'ended';
        
        var results = [];
        for (var i = 0; i < players.length; i++) {
            var player = players[i];
            var propertyValue = 0;
            for (var j = 0; j < player.properties.length; j++) {
                propertyValue += boardCells[player.properties[j]].price || 0;
            }
            
            results.push({
                name: player.name,
                money: player.money,
                propertyValue: propertyValue,
                total: player.money + propertyValue,
                bankrupt: player.bankrupt
            });
        }
        
        results.sort(function(a, b) { return b.total - a.total; });
        
        var resultText = '🏆 RESULTADOS FINALES:\n\n';
        for (var i = 0; i < results.length; i++) {
            var position = i + 1;
            var emoji = position === 1 ? '👑' : position === 2 ? '🥈' : position === 3 ? '🥉' : '💀';
            resultText += emoji + ' ' + position + '. ' + results[i].name + '\n';
            resultText += '   💰 Dinero: €' + results[i].money + '\n';
            resultText += '   🏠 Propiedades: €' + results[i].propertyValue + '\n';
            resultText += '   📊 Total: €' + results[i].total + (results[i].bankrupt ? ' (Bancarrota)' : '') + '\n\n';
        }
        
        alert(resultText);
    }
}

function hideCard() {
    document.getElementById('card-display').style.display = 'none';
}

function handleCellClick(index) {
    var cellData = boardCells[index];
    if (cellData) {
        addLogEntry('ℹ️ ' + cellData.name + ' - ' + (cellData.type || 'especial'));
    }
}

function showRules() {
    var rules = '🎮 REGLAS DE MONOLLADOS (VERSIÓN COMPLETA)\n\n🎯 OBJETIVO:\n- Ser el último jugador sin bancarrota\n- O conseguir "Piso en Andorra" + "Videollamada LLADOS"\n\n💰 DINERO:\n- Empiezas con €2500\n- Ganas €500 al completar una vuelta\n\n🏗️ CONSTRUCCIONES:\n- Compra propiedades para cobrar alquiler\n- Construye mentorías para aumentar la renta\n- 4 mentorías = Lanzamiento Final (renta máxima)\n- LÍMITE: 32 casas y 12 hoteles en total\n\n🏆 MONOPOLIOS:\n- Poseer todas las propiedades de una zona\n- DOBLE alquiler en propiedades sin construcciones\n\n📱 ESTACIONES DIGITALES:\n- TikTok Viral, WiFi Premium, YouTube Monetizado, Instagram Verificado\n- NO se puede construir en ellas, solo comprar\n- Alquiler escalado: 1=€25, 2=€50, 3=€100, 4=€200\n- ¡Tener las 4 = Monopolio Digital!\n\n🔨 SUBASTAS:\n- Si no compras una propiedad, se subasta automáticamente\n- Todos los jugadores pueden pujar\n\n🌑 OSCURIDAD MENTAL (Cárcel):\n- Sales con dobles, después de 3 turnos o pagando €50\n- Algunas cartas te pueden liberar\n\n🔄 INTERCAMBIO:\n- Intercambia propiedades, dinero y cartas con otros jugadores\n\n🃏 CARTAS:\n- MENTE ALFA: Efectos positivos/motivacionales\n- REALIDAD DEL SISTEMA: Efectos de la vida real\n- Algunas cartas se pueden GUARDAR para usar después\n\n💸 IMPUESTOS:\n- Impuesto Motivacional: €200 o 10% del patrimonio\n\n💀 BANCARROTA:\n- Si no puedes pagar, se crea una deuda\n- 3 bancarrotas = ELIMINACIÓN del juego\n- Propiedades del eliminado se reparten entre jugadores activos\n\n🎨 ZONAS REORGANIZADAS:\n- FREELANCE (marrón) + GYM (rojo): Lado superior\n- HUSTLER (naranja) + CAFE (amarillo): Lado derecho\n- MENTORING (verde) + MINDSET (azul claro): Lado inferior\n- CANCELACION (violeta) + NOMADA (azul) + FINALBOSS (negro): Lado izquierdo\n\n⌨️ ATAJOS:\n- ESPACIO: Tirar dados\n- ENTER: Siguiente jugador';
    
    alert(rules);
}

function showZoneInfo(zoneName) {
    var zone = zoneData[zoneName];
    if (!zone) return;
    
    var info = '📊 INFORMACIÓN DE ZONA: ' + zoneName.toUpperCase() + '\n\n';
    info += '💰 Costo Mentoría: €' + zone.mentorCost + '\n';
    info += '💸 Renta por Mentoría: €' + zone.mentorRent + '\n';
    info += '🚀 Renta Lanzamiento Final: €' + zone.maxRent + '\n\n';
    info += '🏠 PROPIEDADES EN ESTA ZONA:\n';
    
    for (var i = 0; i < boardCells.length; i++) {
        var property = boardCells[i];
        if (property.zone === zoneName) {
            info += '- ' + property.name + ' (€' + property.price + ')\n';
            if (property.owner) {
                var owner = players[property.owner - 1];
                info += '  👤 Propietario: ' + owner.name + '\n';
                info += '  🏗️ Construcciones: ' + (property.constructions || 0) + '\n';
            }
        }
    }
    
    alert(info);
}

// FUNCIONES AUXILIARES
function calculateRent(cellData, position) {
    if (!cellData.zone || !zoneData[cellData.zone]) {
        return Math.floor(cellData.price * 0.1);
    }
    
    var zone = zoneData[cellData.zone];
    var constructions = cellData.constructions || 0;
    
    if (constructions === 0) {
        return Math.floor(cellData.price * 0.1);
    } else if (constructions < 4) {
        return zone.mentorRent * constructions;
    } else {
        return zone.maxRent;
    }
}

function updateCellDisplay(position) {
    var cell = document.querySelector('[data-index="' + position + '"]');
    var cellData = boardCells[position];
    
    if (cell && cellData.constructions > 0) {
        var existingIndicator = cell.querySelector('.construction-indicator');
        if (!existingIndicator) {
            existingIndicator = document.createElement('div');
            existingIndicator.className = 'construction-indicator';
            cell.appendChild(existingIndicator);
        }
        
        // Obtener el color del jugador propietario
        var playerColor = getPlayerColor(cellData.owner);
        
        if (cellData.constructions === 4) {
            existingIndicator.textContent = '🚀';
            existingIndicator.style.background = playerColor;
            existingIndicator.style.color = '#fff';
            existingIndicator.style.border = '2px solid #fff';
        } else {
            existingIndicator.textContent = cellData.constructions;
            existingIndicator.style.background = playerColor;
            existingIndicator.style.color = '#fff';
            existingIndicator.style.border = '2px solid #fff';
        }
        
        // Añadir clase para identificar el jugador
        existingIndicator.className = 'construction-indicator player' + cellData.owner + '-construction';
    }
}

// Nueva función para obtener el color del jugador
function getPlayerColor(playerId) {
    var playerColors = {
        1: '#e74c3c', // Rojo
        2: '#3498db', // Azul
        3: '#2ecc71', // Verde
        4: '#f1c40f', // Amarillo
        5: '#9b59b6', // Púrpura
        6: '#1abc9c'  // Turquesa
    };
    return playerColors[playerId] || '#95a5a6'; // Gris por defecto
}

// Función para actualizar todas las construcciones del tablero
function updateAllConstructions() {
    for (var i = 0; i < boardCells.length; i++) {
        var cellData = boardCells[i];
        if (cellData.type === 'property' && cellData.constructions > 0 && cellData.owner) {
            updateCellDisplay(i);
        }
    }
}

function movePlayer(playerId, steps) {
    var player = players[playerId - 1];
    var oldPosition = player.position;
    
    // Validar que steps sea un número válido
    if (isNaN(steps) || steps < 0) {
        addLogEntry('❌ Error: movimiento inválido (' + steps + ')');
        return;
    }
    
    // Desplazar al jugador el número de casillas indicado (sentido horario)
    var newPosition = (oldPosition + steps) % boardCells.length;
    player.position = newPosition;

    // Verificar si pasó por el inicio (posición 0 = DESPERTAR DEL SISTEMA)
    if (oldPosition + steps >= boardCells.length) {
        player.money += 500;
        addLogEntry('💰 ' + player.name + ' pasó por DESPERTAR DEL SISTEMA y ganó €500');
        
        // Intentar pagar deudas automáticamente
        pagarDeudas(playerId);
    }

    updatePlayerDisplay();
    updatePlayerPieces();
    highlightCurrentPosition();

    setTimeout(function() {
        handleLanding(playerId, player.position);
    }, 500);
}

function handleLanding(playerId, position) {
    var player = players[playerId - 1];
    var cellData = boardCells[position];
    
    addLogEntry('📍 ' + player.name + ' llegó a: ' + cellData.name);

    if (cellData.type === 'card') {
        mostrarPopupCarta(cellData.name, playerId);
    } else if (cellData.type === 'property') {
        handlePropertyLanding(player, cellData, position);
    } else if (cellData.type === 'digital-station') {
        handleDigitalStation(player, cellData, position);
    } else if (cellData.type === 'tax') {
        handleTax(player, cellData);
    } else if (cellData.type === 'special-action') {
        handleSpecialAction(player, cellData);
    } else if (cellData.type === 'corner') {
        handleCorner(player, cellData);
    }
}

function handlePropertyLanding(player, cellData, position) {
    if (!cellData.owner) {
        addLogEntry('🏠 ' + cellData.name + ' está disponible por €' + cellData.price);
        if (cellData.zone && zoneData[cellData.zone]) {
            addLogEntry('💡 Zona ' + cellData.zone + ': Mentoría cuesta €' + zoneData[cellData.zone].mentorCost);
        }
        // Mostrar popup de opciones en lugar de subasta automática
        mostrarOpcionesCasilla(player, cellData, position);
    } else if (cellData.owner !== player.id) {
        var owner = players[cellData.owner - 1];
        var rent = calculateRentAdvanced(cellData, position);
        
        // Mostrar popup de renta en lugar de pago automático
        mostrarPopupRenta(player, owner, cellData, rent);
        return; // Salir aquí para evitar updatePlayerDisplay duplicado
    } else {
        addLogEntry('🏠 ' + player.name + ' está en su propia propiedad');
        if (cellData.zone && cellData.constructions < 4) {
            var zone = zoneData[cellData.zone];
            addLogEntry('💡 Puedes construir mentoría por €' + zone.mentorCost);
            // Mostrar opciones para propiedades propias
            mostrarOpcionesCasilla(player, cellData, position);
        }
    }
    updatePlayerDisplay();
}

function handleTax(player, cellData) {
    mostrarPopupImpuesto(player, cellData);
}

function handleSpecialAction(player, cellData) {
    if (cellData.effect === 'lose_turn') {
        addLogEntry('😴 ' + player.name + ' come en el coche y pierde el turno');
        nextPlayer();
    } else if (cellData.effect === 'wifi_premium') {
        mostrarPopupWifiPremium(player);
    } else if (cellData.effect === 'instagram_verificado') {
        mostrarPopupInstagramVerificado(player);
    }
}

function handleCorner(player, cellData) {
    switch(cellData.name) {
        case "DESPERTAR DEL SISTEMA":
            addLogEntry('🏠 ' + player.name + ' está en DESPERTAR DEL SISTEMA');
            break;
        case "OSCURIDAD MENTAL":
            if (!player.inJail) {
                player.inJail = true;
                player.jailTurns = 0;
                addLogEntry('🌑 ' + player.name + ' entró en OSCURIDAD MENTAL');
            } else {
                // Si ya está en la cárcel, mostrar opciones
                mostrarOpcionesCarcel(player);
            }
            break;
        case "COWORKING GRATUITO":
            addLogEntry('☕ ' + player.name + ' descansa en COWORKING GRATUITO');
            break;
        case "IR AL SISTEMA":
            player.inJail = true;
            player.jailTurns = 0;
            player.position = 10; // Posición de OSCURIDAD MENTAL
            addLogEntry('🌑 ' + player.name + ' fue enviado a OSCURIDAD MENTAL');
            updatePlayerPieces();
            break;
        default:
            addLogEntry('📍 ' + player.name + ' está en ' + cellData.name);
    }
}

function mostrarPopupCarta(cardType, playerId) {
    var cards = cardType === 'MENTE ALFA' ? menteAlfaCards : realidadSistemaCards;
    var randomCard = cards[Math.floor(Math.random() * cards.length)];
    var cardDisplay = document.getElementById('popup-carta');
    var cardVisual = document.getElementById('popup-carta-visual');
    var t = document.getElementById('popup-carta-titulo');
    var txt = document.getElementById('popup-carta-texto');
    t.textContent = cardType;
    txt.textContent = randomCard;
    cardVisual.className = 'carta-visual ' + (cardType === 'MENTE ALFA' ? 'mentealfa' : 'realidad');
    cardDisplay.style.display = 'flex';
    cartaPendiente = randomCard;
    tipoCartaPendiente = cardType;
    jugadorCartaPendiente = playerId;
    // Bloquear botones de acción
    document.getElementById('roll-btn').disabled = true;
    // (Opcional: deshabilitar otros botones si lo deseas)
}

function aceptarCartaPopup() {
    if (cartaPendiente && tipoCartaPendiente && jugadorCartaPendiente) {
        addLogEntry('🃏 ' + players[jugadorCartaPendiente-1].name + ' robó carta: ' + tipoCartaPendiente);
        aplicarEfectoCarta(cartaPendiente, tipoCartaPendiente, jugadorCartaPendiente);
    }
    cerrarPopupCarta();
    cartaPendiente = null;
    tipoCartaPendiente = null;
    jugadorCartaPendiente = null;
}

function cerrarPopupCarta() {
    document.getElementById('popup-carta').style.display = 'none';
}

function aplicarEfectoCarta(cardText, cardType, playerId) {
    var player = players[playerId - 1];
    
    // Variable para saber si es guardable (pero ejecutamos efectos primero)
    var esGuardable = cardText.includes('[GUARDABLE]');
    
    // Ganar seguidores por sacar cartas
    if (cardType === 'mente-alfa') {
        giveFollowers(playerId, 25, 'Carta Mente Alfa');
        playSound('good', 'menteAlfaCard');
    } else if (cardType === 'realidad-sistema') {
        playSound('bad', 'realidadCard');
    }
    
    // Verificar si es una carta negativa y el jugador tiene protección
    var esCartaNegativa = cardType === 'realidad' || 
                         cardText.includes('paga €') || 
                         cardText.includes('pierde €') || 
                         cardText.includes('retrocede') ||
                         cardText.includes('Hacienda') ||
                         cardText.includes('cancelan') ||
                         cardText.includes('bloquea') ||
                         cardText.includes('crisis') ||
                         cardText.includes('guerra');
    
    if (esCartaNegativa && proteccionesActivas[playerId] && proteccionesActivas[playerId].cantidad > 0) {
        proteccionesActivas[playerId].cantidad--;
        addLogEntry('🛡️ ' + player.name + ' está protegido contra esta carta negativa (quedan ' + proteccionesActivas[playerId].cantidad + ' protecciones)');
        
        if (proteccionesActivas[playerId].cantidad <= 0) {
            delete proteccionesActivas[playerId];
            addLogEntry('🛡️ ' + player.name + ' ya no tiene más protecciones');
        }
        
        updatePlayerDisplay();
        return; // No aplicar el efecto negativo
    }

    // EFECTOS ESPECÍFICOS DE CARTAS MEJORADAS
    
    // === MENTE ALFA CARDS ===
    if (cardText.includes('Has invertido €997 en un curso')) {
        player.money -= 997;
        movePlayer(playerId, 3);
        player.money += 300;
        addLogEntry('🚀 ' + player.name + ' invirtió €997, avanzó 3 casillas y ganó €300');
        return;
    }
    
    if (cardText.includes('Publicaste tu transformación')) {
        player.money += 400;
        addLogEntry('📱 ' + player.name + ' ganó €400 por patrocinios');
        setTimeout(function() {
            mostrarPopupCarta('MENTE ALFA', playerId);
        }, 1000);
        return;
    }
    
    if (cardText.includes('Tu mentor te dio like')) {
        player.money += 500;
        addLogEntry('👨‍🏫 ' + player.name + ' ganó €500 por credibilidad');
    }
    
    if (cardText.includes('Dices \'soy el mejor\'')) {
        player.money += 200;
        addLogEntry('🪞 ' + player.name + ' ganó €200 por autoestima y repite turno');
        setTimeout(function() {
            turnPhase = 'roll';
            document.getElementById('roll-btn').disabled = false;
        }, 1000);
        return;
    }
    
    if (cardText.includes('Rutina matutina perfecta')) {
        player.money += 350;
        movePlayer(playerId, 2);
        addLogEntry('💪 ' + player.name + ' ganó €350 y avanzó 2 casillas por disciplina');
        return;
    }
    
    if (cardText.includes('Manifiestas abundancia')) {
        var totalCobrado = 0;
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadCobrar = Math.min(100, players[i].money);
                if (cantidadCobrar > 0) {
                    players[i].money -= cantidadCobrar;
                    player.money += cantidadCobrar;
                    totalCobrado += cantidadCobrar;
                }
            }
        }
        addLogEntry('🎯 ' + player.name + ' cobró €' + totalCobrado + ' de otros jugadores por su energía');
    }
    
    if (cardText.includes('Video viral: Avanza hasta la propiedad más cara')) {
        var propiedadMasCara = null;
        var precioMasCaro = 0;
        for (var i = 0; i < boardCells.length; i++) {
            if (boardCells[i].type === 'property' && !boardCells[i].owner && boardCells[i].price > precioMasCaro) {
                propiedadMasCara = i;
                precioMasCaro = boardCells[i].price;
            }
        }
        if (propiedadMasCara !== null) {
            player.position = propiedadMasCara;
            updatePlayerPieces();
            var precioDescuento = Math.floor(precioMasCaro * 0.5);
            if (player.money >= precioDescuento) {
                player.money -= precioDescuento;
                boardCells[propiedadMasCara].owner = playerId;
                player.properties.push(propiedadMasCara);
                addLogEntry('🎥 ' + player.name + ' compró ' + boardCells[propiedadMasCara].name + ' con 50% descuento por €' + precioDescuento);
                updateCellDisplay(propiedadMasCara);
            }
        }
        return;
    }
    
    if (cardText.includes('Ofreces mentoring de mindset')) {
        var totalCobrado = 0;
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadCobrar = Math.min(500, players[i].money);
                if (cantidadCobrar > 0) {
                    players[i].money -= cantidadCobrar;
                    player.money += cantidadCobrar;
                    totalCobrado += cantidadCobrar;
                }
            }
        }
        addLogEntry('🧑‍🏫 ' + player.name + ' cobró €' + totalCobrado + ' de otros jugadores por mentoring');
    }
    
    if (cardText.includes('Reels virales: Tira 3 dados')) {
        var dice1 = Math.floor(Math.random() * 6) + 1;
        var dice2 = Math.floor(Math.random() * 6) + 1;
        var dice3 = Math.floor(Math.random() * 6) + 1;
        var total = dice1 + dice2 + dice3;
        movePlayer(playerId, total);
        addLogEntry('📱 ' + player.name + ' tiró 3 dados (' + dice1 + '+' + dice2 + '+' + dice3 + '=' + total + ') por reels virales');
        return;
    }
    
    // === REALIDAD DEL SISTEMA CARDS ===
    if (cardText.includes('Hacienda te persigue')) {
        player.money = Math.max(0, player.money - 800);
        player.position = Math.max(0, player.position - 3);
        updatePlayerPieces();
        addLogEntry('🏛️ ' + player.name + ' pagó €800 y retrocedió 3 casillas por Hacienda');
    }
    
    if (cardText.includes('Tu madre te dice que consigas trabajo')) {
        player.money = Math.max(0, player.money - 300);
        addLogEntry('👩 ' + player.name + ' perdió €300 y el turno por crisis existencial');
        nextPlayer();
        return;
    }
    
    if (cardText.includes('Te cancelan por comentario antiguo')) {
        player.position = Math.max(0, player.position - 5);
        updatePlayerPieces();
        if (player.properties.length > 0) {
            procesarPerderPropiedad(playerId);
        }
        addLogEntry('🚫 ' + player.name + ' retrocedió 5 casillas y pierde 1 propiedad por cancelación');
        return;
    }
    
    if (cardText.includes('Guerra en el coworking')) {
        var totalPago = 400 * (players.length - 1);
        player.money = Math.max(0, player.money - totalPago);
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                players[i].money += 400;
            }
        }
        addLogEntry('😤 ' + player.name + ' pagó €400 a cada jugador por mal ambiente');
    }
    
    if (cardText.includes('Stripe te bloquea la cuenta')) {
        player.money = Math.max(0, player.money - 1500);
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                players[i].money += 200;
            }
        }
        addLogEntry('💳 ' + player.name + ' perdió €1500 y dio €200 a cada jugador');
    }
    
    if (cardText.includes('Tu lifestyle es fake')) {
        var totalRobado = 0;
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadRobar = Math.min(150, player.money);
                if (cantidadRobar > 0) {
                    player.money -= cantidadRobar;
                    players[i].money += cantidadRobar;
                    totalRobado += cantidadRobar;
                }
            }
        }
        addLogEntry('😒 ' + player.name + ' perdió €' + totalRobado + ' - cada jugador le robó €150');
    }
    
    if (cardText.includes('Te plagian todo el contenido')) {
        var totalPerdido = 0;
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadCobrar = Math.min(200, player.money);
                if (cantidadCobrar > 0) {
                    player.money -= cantidadCobrar;
                    players[i].money += cantidadCobrar;
                    totalPerdido += cantidadCobrar;
                }
            }
        }
        addLogEntry('📝 ' + player.name + ' perdió €' + totalPerdido + ' - cada jugador cobró €200 por plagiar contenido');
    }
    
    if (cardText.includes('Piratean tus cursos')) {
        player.money = Math.max(0, player.money - 800);
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                players[i].money += 100;
            }
        }
        addLogEntry('📄 ' + player.name + ' perdió €800 y dio €100 a cada jugador por cursos pirateados');
    }
    
    if (cardText.includes('YouTube te desmonetiza')) {
        player.money = Math.max(0, player.money - 600);
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                players[i].money += 100;
            }
        }
        addLogEntry('📺 ' + player.name + ' perdió €600 y dio €100 a cada jugador por desmonetización');
    }
    
    if (cardText.includes('Errores ortográficos virales')) {
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadPagar = Math.min(400, player.money);
                if (cantidadPagar > 0) {
                    player.money -= cantidadPagar;
                    players[i].money += cantidadPagar;
                }
            }
        }
        addLogEntry('✏️ ' + player.name + ' pagó €400 a cada jugador por errores ortográficos');
    }
    
    if (cardText.includes('Robas ideas ajenas')) {
        procesarRobarPropiedad(playerId);
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadPagar = Math.min(500, player.money);
                if (cantidadPagar > 0) {
                    player.money -= cantidadPagar;
                    players[i].money += cantidadPagar;
                }
            }
        }
        addLogEntry('🔄 ' + player.name + ' robó 1 propiedad pero pagó €500 a cada jugador por karma');
        return;
    }
    
    // Cartas MENTE ALFA que cobran de otros jugadores
    if (cardText.includes('Evento motivacional')) {
        var totalCobrado = 0;
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadCobrar = Math.min(400, players[i].money);
                if (cantidadCobrar > 0) {
                    players[i].money -= cantidadCobrar;
                    player.money += cantidadCobrar;
                    totalCobrado += cantidadCobrar;
                }
            }
        }
        addLogEntry('🎪 ' + player.name + ' cobró €' + totalCobrado + ' de otros jugadores por evento motivacional');
    }
    
    if (cardText.includes('Conferencia magistral')) {
        var totalCobrado = 0;
        for (var i = 0; i < players.length; i++) {
            if (i !== playerId - 1 && !players[i].bankrupt) {
                var cantidadCobrar = Math.min(300, players[i].money);
                if (cantidadCobrar > 0) {
                    players[i].money -= cantidadCobrar;
                    player.money += cantidadCobrar;
                    totalCobrado += cantidadCobrar;
                }
            }
        }
        movePlayer(playerId, 3);
        addLogEntry('📢 ' + player.name + ' cobró €' + totalCobrado + ' de otros jugadores y avanzó 3 casillas');
        return;
    }
    
    if (cardText.includes('Meditación trascendental')) {
        var gananciaTotal = 100 * players.length;
        player.money += gananciaTotal;
        addLogEntry('🧘 ' + player.name + ' ganó €' + gananciaTotal + ' por meditación y repite turno');
        setTimeout(function() {
            turnPhase = 'roll';
            document.getElementById('roll-btn').disabled = false;
        }, 1000);
        return;
    }

    // EFECTOS GENERALES (para cartas que no tienen efectos específicos arriba)
    
    // Efectos de dinero
    var cobraMatch = cardText.match(/cobra €(\d+)/i);
    if (cobraMatch) {
        var amount = parseInt(cobraMatch[1]);
        player.money += amount;
        addLogEntry('💰 ' + player.name + ' ganó €' + amount);
        
        // Intentar pagar deudas automáticamente
        pagarDeudas(playerId);
    }
    
    var pagaMatch = cardText.match(/paga €(\d+)|pierde €(\d+)/i);
    if (pagaMatch) {
        var amount = parseInt(pagaMatch[1] || pagaMatch[2]);
        player.money = Math.max(0, player.money - amount);
        addLogEntry('💸 ' + player.name + ' perdió €' + amount);
    }

    // Efectos de movimiento
    var avanzaMatch = cardText.match(/avanza (\d+)/i);
    if (avanzaMatch) {
        var steps = parseInt(avanzaMatch[1]);
        movePlayer(playerId, steps);
        return;
    }
    
    var retrocedeMatch = cardText.match(/retrocede (\d+)/i);
    if (retrocedeMatch) {
        var steps = parseInt(retrocedeMatch[1]);
        player.position = Math.max(0, player.position - steps);
        updatePlayerPieces();
        addLogEntry('↩️ ' + player.name + ' retrocedió ' + steps + ' casillas');
    }

    // Efectos de turno
    if (cardText.includes('repite turno') || cardText.includes('Repite turno')) {
        setTimeout(function() {
            turnPhase = 'roll';
            document.getElementById('roll-btn').disabled = false;
            addLogEntry('🔄 ' + player.name + ' puede tirar otra vez');
        }, 1000);
        return;
    }
    
    if (cardText.includes('pierdes turno') || cardText.includes('Pierdes turno')) {
        addLogEntry('⏸️ ' + player.name + ' pierde el siguiente turno');
        nextPlayer();
        return;
    }

    // Efectos de propiedades
    if (cardText.includes('pierde 1 propiedad') || cardText.includes('Pierde 1 propiedad')) {
        procesarPerderPropiedad(playerId);
        return;
    }
    
    if (cardText.includes('roba 1 propiedad') || cardText.includes('Roba 1 propiedad')) {
        procesarRobarPropiedad(playerId);
        return;
    }

    // Efectos de cárcel
    if (cardText.includes('Sal de la cárcel') && player.inJail) {
        player.inJail = false;
        player.jailTurns = 0;
        addLogEntry('🧠 ' + player.name + ' salió de Oscuridad Mental');
    }
    
    if (cardText.includes('ve a la cárcel')) {
        player.inJail = true;
        player.jailTurns = 0;
        player.position = 10; // Posición de OSCURIDAD MENTAL
        updatePlayerPieces();
        addLogEntry('🌑 ' + player.name + ' fue enviado a Oscuridad Mental');
    }

    // EFECTOS ESPECÍFICOS DE CARTAS GUARDABLES
    if (cardText.includes('Encuentras mentor real')) {
        player.money += 600;
        addLogEntry('📚 ' + player.name + ' ganó €600 por encontrar un mentor real');
        // Activar protección contra 2 cartas negativas
        if (!proteccionesActivas[playerId]) {
            proteccionesActivas[playerId] = {tipo: 'negativas', cantidad: 2};
        } else {
            proteccionesActivas[playerId].cantidad += 2;
        }
        addLogEntry('🛡️ ' + player.name + ' tiene protección contra 2 cartas negativas');
    }
    
    if (cardText.includes('Despierta ya')) {
        if (player.inJail) {
            player.inJail = false;
            player.jailTurns = 0;
            addLogEntry('🧠 ' + player.name + ' salió de Oscuridad Mental con claridad mental');
        }
        // Esta carta se puede guardar para usar después
    }
    
    if (cardText.includes('Libro de finanzas te salva')) {
        player.money += 400;
        addLogEntry('📚 ' + player.name + ' ganó €400 por el libro de finanzas');
        // Activar protección contra 1 carta negativa
        if (!proteccionesActivas[playerId]) {
            proteccionesActivas[playerId] = {tipo: 'negativas', cantidad: 1};
        } else {
            proteccionesActivas[playerId].cantidad += 1;
        }
        addLogEntry('🛡️ ' + player.name + ' tiene protección contra 1 carta negativa');
    }
    
    if (cardText.includes('Mentalidad ganadora')) {
        player.money += 500;
        addLogEntry('🗝️ ' + player.name + ' ganó €500 por mentalidad ganadora');
        // Esta carta también permite robar carta especial, se guardará al final
    }

    // Si es una carta guardable, guardarla después de ejecutar efectos inmediatos
    if (esGuardable) {
        guardarCarta(playerId, cardText, cardType);
        addLogEntry('🃏 ' + player.name + ' guardó una carta especial para usar después');
    }

    updatePlayerDisplay();
}

function updatePlayerDisplay() {
    var player = players[currentPlayer - 1];
    if (!player) return;
    if (!Array.isArray(player.properties)) player.properties = [];
    var cellName = boardCells[player.position] ? boardCells[player.position].name : 'Desconocida';
    
    // Actualizar estado de botones
    updateButtonStates();
    
    // Extraer el icono del nombre del jugador
    var playerIcon = '';
    var playerNameWithoutIcon = player.name;
    
    // Buscar el primer emoji en el nombre
    var spaceIndex = player.name.indexOf(' ');
    if (spaceIndex > 0) {
        playerIcon = player.name.substring(0, spaceIndex);
        playerNameWithoutIcon = player.name.substring(spaceIndex + 1);
    }
    
    // Si no se encontró un espacio, usar el primer carácter como icono
    if (!playerIcon) {
        playerIcon = player.name.charAt(0);
        playerNameWithoutIcon = player.name.substring(1).trim();
    }
    
    document.getElementById('current-player').innerHTML = 
        '<div class="current-player-header">' +
            '<span class="player-icon-display">' + playerIcon + '</span>' +
            '<span class="player-number-display player' + player.id + '">' + player.id + '</span>' +
        '</div>' +
        '<div class="player-name-display">' + playerNameWithoutIcon + '</div>' +
        '<div class="player-money-display">€' + player.money + '</div>' +
        '<div class="player-location-display">' + cellName + '</div>';
    
    var zonesOwned = {};
    for (var i = 0; i < player.properties.length; i++) {
        var index = player.properties[i];
        var cellData = boardCells[index];
        if (cellData.zone) {
            if (!zonesOwned[cellData.zone]) {
                zonesOwned[cellData.zone] = { count: 0, constructions: 0 };
            }
            zonesOwned[cellData.zone].count++;
            zonesOwned[cellData.zone].constructions += (cellData.constructions || 0);
        }
    }
    
    var zoneInfo = '';
    for (var zone in zonesOwned) {
        var data = zonesOwned[zone];
        zoneInfo += zone + ': ' + data.count + '🏠 ' + data.constructions + '🏗️ ';
    }
    
    // Información de protecciones
    var proteccionInfo = '';
    if (proteccionesActivas[player.id] && proteccionesActivas[player.id].cantidad > 0) {
        proteccionInfo = '🛡️ Protección: ' + proteccionesActivas[player.id].cantidad + ' cartas<br>';
    }
    
    // Información de cartas guardadas
    var cartasGuardadasInfo = '';
    if (cartasEspecialesGuardadas[player.id] && cartasEspecialesGuardadas[player.id].length > 0) {
        cartasGuardadasInfo = '🃏 Cartas guardadas: ' + cartasEspecialesGuardadas[player.id].length + '<br>';
    }
    
    // Información de deudas
    var deudasInfo = '';
    if (deudasPendientes[player.id] && deudasPendientes[player.id].length > 0) {
        var totalDeudas = 0;
        for (var i = 0; i < deudasPendientes[player.id].length; i++) {
            totalDeudas += deudasPendientes[player.id][i].cantidad;
        }
        deudasInfo = '💳 Deudas: €' + totalDeudas + '<br>';
    }
    
    // Información de bancarrotas
    var bancarrotasInfo = '';
    if (contadorBancarrotas[player.id] && contadorBancarrotas[player.id] > 0) {
        bancarrotasInfo = '⚠️ Bancarrotas: ' + contadorBancarrotas[player.id] + '/3<br>';
    }
    
    // Información del rango LLADOS
    var rankInfo = getRankInfo(player.id);
    var rangoInfo = rankInfo.icon + ' ' + rankInfo.name + '<br>';
    
    // Información de seguidores
    var seguidoresInfo = '📈 Seguidores: ' + player.followers + '<br>';
    
    document.getElementById('player-stats').innerHTML = 
        'Propiedades: ' + player.properties.length + '<br>' +
        'Construcciones: ' + player.constructions + '<br>' +
        (zoneInfo ? 'Zonas: ' + zoneInfo + '<br>' : '') +
        rangoInfo +
        seguidoresInfo +
        proteccionInfo +
        cartasGuardadasInfo +
        deudasInfo +
        bancarrotasInfo +
        'Estado: ' + (player.bankrupt ? '💀 Eliminado' : player.inJail ? '🌑 Oscuridad Mental' : '✅ Activo');
    
    // Actualizar todas las construcciones con colores de jugador
    updateAllConstructions();
}

function updateButtonStates() {
    if (gameState !== 'playing') return;
    
    var player = players[currentPlayer - 1];
    if (!player) return;
    if (!Array.isArray(player.properties)) player.properties = [];
    var cellData = boardCells[player.position];
    
    // Botón COMPRAR
    var buyBtn = document.getElementById('buy-btn');
    var canBuy = cellData && cellData.type === 'property' && !cellData.owner && player.money >= cellData.price && !player.bankrupt;
    buyBtn.disabled = !canBuy;
    buyBtn.style.opacity = canBuy ? '1' : '0.5';
    
    // Botón CONSTRUIR
    var buildBtn = document.getElementById('build-btn');
    var canBuild = false;
    if (cellData && cellData.type === 'property' && cellData.owner === player.id && cellData.zone) {
        var zone = zoneData[cellData.zone];
        var currentConstructions = cellData.constructions || 0;
        canBuild = currentConstructions < 4 && player.money >= zone.mentorCost && !player.bankrupt;
    }
    buildBtn.disabled = !canBuild;
    buildBtn.style.opacity = canBuild ? '1' : '0.5';
    

    
    // Botón PAGAR CÁRCEL
    var jailBtn = document.getElementById('jail-btn');
    var canPayJail = player.inJail && player.money >= 50 && !player.bankrupt;
    jailBtn.disabled = !canPayJail;
    jailBtn.style.opacity = canPayJail ? '1' : '0.5';
    
    // Botón INTERCAMBIAR
    var tradeBtn = document.getElementById('trade-btn');
    var canTrade = !player.bankrupt && (player.properties.length > 0 || player.money > 0);
    // Verificar que hay otros jugadores no bancarrota
    var otherPlayersActive = false;
    for (var i = 0; i < players.length; i++) {
        if (i !== currentPlayer - 1 && !players[i].bankrupt) {
            otherPlayersActive = true;
            break;
        }
    }
    canTrade = canTrade && otherPlayersActive;
    tradeBtn.disabled = !canTrade;
    tradeBtn.style.opacity = canTrade ? '1' : '0.5';
    
    // Botón PASAR TURNO - siempre disponible cuando no es fase de tirar dados
    var nextBtn = document.getElementById('next-btn');
    var canNext = turnPhase !== 'roll' && !debeSeguitTirando;
    nextBtn.disabled = !canNext;
    nextBtn.style.opacity = canNext ? '1' : '0.5';
    
    // Actualizar texto del botón según el contexto
    if (debeSeguitTirando) {
        nextBtn.textContent = '🎲 DEBES TIRAR';
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.5';
    } else if (turnPhase === 'roll') {
        nextBtn.textContent = '⏭️ TIRA DADOS PRIMERO';
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.5';
    } else {
        nextBtn.textContent = '⏭️ PASAR TURNO';
    }
}

function updatePlayerPieces() {
    var pieces = document.querySelectorAll('.player-piece');
    for (var i = 0; i < pieces.length; i++) {
        pieces[i].remove();
    }

    // Agrupar jugadores por posición
    var playersByPosition = {};
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (!player.bankrupt) {
            if (!playersByPosition[player.position]) {
                playersByPosition[player.position] = [];
            }
            playersByPosition[player.position].push(player);
        }
    }

    // Crear fichas con posicionamiento inteligente
    for (var position in playersByPosition) {
        var playersInPosition = playersByPosition[position];
        var cell = document.querySelector('[data-index="' + position + '"]');
        
        if (cell) {
            for (var j = 0; j < playersInPosition.length; j++) {
                var player = playersInPosition[j];
                var piece = document.createElement('div');
                piece.className = 'player-piece player' + player.id + ' pos-' + (j + 1);
                piece.textContent = player.id;
                cell.appendChild(piece);
            }
        }
    }
}

function highlightCurrentPosition() {
    var cells = document.querySelectorAll('.cell');
    for (var i = 0; i < cells.length; i++) {
        cells[i].classList.remove('current-position');
    }
    
    var currentCell = document.querySelector('[data-index="' + players[currentPlayer-1].position + '"]');
    if (currentCell) {
        currentCell.classList.add('current-position');
    }
}

function handleBankruptcy(player) {
    player.bankrupt = true;
    player.money = 0;
    
    for (var i = 0; i < player.properties.length; i++) {
        var index = player.properties[i];
        delete boardCells[index].owner;
        boardCells[index].constructions = 0;
        
        var cell = document.querySelector('[data-index="' + index + '"]');
        if (cell) {
            cell.classList.remove('property-owned');
            // Remover todas las clases de dueño
            for (var j = 1; j <= 6; j++) {
                cell.classList.remove('owner-' + j);
            }
            var indicator = cell.querySelector('.construction-indicator');
            if (indicator) indicator.remove();
        }
    }
    player.properties = [];
    
    addLogEntry('💀 ' + player.name + ' se declaró en bancarrota');
    
    var playerPiece = document.querySelector('.player' + player.id);
    if (playerPiece) playerPiece.classList.add('bankrupt');
    
    updatePlayerDisplay();
}

function allPlayersExceptOneBankrupt() {
    var activePlayers = 0;
    for (var i = 0; i < players.length; i++) {
        if (!players[i].bankrupt) activePlayers++;
    }
    return activePlayers <= 1;
}

function checkWinCondition() {
    var activePlayers = [];
    for (var i = 0; i < players.length; i++) {
        if (!players[i].bankrupt) activePlayers.push(players[i]);
    }
    
    if (activePlayers.length === 1) {
        gameState = 'ended';
        addLogEntry('🏆 ¡' + activePlayers[0].name + ' ganó el juego!');
        alert('🎉 ¡' + activePlayers[0].name + ' se convirtió en el Alpha Máximo!');
        return;
    }
    
    for (var i = 0; i < activePlayers.length; i++) {
        var player = activePlayers[i];
        var hasAndorraPiso = false;
        var hasLladosCall = false;
        
        for (var j = 0; j < player.properties.length; j++) {
            var index = player.properties[j];
            if (boardCells[index].name === 'Piso en Andorra') hasAndorraPiso = true;
            if (boardCells[index].name === 'Videollamada LLADOS') hasLladosCall = true;
        }
        
        if (hasAndorraPiso && hasLladosCall) {
            gameState = 'ended';
            addLogEntry('👑 ¡' + player.name + ' ganó con la victoria especial: Piso en Andorra + Videollamada LLADOS!');
            alert('🐒 ¡' + player.name + ' logró la victoria Alpha Suprema!');
        }
    }
}

function addLogEntry(message) {
    var log = document.getElementById('game-log');
    var entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
}

function initializeProperties() {
    for (var i = 0; i < boardCells.length; i++) {
        if (boardCells[i].type === 'property') {
            boardCells[i].owner = null;
            boardCells[i].constructions = 0;
        }
    }
}

function initBoard() {
    var board = document.getElementById('board');
    board.innerHTML = '';
    var size = 11;
    var totalCells = size * size;
    
    // Mapeo correcto de posiciones visuales a índices del array boardCells
    var positionMap = {};
    var boardCellIdx = 0;
    
    // Fila superior: izquierda a derecha (posiciones lógicas 0-10)
    for (let i = 0; i < size; i++) {
        positionMap[i] = boardCellIdx++;
    }
    
    // Lado derecho: arriba hacia abajo (posiciones lógicas 11-15)
    for (let i = 1; i < size - 1; i++) {
        if (boardCellIdx < boardCells.length) {
            positionMap[i * size + (size - 1)] = boardCellIdx++;
        }
    }
    
    // Fila inferior: derecha a izquierda (posiciones lógicas 16-30)
    for (let i = size - 1; i >= 0; i--) {
        if (boardCellIdx < boardCells.length) {
            positionMap[(size - 1) * size + i] = boardCellIdx++;
        }
    }
    
    // Lado izquierdo: abajo hacia arriba (posiciones lógicas 31-39)
    for (let i = size - 2; i > 0; i--) {
        if (boardCellIdx < boardCells.length) {
            positionMap[i * size] = boardCellIdx++;
        }
    }

    // Crear todas las celdas del grid
    for (let i = 0; i < totalCells; i++) {
        let cellDiv;
        if (positionMap.hasOwnProperty(i)) {
            cellDiv = createCell(positionMap[i]);
        } else {
            cellDiv = document.createElement('div');
            cellDiv.className = 'inner-cell';
        }
        board.appendChild(cellDiv);
    }
    
    // Actualizar construcciones con colores de jugador
    setTimeout(function() {
        updateAllConstructions();
    }, 100);
}

function createCell(index) {
    var cellData = boardCells[index];
    var cell = document.createElement('div');
    cell.className = 'cell ' + (cellData.class || '');
    if (cellData.zone) {
        cell.classList.add('zone-' + cellData.zone);
    }
    cell.setAttribute('data-index', index);
    cell.onclick = function() { handleCellClick(index); };
    
    var name = document.createElement('div');
    name.className = 'cell-name';
    name.textContent = cellData.name;
    cell.appendChild(name);
    
    if (cellData.type === 'property') {
        var price = document.createElement('div');
        price.className = 'cell-price';
        price.textContent = '€' + cellData.price;
        cell.appendChild(price);
    }
    
    return cell;
}

// FUNCIONES DE SELECCIÓN DE OBJETOS
function mostrarPopupSeleccion(titulo, subtitulo, opciones, callback) {
    var popup = document.getElementById('popup-seleccion');
    var tituloEl = document.getElementById('popup-seleccion-titulo');
    var subtituloEl = document.getElementById('popup-seleccion-subtitulo');
    var opcionesEl = document.getElementById('popup-seleccion-opciones');
    
    tituloEl.textContent = titulo;
    subtituloEl.textContent = subtitulo;
    opcionesEl.innerHTML = '';
    
    callbackSeleccion = callback;
    
    // Si solo hay una opción, seleccionarla automáticamente
    if (opciones.length === 1) {
        setTimeout(function() {
            callback(opciones[0]);
        }, 500);
        return;
    }
    
    // Crear botones para cada opción
    opciones.forEach(function(opcion) {
        var item = document.createElement('div');
        item.className = 'opcion-item';
        
        if (opcion.zona) {
            item.classList.add('zona-' + opcion.zona);
        } else if (opcion.tipo === 'carta-especial') {
            item.classList.add('carta-especial');
        }
        
        item.innerHTML = 
            '<div class="opcion-icono">' + opcion.icono + '</div>' +
            '<div class="opcion-info">' +
                '<div class="opcion-nombre">' + opcion.nombre + '</div>' +
                (opcion.precio ? '<div class="opcion-precio">€' + opcion.precio + '</div>' : '') +
                (opcion.zona ? '<div class="opcion-zona">' + opcion.zona.toUpperCase() + '</div>' : '') +
            '</div>';
        
        item.onclick = function() {
            cerrarPopupSeleccion();
            callback(opcion);
        };
        
        opcionesEl.appendChild(item);
    });
    
    popup.style.display = 'flex';
}

function cerrarPopupSeleccion() {
    document.getElementById('popup-seleccion').style.display = 'none';
    callbackSeleccion = null;
}

function obtenerOpcionesPropiedades(jugadorId) {
    var player = players[jugadorId - 1];
    var opciones = [];
    
    player.properties.forEach(function(propIndex) {
        var cellData = boardCells[propIndex];
        opciones.push({
            id: propIndex,
            nombre: cellData.name,
            precio: cellData.price,
            zona: cellData.zone,
            icono: '🏠',
            tipo: 'propiedad'
        });
    });
    
    return opciones;
}

function obtenerOpcionesCartasEspeciales(jugadorId) {
    var player = players[jugadorId - 1];
    var opciones = [];
    
    // Cartas de salir de la cárcel (si las implementamos)
    if (player.getOutCards && player.getOutCards > 0) {
        for (var i = 0; i < player.getOutCards; i++) {
            opciones.push({
                id: 'salir-carcel-' + i,
                nombre: 'Carta "Salir de la Cárcel"',
                icono: '🗝️',
                tipo: 'carta-especial'
            });
        }
    }
    
    return opciones;
}

function obtenerJugadoresValidos(excluirJugador) {
    var opciones = [];
    
    players.forEach(function(player, index) {
        if (!player.bankrupt && player.id !== excluirJugador) {
            var propiedades = obtenerOpcionesPropiedades(player.id);
            var cartas = obtenerOpcionesCartasEspeciales(player.id);
            
            if (propiedades.length > 0 || cartas.length > 0) {
                opciones.push({
                    id: player.id,
                    nombre: player.name,
                    icono: '👤',
                    tipo: 'jugador',
                    propiedades: propiedades.length,
                    cartas: cartas.length
                });
            }
        }
    });
    
    return opciones;
}

// FUNCIONES ESPECÍFICAS PARA CADA ACCIÓN
function procesarPerderPropiedad(jugadorId) {
    var opciones = obtenerOpcionesPropiedades(jugadorId);
    
    if (opciones.length === 0) {
        addLogEntry('❌ ' + players[jugadorId-1].name + ' no tiene propiedades que perder');
        return;
    }
    
    mostrarPopupSeleccion(
        'PERDER PROPIEDAD',
        'Elige la propiedad que quieres perder',
        opciones,
        function(opcionSeleccionada) {
            aplicarPerderPropiedad(jugadorId, opcionSeleccionada.id);
        }
    );
}

function procesarRobarPropiedad(jugadorId) {
    var jugadoresValidos = obtenerJugadoresValidos(jugadorId);
    
    if (jugadoresValidos.length === 0) {
        addLogEntry('❌ No hay jugadores con propiedades para robar');
        return;
    }
    
    mostrarPopupSeleccion(
        'ROBAR PROPIEDAD',
        'Elige a quién quieres robarle una propiedad',
        jugadoresValidos,
        function(jugadorSeleccionado) {
            var propiedadesVictima = obtenerOpcionesPropiedades(jugadorSeleccionado.id);
            
            mostrarPopupSeleccion(
                'ROBAR PROPIEDAD',
                'Elige la propiedad que quieres robar a ' + jugadorSeleccionado.nombre,
                propiedadesVictima,
                function(propiedadSeleccionada) {
                    aplicarRobarPropiedad(jugadorId, jugadorSeleccionado.id, propiedadSeleccionada.id);
                }
            );
        }
    );
}

function procesarPerderCartaEspecial(jugadorId) {
    var opciones = obtenerOpcionesCartasEspeciales(jugadorId);
    
    if (opciones.length === 0) {
        addLogEntry('❌ ' + players[jugadorId-1].name + ' no tiene cartas especiales que perder');
        return;
    }
    
    mostrarPopupSeleccion(
        'PERDER CARTA ESPECIAL',
        'Elige la carta especial que quieres perder',
        opciones,
        function(opcionSeleccionada) {
            aplicarPerderCartaEspecial(jugadorId, opcionSeleccionada.id);
        }
    );
}

function procesarRobarCartaEspecial(jugadorId) {
    var jugadoresValidos = obtenerJugadoresValidos(jugadorId);
    
    if (jugadoresValidos.length === 0) {
        addLogEntry('❌ No hay jugadores con cartas especiales para robar');
        return;
    }
    
    mostrarPopupSeleccion(
        'ROBAR CARTA ESPECIAL',
        'Elige a quién quieres robarle una carta especial',
        jugadoresValidos,
        function(jugadorSeleccionado) {
            var cartasVictima = obtenerOpcionesCartasEspeciales(jugadorSeleccionado.id);
            
            mostrarPopupSeleccion(
                'ROBAR CARTA ESPECIAL',
                'Elige la carta especial que quieres robar a ' + jugadorSeleccionado.nombre,
                cartasVictima,
                function(cartaSeleccionada) {
                    aplicarRobarCartaEspecial(jugadorId, jugadorSeleccionado.id, cartaSeleccionada.id);
                }
            );
        }
    );
}

// FUNCIONES DE APLICACIÓN DE EFECTOS
function aplicarPerderPropiedad(jugadorId, propiedadId) {
    var player = players[jugadorId - 1];
    var cellData = boardCells[propiedadId];
    
    // Remover la propiedad del jugador
    player.properties = player.properties.filter(function(prop) {
        return prop !== propiedadId;
    });
    
    // Limpiar la propiedad en el tablero
    delete cellData.owner;
    cellData.constructions = 0;
    
    var cell = document.querySelector('[data-index="' + propiedadId + '"]');
    if (cell) {
        cell.classList.remove('property-owned');
        // Remover todas las clases de dueño
        for (var i = 1; i <= 6; i++) {
            cell.classList.remove('owner-' + i);
        }
        var indicator = cell.querySelector('.construction-indicator');
        if (indicator) indicator.remove();
    }
    
    addLogEntry('🏠💔 ' + player.name + ' perdió ' + cellData.name);
    updatePlayerDisplay();
}

function aplicarRobarPropiedad(ladronId, victimaId, propiedadId) {
    var ladron = players[ladronId - 1];
    var victima = players[victimaId - 1];
    var cellData = boardCells[propiedadId];
    
    // Remover la propiedad de la víctima
    victima.properties = victima.properties.filter(function(prop) {
        return prop !== propiedadId;
    });
    
    // Agregar la propiedad al ladrón
    ladron.properties.push(propiedadId);
    cellData.owner = ladronId;
    
    var cell = document.querySelector('[data-index="' + propiedadId + '"]');
    if (cell) {
        // Remover clases de dueño anterior
        for (var i = 1; i <= 6; i++) {
            cell.classList.remove('owner-' + i);
        }
        cell.classList.add('property-owned');
        cell.classList.add('owner-' + ladronId);
    }
    
    addLogEntry('🏠🔄 ' + ladron.name + ' robó ' + cellData.name + ' a ' + victima.name);
    updatePlayerDisplay();
}

function aplicarPerderCartaEspecial(jugadorId, cartaId) {
    var player = players[jugadorId - 1];
    
    if (cartaId.startsWith('salir-carcel')) {
        player.getOutCards = Math.max(0, (player.getOutCards || 0) - 1);
        addLogEntry('🗝️💔 ' + player.name + ' perdió una carta "Salir de la Cárcel"');
    }
    
    updatePlayerDisplay();
}

function aplicarRobarCartaEspecial(ladronId, victimaId, cartaId) {
    var ladron = players[ladronId - 1];
    var victima = players[victimaId - 1];
    
    if (cartaId.startsWith('salir-carcel')) {
        victima.getOutCards = Math.max(0, (victima.getOutCards || 0) - 1);
        ladron.getOutCards = (ladron.getOutCards || 0) + 1;
        addLogEntry('🗝️🔄 ' + ladron.name + ' robó una carta "Salir de la Cárcel" a ' + victima.name);
    }
    
    updatePlayerDisplay();
}

// ========================================
// NUEVAS FUNCIONES DEL MONOPOLY COMPLETO
// ========================================

// 1. SISTEMA DE SUBASTAS
function iniciarSubasta(posicion) {
    if (subastaActiva) return;
    
    var cellData = boardCells[posicion];
    if (cellData.owner || cellData.type !== 'property') return;
    
    subastaActiva = true;
    propiedadEnSubasta = posicion;
    jugadoresSubasta = [];
    pujadorActual = 0;
    pujaActual = 10; // Puja mínima
    
    // Añadir todos los jugadores activos a la subasta
    for (var i = 0; i < players.length; i++) {
        if (!players[i].bankrupt) {
            jugadoresSubasta.push({
                id: players[i].id,
                name: players[i].name,
                activo: true,
                pasado: false
            });
        }
    }
    
    addLogEntry('🔨 SUBASTA iniciada para ' + cellData.name + ' (precio base: €' + cellData.price + ')');
    mostrarPopupSubasta();
}

function mostrarPopupSubasta() {
    var cellData = boardCells[propiedadEnSubasta];
    var popup = document.getElementById('popup-subasta');
    
    document.getElementById('subasta-propiedad-nombre').textContent = cellData.name;
    document.getElementById('subasta-precio-base').textContent = 'Precio base: €' + cellData.price;
    document.getElementById('puja-actual').textContent = pujaActual;
    document.getElementById('pujador-actual').textContent = pujadorActual > 0 ? players[pujadorActual - 1].name : '-';
    
    // Mostrar jugadores
    var jugadoresDiv = document.getElementById('jugadores-subasta');
    jugadoresDiv.innerHTML = '';
    
    jugadoresSubasta.forEach(function(jugador) {
        var div = document.createElement('div');
        div.className = 'jugador-subasta';
        if (jugador.activo && !jugador.pasado) div.classList.add('activo');
        if (jugador.pasado) div.classList.add('pasado');
        div.textContent = jugador.name;
        jugadoresDiv.appendChild(div);
    });
    
    popup.style.display = 'flex';
}

function realizarPuja() {
    var nuevaPujaInput = document.getElementById('nueva-puja');
    var nuevaPuja = parseInt(nuevaPujaInput.value);
    var jugadorActual = players[currentPlayer - 1];
    
    if (!nuevaPuja || nuevaPuja <= pujaActual) {
        alert('La puja debe ser mayor a €' + pujaActual);
        return;
    }
    
    if (nuevaPuja > jugadorActual.money) {
        alert('No tienes suficiente dinero (tienes €' + jugadorActual.money + ')');
        return;
    }
    
    pujaActual = nuevaPuja;
    pujadorActual = currentPlayer;
    nuevaPujaInput.value = '';
    
    addLogEntry('💰 ' + jugadorActual.name + ' puja €' + nuevaPuja);
    
    // Actualizar display
    document.getElementById('puja-actual').textContent = pujaActual;
    document.getElementById('pujador-actual').textContent = jugadorActual.name;
    
    // Pasar al siguiente jugador
    siguienteJugadorSubasta();
}

function pasarSubasta() {
    var jugadorActual = players[currentPlayer - 1];
    
    // Marcar jugador como pasado
    for (var i = 0; i < jugadoresSubasta.length; i++) {
        if (jugadoresSubasta[i].id === currentPlayer) {
            jugadoresSubasta[i].pasado = true;
            jugadoresSubasta[i].activo = false;
            break;
        }
    }
    
    addLogEntry('❌ ' + jugadorActual.name + ' pasa en la subasta');
    
    // Verificar si queda solo un jugador activo
    var jugadoresActivos = jugadoresSubasta.filter(function(j) { return j.activo && !j.pasado; });
    
    if (jugadoresActivos.length <= 1) {
        finalizarSubasta();
    } else {
        siguienteJugadorSubasta();
    }
}

function siguienteJugadorSubasta() {
    var jugadoresActivos = jugadoresSubasta.filter(function(j) { return j.activo && !j.pasado; });
    
    if (jugadoresActivos.length <= 1) {
        finalizarSubasta();
        return;
    }
    
    // Encontrar siguiente jugador activo
    var currentIndex = -1;
    for (var i = 0; i < jugadoresSubasta.length; i++) {
        if (jugadoresSubasta[i].id === currentPlayer) {
            currentIndex = i;
            break;
        }
    }
    
    var nextIndex = (currentIndex + 1) % jugadoresSubasta.length;
    while (jugadoresSubasta[nextIndex].pasado || !jugadoresSubasta[nextIndex].activo) {
        nextIndex = (nextIndex + 1) % jugadoresSubasta.length;
    }
    
    currentPlayer = jugadoresSubasta[nextIndex].id;
    mostrarPopupSubasta();
}

function finalizarSubasta() {
    var cellData = boardCells[propiedadEnSubasta];
    
    if (pujadorActual > 0) {
        var ganador = players[pujadorActual - 1];
        ganador.money -= pujaActual;
        ganador.properties.push(propiedadEnSubasta);
        cellData.owner = pujadorActual;
        cellData.constructions = 0;
        
        var cell = document.querySelector('[data-index="' + propiedadEnSubasta + '"]');
        if (cell) {
            cell.classList.add('property-owned');
            cell.classList.add('owner-' + pujadorActual);
        }
        
        addLogEntry('🏆 ' + ganador.name + ' ganó la subasta de ' + cellData.name + ' por €' + pujaActual);
        verificarMonopolio(cellData.zone, pujadorActual);
    } else {
        addLogEntry('🚫 Subasta de ' + cellData.name + ' terminó sin ganador');
    }
    
    // Limpiar variables de subasta
    subastaActiva = false;
    propiedadEnSubasta = null;
    jugadoresSubasta = [];
    pujadorActual = 0;
    pujaActual = 0;
    
    document.getElementById('popup-subasta').style.display = 'none';
    updatePlayerDisplay();
}

// 2. PAGO PARA SALIR DE CÁRCEL
function pagarCarcel() {
    var player = players[currentPlayer - 1];
    
    if (!player.inJail) {
        addLogEntry('❌ ' + player.name + ' no está en Oscuridad Mental');
        return;
    }
    
    if (player.money < 50) {
        addLogEntry('❌ ' + player.name + ' no tiene €50 para salir de Oscuridad Mental');
        return;
    }
    
    player.money -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    
    addLogEntry('🔓 ' + player.name + ' pagó €50 y salió de Oscuridad Mental');
    updatePlayerDisplay();
}

// 3. VERIFICAR MONOPOLIO DE ZONAS
function verificarMonopolio(zona, jugadorId) {
    if (!zona) return;
    
    var propiedadesZona = [];
    var propiedadesJugador = 0;
    
    // Contar propiedades de la zona
    for (var i = 0; i < boardCells.length; i++) {
        if (boardCells[i].zone === zona && boardCells[i].type === 'property') {
            propiedadesZona.push(i);
            if (boardCells[i].owner === jugadorId) {
                propiedadesJugador++;
            }
        }
    }
    
    // Verificar si tiene monopolio completo
    if (propiedadesJugador === propiedadesZona.length) {
        monopoliosActivos[zona] = jugadorId;
        addLogEntry('🏆 ' + players[jugadorId - 1].name + ' tiene MONOPOLIO de zona ' + zona.toUpperCase() + '!');
        addLogEntry('💰 Alquiler DOBLE en propiedades sin construcciones de esta zona');
    }
}

// 4. CALCULAR ALQUILER CON MONOPOLIO Y UTILITIES
function calculateRentAdvanced(cellData, position) {
    if (cellData.type === 'utility') {
        return calculateUtilityRent(cellData, position);
    }
    
    var baseRent = calculateRent(cellData, position);
    
    // Aplicar bono de monopolio si no tiene construcciones
    if (cellData.constructions === 0 && cellData.zone && monopoliosActivos[cellData.zone] === cellData.owner) {
        baseRent *= 2;
    }
    
    return baseRent;
}

function calculateUtilityRent(cellData, position) {
    var owner = players[cellData.owner - 1];
    var utilitiesOwned = 0;
    
    // Contar utilities del propietario
    for (var i = 0; i < boardCells.length; i++) {
        if (boardCells[i].type === 'utility' && boardCells[i].owner === cellData.owner) {
            utilitiesOwned++;
        }
    }
    
    // Alquiler basado en cantidad de utilities y último dado
    var multiplier = utilitiesOwned === 1 ? 4 : 10;
    return lastRoll * multiplier;
}

// 5. SISTEMA DE INTERCAMBIO
function iniciarIntercambio() {
    if (intercambioActivo) {
        addLogEntry('❌ Ya hay un intercambio activo');
        return;
    }
    
    var jugadoresDisponibles = [];
    for (var i = 0; i < players.length; i++) {
        if (!players[i].bankrupt && players[i].id !== currentPlayer) {
            jugadoresDisponibles.push({
                id: players[i].id,
                nombre: players[i].name,
                icono: '👤',
                tipo: 'jugador'
            });
        }
    }
    
    if (jugadoresDisponibles.length === 0) {
        addLogEntry('❌ No hay jugadores disponibles para intercambiar');
        return;
    }
    
    mostrarPopupSeleccion(
        'INICIAR INTERCAMBIO',
        'Elige con quién quieres intercambiar',
        jugadoresDisponibles,
        function(jugadorSeleccionado) {
            jugadorIntercambio1 = currentPlayer;
            jugadorIntercambio2 = jugadorSeleccionado.id;
            intercambioActivo = true;
            mostrarPopupIntercambio();
        }
    );
}

function mostrarPopupIntercambio() {
    var popup = document.getElementById('popup-intercambio');
    var jugador1 = players[jugadorIntercambio1 - 1];
    var jugador2 = players[jugadorIntercambio2 - 1];
    
    document.getElementById('jugador1-intercambio').textContent = jugador1.name;
    document.getElementById('jugador2-intercambio').textContent = jugador2.name;
    
    popup.style.display = 'flex';
}

function cerrarIntercambio() {
    intercambioActivo = false;
    jugadorIntercambio1 = null;
    jugadorIntercambio2 = null;
    ofertaIntercambio = null;
    document.getElementById('popup-intercambio').style.display = 'none';
}

// 6. CARTAS GUARDABLES
function inicializarCartasGuardadas() {
    for (var i = 1; i <= players.length; i++) {
        cartasEspecialesGuardadas[i] = [];
    }
}

function mostrarCartasGuardadas() {
    var jugador = players[currentPlayer - 1];
    var cartas = cartasEspecialesGuardadas[currentPlayer] || [];
    
    var popup = document.getElementById('popup-cartas-guardadas');
    var lista = document.getElementById('cartas-lista');
    
    lista.innerHTML = '';
    
    if (cartas.length === 0) {
        lista.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No tienes cartas guardadas</div>';
    } else {
        cartas.forEach(function(carta) {
            var div = document.createElement('div');
            div.className = 'carta-guardada' + (carta.usada ? ' usada' : '');
            div.innerHTML = '<strong>' + carta.tipo + '</strong><br>' + carta.texto;
            
            if (!carta.usada) {
                div.onclick = function() {
                    usarCartaGuardada(carta.id);
                };
            }
            
            lista.appendChild(div);
        });
    }
    
    popup.style.display = 'flex';
}

function cerrarCartasGuardadas() {
    document.getElementById('popup-cartas-guardadas').style.display = 'none';
}

function usarCartaGuardada(cartaId) {
    var cartas = cartasEspecialesGuardadas[currentPlayer] || [];
    var carta = cartas.find(function(c) { return c.id === cartaId; });
    
    if (!carta || carta.usada) return;
    
    carta.usada = true;
    aplicarEfectoCarta(carta.texto, carta.tipo, currentPlayer);
    cerrarCartasGuardadas();
    
    addLogEntry('🃏 ' + players[currentPlayer - 1].name + ' usó carta guardada: ' + carta.tipo);
}

function guardarCarta(jugadorId, carta, tipo) {
    if (!cartasEspecialesGuardadas[jugadorId]) {
        cartasEspecialesGuardadas[jugadorId] = [];
    }
    
    cartasEspecialesGuardadas[jugadorId].push({
        texto: carta,
        tipo: tipo,
        usada: false,
        id: Date.now() + Math.random()
    });
    
    addLogEntry('🃏 ' + players[jugadorId - 1].name + ' guardó una carta especial');
}



// 8. LÍMITE DE CONSTRUCCIONES
function verificarLimiteConstrucciones(tipo) {
    if (tipo === 'casa') {
        return casasDisponibles > 0;
    } else if (tipo === 'hotel') {
        return hotelesDisponibles > 0;
    }
    return false;
}

function usarConstruccion(tipo) {
    if (tipo === 'casa' && casasDisponibles > 0) {
        casasDisponibles--;
    } else if (tipo === 'hotel' && hotelesDisponibles > 0) {
        hotelesDisponibles--;
        casasDisponibles += 4; // Devolver 4 casas al construir hotel
    }
}

function liberarConstruccion(tipo, cantidad) {
    if (tipo === 'casa') {
        casasDisponibles += cantidad;
    } else if (tipo === 'hotel') {
        hotelesDisponibles += cantidad;
    }
}

// 9. BANCARROTA AVANZADA
function handleBankruptcyAdvanced(player, acreedor) {
    player.bankrupt = true;
    
    addLogEntry('💀 ' + player.name + ' se declaró en bancarrota');
    
    if (acreedor) {
        // Transferir propiedades al acreedor
        for (var i = 0; i < player.properties.length; i++) {
            var propIndex = player.properties[i];
            var cellData = boardCells[propIndex];
            
            cellData.owner = acreedor.id;
            acreedor.properties.push(propIndex);
            
            var cell = document.querySelector('[data-index="' + propIndex + '"]');
            if (cell) {
                // Cambiar color de propietario
                for (var j = 1; j <= 6; j++) {
                    cell.classList.remove('owner-' + j);
                }
                cell.classList.add('owner-' + acreedor.id);
            }
        }
        
        // Transferir dinero restante
        acreedor.money += player.money;
        addLogEntry('💰 ' + acreedor.name + ' heredó las propiedades y €' + player.money + ' de ' + player.name);
    } else {
        // Subastar propiedades
        for (var i = 0; i < player.properties.length; i++) {
            var propIndex = player.properties[i];
            delete boardCells[propIndex].owner;
            boardCells[propIndex].constructions = 0;
            
            setTimeout(function(index) {
                iniciarSubasta(index);
            }, i * 2000, propIndex);
        }
    }
    
    player.properties = [];
    player.money = 0;
    
    var playerPiece = document.querySelector('.player' + player.id);
    if (playerPiece) playerPiece.classList.add('bankrupt');
    
    updatePlayerDisplay();
}

// 10. IMPUESTOS VARIABLES
function handleTaxAdvanced(player, cellData) {
    if (cellData.name === 'IMPUESTO MOTIVACIONAL') {
        // Opción: pagar €200 o 10% del patrimonio
        var patrimonio = calcularPatrimonio(player);
        var impuesto10 = Math.floor(patrimonio * 0.1);
        
        if (impuesto10 < 200) {
            player.money -= impuesto10;
            addLogEntry('💸 ' + player.name + ' pagó €' + impuesto10 + ' (10% del patrimonio)');
        } else {
            var opcion = confirm('¿Pagar €200 fijo o €' + impuesto10 + ' (10% del patrimonio)?');
            var amount = opcion ? 200 : impuesto10;
            player.money -= amount;
            addLogEntry('💸 ' + player.name + ' pagó €' + amount + ' de impuestos');
        }
    } else {
        var amount = cellData.amount || 200;
        player.money -= amount;
        addLogEntry('💸 ' + player.name + ' pagó €' + amount + ' de impuestos');
    }
    
    updatePlayerDisplay();
}

function calcularPatrimonio(player) {
    var total = player.money;
    
    // Sumar valor de propiedades
    for (var i = 0; i < player.properties.length; i++) {
        var cellData = boardCells[player.properties[i]];
        total += cellData.price;
        
        // Sumar valor de construcciones
        if (cellData.constructions > 0) {
            var zone = zoneData[cellData.zone];
            if (zone) {
                total += cellData.constructions * zone.mentorCost;
            }
        }
    }
    
    return total;
}

// FUNCIONES ADICIONALES PARA INTERCAMBIO
function añadirAOferta(jugador) {
    // Implementación básica del intercambio
    addLogEntry('🔄 Sistema de intercambio en desarrollo');
}

function enviarOfertaIntercambio() {
    addLogEntry('📤 Oferta de intercambio enviada');
}

function aceptarIntercambio() {
    addLogEntry('✅ Intercambio aceptado');
    cerrarIntercambio();
}

function rechazarIntercambio() {
    addLogEntry('❌ Intercambio rechazado');
    cerrarIntercambio();
}

// SISTEMA DE POPUPS DE OPCIONES DE CASILLA
function mostrarOpcionesCasilla(player, cellData, position) {
    var popup = document.getElementById('popup-opciones-casilla');
    var titulo = document.getElementById('opciones-titulo');
    var casillaNombre = document.getElementById('opciones-casilla-nombre');
    var precioInfo = document.getElementById('opciones-precio-info');
    var botonesContainer = document.getElementById('opciones-botones');
    
    // Configurar información de la casilla
    titulo.textContent = 'OPCIONES DISPONIBLES';
    casillaNombre.textContent = cellData.name;
    
    if (cellData.price) {
        precioInfo.textContent = 'Precio: €' + cellData.price;
        precioInfo.style.display = 'block';
    } else {
        precioInfo.style.display = 'none';
    }
    
    // Limpiar botones anteriores
    botonesContainer.innerHTML = '';
    
    // Generar botones según el estado de la casilla
    if (!cellData.owner) {
        // Propiedad disponible
        if (player.money >= cellData.price) {
            var btnComprar = crearBotonOpcion('🏠 COMPRAR PROPIEDAD', 'comprar', function() {
                cerrarOpcionesCasilla();
                comprarPropiedadDirecta(position);
            });
            botonesContainer.appendChild(btnComprar);
        }
        
        var btnSubasta = crearBotonOpcion('🔨 INICIAR SUBASTA', 'subasta', function() {
            cerrarOpcionesCasilla();
            iniciarSubasta(position);
        });
        botonesContainer.appendChild(btnSubasta);
        
    } else if (cellData.owner === player.id) {
        // Propiedad propia
        if (cellData.zone && cellData.constructions < 4) {
            var zone = zoneData[cellData.zone];
            if (zone && player.money >= zone.mentorCost) {
                var btnConstruir = crearBotonOpcion('🏗️ CONSTRUIR MENTORÍA (€' + zone.mentorCost + ')', 'construir', function() {
                    cerrarOpcionesCasilla();
                    construirMentoriaDirecta(position);
                });
                botonesContainer.appendChild(btnConstruir);
            }
        }
        

    }
    
    // Botón para continuar sin hacer nada
    var btnContinuar = crearBotonOpcion('⏭️ CONTINUAR', 'pasar-turno', function() {
        cerrarOpcionesCasilla();
    });
    botonesContainer.appendChild(btnContinuar);
    
    // Mostrar popup
    popup.style.display = 'flex';
    
    // Bloquear botones de acción
    document.getElementById('roll-btn').disabled = true;
}

function mostrarOpcionesCarcel(player) {
    var popup = document.getElementById('popup-opciones-casilla');
    var titulo = document.getElementById('opciones-titulo');
    var casillaNombre = document.getElementById('opciones-casilla-nombre');
    var precioInfo = document.getElementById('opciones-precio-info');
    var botonesContainer = document.getElementById('opciones-botones');
    
    // Configurar información de la cárcel
    titulo.textContent = 'OPCIONES EN OSCURIDAD MENTAL';
    casillaNombre.textContent = 'Estás en la cárcel mental';
    precioInfo.textContent = 'Costo de libertad: €50';
    precioInfo.style.display = 'block';
    
    // Limpiar botones anteriores
    botonesContainer.innerHTML = '';
    
    // Opción de pagar para salir
    if (player.money >= 50) {
        var btnPagar = crearBotonOpcion('🔓 PAGAR LIBERTAD (€50)', 'pagar-carcel', function() {
            cerrarOpcionesCasilla();
            pagarCarcelDirecta();
        });
        botonesContainer.appendChild(btnPagar);
    }
    
    // Opción de intentar salir tirando dados
    var btnTirar = crearBotonOpcion('🎲 TIRAR DADOS (Intentar dobles)', 'pasar-turno', function() {
        cerrarOpcionesCasilla();
        pasarTurnoCarcel();
    });
    botonesContainer.appendChild(btnTirar);
    
    // Mostrar popup
    popup.style.display = 'flex';
    
    // Bloquear botones de acción
    document.getElementById('roll-btn').disabled = true;
}

function crearBotonOpcion(texto, clase, callback) {
    var boton = document.createElement('button');
    boton.textContent = texto;
    boton.className = 'opcion-boton ' + clase;
    boton.onclick = callback;
    return boton;
}

function cerrarOpcionesCasilla() {
    var popup = document.getElementById('popup-opciones-casilla');
    var opcionesVisual = popup.querySelector('.opciones-visual');
    
    // Limpiar clases específicas
    opcionesVisual.classList.remove('impuesto');
    
    popup.style.display = 'none';
    document.getElementById('roll-btn').disabled = false;
}

function comprarPropiedadDirecta(position) {
    var player = players[currentPlayer - 1];
    if (!Array.isArray(player.properties)) player.properties = [];
    var cellData = boardCells[position];
    
    if (player.money >= cellData.price) {
        player.money -= cellData.price;
        cellData.owner = player.id;
        player.properties.push(position);
        
        addLogEntry('🏠 ' + player.name + ' compró ' + cellData.name + ' por €' + cellData.price);
        
        // Actualizar visualización
        updateCellDisplay(position);
        updatePlayerDisplay();
        
        // Verificar monopolio
        if (cellData.zone) {
            verificarMonopolio(cellData.zone, player.id);
        }
    } else {
        addLogEntry('❌ ' + player.name + ' no tiene suficiente dinero para comprar ' + cellData.name);
    }
}

function construirMentoriaDirecta(position) {
    var player = players[currentPlayer - 1];
    var cellData = boardCells[position];
    var zone = zoneData[cellData.zone];
    
    if (player.money >= zone.mentorCost) {
        player.money -= zone.mentorCost;
        cellData.constructions++;
        
        var constructionName = cellData.constructions === 4 ? 'Lanzamiento Final 🚀' : 'Mentoría ' + cellData.constructions;
        addLogEntry('🏗️ ' + player.name + ' construyó ' + constructionName + ' en ' + cellData.name + ' por €' + zone.mentorCost);
        
        // Actualizar visualización
        updateCellDisplay(position);
        updatePlayerDisplay();
        updateAllConstructions();
    } else {
        addLogEntry('❌ ' + player.name + ' no tiene suficiente dinero para construir');
    }
}

function pagarCarcelDirecta() {
    var player = players[currentPlayer - 1];
    
    if (player.money >= 50) {
        player.money -= 50;
        player.inJail = false;
        player.jailTurns = 0;
        
        addLogEntry('🔓 ' + player.name + ' pagó €50 y salió de Oscuridad Mental');
        updatePlayerDisplay();
        
        // Permitir tirar dados
        turnPhase = 'roll';
        document.getElementById('roll-btn').disabled = false;
    } else {
        addLogEntry('❌ ' + player.name + ' no tiene €50 para pagar la libertad');
    }
}

function pasarTurnoCarcel() {
    var player = players[currentPlayer - 1];
    
    // Intentar salir tirando dados
    var dice1 = Math.floor(Math.random() * 6) + 1;
    var dice2 = Math.floor(Math.random() * 6) + 1;
    var isDouble = dice1 === dice2;
    
    document.getElementById('dice1').textContent = dice1;
    document.getElementById('dice2').textContent = dice2;
    
    if (isDouble) {
        // Salir con dobles
        player.inJail = false;
        player.jailTurns = 0;
        doblesConsecutivos = 0;
        debeSeguitTirando = false;
        
        document.getElementById('dice-result').textContent = '¡Dobles! Sales de Oscuridad Mental';
        addLogEntry('🎲 ' + player.name + ' sacó dobles (' + dice1 + '+' + dice2 + ') y salió de Oscuridad Mental');
        
        // Mover al jugador
        movePlayer(currentPlayer, dice1 + dice2);
        
        turnPhase = 'action';
        document.getElementById('roll-btn').disabled = true;
    } else {
        player.jailTurns++;
        document.getElementById('dice-result').textContent = 'Sin dobles - Turno ' + player.jailTurns + '/3 en cárcel';
        
        if (player.jailTurns >= 3) {
            // Salir automáticamente después de 3 turnos
            player.inJail = false;
            player.jailTurns = 0;
            addLogEntry('🌅 ' + player.name + ' salió automáticamente de Oscuridad Mental después de 3 turnos');
            
            // Permitir tirar dados normalmente
            turnPhase = 'roll';
            document.getElementById('roll-btn').disabled = false;
        } else {
            addLogEntry('⏸️ ' + player.name + ' no sacó dobles y sigue en Oscuridad Mental (' + player.jailTurns + '/3)');
            nextPlayer();
        }
    }
    
    updatePlayerDisplay();
}

// SISTEMA DE POPUP PARA IMPUESTOS
function mostrarPopupImpuesto(player, cellData) {
    var popup = document.getElementById('popup-opciones-casilla');
    var opcionesVisual = popup.querySelector('.opciones-visual');
    var titulo = document.getElementById('opciones-titulo');
    var casillaNombre = document.getElementById('opciones-casilla-nombre');
    var precioInfo = document.getElementById('opciones-precio-info');
    var botonesContainer = document.getElementById('opciones-botones');
    
    // Aplicar estilo específico de impuesto
    opcionesVisual.classList.add('impuesto');
    
    // Configurar información del impuesto
    titulo.textContent = '💸 IMPUESTO A PAGAR';
    casillaNombre.textContent = cellData.name;
    
    // Calcular el impuesto a pagar
    var impuesto = 0;
    var mensaje = '';
    var tieneOpcion = false;
    
    if (cellData.name === 'IMPUESTO MOTIVACIONAL') {
        // Opción: pagar €200 o 10% del patrimonio
        var patrimonio = calcularPatrimonio(player);
        var impuesto10 = Math.floor(patrimonio * 0.1);
        
        if (impuesto10 < 200) {
            impuesto = impuesto10;
            mensaje = 'Pagas €' + impuesto + ' (10% de tu patrimonio de €' + patrimonio + ')';
        } else {
            tieneOpcion = true;
            mensaje = 'Elige: €200 fijo o €' + impuesto10 + ' (10% de tu patrimonio de €' + patrimonio + ')';
        }
    } else if (cellData.name === 'MULTA HACIENDA') {
        impuesto = cellData.amount || 100;
        mensaje = 'Debes pagar €' + impuesto + ' de multa a Hacienda';
    } else {
        impuesto = cellData.amount || 200;
        mensaje = 'Debes pagar €' + impuesto + ' de impuestos';
    }
    
    precioInfo.textContent = mensaje;
    precioInfo.style.display = 'block';
    
    // Limpiar botones anteriores
    botonesContainer.innerHTML = '';
    
    if (tieneOpcion) {
        // Caso especial: IMPUESTO MOTIVACIONAL con opción
        var patrimonio = calcularPatrimonio(player);
        var impuesto10 = Math.floor(patrimonio * 0.1);
        
        var btnFijo = crearBotonOpcion('💰 PAGAR €200 (FIJO)', 'impuesto', function() {
            cerrarOpcionesCasilla();
            pagarImpuestoDirecto(player, 200, 'Pagó €200 fijo de Impuesto Motivacional');
        });
        botonesContainer.appendChild(btnFijo);
        
        var btnPorcentaje = crearBotonOpcion('📊 PAGAR €' + impuesto10 + ' (10% PATRIMONIO)', 'impuesto', function() {
            cerrarOpcionesCasilla();
            pagarImpuestoDirecto(player, impuesto10, 'Pagó €' + impuesto10 + ' (10% del patrimonio)');
        });
        botonesContainer.appendChild(btnPorcentaje);
        
    } else {
        // Caso normal: pagar impuesto fijo
        if (player.money >= impuesto) {
            var btnPagar = crearBotonOpcion('💸 PAGAR €' + impuesto, 'impuesto', function() {
                cerrarOpcionesCasilla();
                pagarImpuestoDirecto(player, impuesto, 'Pagó €' + impuesto + ' de ' + cellData.name);
            });
            botonesContainer.appendChild(btnPagar);
        } else {
            // No tiene suficiente dinero
            var btnBancarrota = crearBotonOpcion('💀 NO PUEDO PAGAR (BANCARROTA)', 'impuesto', function() {
                cerrarOpcionesCasilla();
                addLogEntry('💔 ' + player.name + ' no puede pagar €' + impuesto + ' y se declara en bancarrota');
                handleBankruptcy(player);
            });
            botonesContainer.appendChild(btnBancarrota);
        }
    }
    
    // Mostrar popup
    popup.style.display = 'flex';
    
    // Bloquear botones de acción
    document.getElementById('roll-btn').disabled = true;
}

function pagarImpuestoDirecto(player, cantidad, mensaje) {
    if (player.money >= cantidad) {
        player.money -= cantidad;
        addLogEntry('💸 ' + player.name + ' ' + mensaje);
        updatePlayerDisplay();
    } else {
        addLogEntry('💔 ' + player.name + ' no puede pagar €' + cantidad + ' y se declara en bancarrota');
        handleBankruptcy(player);
    }
}

// SISTEMA DE POPUP PARA WIFI PREMIUM
function mostrarPopupWifiPremium(player) {
    var popup = document.getElementById('popup-opciones-casilla');
    var opcionesVisual = popup.querySelector('.opciones-visual');
    var titulo = document.getElementById('opciones-titulo');
    var casillaNombre = document.getElementById('opciones-casilla-nombre');
    var precioInfo = document.getElementById('opciones-precio-info');
    var botonesContainer = document.getElementById('opciones-botones');
    
    // Aplicar estilo específico (usaremos el estilo normal, no de impuesto)
    opcionesVisual.classList.remove('impuesto');
    
    // Configurar información del WiFi Premium
    titulo.textContent = '📶 WIFI PREMIUM DISPONIBLE';
    casillaNombre.textContent = 'WIFI PREMIUM';
    
    // Calcular cuánto cobrará
    var otrosJugadores = 0;
    for (var i = 0; i < players.length; i++) {
        if (players[i].id !== player.id && !players[i].bankrupt) {
            otrosJugadores++;
        }
    }
    
    var totalCobro = otrosJugadores * 20;
    precioInfo.textContent = 'Todos los jugadores te pagan €20 por usar tu contraseña WiFi (Total: €' + totalCobro + ')';
    precioInfo.style.display = 'block';
    
    // Limpiar botones anteriores
    botonesContainer.innerHTML = '';
    
    // Botón para cobrar el WiFi
    var btnCobrar = crearBotonOpcion('📶 COBRAR WIFI PREMIUM (€' + totalCobro + ')', 'comprar', function() {
        cerrarOpcionesCasilla();
        cobrarWifiPremium(player);
    });
    botonesContainer.appendChild(btnCobrar);
    
    // Mostrar popup
    popup.style.display = 'flex';
    
    // Bloquear botones de acción
    document.getElementById('roll-btn').disabled = true;
}

function cobrarWifiPremium(player) {
    var totalCobrado = 0;
    var jugadoresPagaron = [];
    
    // Cobrar €20 a cada jugador
    for (var i = 0; i < players.length; i++) {
        if (players[i].id !== player.id && !players[i].bankrupt) {
            var pago = Math.min(20, players[i].money); // No puede pagar más de lo que tiene
            players[i].money -= pago;
            player.money += pago;
            totalCobrado += pago;
            
            if (pago === 20) {
                jugadoresPagaron.push(players[i].name);
            } else {
                jugadoresPagaron.push(players[i].name + ' (€' + pago + ')');
            }
        }
    }
    
    if (totalCobrado > 0) {
        addLogEntry('📶 ' + player.name + ' cobró €' + totalCobrado + ' por WiFi Premium de: ' + jugadoresPagaron.join(', '));
    } else {
        addLogEntry('📶 ' + player.name + ' ofreció WiFi Premium pero nadie tenía dinero para pagar');
    }
    
    updatePlayerDisplay();
}

// SISTEMA DE POPUP PARA INSTAGRAM VERIFICADO
function mostrarPopupInstagramVerificado(player) {
    var popup = document.getElementById('popup-opciones-casilla');
    var opcionesVisual = popup.querySelector('.opciones-visual');
    var titulo = document.getElementById('opciones-titulo');
    var casillaNombre = document.getElementById('opciones-casilla-nombre');
    var precioInfo = document.getElementById('opciones-precio-info');
    var botonesContainer = document.getElementById('opciones-botones');
    
    // Aplicar estilo específico (usaremos el estilo normal, no de impuesto)
    opcionesVisual.classList.remove('impuesto');
    
    // Configurar información del Instagram Verificado
    titulo.textContent = '✅ INSTAGRAM VERIFICADO';
    casillaNombre.textContent = 'INSTAGRAM VERIFICADO';
    
    // Calcular cuánto cobrará
    var otrosJugadores = 0;
    for (var i = 0; i < players.length; i++) {
        if (players[i].id !== player.id && !players[i].bankrupt) {
            otrosJugadores++;
        }
    }
    
    var totalCobro = otrosJugadores * 30;
    precioInfo.textContent = 'Todos los jugadores te pagan €30 por colaboraciones en tu Instagram verificado (Total: €' + totalCobro + ')';
    precioInfo.style.display = 'block';
    
    // Limpiar botones anteriores
    botonesContainer.innerHTML = '';
    
    // Botón para cobrar las colaboraciones
    var btnCobrar = crearBotonOpcion('✅ COBRAR COLABORACIONES (€' + totalCobro + ')', 'comprar', function() {
        cerrarOpcionesCasilla();
        cobrarInstagramVerificado(player);
    });
    botonesContainer.appendChild(btnCobrar);
    
    // Mostrar popup
    popup.style.display = 'flex';
    
    // Bloquear botones de acción
    document.getElementById('roll-btn').disabled = true;
}

function cobrarInstagramVerificado(player) {
    var totalCobrado = 0;
    var jugadoresPagaron = [];
    
    // Cobrar €30 a cada jugador
    for (var i = 0; i < players.length; i++) {
        if (players[i].id !== player.id && !players[i].bankrupt) {
            var pago = Math.min(30, players[i].money); // No puede pagar más de lo que tiene
            players[i].money -= pago;
            player.money += pago;
            totalCobrado += pago;
            
            if (pago === 30) {
                jugadoresPagaron.push(players[i].name);
            } else {
                jugadoresPagaron.push(players[i].name + ' (€' + pago + ')');
            }
        }
    }
    
    if (totalCobrado > 0) {
        addLogEntry('✅ ' + player.name + ' cobró €' + totalCobrado + ' por colaboraciones de Instagram de: ' + jugadoresPagaron.join(', '));
    } else {
        addLogEntry('✅ ' + player.name + ' ofreció colaboraciones pero nadie tenía dinero para pagar');
    }
    
    updatePlayerDisplay();
}

// SISTEMA DE POPUP PARA PAGO DE RENTA
function mostrarPopupRenta(player, owner, cellData, rent) {
    // Guardar información de la renta pendiente
    rentaPendiente = {
        player: player,
        owner: owner,
        cellData: cellData,
        rent: rent
    };
    
    // Configurar el popup
    document.getElementById('renta-propiedad-nombre').textContent = cellData.name;
    document.getElementById('renta-propietario').textContent = 'Propietario: ' + owner.name;
    document.getElementById('renta-cantidad').textContent = rent;
    
    // Información de construcciones
    var construccionesInfo = '';
    if (cellData.constructions === 4) {
        construccionesInfo = '🚀 Lanzamiento Final';
    } else if (cellData.constructions > 0) {
        construccionesInfo = '🏗️ ' + cellData.constructions + ' mentoría' + (cellData.constructions > 1 ? 's' : '');
    } else {
        construccionesInfo = '🏠 Sin construcciones';
    }
    document.getElementById('renta-construcciones-info').textContent = construccionesInfo;
    
    // Verificar si el jugador puede pagar
    var pagarBtn = document.getElementById('pagar-renta-btn');
    if (player.money >= rent) {
        pagarBtn.disabled = false;
        pagarBtn.textContent = '💰 PAGAR RENTA';
        pagarBtn.style.opacity = '1';
    } else if (player.money > 0) {
        pagarBtn.disabled = false;
        pagarBtn.textContent = '💳 PAGAR PARCIAL + DEUDA';
        pagarBtn.style.opacity = '1';
    } else {
        pagarBtn.disabled = false;
        pagarBtn.textContent = '💳 CREAR DEUDA';
        pagarBtn.style.opacity = '1';
    }
    
    // Mostrar el popup
    document.getElementById('popup-renta').style.display = 'flex';
}

function pagarRentaDirecta() {
    if (!rentaPendiente) return;
    
    var player = rentaPendiente.player;
    var owner = rentaPendiente.owner;
    var cellData = rentaPendiente.cellData;
    var rent = rentaPendiente.rent;
    
    if (player.money >= rent) {
        // Realizar el pago completo
        player.money -= rent;
        owner.money += rent;
        
        var constructionInfo = cellData.constructions === 4 ? 
            ' (Lanzamiento Final 🚀)' : 
            cellData.constructions > 0 ? 
            ' (' + cellData.constructions + ' mentorías)' : '';
        
        addLogEntry('💸 ' + player.name + ' pagó €' + rent + ' a ' + owner.name + constructionInfo);
    } else {
        // No puede pagar completo - crear deuda y contar bancarrota
        var cantidadPagada = player.money;
        var deudaRestante = rent - cantidadPagada;
        
        // Pagar lo que puede
        if (cantidadPagada > 0) {
            player.money = 0;
            owner.money += cantidadPagada;
        }
        
        // Contar bancarrota
        if (!contadorBancarrotas[player.id]) {
            contadorBancarrotas[player.id] = 0;
        }
        contadorBancarrotas[player.id]++;
        
        var constructionInfo = cellData.constructions === 4 ? 
            ' (Lanzamiento Final 🚀)' : 
            cellData.constructions > 0 ? 
            ' (' + cellData.constructions + ' mentorías)' : '';
        
        if (cantidadPagada > 0) {
            addLogEntry('💸 ' + player.name + ' pagó €' + cantidadPagada + ' a ' + owner.name + constructionInfo);
        }
        
        // Verificar si es la tercera bancarrota
        if (contadorBancarrotas[player.id] >= 3) {
            addLogEntry('💀 ' + player.name + ' ha caído en bancarrota 3 veces y queda ELIMINADO del juego');
            eliminarJugadorPorBancarrotas(player.id);
        } else {
            // Crear deuda por el resto
            crearDeuda(player.id, owner.id, deudaRestante, 'Renta de ' + cellData.name);
            addLogEntry('💳 ' + player.name + ' debe €' + deudaRestante + ' a ' + owner.name + ' por ' + cellData.name);
            addLogEntry('⚠️ ' + player.name + ' - Bancarrota ' + contadorBancarrotas[player.id] + '/3');
        }
    }
    
    // Cerrar popup y limpiar
    document.getElementById('popup-renta').style.display = 'none';
    rentaPendiente = null;
    updatePlayerDisplay();
}

// SISTEMA DE DEUDAS
function crearDeuda(deudorId, acreedorId, cantidad, concepto) {
    if (!deudasPendientes[deudorId]) {
        deudasPendientes[deudorId] = [];
    }
    
    deudasPendientes[deudorId].push({
        acreedor: acreedorId,
        cantidad: cantidad,
        concepto: concepto
    });
    
    addLogEntry('📋 Deuda registrada: ' + players[deudorId-1].name + ' debe €' + cantidad + ' a ' + players[acreedorId-1].name);
}

function pagarDeudas(jugadorId) {
    if (!deudasPendientes[jugadorId] || deudasPendientes[jugadorId].length === 0) {
        return;
    }
    
    var player = players[jugadorId - 1];
    var deudasPagadas = [];
    var deudasRestantes = [];
    
    for (var i = 0; i < deudasPendientes[jugadorId].length; i++) {
        var deuda = deudasPendientes[jugadorId][i];
        var acreedor = players[deuda.acreedor - 1];
        
        if (player.money >= deuda.cantidad) {
            // Puede pagar esta deuda completa
            player.money -= deuda.cantidad;
            acreedor.money += deuda.cantidad;
            deudasPagadas.push(deuda);
            addLogEntry('💰 ' + player.name + ' pagó €' + deuda.cantidad + ' a ' + acreedor.name + ' (' + deuda.concepto + ')');
        } else if (player.money > 0) {
            // Pago parcial
            var pagoParcial = player.money;
            player.money = 0;
            acreedor.money += pagoParcial;
            deuda.cantidad -= pagoParcial;
            deudasRestantes.push(deuda);
            addLogEntry('💸 ' + player.name + ' pagó €' + pagoParcial + ' a ' + acreedor.name + ' (quedan €' + deuda.cantidad + ')');
        } else {
            // No puede pagar nada
            deudasRestantes.push(deuda);
        }
    }
    
    // Actualizar deudas pendientes
    if (deudasRestantes.length > 0) {
        deudasPendientes[jugadorId] = deudasRestantes;
    } else {
        delete deudasPendientes[jugadorId];
                 addLogEntry('✅ ' + player.name + ' ha pagado todas sus deudas');
     }
 }
 
 function eliminarJugadorPorBancarrotas(jugadorId) {
     var player = players[jugadorId - 1];
     
     // Marcar como eliminado (bancarrota definitiva)
     player.bankrupt = true;
     player.money = 0;
     
     // Limpiar deudas del jugador eliminado
     delete deudasPendientes[jugadorId];
     
     // Obtener jugadores activos para repartir propiedades
     var jugadoresActivos = [];
     for (var i = 0; i < players.length; i++) {
         if (!players[i].bankrupt && players[i].id !== jugadorId) {
             jugadoresActivos.push(players[i]);
         }
     }
     
     if (jugadoresActivos.length === 0) {
         addLogEntry('🏁 ¡Juego terminado! No quedan jugadores activos');
         return;
     }
     
     // Repartir propiedades equitativamente
     if (player.properties.length > 0) {
         addLogEntry('🏠 Repartiendo ' + player.properties.length + ' propiedades de ' + player.name + ' entre ' + jugadoresActivos.length + ' jugadores');
         
         for (var i = 0; i < player.properties.length; i++) {
             var propiedadIndex = player.properties[i];
             var cellData = boardCells[propiedadIndex];
             
             // Asignar propiedad al siguiente jugador activo (rotativo)
             var nuevoOwner = jugadoresActivos[i % jugadoresActivos.length];
             
             // Transferir propiedad
             cellData.owner = nuevoOwner.id;
             nuevoOwner.properties.push(propiedadIndex);
             
             // Actualizar visualización
             var cell = document.querySelector('[data-index="' + propiedadIndex + '"]');
             if (cell) {
                 // Remover clase del jugador anterior
                 cell.classList.remove('owner-' + jugadorId);
                 // Añadir clase del nuevo jugador
                 cell.classList.add('owner-' + nuevoOwner.id);
             }
             
             addLogEntry('🏠 ' + cellData.name + ' transferida a ' + nuevoOwner.name);
         }
     }
     
     // Limpiar propiedades del jugador eliminado
     player.properties = [];
     player.constructions = 0;
     
     // Remover ficha del tablero
     var playerPieces = document.querySelectorAll('.player' + jugadorId);
     for (var i = 0; i < playerPieces.length; i++) {
         playerPieces[i].remove();
     }
     
         addLogEntry('💀 ' + player.name + ' ha sido ELIMINADO del juego por 3 bancarrotas');
    
    // Verificar condición de victoria
    checkWinCondition();
}









// ===== SISTEMA DE ESTACIONES DIGITALES =====

function handleDigitalStation(player, cellData, position) {
    if (!cellData.owner) {
        // Estación disponible para comprar
        mostrarOpcionesEstacionDigital(player, cellData, position);
    } else if (cellData.owner === player.id) {
        // Es tu propia estación
        addLogEntry('📱 ' + player.name + ' está en su propia estación digital');
    } else {
        // Pagar alquiler a otro jugador
        var owner = players[cellData.owner - 1];
        var rent = calculateDigitalStationRent(cellData.owner);
        
        if (player.money >= rent) {
            mostrarPopupRentaEstacion(player, owner, cellData, rent);
        } else {
            crearDeuda(player.id, cellData.owner, rent, 'Alquiler de ' + cellData.name);
            addLogEntry('💸 ' + player.name + ' debe €' + rent + ' a ' + owner.name + ' por ' + cellData.name);
        }
    }
}

function calculateDigitalStationRent(ownerId) {
    var stationsOwned = 0;
    
    // Contar estaciones digitales del propietario
    for (var i = 0; i < boardCells.length; i++) {
        if (boardCells[i].type === 'digital-station' && boardCells[i].owner === ownerId) {
            stationsOwned++;
        }
    }
    
    // Alquiler escalado: 1=€25, 2=€50, 3=€100, 4=€200
    return digitalStationData.baseRent[stationsOwned - 1] || 25;
}

function mostrarOpcionesEstacionDigital(player, cellData, position) {
    var popup = document.getElementById('popup-opciones-casilla');
    var titulo = document.getElementById('opciones-titulo');
    var casillaNombre = document.getElementById('opciones-casilla-nombre');
    var precioInfo = document.getElementById('opciones-precio-info');
    var botonesContainer = document.getElementById('opciones-botones');
    
    // Configurar información de la estación
    titulo.textContent = '📱 ESTACIÓN DIGITAL DISPONIBLE';
    casillaNombre.textContent = cellData.name;
    precioInfo.textContent = 'Precio: €' + cellData.price + ' | Alquiler escalado según estaciones poseídas';
    precioInfo.style.display = 'block';
    
    // Limpiar botones anteriores
    botonesContainer.innerHTML = '';
    
    // Botón para comprar si tiene dinero
    if (player.money >= cellData.price) {
        var btnComprar = crearBotonOpcion('📱 COMPRAR ESTACIÓN (€' + cellData.price + ')', 'comprar', function() {
            cerrarOpcionesCasilla();
            comprarEstacionDigital(position);
        });
        botonesContainer.appendChild(btnComprar);
    }
    
    // Botón para iniciar subasta
    var btnSubasta = crearBotonOpcion('🔨 INICIAR SUBASTA', 'subasta', function() {
        cerrarOpcionesCasilla();
        iniciarSubasta(position);
    });
    botonesContainer.appendChild(btnSubasta);
    
    // Botón para continuar
    var btnContinuar = crearBotonOpcion('⏭️ CONTINUAR', 'pasar-turno', function() {
        cerrarOpcionesCasilla();
    });
    botonesContainer.appendChild(btnContinuar);
    
    // Mostrar popup
    popup.style.display = 'flex';
    document.getElementById('roll-btn').disabled = true;
}

function comprarEstacionDigital(position) {
    var player = players[currentPlayer - 1];
    if (!Array.isArray(player.properties)) player.properties = [];
    var cellData = boardCells[position];
    
    if (player.money >= cellData.price) {
        player.money -= cellData.price;
        cellData.owner = player.id;
        player.properties.push(position);
        
        // Contar estaciones digitales totales del jugador
        var stationsOwned = 0;
        for (var i = 0; i < boardCells.length; i++) {
            if (boardCells[i].type === 'digital-station' && boardCells[i].owner === player.id) {
                stationsOwned++;
            }
        }
        
        var rentInfo = digitalStationData.baseRent[stationsOwned - 1];
        
        addLogEntry('📱 ' + player.name + ' compró ' + cellData.name + ' por €' + cellData.price);
        addLogEntry('📊 Ahora tiene ' + stationsOwned + ' estación(es) digital(es) - Alquiler: €' + rentInfo);
        
        if (stationsOwned === 4) {
            addLogEntry('🏆 ' + player.name + ' tiene TODAS las estaciones digitales - ¡Monopolio digital!');
        }
        
        // Ganar seguidores por comprar estación digital
        giveFollowers(player.id, 50, 'Estación Digital');
        
        // Verificar logro de monopolista digital
        checkAchievement(player.id, 'monopolista_digital');
        
        playSound('good', 'buyProperty');
        
        updateCellDisplay(position);
        updatePlayerDisplay();
    } else {
        addLogEntry('❌ ' + player.name + ' no tiene suficiente dinero para comprar ' + cellData.name);
    }
}

function mostrarPopupRentaEstacion(player, owner, cellData, rent) {
    var popup = document.getElementById('popup-renta');
    var propietarioElement = document.getElementById('renta-propietario');
    var propiedadElement = document.getElementById('renta-propiedad');
    var cantidadElement = document.getElementById('renta-cantidad');
    var infoElement = document.getElementById('renta-info');
    
    // Contar estaciones del propietario para mostrar info
    var stationsOwned = 0;
    for (var i = 0; i < boardCells.length; i++) {
        if (boardCells[i].type === 'digital-station' && boardCells[i].owner === owner.id) {
            stationsOwned++;
        }
    }
    
    propietarioElement.textContent = owner.name;
    propiedadElement.textContent = cellData.name;
    cantidadElement.textContent = '€' + rent;
    infoElement.textContent = 'Propietario tiene ' + stationsOwned + ' estación(es) digital(es)';
    
    // Configurar botón de pago
    var btnPagar = document.getElementById('pagar-renta-btn');
    btnPagar.onclick = function() {
        pagarRentaEstacionDirecta(player.id, owner.id, rent, cellData.name);
    };
    
    popup.style.display = 'flex';
    document.getElementById('roll-btn').disabled = true;
}

function pagarRentaEstacionDirecta(playerId, ownerId, rent, stationName) {
    var player = players[playerId - 1];
    var owner = players[ownerId - 1];
    
    player.money -= rent;
    owner.money += rent;
    
    addLogEntry('💸 ' + player.name + ' pagó €' + rent + ' a ' + owner.name + ' por ' + stationName);
    
    // Cerrar popup
    document.getElementById('popup-renta').style.display = 'none';
    document.getElementById('roll-btn').disabled = false;
    
    updatePlayerDisplay();
}

// ===== SISTEMAS LLADOS AVANZADOS =====

// Inicializar todos los sistemas LLADOS
function inicializarSistemasLlados() {
    // Inicializar seguidores y logros para cada jugador
    for (var i = 0; i < players.length; i++) {
        var playerId = players[i].id;
        playerFollowers[playerId] = players[i].followers;
        playerAchievements[playerId] = [];
        proteccionesEspeciales[playerId] = {};
        
        // Inicializar progreso de logros
        achievementsSystem.playerProgress[playerId] = {
            primer_millonario: 0,
            monopolista_digital: 0,
            superviviente: 0,
            mentor_supremo: 0,
            alpha_velocidad: 0,
            influencer_viral: 0
        };
    }
    
    // Resetear logros globales
    for (var j = 0; j < achievementsSystem.achievements.length; j++) {
        achievementsSystem.achievements[j].completed = false;
        achievementsSystem.achievements[j].playerId = null;
    }
    
    addLogEntry('🎯 Sistemas LLADOS activados: Rangos, Seguidores y Logros');
    console.log('✅ Sistemas LLADOS inicializados correctamente');
}

// Sistema de Rangos
function calcularRango(playerId) {
    var player = players[playerId - 1];
    if (!player) return 0;
    if (!Array.isArray(player.properties)) player.properties = [];
    var propiedades = player.properties.length;
    
    for (var i = 0; i < rankSystem.ranks.length; i++) {
        var rank = rankSystem.ranks[i];
        if (propiedades >= rank.min && propiedades <= rank.max) {
            if (player.rank !== i) {
                var oldRank = player.rank;
                player.rank = i;
                
                if (i > oldRank) {
                    // Subió de rango
                    playSound('good', 'rankUp');
                    addLogEntry('🎉 ' + player.name + ' subió a: ' + rank.icon + ' ' + rank.name);
                    // Bonificación por subir de rango
                    giveFollowers(playerId, 50, 'Subir de rango');
                }
            }
            return i;
        }
    }
    return 0;
}

function getRankInfo(playerId) {
    var player = players[playerId - 1];
    var rankIndex = player.rank || 0;
    return rankSystem.ranks[rankIndex];
}

// Sistema de Seguidores
function giveFollowers(playerId, cantidad, razon) {
    var player = players[playerId - 1];
    player.followers += cantidad;
    playerFollowers[playerId] = player.followers;
    
    playSound('good', 'gainFollowers');
    addLogEntry('📈 ' + player.name + ' ganó ' + cantidad + ' seguidores (' + razon + ')');
    
    // Verificar logro de influencer viral
    checkAchievement(playerId, 'influencer_viral', player.followers);
    
    updatePlayerDisplay();
}

function spendFollowers(playerId, cantidad, concepto) {
    var player = players[playerId - 1];
    if (player.followers >= cantidad) {
        player.followers -= cantidad;
        playerFollowers[playerId] = player.followers;
        addLogEntry('💸 ' + player.name + ' gastó ' + cantidad + ' seguidores en: ' + concepto);
        updatePlayerDisplay();
        return true;
    }
    return false;
}

function mostrarMenuSeguidores(playerId) {
    var player = players[playerId - 1];
    var opciones = [];
    
    // Descuento en propiedades
    if (player.followers >= followersSystem.spendOptions.propertyDiscount.cost) {
        opciones.push({
            id: 'property_discount',
            nombre: 'Descuento 10% en Propiedades',
            precio: followersSystem.spendOptions.propertyDiscount.cost,
            descripcion: 'Próxima compra con 10% descuento'
        });
    }
    
    // Protección contra alquileres
    if (player.followers >= followersSystem.spendOptions.rentProtection.cost) {
        opciones.push({
            id: 'rent_protection',
            nombre: 'Protección Anti-Alquiler',
            precio: followersSystem.spendOptions.rentProtection.cost,
            descripcion: 'No pagas alquileres por 3 turnos'
        });
    }
    
    // Tirada extra
    if (player.followers >= followersSystem.spendOptions.extraRoll.cost) {
        opciones.push({
            id: 'extra_roll',
            nombre: 'Tirada Extra de Dados',
            precio: followersSystem.spendOptions.extraRoll.cost,
            descripcion: 'Tira dados una vez más este turno'
        });
    }
    
    // Saltar impuesto
    if (player.followers >= followersSystem.spendOptions.skipTax.cost) {
        opciones.push({
            id: 'skip_tax',
            nombre: 'Evadir Impuesto',
            precio: followersSystem.spendOptions.skipTax.cost,
            descripcion: 'No pagas el próximo impuesto'
        });
    }
    
    if (opciones.length === 0) {
        alert('❌ No tienes suficientes seguidores para ninguna opción');
        return;
    }
    
    // Mostrar menú de opciones
    mostrarPopupSeguidores(opciones, playerId);
}

// Sistema de Logros
function checkAchievement(playerId, achievementId, currentValue) {
    var achievement = achievementsSystem.achievements.find(a => a.id === achievementId);
    if (!achievement || achievement.completed) return;
    
    var player = players[playerId - 1];
    var shouldComplete = false;
    
    switch(achievementId) {
        case 'primer_millonario':
            shouldComplete = player.money >= 3000;
            break;
        case 'monopolista_digital':
            var digitalStations = 0;
            for (var i = 0; i < boardCells.length; i++) {
                if (boardCells[i].type === 'digital-station' && boardCells[i].owner === playerId) {
                    digitalStations++;
                }
            }
            shouldComplete = digitalStations >= 4;
            break;
        case 'superviviente':
            shouldComplete = (contadorBancarrotas[playerId] || 0) >= 3 && !player.bankrupt;
            break;
        case 'mentor_supremo':
            shouldComplete = player.totalMentorias >= 10;
            break;
        case 'alpha_velocidad':
            shouldComplete = player.properties.length >= 5 && player.turnsPlayed <= 10;
            break;
        case 'influencer_viral':
            shouldComplete = player.followers >= 500;
            break;
    }
    
    if (shouldComplete) {
        completeAchievement(playerId, achievement);
    }
}

function completeAchievement(playerId, achievement) {
    achievement.completed = true;
    achievement.playerId = playerId;
    
    var player = players[playerId - 1];
    playerAchievements[playerId].push(achievement.id);
    
    playSound('good', 'achievement');
    addLogEntry('🏆 ¡' + player.name + ' logró: ' + achievement.icon + ' ' + achievement.name + '!');
    
    // Aplicar recompensa
    switch(achievement.reward.type) {
        case 'money':
            player.money += achievement.reward.amount;
            addLogEntry('💰 Recompensa: €' + achievement.reward.amount);
            break;
        case 'followers':
            giveFollowers(playerId, achievement.reward.amount, 'Logro completado');
            break;
        case 'protection':
            proteccionesEspeciales[playerId].negativeCards = achievement.reward.turns;
            addLogEntry('🛡️ Protección contra cartas negativas por ' + achievement.reward.turns + ' turnos');
            break;
    }
    
    updatePlayerDisplay();
    
    // Mostrar popup de logro
    setTimeout(() => {
        alert('🎉 ¡LOGRO DESBLOQUEADO!\n\n' + 
              achievement.icon + ' ' + achievement.name + '\n' + 
              achievement.description + '\n\n' + 
              '¡Recompensa recibida!');
    }, 500);
}

// Sistema de Sonidos
function playSound(category, soundType) {
    if (!soundSystem.enabled) return;
    
    var sound = soundSystem.sounds[category][soundType];
    if (sound && sound.src) {
        try {
            sound.currentTime = 0; // Reiniciar sonido
            sound.play().catch(function(error) {
                console.log('Error reproduciendo sonido:', error);
            });
        } catch (error) {
            console.log('Error con el sonido:', error);
        }
    }
}

function loadSounds() {
    // Esta función se llamará cuando agregues los archivos de sonido
    // Ejemplo de cómo cargar un sonido:
    /*
    soundSystem.sounds.good.gainMoney = new Audio('sounds/gain_money.mp3');
    soundSystem.sounds.good.gainMoney.volume = 0.5;
    */
    
    console.log('🔊 Sistema de sonidos preparado. Agrega archivos en carpeta "sounds/"');
    console.log('📁 Sonidos recomendados (1-3 seg para buenos, 1-2 seg para malos, 0.5-1 seg para neutrales):');
    console.log('   BUENOS: gain_money.mp3, buy_property.mp3, achievement.mp3, rank_up.mp3');
    console.log('   MALOS: lose_money.mp3, pay_rent.mp3, bankruptcy.mp3, go_to_jail.mp3');
    console.log('   NEUTRALES: roll_dice.mp3, next_player.mp3, card_flip.mp3');
}

function toggleSound() {
    soundSystem.enabled = !soundSystem.enabled;
    addLogEntry('🔊 Sonidos: ' + (soundSystem.enabled ? 'Activados' : 'Desactivados'));
}

// Funciones del popup de seguidores
function mostrarPopupSeguidores(opciones, playerId) {
    var player = players[playerId - 1];
    var popup = document.getElementById('popup-seguidores');
    var balanceElement = document.getElementById('seguidores-balance');
    var opcionesContainer = document.getElementById('seguidores-opciones');
    
    balanceElement.textContent = 'Seguidores: ' + player.followers;
    opcionesContainer.innerHTML = '';
    
    for (var i = 0; i < opciones.length; i++) {
        var opcion = opciones[i];
        var opcionElement = document.createElement('div');
        opcionElement.className = 'seguidor-opcion';
        
        if (player.followers < opcion.precio) {
            opcionElement.classList.add('disabled');
        }
        
        opcionElement.innerHTML = 
            '<div class="seguidor-opcion-nombre">' + opcion.nombre + '</div>' +
            '<div class="seguidor-opcion-precio">💎 ' + opcion.precio + ' seguidores</div>' +
            '<div class="seguidor-opcion-descripcion">' + opcion.descripcion + '</div>';
        
        if (player.followers >= opcion.precio) {
            opcionElement.onclick = function(optionId) {
                return function() {
                    usarSeguidores(playerId, optionId);
                };
            }(opcion.id);
        }
        
        opcionesContainer.appendChild(opcionElement);
    }
    
    popup.style.display = 'flex';
}

function cerrarPopupSeguidores() {
    document.getElementById('popup-seguidores').style.display = 'none';
}

function usarSeguidores(playerId, opcionId) {
    var player = players[playerId - 1];
    var costo = 0;
    var mensaje = '';
    
    switch(opcionId) {
        case 'property_discount':
            costo = followersSystem.spendOptions.propertyDiscount.cost;
            if (spendFollowers(playerId, costo, 'Descuento en propiedades')) {
                // Aplicar descuento temporal
                player.tempPropertyDiscount = 0.1;
                mensaje = '¡Próxima compra con 10% de descuento!';
            }
            break;
            
        case 'rent_protection':
            costo = followersSystem.spendOptions.rentProtection.cost;
            if (spendFollowers(playerId, costo, 'Protección anti-alquiler')) {
                proteccionesEspeciales[playerId].rent = 3;
                mensaje = '¡Protegido contra alquileres por 3 turnos!';
            }
            break;
            
        case 'extra_roll':
            costo = followersSystem.spendOptions.extraRoll.cost;
            if (spendFollowers(playerId, costo, 'Tirada extra')) {
                player.extraRoll = true;
                mensaje = '¡Puedes tirar dados una vez más este turno!';
            }
            break;
            
        case 'skip_tax':
            costo = followersSystem.spendOptions.skipTax.cost;
            if (spendFollowers(playerId, costo, 'Evadir impuesto')) {
                player.skipNextTax = true;
                mensaje = '¡No pagarás el próximo impuesto!';
            }
            break;
    }
    
    if (mensaje) {
        addLogEntry('✨ ' + player.name + ': ' + mensaje);
        alert('✨ ' + mensaje);
    }
    
    cerrarPopupSeguidores();
}

// Funciones del popup de logros
function mostrarLogros() {
    var popup = document.getElementById('popup-logros');
    var listaElement = document.getElementById('logros-lista');
    
    listaElement.innerHTML = '';
    
    for (var i = 0; i < achievementsSystem.achievements.length; i++) {
        var logro = achievementsSystem.achievements[i];
        var logroElement = document.createElement('div');
        logroElement.className = 'logro-item';
        
        if (logro.completed) {
            logroElement.classList.add('completado');
        }
        
        var recompensaText = '';
        switch(logro.reward.type) {
            case 'money':
                recompensaText = '💰 €' + logro.reward.amount;
                break;
            case 'followers':
                recompensaText = '📈 ' + logro.reward.amount + ' seguidores';
                break;
            case 'protection':
                recompensaText = '🛡️ Protección por ' + logro.reward.turns + ' turnos';
                break;
        }
        
        var completadoPor = logro.completed ? 
            '<div class="logro-completado">✅ Completado por: ' + players[logro.playerId - 1].name + '</div>' : 
            '<div class="logro-progreso">⏳ Pendiente</div>';
        
        logroElement.innerHTML = 
            '<div class="logro-header">' +
                '<div class="logro-icon">' + logro.icon + '</div>' +
                '<div class="logro-info">' +
                    '<div class="logro-nombre">' + logro.name + '</div>' +
                    '<div class="logro-descripcion">' + logro.description + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="logro-recompensa">Recompensa: ' + recompensaText + '</div>' +
            completadoPor;
        
        listaElement.appendChild(logroElement);
    }
    
    popup.style.display = 'flex';
}

function cerrarPopupLogros() {
    document.getElementById('popup-logros').style.display = 'none';
}

// Integración con funciones existentes
function updatePlayerDisplayWithRankAndFollowers() {
    // Esta función se integrará con updatePlayerDisplay existente
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        var playerId = player.id;
        
        // Actualizar rango
        calcularRango(playerId);
        
        // Verificar logros automáticamente
        checkAchievement(playerId, 'primer_millonario');
        checkAchievement(playerId, 'monopolista_digital');
        checkAchievement(playerId, 'influencer_viral');
    }
}

// Escuchar eventos de teclado
document.addEventListener('keydown', function(event) {
    if (gameState !== 'playing') return;
    
    switch(event.code) {
        case 'Space':
            event.preventDefault();
            if (!document.getElementById('roll-btn').disabled) {
                rollDice();
            }
            break;
        case 'Enter':
            event.preventDefault();
            if (!document.getElementById('next-btn').disabled) {
                nextPlayer();
            }
            break;
        case 'KeyF':
            event.preventDefault();
            if (currentPlayer && players[currentPlayer-1]) {
                mostrarMenuSeguidores(currentPlayer);
            }
            break;
        case 'KeyS':
            event.preventDefault();
            toggleSound();
            break;
    }
});

