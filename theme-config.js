// ============================================================================
// 🎨 CONFIGURACIÓN DE TEMÁTICA DEL JUEGO (theme-config.js)
// ============================================================================
// Para crear un nuevo juego con otra temática:
// 1. Duplica este repositorio o edita este archivo.
// 2. Modifica los textos, zonas, casillas (40 en total), cartas, rangos y logros.
// 3. Cambia la imagen central en `GAME_THEME.centerImage`.
// ¡El motor del juego (monopollados.js) y el multijugador (multiplayer-firebase.js)
// funcionarán automáticamente sin necesidad de tocar su código!
// ============================================================================

window.GAME_THEME = {
    id: "monollados",
    title: "🐒 MonoLLADOS Multiplayer Online",
    subtitle: "El Juego del Éxito (o del Coche Dormitorio)",
    centerImage: "img/monollados_central.PNG",
    currencySymbol: "€",
    startingMoney: 2500,
    startingFollowers: 100,
    passGoReward: 200,
    jailFine: 50,
    terms: {
        buildingSingular: "Mentoría",
        buildingPlural: "Mentorías",
        reputationName: "Seguidores",
        jailName: "Oscuridad Mental",
        deckPositiveName: "MENTE ALFA",
        deckPositiveIcon: "🧠",
        deckNegativeName: "REALIDAD DEL SISTEMA",
        deckNegativeIcon: "⚠️"
    },
    playerAvatars: ['🏋️', '📱', '🚗', '💰', '🧠', '🎯', '💼', '🚀', '⚡', '🔥'],
    defaultNames: [
        'Alpha Macho',
        'Influencer Pro',
        'Coach Nómada',
        'Crypto Guru',
        'Mindset Master',
        'Success Hunter'
    ],
    rankSystem: {
        ranks: [
            { name: "Novato del Sistema", min: 0, max: 2, icon: "🐣", color: "#95a5a6" },
            { name: "Alpha en Construcción", min: 3, max: 5, icon: "🔨", color: "#3498db" },
            { name: "Influencer Certificado", min: 6, max: 8, icon: "📱", color: "#9b59b6" },
            { name: "Mentor Digital", min: 9, max: 12, icon: "🧠", color: "#e67e22" },
            { name: "Alpha Supremo", min: 13, max: 999, icon: "👑", color: "#f1c40f" }
        ]
    },
    followersSystem: {
        gainReasons: {
            digitalStation: 50,  // Al comprar estación digital
            menteAlfaCard: 25,   // Al sacar carta positiva
            completeVuelta: 30,  // Al completar una vuelta
            winRent: 10,         // Al cobrar alquiler
            buildMentoria: 20    // Al construir mejora
        },
        spendOptions: {
            propertyDiscount: { cost: 100, discount: 0.1 }, // 10% descuento en propiedades
            rentProtection: { cost: 150, turns: 3 },        // Protección contra alquileres por 3 turnos
            extraRoll: { cost: 200 },                       // Tirada extra de dados
            skipTax: { cost: 120 }                          // Saltar impuesto
        }
    },
    achievements: [
        {
            id: "primer_millonario",
            name: "Primer Millonario",
            description: "Primer jugador en llegar a €3000",
            icon: "💰",
            reward: { type: "money", amount: 500 },
            completed: false,
            playerId: null
        },
        {
            id: "monopolista_digital",
            name: "Monopolista Digital",
            description: "Poseer todas las estaciones digitales",
            icon: "📱",
            reward: { type: "followers", amount: 200 },
            completed: false,
            playerId: null
        },
        {
            id: "superviviente",
            name: "Superviviente",
            description: "Sobrevivir 3 bancarrotas",
            icon: "💪",
            reward: { type: "protection", turns: 5 },
            completed: false,
            playerId: null
        },
        {
            id: "mentor_supremo",
            name: "Mentor Supremo",
            description: "Construir 10 mentorías",
            icon: "🏗️",
            reward: { type: "money", amount: 1000 },
            completed: false,
            playerId: null
        },
        {
            id: "alpha_velocidad",
            name: "Alpha Velocidad",
            description: "Comprar 5 propiedades en 10 turnos",
            icon: "⚡",
            reward: { type: "followers", amount: 150 },
            completed: false,
            playerId: null
        },
        {
            id: "influencer_viral",
            name: "Influencer Viral",
            description: "Acumular 500 seguidores",
            icon: "🔥",
            reward: { type: "money", amount: 800 },
            completed: false,
            playerId: null
        }
    ],
    zoneData: {
        freelance: { mentorCost: 50, mentorRent: 50, maxRent: 200 },
        gym: { mentorCost: 75, mentorRent: 75, maxRent: 300 },
        hustler: { mentorCost: 100, mentorRent: 100, maxRent: 400 },
        cafe: { mentorCost: 125, mentorRent: 125, maxRent: 500 },
        mentoring: { mentorCost: 150, mentorRent: 150, maxRent: 600 },
        mindset: { mentorCost: 175, mentorRent: 175, maxRent: 700 },
        cancelacion: { mentorCost: 200, mentorRent: 200, maxRent: 800 },
        nomada: { mentorCost: 225, mentorRent: 225, maxRent: 900 },
        finalboss: { mentorCost: 250, mentorRent: 250, maxRent: 1000 }
    },
    digitalStationData: {
        stations: ["TIKTOK VIRAL", "WIFI PREMIUM", "YOUTUBE MONETIZADO", "INSTAGRAM VERIFICADO"],
        baseRent: [25, 50, 100, 200]
    },
    boardCells: [
        // Fila superior (0-10) - FREELANCE (marrón) + GYM (rojo)
        { name: "DESPERTAR DEL SISTEMA", type: "corner", class: "corner" },
        { name: "INFOPRODUCTO BÁSICO", type: "property", zone: "freelance", price: 100, class: "freelance", constructions: 0 },
        { name: "MENTE ALFA", type: "card", class: "special" },
        { name: "COACHING POR ZOOM", type: "property", zone: "freelance", price: 120, class: "freelance", constructions: 0 },
        { name: "IMPUESTO MOTIVACIONAL", type: "tax", amount: 200, class: "special" },
        { name: "TIKTOK VIRAL", type: "digital-station", price: 200, class: "digital-station" },
        { name: "GIMNASIO 24H", type: "property", zone: "gym", price: 140, class: "gym", constructions: 0 },
        { name: "REALIDAD DEL SISTEMA", type: "card", class: "special" },
        { name: "CONSULTORÍA ESTÉTICA", type: "property", zone: "gym", price: 140, class: "gym", constructions: 0 },
        { name: "SELFIE MOTIVACIONAL", type: "property", zone: "gym", price: 160, class: "gym", constructions: 0 },
        { name: "OSCURIDAD MENTAL", type: "jail", class: "corner" },

        // Lado derecho (11-20) - HUSTLER (naranja) + CAFE (amarillo)
        { name: "DROPSHIPPING SUPLEMENTOS", type: "property", zone: "hustler", price: 180, class: "hustler", constructions: 0 },
        { name: "WIFI PREMIUM", type: "digital-station", price: 200, class: "digital-station" },
        { name: "YOUTUBE SIN MONETIZAR", type: "property", zone: "hustler", price: 180, class: "hustler", constructions: 0 },
        { name: "CRIPTOS PUMP&DUMP", type: "property", zone: "hustler", price: 200, class: "hustler", constructions: 0 },
        { name: "COWORKING GRATUITO", type: "corner", class: "corner" },
        { name: "CAFÉ DE 5€", type: "property", zone: "cafe", price: 220, class: "cafe", constructions: 0 },
        { name: "REALIDAD DEL SISTEMA", type: "card", class: "special" },
        { name: "COMER EN EL COCHE", type: "property", zone: "cafe", price: 220, class: "cafe", constructions: 0 },
        { name: "CORTADO CON AVENA", type: "property", zone: "cafe", price: 240, class: "cafe", constructions: 0 },
        { name: "MULTA HACIENDA", type: "tax", amount: 100, class: "special" },

        // Fila inferior (21-30) - MENTORING (verde) + MINDSET (azul claro)
        { name: "CURSO DESPIERTA", type: "property", zone: "mentoring", price: 260, class: "mentoring", constructions: 0 },
        { name: "MENTE ALFA", type: "card", class: "special" },
        { name: "CURSO TIBURÓN", type: "property", zone: "mentoring", price: 260, class: "mentoring", constructions: 0 },
        { name: "MASTERCLASS EXCLUSIVA", type: "property", zone: "mentoring", price: 280, class: "mentoring", constructions: 0 },
        { name: "YOUTUBE MONETIZADO", type: "digital-station", price: 200, class: "digital-station" },
        { name: "MEDITACIÓN GURÚ", type: "property", zone: "mindset", price: 300, class: "mindset", constructions: 0 },
        { name: "CARTA MOTIVACIONAL", type: "property", zone: "mindset", price: 300, class: "mindset", constructions: 0 },
        { name: "REALIDAD DEL SISTEMA", type: "card", class: "special" },
        { name: "AYUNO INTERMITENTE", type: "property", zone: "mindset", price: 320, class: "mindset", constructions: 0 },
        { name: "IR AL SISTEMA", type: "corner", class: "corner" },

        // Lado izquierdo (31-39) - CANCELACION (violeta) + NOMADA (azul oscuro) + FINALBOSS (negro)
        { name: "POLÉMICA EN X", type: "property", zone: "cancelacion", price: 350, class: "cancelacion", constructions: 0 },
        { name: "TE FUNAN EN REDES", type: "property", zone: "cancelacion", price: 350, class: "cancelacion", constructions: 0 },
        { name: "MENTE ALFA", type: "card", class: "special" },
        { name: "AIRBNB PARA STORIES", type: "property", zone: "nomada", price: 400, class: "nomada", constructions: 0 },
        { name: "INSTAGRAM VERIFICADO", type: "digital-station", price: 200, class: "digital-station" },
        { name: "HOSTAL COMPARTIDO", type: "property", zone: "nomada", price: 400, class: "nomada", constructions: 0 },
        { name: "PISO EN ANDORRA", type: "property", zone: "finalboss", price: 500, class: "finalboss", constructions: 0 },
        { name: "REALIDAD DEL SISTEMA", type: "card", class: "special" },
        { name: "VIDEOLLAMADA LLADOS", type: "property", zone: "finalboss", price: 600, class: "finalboss", constructions: 0 }
    ],
    menteAlfaCards: [
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
    ],
    realidadSistemaCards: [
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
    ]
};
