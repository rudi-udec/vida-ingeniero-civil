// ===== Motor de reglas: "La vida de un Ingeniero Civil" (v0.2) =====
// Motor puro: reduce(state, action) -> nuevo estado. Todo el azar sale del RNG guardado en el estado,
// así el mismo motor corre en el navegador (modo local) y en el servidor (modo online).

const GAME = (() => {

// ---------- Utilidades ----------
function rngNext(s) { // mulberry32 sobre s.rng
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const spinN = s => 1 + Math.floor(rngNext(s) * 10);
const pickI = (s, n) => Math.floor(rngNext(s) * n);
const fmt = n => (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n) * 1000).toLocaleString('es-CL');

// ---------- Números del juego (calibrables) ----------
const CFG = {
  umbral: { baja: 3, media: 5, alta: 7 },
  bonoCada: 4, bonoMax: 3,
  plataInicial: 200, familiaExtra: 400,
  pagoEstudio: { trabajando: 1400, beca: 700, familia: 500, becaPerdida: 200 },
  ayudantePago: 300, ayudanteMinK: 8,
  pareja: -150, mascota: -80, hermanos: 200,
  carta: 150,
  mechon: { plata: 500, k: 1 },
  suerte: 150,
  sueldoMult: 2, nivelSueldo: [1, 1.4, 1.8], magister: 300, contacto: 100,
  ascenso: [6, 7],
  plataPorPunto: 750, bonoPrimero: 5, bonoCorona: 2, bonoLider: 3, bonoMulti: 2,
  liderPlata: 150,
  conv: { m: 300, k: 2 },
  rondasFinales: 3,
  casa: { m: -5000, v: 4, ahorro: 300 },
  pasivoSenior: 0.4,          // al llegar a Senior sigues ganando el 40% de tu sueldo por ronda
  sueldoRonda: 0.10,          // los que trabajan ganan el 10% de su pago en cada ronda
  becaMin: 6, becaCupos: 2,   // para la beca hay que sacar 6+ y hay 2 cupos por partida
  becaPierde: { mismo: 2, total: 3 },
  gobierno: 0.2,              // un cambio de gobierno sube o baja los pagos en 20%
  ev: { maxPorPartida: 4, prob: 0.2, probLenta: 0.15, probRapida: 0.3, rondasEsperadas: 24 },
};

// ---------- Profes guía por mención ----------
const PROFES_MEN = {
  geo: { alta: ['Montalva'], media: ['M. Valenzuela', 'Escribano'], baja: ['Martínez'] },
  est: { alta: ['Cendoya', 'Calderón'], media: ['Aguilar', 'Opazo'], baja: ['Silva', 'Ramírez'] },
  hid: { alta: ['Link'], media: ['Stehr', 'Schwarz'], baja: ['Guerra', 'Veloso', 'Ramos', 'Morales'] },
  tra: { alta: ['Tudela', 'Echaveguren'], media: ['Victoriano'], baja: ['Carrasco', 'Dufeu', 'Tapia'] },
  con: { alta: ['Echaveguren', 'Merino'], media: [], baja: ['Orellana', 'R. Valenzuela', 'Ávalos'] },
};
// Profes que no guían tesis de magíster (Silva, Cendoya y los part-time)
const NO_MAG = ['Silva', 'Cendoya', 'M. Valenzuela', 'González', 'R. Valenzuela', 'Ávalos', 'Martínez', 'Ramírez', 'Veloso', 'Ramos', 'Morales', 'Dufeu', 'Tapia'];
const GUIA = {
  alta: { umbral: 7, dur: 3, k: 3, contacto: 1 },
  media: { umbral: 5, dur: 2, k: 2, contacto: 0 },
  baja: { umbral: 3, dur: 1, k: 1, contacto: 0 },
};
const tierOf = (men, name) => { const t = PROFES_MEN[men] || {}; return ['alta', 'media', 'baja'].find(k => (t[k] || []).includes(name)) || 'media'; };

// ---------- Menciones y pegas ----------
const MENCIONES = {
  geo: { name: 'Geotecnia', rama: 'Terreno', color: '#b5651d' },
  est: { name: 'Estructuras', rama: 'Oficina', color: '#3d6fb6' },
  hid: { name: 'Hidráulica', rama: 'Terreno', color: '#1f9bb5' },
  tra: { name: 'Transporte', rama: 'Oficina', color: '#7a54b0' },
  con: { name: 'Construcción', rama: 'Terreno', color: '#d08a12' },
};
const PEGAS = {
  consGeo: { name: 'Consultora geotécnica', base: 1600 },
  constructora: { name: 'Constructora', base: 1500, perk: '+1 Vida Social extra en cada día de pago' },
  calculo: { name: 'Consultora de cálculo', base: 1700 },
  academia: { name: 'Academia', base: 1200, perk: '+1 Conocimiento en cada día de pago', magister: true },
  publico: { name: 'Sector público (MOP)', base: 1300, perk: '+1 Vida Social extra en cada día de pago' },
  sanitaria: { name: 'Sanitaria', base: 1500 },
  consHid: { name: 'Consultora hidráulica', base: 1600 },
  consTra: { name: 'Consultora de transporte', base: 1600 },
  ito: { name: 'ITO', base: 1400, perk: '+1 Vida Social extra en cada día de pago' },
  emprende: { name: 'Emprendimiento', base: 0, perk: 'Sueldo variable en cada día de pago' },
};
const PEGAS_POR = {
  geo: ['consGeo', 'constructora'], est: ['calculo'], hid: ['publico', 'sanitaria', 'consHid'],
  tra: ['publico', 'consTra'], con: ['constructora', 'ito', 'emprende'],
};

// ---------- Cartas ----------
// efectos: m=plata (miles), k=conocimiento, v=vida social, c=contacto, skip=pierde turno,
// spin:{min, ok, ko}, otro:{yo, otro} (elige a otro jugador), todos:{...} (a los demás), tramo:{v}
const DECKS = {
  campanil: [
    { t: 'Mechoneo en el Campanil', e: { v: 2, m: -30 } },
    { t: 'Cumpleaños en el Campanil', d: 'Todos los que están en tu mismo tramo celebran.', e: { tramo: { v: 1 } } },
    { t: 'Tocata en el Campanil', e: { v: 2 } },
    { t: 'Invitas a alguien a la tocata', d: 'Elige a otro jugador: ambos +1 Vida Social.', e: { otro: { yo: { v: 1 }, otro: { v: 1 } } } },
  ],
  casino: [
    { t: 'Almuerzo con el curso en Los Patos', e: { v: 2 } },
    { t: 'Del casino al carrete sin escalas', e: { v: 2, k: -1 } },
    { t: 'Te robaron el puesto en la fila del casino', e: { v: -1 } },
    { t: 'Pagas el almuerzo de otro jugador', d: 'Tú −$30.000 y +1 Vida Social; el otro +1 Vida Social.', e: { otro: { yo: { m: -30, v: 1 }, otro: { v: 1 } } } },
  ],
  central: [
    { t: 'Estudiaste en Central hasta que cerró', e: { k: 2, v: -1 } },
    { t: 'Ayudantía pagada en Central', d: 'Si ya eres ayudante, además te pagan.', e: { k: 1, ayud: 200 } },
    { t: 'Encontraste el libro que nadie devolvía', e: { k: 1 } },
    { t: 'Grupo de estudio en Central', d: 'Elige a otro jugador: ambos +1 Conocimiento.', e: { otro: { yo: { k: 1 }, otro: { k: 1 } } } },
  ],
  tm: [
    { t: 'No encontraste la sala en el TM', e: { skip: 1 } },
    { t: 'Encontraste el resumen de un compañero en el TM', e: { k: 1 } },
    { t: 'Hiciste una ayudantía privada', e: { k: 1, m: 100 } },
  ],
  matadero: [
    { t: 'Vendiste apuntes en el Matadero', e: { m: 120 } },
    { t: 'Se cortó la luz y se suspendió la clase', e: { v: 1 } },
    { t: 'Copiaste en un certamen con otro jugador y no los pillaron', d: 'Ambos jugadores ganan.', e: { otro: { yo: { k: 1, v: 1 }, otro: { k: 1, v: 1 } } } },
  ],
  general: [
    { t: 'Hiciste el informe con IA y al profe le encantó', e: { k: 1 } },
    { t: 'Te quedaste dormido para el certamen y pasaste con un 4,0', e: { v: 1 } },
    { t: 'Se te acabaron las pilas de la calculadora en el certamen', e: { m: -60 } },
    { t: 'Le tomaste una foto a Montalva', e: { k: -1 } },
    { t: 'Salida a terreno al río con Link', e: { k: 1, v: 1 } },
    { t: 'Merino te pide probetas para el lab', e: { k: 1 } },
    { t: 'Montalva te lleva a terreno', e: { k: 2, v: -1 } },
    { t: 'La malla de Cendoya no converge', d: 'Pierdes un turno refinando.', e: { skip: 1 } },
    { t: 'Echaveguren revisa tu informe con lupa', d: 'Gira: con 7 o más ganas +2 Conocimiento.', e: { spin: { min: 7, ok: { k: 2 }, ko: {} } } },
    { t: 'Te copiaste del informe de otro jugador', d: 'Tú +1 Conocimiento; el otro −1 Vida Social.', e: { otro: { yo: { k: 1 }, otro: { v: -1 } } } },
    { t: 'Tu hermano roomie se comió tu almuerzo', d: 'Solo si vives con tus hermanos.', e: { siHermanos: { v: -1 } } },
    { t: 'Terreno de Geomática con lluvia penquista', e: { v: -1 } },
  ],
  gastos: [
    { t: 'Reparación sorpresa del auto', e: { m: -800 } },
    { t: 'Se rompió el calefont en pleno invierno', e: { m: -500, v: -1 } },
    { t: 'Un familiar se enfermó', d: 'Ayudas con los gastos médicos.', e: { m: -1200, v: -1 } },
    { t: 'Matrimonio de un amigo: regalo y traje', e: { m: -400, v: 2 } },
    { t: 'Tratamiento en el dentista', e: { m: -600 } },
    { t: 'Se acumularon las cuentas de la casa', e: { m: -700 } },
    { t: 'Multa de tránsito', e: { m: -300 } },
    { t: 'Viaje familiar al sur', e: { m: -1000, v: 3 } },
    { t: 'Entraron a robar al depto', e: { m: -900, v: -1 } },
    { t: 'Le prestas plata a otro jugador', d: 'Tú −$300.000 y +1 Vida Social; el otro +$300.000.', e: { otro: { yo: { m: -300, v: 1 }, otro: { m: 300 } } } },
  ],
  pega: [
    { t: 'Ganaste una licitación', e: { m: 600 } },
    { t: 'La obra va atrasada: multa', e: { m: -400 } },
    { t: 'Error en un plano', e: { m: -200, v: -1 } },
    { t: 'Te invitan a hacer clases', e: { k: 1, m: 200 } },
    { t: 'Asado de la pega', e: { v: 2 } },
    { t: 'Terreno en el norte por dos semanas', e: { m: 500, v: -1 } },
    { t: 'Sismo fuerte: tu estructura se portó impecable', e: { k: 2 } },
    { t: 'Tu jefe te recomienda', e: { c: 1 } },
    { t: 'Le pasas un dato de pega a otro jugador', d: 'El otro +1 contacto; tú +1 Vida Social.', e: { otro: { yo: { v: 1 }, otro: { c: 1 } } } },
    { t: 'Congreso de ingeniería', e: { k: 1, v: 1, m: -100 } },
  ],
};

// Dilemas: casillas con dos opciones
const DILEMAS = {
  estu: [
    { q: '¿Estudiar para el certamen o ir a carretear?', a: ['Estudiar', { k: 2, v: -1 }], b: ['Carretear', { v: 2, k: -1 }] },
    { q: '¿Dormir 5 minutos más o llegar con sueño?', a: ['Dormir 5 minutos más', { spin: { min: 5, ok: { v: 1 }, ko: { k: -1 } } }, 'Gira: con 5+ llegas igual (+1 Vida Social); si no, −1 Conocimiento'], b: ['Llegar con sueño', { k: 1, v: -1 }] },
    { q: '¿Almorzar en Los Patos o traer colación?', a: ['Los Patos', { v: 1, m: -30 }], b: ['Colación', { m: 30 }] },
    { q: '¿Hacer el informe solo o con alguien?', a: ['Solo', { k: 2, v: -1 }], b: ['Con otro jugador', { otro: { yo: { k: 1, v: 1 }, otro: { k: 1, v: 1 } } }, 'Ambos +1 Conocimiento y +1 Vida Social'] },
    { q: '¿Ir a la ayudantía o al partido?', a: ['Ayudantía', { k: 1 }], b: ['Partido', { v: 2, m: -20 }] },
    { q: '¿Ramo de verano o vacaciones?', a: ['Ramo de verano', { k: 1, m: -100 }], b: ['Vacaciones', { v: 2, m: -150 }] },
    { q: '¿Pega de verano o descansar?', a: ['Pega de verano', { m: 400, v: -1 }], b: ['Descansar', { v: 1 }] },
    { q: '¿Preguntar en clase o quedarte callado?', a: ['Preguntar', { spin: { min: 5, ok: { k: 2 }, ko: { v: -1 } } }, 'Gira: con 5+ +2 Conocimiento; si no, −1 Vida Social'], b: ['Quedarte callado', {}] },
    { q: '¿Hacer la tarea con IA o a mano?', a: ['Con IA', { spin: { min: 5, ok: { k: 1, v: 1 }, ko: { k: -1 } } }, 'Gira: con 5+ al profe le encanta; si no, te pillan'], b: ['A mano', { k: 1, v: -1 }] },
    { q: '¿Pedir los apuntes a alguien o hacerlos tú?', a: ['Pedirlos', { otro: { yo: { k: 1, m: -50 }, otro: { m: 50, v: 1 } } }, 'Le pagas $50.000 a otro jugador; tú +1 Conocimiento'], b: ['Hacerlos tú', { k: 1, v: -1 }] },
    { q: '¿Ir a la fonda universitaria o estudiar en Central?', a: ['Fonda', { v: 2, m: -50 }], b: ['Central', { k: 1 }] },
    { q: '¿Hacer un carrete en tu depto o ir a uno?', a: ['Hacerlo en tu depto', { m: -80, v: 1, todos: { v: 1 } }, 'Tú −$80.000; todos +1 Vida Social'], b: ['Ir a uno', { v: 1 }] },
  ],
  pega: [
    { q: '¿Horas extra o irte a la hora?', a: ['Horas extra', { m: 400, v: -1 }], b: ['Irte a la hora', { v: 1 }] },
    { q: '¿Cambiarte de pega o quedarte?', a: ['Cambiarte', { spin: { min: 6, ok: { m: 600, c: 1 }, ko: { v: -1 } } }, 'Gira: con 6+ +$600.000 y un contacto; si no, −1 Vida Social'], b: ['Quedarte', { k: 1 }] },
    { q: '¿Diplomado online o vacaciones?', a: ['Diplomado', { k: 2, m: -300 }], b: ['Vacaciones', { v: 2, m: -200 }] },
    { q: '¿Asado de la pega o cumpleaños de un amigo?', a: ['Asado de la pega', { c: 1 }], b: ['Cumpleaños', { v: 2 }] },
    { q: '¿Firmar el plano sin revisar o revisarlo de nuevo?', a: ['Firmar así nomás', { spin: { min: 5, ok: { m: 300 }, ko: { m: -500 } } }, 'Gira: con 5+ +$300.000; si no, −$500.000'], b: ['Revisarlo', { k: 1 }] },
    { q: '¿Subcontratar a otro jugador o hacerlo tú?', a: ['Subcontratar', { otro: { yo: { m: 300 }, otro: { m: 300 } } }, 'Ambos +$300.000'], b: ['Hacerlo tú', { k: 1, v: -1 }] },
    { q: '¿Postular a una licitación grande o a una chica?', a: ['Grande', { spin: { min: 7, ok: { m: 1000 }, ko: { m: -200 } } }, 'Gira: con 7+ +$1.000.000; si no, −$200.000'], b: ['Chica', { m: 300 }] },
    { q: '¿Hacer clases en la U o descansar el fin de semana?', a: ['Hacer clases', { k: 1, m: 200, v: -1 }], b: ['Descansar', { v: 2 }] },
  ],
};

// ---------- Construcción del tablero ----------
const TIER_EFF = { alta: { spin: { min: 6, ok: { k: 2, v: 1 }, ko: { v: -1 } } }, media: { k: 1 }, baja: { k: 1, v: 1 } };
function R(name, profe, tier, text) { return { type: 'ramo', name, profe, tier, text, e: TIER_EFF[tier] }; }
function G(name, text, e) { return { type: 'ramo', name, text, e: e || { k: 1 } }; }
function F(name, profe, dif) { return { type: 'filtro', name, profe, dif }; }
function E(deck) { return { type: 'evento', deck }; }
function P() { return { type: 'pago' }; }
function D(kind) { return { type: 'decision', kind }; }
function Q(deck) { return { type: 'dilema', deck: deck || 'estu' }; }
function DU() { return { type: 'duelo' }; }
function GR(name, profe, tier) { return { type: 'grupal', name, profe, tier }; }
function PR(name, profe, m) { return { type: 'practica', name, profe, m }; }
function S(type, extra) { return Object.assign({ type }, extra || {}); }

const SEG = {
  plato: [
    D('hermanos'),
    G('Física I', 'Plano inclinado sin roce, como tu semestre'),
    E('campanil'),
    E('general'),
    G('Cálculo I', 'Derivaste hasta en sueños'),
    G('Química General I', 'El lab olía a huevo podrido', { v: 1 }),
    R('Intro a la Ing. Civil', 'Escribano y Aguilar', 'media', 'Primera clase: te muestran todo lo que viene'),
    P(),
    S('conv', { name: 'Inicio del 2.º semestre' }), // aquí parten los que convalidan
    E('casino'),
    Q(),
    R('Herramientas Computacionales', 'Guerra, Moraga y Orellana', 'media', 'Tu primera planilla con macros'),
    DU(),
    F('Álgebra II', null, 'baja'),
    P(),
  ],
  cubos: [
    G('EDO', 'Ecuaciones diferenciales hasta en la micro'),
    E('matadero'),
    Q(),
    R('Mecánica', 'Parra', 'media', 'Diagrama de cuerpo libre con Parra'),
    G('Programación', 'Tu código compiló a la primera y nadie te cree'),
    R('Ing. de la Construcción', 'Merino', 'alta', 'Merino te lleva a ver una obra'),
    D('pareja'),
    P(),
    S('atrasado', { name: 'Ramo atrasado', dif: 'baja' }),
    R('Estática', 'Calderón', 'alta', 'Calderón pide las reacciones de la viga'),
    DU(),
    F('Complemento de Cálculo', null, 'media'),
    R('Geomática', 'Orellana', 'baja', 'Nivelación topográfica con Orellana'),
    E('general'),
    E('tm'),
    P(),
  ],
  labs: [
    R('Mecánica de Sólidos', 'Cendoya', 'alta', 'Círculo de Mohr con Cendoya'),
    Q(),
    R('Mecánica de Fluidos', 'Stehr', 'media', 'Laboratorio de canal con Stehr'),
    R('Materiales de Construcción', 'Orellana', 'baja', 'Rompiste probetas con Orellana'),
    PR('Práctica Laboral', 'Silva y Ruz', 300),
    E('central'),
    P(),
    R('Análisis de Estructuras', 'Silva', 'baja', 'Silva y el método matricial'),
    F('Geotecnia', 'Montalva', 'media'),
    DU(),
    R('Hidráulica', 'Guerra', 'baja', 'Resalto hidráulico en el lab con Guerra'),
    GR('Proyecto de Ingeniería Conceptual', 'Link y Aguilar', 'alta'),
    D('mascota'),
    E('campanil'),
    P(),
    G('Innovación', 'Te quedaste dormido en Innovación', { k: -1, v: 1 }),
    E('general'),
    R('Sistemas de Transporte', 'Tudela y Victoriano', 'alta', 'Tudela pregunta el modelo de 4 etapas'),
    F('Ingeniería de Suelos', 'Escribano', 'alta'),
    R('Hormigón Armado', 'Calderón', 'alta', 'Calderón revisa tu cuantía'),
    E('matadero'),
    P(),
    R('Ingeniería Antisísmica', 'Cendoya', 'alta', 'Cendoya pide el espectro de diseño'),
    F('Infraestructura de Transporte', 'Echaveguren', 'media'),
    GR('Proyecto de Ingeniería de Detalle', 'Cendoya y Cortés', 'alta'),
    Q(),
    E('casino'),
    P(),
  ],
  mencion: {
    geo: [R('Estructuras de Retención', 'M. Valenzuela', 'media', 'Muro de contención con M. Valenzuela'), R('Mec. de Suelos en Ing. Vial', 'M. Valenzuela', 'media', 'Ensayo de suelos para un camino'), Q(), F('Ing. Geotécnica-Sísmica', 'Montalva', 'alta'), R('Modelamiento Numérico Geotécnico', 'Martínez', 'baja', 'El modelo de Martínez por fin corre'), R('Mec. de Suelos Avanzada', 'Escribano', 'media', 'Escribano pide el triaxial completo'), R('Geoingeniería en Terreno', 'Montalva y Escribano', 'alta', 'Terreno con Montalva y Escribano'), P()],
    est: [R('Hormigón Armado Avanzado', 'Aguilar', 'media', 'Aguilar revisa tu armadura'), R('Estructuras de Acero', 'Silva', 'baja', 'Conexiones de acero con Silva'), Q(), F('Elementos Finitos', 'Cendoya', 'alta'), R('Diseño Sismorresistente', 'Calderón', 'alta', 'Calderón pide la tarea en Python con la API de SAP2000'), R('Diseño de Edificios de HA', 'Opazo', 'media', 'Opazo revisa tu modelo en ETABS'), R('Ingeniería de Puentes', 'Aguilar, Montalva y Link', 'alta', 'Puente diseñado con Aguilar, Montalva y Link'), P()],
    hid: [R('Hidráulica Urbana', 'Ramos', 'baja', 'Ramos diseña un colector contigo'), R('Ingeniería Sanitaria', 'Schwarz', 'media', 'Planta de tratamiento con Schwarz'), Q(), F('Hidrología Distribuida', 'Stehr', 'alta'), R('Ingeniería de Costas', 'Guerra', 'baja', 'Terreno en la playa con Guerra'), R('Ingeniería de Ríos', 'Link', 'alta', 'Link te explica el transporte de sedimentos'), R('Obras Hidráulicas', 'Morales', 'baja', 'Bocatoma diseñada con Morales'), P()],
    tra: [R('Demanda de Transportes', 'Carrasco', 'baja', 'Carrasco te hace una encuesta origen-destino'), R('Ingeniería de Tráfico', 'Dufeu', 'baja', 'Conteo vehicular con Dufeu'), Q(), F('Seguridad Vial', 'Echaveguren', 'alta'), R('Redes de Transporte', 'Tapia', 'baja', 'Tapia te pide la ruta mínima'), R('Ciudad y Transporte', 'Carrasco', 'baja', 'Clase de Ciudad y Transporte con Carrasco'), R('Planificación y Economía de Transporte', 'Tudela', 'alta', 'Tudela evalúa tu proyecto vial'), P()],
    con: [R('Diseño de Pavimentos', 'Echaveguren', 'alta', 'Echaveguren te pide recalcular el espesor del pavimento'), R('Materiales Avanzados', 'Merino', 'alta', 'Merino trae un material innovador y sustentable a clase'), Q(), F('Gestión de Infraestructura de Transporte', 'Echaveguren', 'alta'), R('Planificación y Control de Proyectos', 'Orellana', 'baja', 'Carta Gantt entregada a tiempo con Orellana'), R('Edificación', 'R. Valenzuela', 'baja', 'Clase de Edificación con R. Valenzuela'), R('Inspección Técnica de Obras', 'Ávalos', 'baja', 'Ávalos te manda a inspeccionar una obra'), P()],
  },
  facultad: [
    F('FEP', null, 'baja'),
    GR('Proyecto de Ingeniería Civil II', 'Carrasco, Stehr, Cortés y Orellana', 'media'),
    PR('Práctica Pre Profesional', 'Carrasco', 400),
    DU(),
    G('Complementaria', 'Complementaria de cocina: aprobada con 7,0', { v: 1 }),
  ],
  memoria: [S('guia'), Q(), PR('Práctica Pre Profesional II', 'Carrasco', 400), S('defensa', { name: 'Defensa de memoria' })],
  magister: [S('guia'), S('becaMag', { name: 'Postulación a beca de magíster' }), G('Ramo de magíster', 'Leíste 40 papers en una semana', { k: 2 }), S('paper', { name: 'Paper aceptado', e: { k: 2, v: 1 } }), PR('Ayudantía de magíster', 'Silva', 300), S('congreso', { name: 'Congreso', e: { k: 1, v: 1 } }), S('defensa', { name: 'Defensa de tesis' })],
  pega: [
    S('titulo', { name: 'Ceremonia de titulación', e: { v: 2 } }),
    S('pega', { name: 'Elegir pega' }),
    S('hito', { name: 'Primer día de pega', e: { v: 1 } }),
    Q('pega'), P(), E('pega'),
    DU(), P(),
    E('gastos'),
    S('hito', { name: 'Asado de bienvenida', e: { v: 2 } }),
    S('ascenso', { name: 'Ascenso a Semi-senior', nivel: 1 }),
    P(), D('casa'), Q('pega'), E('gastos'), P(),
    S('hito', { name: 'Curso de especialización', e: { m: -200, k: 2 } }),
    S('ascenso', { name: 'Ascenso a Senior', nivel: 2 }),
    P(), E('gastos'), Q('pega'), DU(), P(),
    S('fin', { name: 'Consultora: Ing. Senior' }),
  ],
};

function buildBoard() {
  const nodes = {}; let n = 0;
  const add = (spec, zone, extra) => { const id = 'n' + (n++); nodes[id] = Object.assign({ id, zone, next: [] }, spec, extra || {}); return id; };
  const chain = (specs, zone, extra) => { const ids = specs.map(s => add(s, zone, extra)); for (let i = 0; i < ids.length - 1; i++) nodes[ids[i]].next.push(ids[i + 1]); return ids; };
  const start = add({ type: 'start', name: 'El Arco: ingreso' }, 'arco');
  const plato = chain(SEG.plato, 'plato'); nodes[start].next.push(plato[0]);
  const conv = plato.find(id => nodes[id].type === 'conv');
  const cubos = chain(SEG.cubos, 'cubos'); nodes[plato.at(-1)].next.push(cubos[0]);
  const labs = chain(SEG.labs, 'labs'); nodes[cubos.at(-1)].next.push(labs[0]);
  const fork1 = add({ type: 'forkM', name: 'Elegir mención' }, 'facultad'); nodes[labs.at(-1)].next.push(fork1);
  const fac = chain(SEG.facultad, 'facultad');
  const lanes = {};
  for (const key of Object.keys(SEG.mencion)) {
    const ids = chain(SEG.mencion[key], 'facultad', { lane: key });
    lanes[key] = ids; nodes[fork1].next.push(ids[0]); nodes[ids.at(-1)].next.push(fac[0]);
    nodes[ids[0]].branch = key;
  }
  const fork2 = add({ type: 'forkT', name: 'Memoria o magíster' }, 'facultad'); nodes[fac.at(-1)].next.push(fork2);
  const pega = chain(SEG.pega, 'consultora');
  const mem = chain(SEG.memoria, 'facultad', { lane: 'memoria' }); const mag = chain(SEG.magister, 'facultad', { lane: 'magister' });
  nodes[mem[0]].branch = 'memoria'; nodes[mag[0]].branch = 'magister';
  nodes[fork2].next.push(mem[0], mag[0]);
  nodes[mem.at(-1)].next.push(pega[0]); nodes[mag.at(-1)].next.push(pega[0]);
  for (const id of pega) { if (nodes[id].type === 'pago') nodes[id].work = true; if (nodes[id].type === 'duelo') nodes[id].work = true; }
  return { nodes, start, conv, lanes, fork1, fork2, order: { plato, cubos, labs, fac, mem, mag, pega } };
}
const BOARD = buildBoard();
// Nombres cortos para que quepan en pantalla (el nombre completo queda en n.full)
const CORTO = {
  'El Arco: ingreso': 'El Arco', 'Intro a la Ing. Civil': 'Intro Ing. Civil', 'Inicio del 2.º semestre': '2.º semestre',
  'Herramientas Computacionales': 'Herram. Computac.', 'Ing. de la Construcción': 'Ing. Construcción',
  'Complemento de Cálculo': 'Complemento', 'Mecánica de Sólidos': 'Mec. Sólidos', 'Mecánica de Fluidos': 'Mec. Fluidos',
  'Materiales de Construcción': 'Materiales', 'Análisis de Estructuras': 'Análisis Estruct.',
  'Proyecto de Ingeniería Conceptual': 'PIC', 'Proyecto de Ingeniería Básica': 'PIB', 'Proyecto de Ingeniería de Detalle': 'PID',
  'Proyecto de Ingeniería Civil I': 'PIC1', 'Proyecto de Ingeniería Civil II': 'PIC2',
  'Sistemas de Transporte': 'Sist. Transporte', 'Ingeniería de Suelos': 'Ing. Suelos', 'Ingeniería Antisísmica': 'Antisísmica',
  'Infraestructura de Transporte': 'Infraestructura', 'Práctica Pre Profesional': 'Práctica Pre', 'Práctica Pre Profesional II': 'Práctica Pre II',
  'Estructuras de Retención': 'Estr. Retención', 'Mec. de Suelos en Ing. Vial': 'Suelos Vial', 'Ing. Geotécnica-Sísmica': 'Geot. Sísmica',
  'Modelamiento Numérico Geotécnico': 'Mod. Num. Geot.', 'Mec. de Suelos Avanzada': 'Suelos Avanz.', 'Geoingeniería en Terreno': 'Geo en Terreno',
  'Hormigón Armado Avanzado': 'HA Avanzado', 'Estructuras de Acero': 'Acero', 'Elementos Finitos': 'Elem. Finitos',
  'Diseño Sismorresistente': 'Sismorresist.', 'Diseño de Edificios de HA': 'Edificios HA', 'Ingeniería de Puentes': 'Puentes',
  'Hidráulica Urbana': 'Hidr. Urbana', 'Ingeniería Sanitaria': 'Sanitaria', 'Hidrología Distribuida': 'Hidrol. Distrib.',
  'Ingeniería de Costas': 'Costas', 'Ingeniería de Ríos': 'Ríos', 'Obras Hidráulicas': 'Obras Hidr.',
  'Demanda de Transportes': 'Demanda Transp.', 'Ingeniería de Tráfico': 'Tráfico', 'Redes de Transporte': 'Redes Transp.',
  'Ciudad y Transporte': 'Ciudad y Transp.', 'Planificación y Economía de Transporte': 'Planif. Transp.', 'Diseño de Pavimentos': 'Pavimentos',
  'Materiales Avanzados': 'Mat. Avanzados', 'Gestión de Infraestructura de Transporte': 'Gestión Infra.',
  'Planificación y Control de Proyectos': 'Control Proy.', 'Inspección Técnica de Obras': 'ITO',
  'Ceremonia de titulación': 'Titulación', 'Primer día de pega': '1.er día pega', 'Asado de bienvenida': 'Asado',
  'Ascenso a Semi-senior': '▲ Semi-senior', 'Curso de especialización': 'Curso espec.', 'Ascenso a Senior': '▲ Senior',
  'Consultora: Ing. Senior': 'Ing. Senior', 'Postulación a beca de magíster': 'Beca magíster', 'Ayudantía de magíster': 'Ayudantía mag.',
};
for (const id in BOARD.nodes) { const n = BOARD.nodes[id]; if (n.name && CORTO[n.name]) { n.full = n.name; n.name = CORTO[n.name]; } }
const NODE = id => BOARD.nodes[id];

// ---------- Estado ----------
const COLORS = ['#e8442e', '#2f7de1', '#f2b705', '#24a35a', '#9b4dca', '#ef7d1a'];
const TOKENS = ['casco', 'pisco', 'calculadora', 'plano', 'cono', 'cafe', 'huincha', 'escalimetro'];
function newGame({ players, seed, timer }) {
  const s = {
    v: 2, gid: (seed >>> 0) || 1, rng: (seed >>> 0) || 1, turn: 0, round: 0, phase: 'order', timer: timer ?? 120,
    players: players.map((p, i) => ({
      id: 'p' + i, name: p.name, bot: !!p.bot, color: COLORS[i % COLORS.length], token: TOKENS.includes(p.token) ? p.token : 'casco',
      pos: BOARD.start, m: CFG.plataInicial, k: 0, v: 0, c: 0, crown: false, lucky: null,
      via: null, fin: null, becaLost: false, ayudante: false, passed: {}, fails: {},
      mencion: null, titulo: null, guia: null, pega: null, nivel: 0,
      pareja: false, mascota: false, hermanos: false, casa: false,
      stuck: null, skip: 0, finished: false, finishRank: 0, turnsLeft: null,
    })),
    pending: { kind: 'spin', reason: 'orden', label: 'Girar para el orden' },
    log: [], seq: 0, fx: [], acc: [], firstSenior: null, finishCount: 0, leaders: { m: null, k: null, v: null },
    ev: { on: false, count: 0, used: [], hist: [], lastJefe: -99, jefe: 'Silva', gob: { mult: 1, name: null }, act: {}, tarea: null, buy: null },
  };
  log(s, 'Cada jugador gira para definir el orden. Ese número queda como su número de la suerte.');
  return s;
}
const cur = s => s.players[s.turn];
function log(s, txt, pid) { s.log.push({ i: ++s.seq, t: txt, p: pid ?? null }); if (s.log.length > 80) s.log.shift(); }
function fx(s, f) { f.i = ++s.seq; if (f.kind === 'card' || f.kind === 'event' || f.kind === 'income' || f.kind === 'lucky') { f.deltas = s.acc; s.acc = []; f.host = s.ev.jefe; } s.fx.push(f); }
const bono = p => Math.min(CFG.bonoMax, Math.floor(Math.max(0, p.k) / CFG.bonoCada));
const estudiando = p => !p.pega;

// Líderes: quien va primero (sin empate) en cada medidor tiene una ventaja
function computeLeaders(s) {
  const L = {};
  for (const key of ['m', 'k', 'v']) {
    const vals = s.players.map(p => p[key]); const max = Math.max(...vals);
    L[key] = max > 0 && vals.filter(v => v === max).length === 1 ? s.players[vals.indexOf(max)].id : null;
  }
  const before = s.leaders || {};
  for (const key of ['m', 'k', 'v']) if (L[key] && L[key] !== before[key]) {
    const p = s.players.find(x => x.id === L[key]);
    log(s, `${p.name} ahora es ${LIDER[key].name}: si lo mantiene al final, suma +${CFG.bonoLider} puntos.`, p.id);
  }
  s.leaders = L;
}
const LIDER = {
  m: { name: 'líder en Plata', perk: `+${CFG.bonoLider} puntos al final si lo mantiene` },
  k: { name: 'líder en Conocimiento', perk: `+${CFG.bonoLider} puntos al final si lo mantiene` },
  v: { name: 'líder en Vida Social', perk: `+${CFG.bonoLider} puntos al final si lo mantiene` },
};
const isL = (s, p, key) => s.leaders && s.leaders[key] === p.id;

const act = (s, k) => !!(s.ev && s.ev.act[k] && s.round < s.ev.act[k].end);
function apply(s, p, e, src, raw) {
  if (!e) return '';
  const parts = []; e = Object.assign({}, e);
  if (!raw && e.v > 0) {
    if (act(s, 'pandemia')) e.v = 0;
    else if (act(s, 'paro') || act(s, 'aniversario')) e.v *= 2;
  }
  const d = (key, val) => { if (val) s.acc.push({ pid: p.id, key, val }); };
  if (e.m) { p.m += e.m; parts.push((e.m > 0 ? '+' : '') + fmt(e.m)); d('m', e.m); }
  if (e.k) { p.k += e.k; parts.push((e.k > 0 ? '+' : '−') + Math.abs(e.k) + ' Conocimiento'); d('k', e.k); }
  if (e.v) { p.v += e.v; parts.push((e.v > 0 ? '+' : '−') + Math.abs(e.v) + ' Vida Social'); d('v', e.v); }
  if (e.c) { p.c += e.c; parts.push('+' + e.c + ' contacto'); d('c', e.c); }
  if (e.skip) { p.skip += e.skip; parts.push('pierdes un turno'); d('skip', e.skip); }
  if (parts.length) log(s, `${p.name}: ${parts.join(', ')}${src ? ' (' + src + ')' : ''}`, p.id);
  return parts.join(', ');
}
const fixedPart = e => { const o = {}; for (const k of ['m', 'k', 'v', 'c', 'skip']) if (e[k]) o[k] = e[k]; return o; };

// ---------- Flujo de turnos ----------
function beginTurn(s) {
  for (let guard = 0; guard < 20; guard++) {
    if (gameOver(s)) return endGame(s);
    const p = cur(s);
    if (p.finished || (p.turnsLeft !== null && p.turnsLeft <= 0)) { advance(s); continue; }
    if (p.turnsLeft !== null) p.turnsLeft--;
    if (p.skip > 0) { p.skip--; log(s, `${p.name} pierde este turno.`, p.id); fx(s, { kind: 'skip', pid: p.id }); advance(s); continue; }
    s.pending = null;
    if (!p.via) return ask(s, 'via');
    if (!p.fin) return ask(s, 'fin');
    if (s.ev.buy && s.ev.buy.left.includes(p.id)) { s.ev.buy.left = s.ev.buy.left.filter(x => x !== p.id); return ask(s, 'compra', { kind: s.ev.buy.kind }); }
    return continueTurn(s, p);
  }
}
function continueTurn(s, p) {
  {
    const T = s.ev.tarea;
    if (T && T.in.includes(p.id)) {
      const x = tareaX(s);
      s.pending = { kind: 'spin', reason: 'tarea', label: `Salir de la tarea (más de ${x})` };
      return;
    }
    if (p.stuck) {
      const st = p.stuck;
      const fuera = st.kind === 'defensa' && (act(s, 'congreso') && s.ev.act.congreso.prof === p.guia ? 'en un congreso' : act(s, 'sabatico') && s.ev.act.sabatico.prof === p.guia ? 'de año sabático' : null);
      if (fuera) {
        apply(s, p, { k: 1 }, 'avanzas la ' + (p.titulo === 'magister' ? 'tesis' : 'memoria') + ' sola');
        fx(s, { kind: 'card', pid: p.id, title: `Tu profe guía está ${fuera}`, text: `${p.guia} vuelve en unas rondas. Mientras, no puedes defender: sigues escribiendo solo.` });
        return endTurn(s);
      }
      if (st.kind === 'defensa' && st.wait > 0) {
        st.wait--; apply(s, p, { k: 1 }, 'trabajando en la ' + (p.titulo === 'magister' ? 'tesis' : 'memoria'));
        fx(s, { kind: 'card', pid: p.id, title: 'Trabajando en la ' + (p.titulo === 'magister' ? 'tesis' : 'memoria'), text: st.wait > 0 ? `Te quedan ${st.wait} turno${st.wait > 1 ? 's' : ''} antes de defender.` : 'El próximo turno defiendes.', eff: '+1 Conocimiento' });
        return endTurn(s);
      }
      s.pending = { kind: 'spin', reason: st.kind, label: st.kind === 'filtro' ? `Rendir ${NODE(st.node).name}` : st.kind === 'ascenso' ? 'Girar por el ascenso' : 'Girar por la defensa', ctx: {} };
      return;
    }
    s.pending = { kind: 'spin', reason: 'move', label: 'Girar la ruleta' };
    return;
  }
}
function advance(s) {
  s.turn = (s.turn + 1) % s.players.length;
  if (s.turn === 0) { s.round++; roundStart(s); }
}
function endTurn(s) { computeLeaders(s); s.pending = null; advance(s); beginTurn(s); }
function gameOver(s) { return s.players.every(p => p.finished || (p.turnsLeft !== null && p.turnsLeft <= 0)); }
function endGame(s) { computeLeaders(s); s.phase = 'end'; s.pending = null; s.results = score(s); log(s, 'Se terminó la partida.'); }

function ask(s, kind, ctx) {
  const p = cur(s);
  const P = { kind: 'choice', choice: kind, ctx: ctx || {} };
  if (kind === 'via') Object.assign(P, { title: 'Ingreso a la carrera', text: '¿Cómo entras a Ingeniería Civil?', options: [
    { id: 'paes', label: 'PAES', sub: 'Haces toda la nivelación. Partes con +2 Conocimiento.' },
    { id: 'conv', label: 'Convalidación', sub: `Te saltas el primer semestre, partes con +${CFG.conv.k} Conocimiento y ${fmt(CFG.conv.m)}, pero te espera un ramo atrasado en Los Cubos.` }] });
  if (kind === 'fin') {
    const becados = s.players.filter(o => o.fin === 'beca').length;
    const opts = [{ id: 'trabajando', label: 'Trabajando', sub: `${fmt(CFG.pagoEstudio.trabajando)} por pago y ${Math.round(CFG.sueldoRonda * 100)}% de eso en cada ronda, pero los filtros te cuestan +1.` }];
    if (!ctx || !ctx.noBeca) opts.push(becados < CFG.becaCupos
      ? { id: 'beca', label: 'Postular a beca', sub: `Gira: necesitas ${CFG.becaMin}+. ${fmt(CFG.pagoEstudio.beca)} por pago y ${fmt(CFG.pagoEstudio.beca * CFG.sueldoRonda)} por ronda. Se pierde con ${CFG.becaPierde.mismo} reprobaciones del mismo ramo o ${CFG.becaPierde.total} en total. Cupos: ${CFG.becaCupos - becados} de ${CFG.becaCupos}.` }
      : { id: 'sinCupo', label: 'Beca: sin cupos', sub: `Ya hay ${CFG.becaCupos} becados en la partida.`, disabled: true });
    opts.push({ id: 'familia', label: 'Familia', sub: `Partes con ${fmt(CFG.familiaExtra)} extra y recibes ${fmt(CFG.pagoEstudio.familia)} por pago.` });
    Object.assign(P, { title: 'Financiamiento', text: ctx && ctx.noBeca ? 'No alcanzaste la beca. Elige otra forma de pagar la carrera.' : '¿Cómo vas a pagar la carrera? Cobras al caer en "Fin de semestre".', options: opts.filter(o => !o.disabled), shown: opts });
  }
  if (kind === 'forkM') Object.assign(P, { title: 'Elegir mención', text: 'Terreno u Oficina: elige tu mención. Tu profe guía será de esta mención.', options: Object.entries(MENCIONES).map(([id, m]) => {
    const others = s.players.filter(o => o !== p && o.mencion === id).map(o => o.name);
    return { id, label: m.name, group: m.rama, sub: (others.length ? `Grupo de estudio con ${others.join(', ')} · ` : '') + `Pegas: ${PEGAS_POR[id].map(x => PEGAS[x].name).join(', ')}` };
  }) });
  if (kind === 'forkT') Object.assign(P, { title: 'Titulación', text: '¿Memoria o magíster?', options: [
    { id: 'memoria', label: 'Memoria', sub: 'Camino corto: sales antes a trabajar.' },
    { id: 'magister', label: 'Magíster', sub: `Camino largo: más Conocimiento, +${fmt(CFG.magister)} de sueldo y acceso a Academia.` }] });
  if (kind === 'guia') {
    const T = PROFES_MEN[p.mencion]; const mag = p.titulo === 'magister';
    Object.assign(P, { title: 'Elegir profe guía', text: `Profes de ${MENCIONES[p.mencion].name}${mag ? ' que guían tesis de magíster' : ''}. Más exigente = más difícil y más largo, pero mejor recompensa.`, options: [].concat(
      ...['alta', 'media', 'baja'].map(t0 => T[t0].filter(name => !mag || !NO_MAG.includes(name)).map(name => { const t = guiaTier(s, p.mencion, name); return { id: name, label: name, group: { alta: 'Exigencia alta', media: 'Exigencia media', baja: 'Exigencia baja' }[t0],
        sub: `Defiendes con ${GUIA[t].umbral}+ · ${GUIA[t].dur} turno${GUIA[t].dur > 1 ? 's' : ''} de trabajo · +${GUIA[t].k} Conocimiento${GUIA[t].contacto ? ' y un contacto' : ''}` }; }))) });
  }
  if (kind === 'pega') {
    let ids = [...PEGAS_POR[p.mencion]]; if (p.titulo === 'magister' && !ids.includes('academia')) ids.push('academia');
    Object.assign(P, { title: 'Elegir pega', text: 'Las opciones dependen de tu mención. Cobras al caer en "Día de pago".', options: ids.map(id => ({ id, label: PEGAS[id].name,
      sub: (PEGAS[id].base ? `Sueldo junior ${fmt(sueldo(p, id, 0))}` : 'Sueldo variable') + (PEGAS[id].perk ? ' · ' + PEGAS[id].perk : '') })) });
  }
  if (kind === 'decision') {
    const D = { hermanos: ['¿Vivir con tus hermanos?', `Ahorras arriendo: +${fmt(CFG.hermanos)} en cada pago, con eventos de convivencia.`],
      pareja: ['¿Pololear?', `+3 Vida Social, pero gastas ${fmt(-CFG.pareja)} en cada pago.`],
      mascota: ['¿Adoptar una mascota?', `+2 Vida Social, gastas ${fmt(-CFG.mascota)} en cada pago.`],
      casa: ['¿Comprar una casa?', `Pagas el pie: ${fmt(-CFG.casa.m)}. Ganas +${CFG.casa.v} Vida Social y en cada día de pago te ahorras el arriendo (+${fmt(CFG.casa.ahorro)}).`] }[ctx.kind];
    Object.assign(P, { title: D[0], text: D[1], options: [{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }] });
  }
  if (kind === 'dilema') {
    const d = DILEMAS[ctx.deck][ctx.idx];
    Object.assign(P, { title: d.q, text: 'Elige una opción.', options: [
      { id: 'a', label: d.a[0], sub: d.a[2] || effText(d.a[1]) }, { id: 'b', label: d.b[0], sub: d.b[2] || effText(d.b[1]) }] });
  }
  if (kind === 'compra') {
    const E = EVENTOS[ctx.kind];
    Object.assign(P, { title: E.compra.q, text: E.compra.text, options: [{ id: 'si', label: E.compra.si, sub: effText(E.compra.e) }, { id: 'no', label: E.compra.no, sub: 'Sin efecto' }] });
  }
  if (kind === 'otro') Object.assign(P, { title: ctx.title, text: ctx.text, options: s.players.filter(o => o !== p).map(o => ({ id: o.id, label: o.name, sub: `${fmt(o.m)} · ${o.k} Conocimiento · ${o.v} Vida Social` })) });
  s.pending = P;
}
function effText(e) {
  const parts = [];
  if (e.m) parts.push((e.m > 0 ? '+' : '') + fmt(e.m));
  if (e.k) parts.push((e.k > 0 ? '+' : '−') + Math.abs(e.k) + ' Conocimiento');
  if (e.v) parts.push((e.v > 0 ? '+' : '−') + Math.abs(e.v) + ' Vida Social');
  if (e.c) parts.push('+1 contacto');
  return parts.join(', ') || 'Sin efecto';
}

// ---------- Acciones ----------
function reduce(s0, a) {
  const s = structuredClone(s0);
  s.fx = []; s.acc = [];
  if (!['play', 'order'].includes(s.phase) || !s.pending) return s0;
  const p = cur(s);
  if (a.pid && a.pid !== p.id) return s0;
  if (a.type === 'spin' && s.pending.kind === 'spin') doSpin(s, p);
  else if (a.type === 'choose' && s.pending.kind === 'choice' && s.pending.options.some(o => o.id === a.value)) doChoose(s, p, a.value);
  else return s0;
  if (s.acc.length) fx(s, { kind: 'income', silent: true }); // cambios sin tarjeta: se muestran flotando
  return s;
}

function lucky(s, p, n) {
  const owner = s.players.find(o => o.lucky === n && o !== p);
  if (!owner) return;
  apply(s, owner, { m: CFG.suerte }, `número de la suerte (${p.name} sacó ${n})`);
  fx(s, { kind: 'lucky', pid: owner.id, from: p.id, n, m: CFG.suerte });
}

function doSpin(s, p) {
  const P = s.pending; let n = spinN(s);
  s.pending = null;
  if (P.reason === 'orden') {
    const taken = new Set(s.players.map(o => o.lucky).filter(Boolean));
    let repeats = 0; while (taken.has(n)) { n = spinN(s); repeats++; }
    p.lucky = n;
    fx(s, { kind: 'spin', pid: p.id, n, reason: 'orden' });
    log(s, `${p.name} sacó ${n}${repeats ? ' (repetido, giró de nuevo)' : ''}: su número de la suerte es el ${n}.`, p.id);
    if (n === 10) { p.crown = true; apply(s, p, { m: CFG.mechon.plata, k: CFG.mechon.k }, 'Mechón de Oro'); fx(s, { kind: 'card', pid: p.id, title: '¡Mechón de Oro!', text: 'Sacaste un 10 en tu primer giro.', eff: `+${fmt(CFG.mechon.plata)}, +1 Conocimiento y corona` }); }
    if (s.players.every(o => o.lucky)) {
      s.players.sort((a, b) => b.lucky - a.lucky);
      s.phase = 'play'; s.turn = 0; s.round = 1;
      fx(s, { kind: 'card', pid: s.players[0].id, title: 'Orden de juego', text: s.players.map((o, i) => `${i + 1}. ${o.name} (número ${o.lucky})`).join(' · '), eff: `Cuando otro jugador saque tu número, ganas ${fmt(CFG.suerte)}` });
      log(s, 'Orden: ' + s.players.map(o => o.name).join(', ') + '.');
      beginTurn(s);
    } else { s.turn++; s.pending = { kind: 'spin', reason: 'orden', label: 'Girar para el orden' }; }
    return;
  }
  fx(s, { kind: 'spin', pid: p.id, n, reason: P.reason });
  lucky(s, p, n);
  if (P.reason === 'move') {
    let steps = n; const why = [];
    if (act(s, 'estallido') && !p.pega) { steps = Math.ceil(n / 2); why.push('estallido: la mitad'); }
    if (act(s, 'temporal')) { steps = Math.max(1, steps - 1); why.push('temporal: −1'); }
    log(s, `${p.name} giró un ${n}${why.length ? ` y avanza ${steps} (${why.join(', ')})` : ''}.`, p.id);
    return move(s, p, steps);
  }
  if (P.reason === 'beca') {
    if (n >= CFG.becaMin) { p.fin = 'beca'; log(s, `${p.name} ganó la beca con ${n}.`, p.id); fx(s, { kind: 'card', pid: p.id, title: '¡Ganaste la beca!', text: `Sacaste ${n}, necesitabas ${CFG.becaMin}.`, eff: `${fmt(CFG.pagoEstudio.beca)} en cada fin de semestre y ${fmt(CFG.pagoEstudio.beca * CFG.sueldoRonda)} cada ronda mientras la mantengas`, good: true }); s.pending = { kind: 'spin', reason: 'move', label: 'Girar la ruleta' }; return; }
    log(s, `${p.name} no alcanzó la beca (sacó ${n}).`, p.id); fx(s, { kind: 'card', pid: p.id, title: 'Sin beca', text: `Sacaste ${n}, necesitabas ${CFG.becaMin}. Elige otra forma de financiar la carrera.` });
    return ask(s, 'fin', { noBeca: true });
  }
  if (P.reason === 'tarea') return tareaSpin(s, p, n);
  if (P.reason === 'filtro') return rendir(s, p, n, (P.ctx && P.ctx.carry) || 0);
  if (P.reason === 'ascenso') {
    const node = NODE(p.stuck.node); const need = needAscenso(s, p, node);
    if (n >= need) {
      p.nivel = node.nivel; p.stuck = null; log(s, `${p.name} sacó ${n} (necesitaba ${need}): ¡ascendió a ${node.nivel === 1 ? 'Semi-senior' : 'Senior'}!`, p.id);
      const carry = (P.ctx && P.ctx.carry) || 0;
      fx(s, { kind: 'card', pid: p.id, title: node.nivel === 1 ? '¡Semi-senior!' : '¡Senior!', text: `Sacaste ${n}, necesitabas ${need}.` + (carry ? ` Sigues avanzando ${carry}.` : ''), eff: 'Tu sueldo sube' });
      if (carry) return move(s, p, carry);
    } else { log(s, `${p.name} sacó ${n} (necesitaba ${need}): sin ascenso esta vez.`, p.id); fx(s, { kind: 'card', pid: p.id, title: 'Sin ascenso', text: `Sacaste ${n}, necesitabas ${need}. Intentas de nuevo el próximo turno.` }); }
    return endTurn(s);
  }
  if (P.reason === 'defensa') {
    const t = guiaTier(s, p.mencion, p.guia); const g = GUIA[t]; const need = needDefensa(s, p);
    if (n >= need) {
      p.stuck = null; const extra = p.titulo === 'magister' ? 2 : 0;
      apply(s, p, { k: g.k + extra, c: g.contacto }, 'defensa aprobada');
      fx(s, { kind: 'card', pid: p.id, title: '¡Defensa aprobada!', nota: nota(n, need), text: `${p.guia} te pone un ${nota(n, need)}.`, eff: `+${g.k + extra} Conocimiento${g.contacto ? ', +1 contacto' : ''}` });
    } else { log(s, `${p.name} sacó un ${nota(n, need)} en la defensa. A corregir.`, p.id); fx(s, { kind: 'card', pid: p.id, title: 'Correcciones', nota: nota(n, need), text: `${p.guia} te pone un ${nota(n, need)} y te pide correcciones.` }); }
    return endTurn(s);
  }
  if (P.reason === 'efecto') {
    const sp = P.ctx.spin; const ok = n >= sp.min;
    const res = apply(s, p, ok ? sp.ok : sp.ko, P.ctx.src);
    fx(s, { kind: 'card', pid: p.id, title: P.ctx.src, text: `Sacaste ${n} (necesitabas ${sp.min}).`, eff: res || 'Sin efecto', good: ok });
    return endTurn(s);
  }
  if (P.reason === 'grupal') {
    const other = s.players.find(o => o.id === P.ctx.partner); const node = NODE(P.ctx.node);
    const pop = 0; const nn = n;
    const alto = node.tier === 'alta';
    if (nn >= 6) { const e = { k: alto ? 2 : 1 }; apply(s, p, e, node.name); apply(s, other, e, node.name); fx(s, { kind: 'card', pid: p.id, title: 'Proyecto aprobado', nota: nota(n, 6), text: `${p.name} y ${other.name} se sacaron un ${nota(n, 6)}.`, eff: `Ambos +${e.k} Conocimiento`, good: true }); }
    else if (nn <= 2) { apply(s, p, { v: -1, k: 1 }, 'hiciste todo tú'); apply(s, other, { v: 1 }, 'no hizo nada'); fx(s, { kind: 'card', pid: p.id, title: 'El que no hizo nada', text: `${other.name} desapareció del grupo y tú hiciste todo.`, eff: `Tú +1 Conocimiento −1 Vida Social; ${other.name} +1 Vida Social` }); }
    else { fx(s, { kind: 'card', pid: p.id, title: 'Proyecto con observaciones', nota: '4,0', text: 'Se sacaron un 4,0 raspando.', eff: 'Sin efecto' }); log(s, `${node.name}: pasaron raspando.`, p.id); }
    return endTurn(s);
  }
  if (P.reason === 'becaMag') {
    if (n >= 6) { apply(s, p, { m: 800 }, 'beca de magíster'); fx(s, { kind: 'card', pid: p.id, title: '¡Beca de magíster!', text: `Sacaste ${n}.`, eff: '+$800.000', good: true }); }
    else fx(s, { kind: 'card', pid: p.id, title: 'Sin beca', text: `Sacaste ${n}, necesitabas 6. A pagarlo con ayudantías.` });
    return endTurn(s);
  }
  endTurn(s);
}

function move(s, p, steps, path) {
  path = path || [p.pos];
  while (steps > 0) {
    const node = NODE(p.pos);
    if (node.next.length > 1) { // bifurcación
      s.pending = null; fx(s, { kind: 'move', pid: p.id, path });
      ask(s, node.type, { remaining: steps });
      return;
    }
    if (!node.next.length) break;
    p.pos = node.next[0]; path.push(p.pos); steps--;
    if (isStop(p, NODE(p.pos))) break;
  }
  fx(s, { kind: 'move', pid: p.id, path });
  land(s, p, NODE(p.pos), steps);
}
function isStop(p, n) {
  if (['filtro', 'guia', 'defensa', 'pega', 'ascenso', 'fin'].includes(n.type)) return n.type !== 'filtro' || !p.passed[n.id];
  if (n.type === 'atrasado') return p.via === 'conv' && !p.passed[n.id];
  return false;
}

function sueldo(p, id, nivel) {
  const base = PEGAS[id].base + (p.titulo === 'magister' ? CFG.magister : 0) + p.c * CFG.contacto;
  return Math.round(base * CFG.sueldoMult * CFG.nivelSueldo[nivel] / 10) * 10;
}
function pago(s, p, n) {
  let e, title;
  const lp = 0;
  if (n.work) {
    if (!p.pega) return endTurn(s);
    let m = p.pega === 'emprende' ? Math.round((800 + pickI(s, 50) * 100 + (p.titulo === 'magister' ? CFG.magister : 0) + p.c * CFG.contacto) * CFG.nivelSueldo[p.nivel] / 10) * 10 : sueldo(p, p.pega, p.nivel);
    m = Math.round(m * s.ev.gob.mult / 10) * 10;
    m += lp + (p.pareja ? CFG.pareja : 0) + (p.mascota ? CFG.mascota : 0) + (p.casa ? CFG.casa.ahorro : 0);
    e = { m, v: 1 };
    if (['publico', 'ito', 'constructora'].includes(p.pega)) e.v = 2;
    if (p.pega === 'academia') e.k = 1;
    title = 'Día de pago';
  } else {
    let m = Math.round((p.fin === 'beca' && p.becaLost ? CFG.pagoEstudio.becaPerdida : CFG.pagoEstudio[p.fin]) * s.ev.gob.mult / 10) * 10;
    if (p.ayudante) m += CFG.ayudantePago;
    m += lp + (p.pareja ? CFG.pareja : 0) + (p.mascota ? CFG.mascota : 0) + (p.hermanos ? CFG.hermanos : 0);
    if (!p.ayudante && n.zone !== 'plato' && p.k >= CFG.ayudanteMinK) { p.ayudante = true; m += CFG.ayudantePago; log(s, `${p.name} ahora es ayudante: cobra más y ayuda en filtros que ya aprobó.`, p.id); }
    e = { m, v: 2 }; title = 'Fin de semestre y vacaciones';
  }
  const res = apply(s, p, e, title.toLowerCase());
  fx(s, { kind: 'card', pid: p.id, title, text: [p.ayudante && !n.work ? 'Incluye tu sueldo de ayudante.' : '', s.ev.gob.mult !== 1 ? `${s.ev.gob.name}: pagos ${s.ev.gob.mult > 1 ? '+' : '−'}${Math.round(Math.abs(s.ev.gob.mult - 1) * 100)}%.` : ''].filter(Boolean).join(' '), eff: res, good: true });
  endTurn(s);
}

function land(s, p, n, carry) {
  carry = carry || 0;
  switch (n.type) {
    case 'pago': return pago(s, p, n);
    case 'ramo': {
      if (n.tier === 'baja' && hard(s)) { const res = apply(s, p, TIER_EFF.media, n.name); fx(s, { kind: 'card', pid: p.id, title: n.name, text: n.text + ` (con el jefe ${s.ev.jefe}, este profe exige más)`, eff: res }); return endTurn(s); }
      if (n.e && n.e.spin) { s.pending = { kind: 'spin', reason: 'efecto', label: `Girar: ${n.name}`, ctx: { spin: n.e.spin, src: n.name } }; fx(s, { kind: 'card', pid: p.id, title: n.name, text: n.text, eff: `Gira: con ${n.e.spin.min} o más, +2 Conocimiento y +1 Vida Social; si no, −1 Vida Social`, wait: true }); return; }
      const res = apply(s, p, n.e, n.name);
      fx(s, { kind: 'card', pid: p.id, title: n.name, text: n.text, eff: res || 'Sin efecto' });
      return endTurn(s);
    }
    case 'filtro': case 'atrasado': {
      if (n.type === 'atrasado' && (p.via !== 'conv' || p.passed[n.id])) return endTurn(s);
      p.stuck = { kind: 'filtro', node: n.id };
      s.pending = { kind: 'spin', reason: 'filtro', label: `Rendir ${n.name}`, ctx: { carry } };
      const u = umbralFiltro(s, p, n);
      fx(s, { kind: 'card', pid: p.id, title: `Ramo filtro: ${n.name}`, text: '', need: u.need, mods: u.mods, wait: true });
      return;
    }
    case 'evento': return drawCard(s, p, n.deck);
    case 'dilema': { const idx = pickI(s, DILEMAS[n.deck].length); return ask(s, 'dilema', { deck: n.deck, idx }); }
    case 'duelo': return ask(s, 'otro', n.work
      ? { title: 'Licitación', text: 'Compites con otro jugador por el mismo proyecto. Ambos giran: el más alto gana $500.000 y el otro pierde $100.000.', duelo: n.id }
      : { title: 'Duelo de certamen', text: 'Desafía a otro jugador: ambos giran. El más alto gana +2 Conocimiento y el otro pierde 1 Vida Social.', duelo: n.id });
    case 'decision': {
      if (p[n.kind]) return endTurn(s);
      return ask(s, 'decision', { kind: n.kind });
    }
    case 'grupal': return ask(s, 'otro', { title: n.name, text: `Proyecto grupal (${n.profe}). Elige compañero: ambos giran juntos.`, grupal: n.id });
    case 'practica': {
      const res = apply(s, p, { m: n.m, c: 1 }, n.name);
      fx(s, { kind: 'card', pid: p.id, title: n.name, text: n.name === 'Práctica Laboral' ? 'El jefe de obra te manda a comprar café.' : `Firmada por ${n.profe}.`, eff: res, good: true });
      return endTurn(s);
    }
    case 'guia': return ask(s, 'guia', { carry });
    case 'defensa': {
      const g = GUIA[guiaTier(s, p.mencion, p.guia)];
      p.stuck = { kind: 'defensa', node: n.id, wait: g.dur - 1 };
      fx(s, { kind: 'card', pid: p.id, title: n.name, text: `${p.guia} es tu profe guía: ${g.dur} turno${g.dur > 1 ? 's' : ''} de trabajo y luego defiendes con ${needDefensa(s, p)}+.`, wait: p.stuck.wait <= 0 });
      if (p.stuck.wait <= 0) { s.pending = { kind: 'spin', reason: 'defensa', label: 'Girar por la defensa', ctx: {} }; return; }
      return endTurn(s);
    }
    case 'becaMag': s.pending = { kind: 'spin', reason: 'becaMag', label: 'Postular a la beca (6+)' }; fx(s, { kind: 'card', pid: p.id, title: n.name, text: 'Gira: con 6 o más ganas la beca ($800.000).', wait: true }); return;
    case 'paper': case 'congreso': case 'hito': case 'titulo': {
      const res = apply(s, p, n.e, n.name); fx(s, { kind: 'card', pid: p.id, title: n.name, eff: res, good: true });
      if (n.type === 'titulo') log(s, `🎓 ${p.name} se tituló de Ingeniero Civil.`, p.id);
      return endTurn(s);
    }
    case 'pega': return ask(s, 'pega', { carry });
    case 'ascenso': {
      if (p.nivel >= n.nivel) return endTurn(s);
      p.stuck = { kind: 'ascenso', node: n.id };
      s.pending = { kind: 'spin', reason: 'ascenso', label: 'Girar por el ascenso', ctx: { carry } };
      fx(s, { kind: 'card', pid: p.id, title: n.name, text: '', need: needAscenso(s, p, n), mods: modsAscenso(s, p, n), wait: true });
      return;
    }
    case 'fin': {
      p.finished = true; s.finishCount++; p.finishRank = s.finishCount;
      if (!s.firstSenior) {
        s.firstSenior = p.id; log(s, `🏁 ${p.name} llegó primero a Ing. Senior. Los demás tienen ${CFG.rondasFinales} turnos más.`, p.id);
        for (const o of s.players) if (!o.finished) o.turnsLeft = CFG.rondasFinales;
        fx(s, { kind: 'card', pid: p.id, title: '¡Ingeniero Senior!', text: `${p.name} llegó primero a la Consultora.`, eff: `+${CFG.bonoPrimero} puntos. Los demás tienen ${CFG.rondasFinales} turnos más.`, good: true });
      } else { log(s, `🏁 ${p.name} llegó a Ing. Senior.`, p.id); fx(s, { kind: 'card', pid: p.id, title: '¡Ingeniero Senior!', text: `${p.name} llegó a la Consultora.`, good: true }); }
      return endTurn(s);
    }
    default: return endTurn(s);
  }
}

function needAscenso(s, p, node) { return Math.max(2, CFG.ascenso[node.nivel - 1] - Math.min(2, p.c) - (bono(p) > 1 ? 1 : 0)); }
function needDefensa(s, p) { return Math.max(2, GUIA[guiaTier(s, p.mencion, p.guia)].umbral - bono(p)); }
const hard = s => s.ev && s.ev.jefe !== 'Silva';
function guiaTier(s, men, name) { const t = tierOf(men, name); return t === 'baja' && hard(s) ? 'media' : t; }
// Modificadores del umbral, con ícono para mostrarlos como chips
function umbralFiltro(s, p, n) {
  let need = CFG.umbral[n.dif]; const mods = [{ i: '🎯', v: need, l: `Base (dificultad ${n.dif})` }];
  const add = (i, v, l) => { need += v; mods.push({ i, v, l }); };
  const b = bono(p); if (b) add('📚', -b, 'Bono por Conocimiento');
  if (p.fin === 'trabajando' && estudiando(p)) add('💼', 1, 'Estudias trabajando');
  if (hard(s)) add('👔', 1, `Jefe de carrera ${s.ev.jefe}`);
  if (act(s, 'paro')) add('✊', -1, 'Paro');
  if (act(s, 'pandemia')) add('💻', -1, 'Pruebas online');
  if (act(s, 'congreso') && n.profe && n.profe.includes(s.ev.act.congreso.prof)) add('✈️', -2, `${s.ev.act.congreso.prof} en congreso`);
  const helper = s.players.find(o => o !== p && o.ayudante && o.passed[n.id]);
  if (helper) add('🧑‍🏫', -1, `Ayudante ${helper.name}`);
  if ((p.fails[n.id] || 0) >= 2) mods.push({ i: '✉️', v: 0, l: `Carta: ${fmt(CFG.carta)} y −1 Vida Social`, txt: '−$150mil −1🎉' });
  return { need: Math.max(2, need), detail: mods.map(m => m.l + (m.v ? ` ${m.v > 0 && m.i !== '🎯' ? '+' : ''}${m.v}` : '')).join(' · '), mods, helper };
}
function modsAscenso(s, p, node) {
  const mods = [{ i: '🎯', v: CFG.ascenso[node.nivel - 1], l: 'Base' }];
  if (p.c) mods.push({ i: '🤝', v: -Math.min(2, p.c), l: 'Contactos' });
  if (bono(p) > 1) mods.push({ i: '📚', v: -1, l: 'Conocimiento 8+' });
  return mods;
}
// Nota chilena (1,0 a 7,0) a partir del número de la ruleta: llegar al mínimo es un 4,0
function nota(n, need) {
  need = Math.min(10, Math.max(2, need || 6));
  const v = n >= need ? 4 + (need >= 10 ? 3 : (n - need) / (10 - need) * 3) : 1 + (n - 1) / (need - 1) * 2.9;
  return v.toFixed(1).replace('.', ',');
}
function rendir(s, p, n, carry) {
  const node = NODE(p.stuck.node); const u = umbralFiltro(s, p, node);
  if ((p.fails[node.id] || 0) >= 2) apply(s, p, { m: -CFG.carta, v: -1 }, 'carta');
  if (n >= u.need) {
    p.passed[node.id] = true; p.stuck = null;
    log(s, `${p.name} aprobó ${node.name} con un ${nota(n, u.need)}.`, p.id);
    apply(s, p, { v: 1 }, 'carrete post-certamen');
    if (u.helper) apply(s, u.helper, { m: 100, k: 1 }, `ayudantía a ${p.name}`);
    fx(s, { kind: 'card', pid: p.id, title: `¡Aprobaste ${node.name}!`, nota: nota(n, u.need), text: `Te sacaste un ${nota(n, u.need)} en el certamen.` + (carry ? ` Sigues avanzando ${carry} casilla${carry > 1 ? 's' : ''}.` : ''), eff: '+1 Vida Social (carrete post-certamen)' + (u.helper ? ` · ${u.helper.name} cobra la ayudantía: +$100.000 y +1 Conocimiento` : ''), good: true });
    if (carry) return move(s, p, carry);
  } else {
    p.fails[node.id] = (p.fails[node.id] || 0) + 1;
    let extra = '';
    const total = Object.values(p.fails).reduce((a, b) => a + b, 0);
    if (p.fin === 'beca' && !p.becaLost && (p.fails[node.id] >= CFG.becaPierde.mismo || total >= CFG.becaPierde.total)) { p.becaLost = true; extra = ' Perdiste la beca.'; }
    if (p.fails[node.id] === 2) extra += ' Quedaste en causal: desde ahora cada intento requiere carta.';
    log(s, `${p.name} reprobó ${node.name} con un ${nota(n, u.need)}.${extra}`, p.id);
    fx(s, { kind: 'card', pid: p.id, title: `Reprobaste ${node.name}`, nota: nota(n, u.need), text: `Te sacaste un ${nota(n, u.need)}: no alcanzó para el 4,0.${extra}`, eff: 'Lo intentas de nuevo el próximo turno' });
  }
  endTurn(s);
}

// Resuelve un efecto completo (fijo, a todos, con otro jugador o con giro)
function resolve(s, p, e, title, extraText) {
  if (e.otro) return ask(s, 'otro', { title, text: extraText || 'Elige a otro jugador.', eff: e.otro });
  let res = apply(s, p, fixedPart(e), title);
  if (e.todos) { const others = s.players.filter(o => o !== p && !o.finished); for (const o of others) apply(s, o, e.todos, title); res += (res ? '; ' : '') + `todos los demás ${effText(e.todos)}`; }
  if (e.spin) {
    s.pending = { kind: 'spin', reason: 'efecto', label: 'Girar', ctx: { spin: e.spin, src: title } };
    fx(s, { kind: 'card', pid: p.id, title, text: extraText || '', eff: (res ? res + ' · ' : '') + `Gira: con ${e.spin.min} o más, ${effText(e.spin.ok)}; si no, ${effText(e.spin.ko)}`, wait: true });
    return;
  }
  fx(s, { kind: 'card', pid: p.id, title, text: extraText || '', eff: res || 'Sin efecto' });
  endTurn(s);
}

function drawCard(s, p, deck) {
  const D = DECKS[deck]; let c = D[pickI(s, D.length)];
  if (c.e.siHermanos && !p.hermanos) c = D[0];
  const e = c.e;
  if (e.tramo) {
    const z = NODE(p.pos).zone; const who = s.players.filter(o => !o.finished && NODE(o.pos).zone === z);
    for (const o of who) apply(s, o, e.tramo, c.t);
    fx(s, { kind: 'card', pid: p.id, title: c.t, text: c.d || '', eff: `+${e.tramo.v} Vida Social para ${who.map(o => o.name).join(', ')}`, deck });
    return endTurn(s);
  }
  if (e.siHermanos) { const res = apply(s, p, e.siHermanos, c.t); fx(s, { kind: 'card', pid: p.id, title: c.t, text: c.d || '', eff: res, deck }); return endTurn(s); }
  const ee = Object.assign({}, e); delete ee.ayud;
  if (e.ayud && p.ayudante) ee.m = (ee.m || 0) + e.ayud;
  if (ee.otro || ee.spin) { s.pendingDeck = deck; }
  return resolve(s, p, ee, c.t, c.d);
}

function duelo(s, p, o, node) {
  const a = spinN(s), b = spinN(s); lucky(s, p, a); lucky(s, o, b);
  const pa = a, pb = b;
  const work = node.work; const title = work ? 'Licitación' : 'Duelo de certamen';
  fx(s, { kind: 'duel', a: { pid: p.id, n: a }, b: { pid: o.id, n: b } });
  let txt = work ? `${p.name} ofertó ${a}; ${o.name} ofertó ${b}.` : `${p.name} se sacó un ${nota(a, 5)}; ${o.name}, un ${nota(b, 5)}.`, eff;
  if (pa === pb) { apply(s, p, { k: 1 }, title); apply(s, o, { k: 1 }, title); eff = 'Empate: ambos +1 Conocimiento'; }
  else {
    const [w, l] = pa > pb ? [p, o] : [o, p];
    if (work) { apply(s, w, { m: 500 }, title); apply(s, l, { m: -100 }, title); eff = `${w.name} gana $500.000; ${l.name} pierde $100.000`; }
    else { apply(s, w, { k: 2 }, title); apply(s, l, { v: -1 }, title); eff = `${w.name} +2 Conocimiento; ${l.name} −1 Vida Social`; }
  }
  log(s, `${title}: ${txt}`, p.id);
  fx(s, { kind: 'card', pid: p.id, title: `${title}: ${p.name} vs ${o.name}`, text: txt, eff, duel: [p.id, o.id, a, b] });
  endTurn(s);
}

function doChoose(s, p, val) {
  const P = s.pending; s.pending = null;
  const opt = P.options.find(o => o.id === val);
  fx(s, { kind: 'chose', pid: p.id, title: P.title, label: opt ? opt.label : val });
  switch (P.choice) {
    case 'compra': {
      const E = EVENTOS[P.ctx.kind];
      if (val === 'si') { const res = apply(s, p, E.compra.e, E.name); fx(s, { kind: 'card', pid: p.id, title: E.compra.si, text: E.name, eff: res }); }
      else log(s, `${p.name}: ${E.compra.no.toLowerCase()}.`, p.id);
      return continueTurn(s, p);
    }
    case 'via':
      p.via = val;
      if (val === 'paes') apply(s, p, { k: 2 }, 'PAES');
      else { p.pos = BOARD.conv; apply(s, p, { m: CFG.conv.m, k: CFG.conv.k }, 'convalidación'); log(s, `${p.name} entra por convalidación y parte en el segundo semestre.`, p.id); fx(s, { kind: 'move', pid: p.id, path: [BOARD.start, BOARD.conv] }); }
      return ask(s, 'fin');
    case 'fin':
      if (val === 'beca') { s.pending = { kind: 'spin', reason: 'beca', label: `Postular a la beca (${CFG.becaMin}+)` }; return; }
      p.fin = val; if (val === 'familia') apply(s, p, { m: CFG.familiaExtra }, 'familia');
      log(s, `${p.name} financia la carrera: ${{ trabajando: 'trabajando', beca: 'con beca', familia: 'con su familia' }[val]}.`, p.id);
      s.pending = { kind: 'spin', reason: 'move', label: 'Girar la ruleta' }; return;
    case 'forkM': case 'forkT': {
      const fork = NODE(p.pos);
      const nextId = fork.next.find(id => NODE(id).branch === val);
      if (P.choice === 'forkM') {
        p.mencion = val; log(s, `${p.name} eligió la mención ${MENCIONES[val].name} (${MENCIONES[val].rama}).`, p.id);
        const mates = s.players.filter(o => o !== p && o.mencion === val);
        if (mates.length) { for (const o of [p, ...mates]) apply(s, o, { k: 1, v: 1 }, 'grupo de estudio'); fx(s, { kind: 'card', pid: p.id, title: 'Grupo de estudio', text: `${p.name} se une a ${mates.map(o => o.name).join(', ')} en ${MENCIONES[val].name}.`, eff: 'Todos +1 Conocimiento, +1 Vida Social', good: true }); }
      } else { p.titulo = val; log(s, `${p.name} va por ${val === 'memoria' ? 'la memoria' : 'el magíster'}.`, p.id); }
      p.pos = nextId; const path = [fork.id, nextId]; const steps = (P.ctx.remaining || 1) - 1;
      const nn = NODE(nextId);
      if (isStop(p, nn) || steps <= 0) { fx(s, { kind: 'move', pid: p.id, path }); return land(s, p, nn, isStop(p, nn) ? steps : 0); }
      return move(s, p, steps, path);
    }
    case 'guia': p.guia = val; log(s, `${p.name} eligió a ${val} como profe guía.`, p.id); return P.ctx.carry ? move(s, p, P.ctx.carry) : endTurn(s);
    case 'pega': p.pega = val; log(s, `${p.name} entró a trabajar en ${PEGAS[val].name}.`, p.id); fx(s, { kind: 'card', pid: p.id, title: PEGAS[val].name, text: '¡Primera pega!', eff: PEGAS[val].perk || '', good: true }); return P.ctx.carry ? move(s, p, P.ctx.carry) : endTurn(s);
    case 'decision': {
      const k = P.ctx.kind;
      if (val === 'si') { p[k] = true; const e = { pareja: { v: 3 }, mascota: { v: 2 }, hermanos: { v: 2 }, casa: { v: CFG.casa.v, m: CFG.casa.m } }[k]; const res = apply(s, p, e, { pareja: 'pololeando', mascota: 'nueva mascota', hermanos: 'roomies con tus hermanos', casa: 'casa propia' }[k]); fx(s, { kind: 'card', pid: p.id, title: P.title, text: 'Dijiste que sí.', eff: res, good: true }); }
      else log(s, `${p.name} dijo que no: ${P.title.replace(/[¿?]/g, '').toLowerCase()}.`, p.id);
      return endTurn(s);
    }
    case 'dilema': {
      const d = DILEMAS[P.ctx.deck][P.ctx.idx]; const opt = d[val];
      log(s, `${p.name}: "${d.q}" → ${opt[0]}.`, p.id);
      return resolve(s, p, opt[1], opt[0], d.q);
    }
    case 'otro': {
      const o = s.players.find(x => x.id === val);
      if (P.ctx.grupal) { s.pending = { kind: 'spin', reason: 'grupal', label: 'Girar por el proyecto', ctx: { partner: o.id, node: P.ctx.grupal } }; log(s, `${p.name} hace ${NODE(P.ctx.grupal).name} con ${o.name}.`, p.id); return; }
      if (P.ctx.duelo) return duelo(s, p, o, NODE(P.ctx.duelo));
      const r1 = apply(s, p, P.ctx.eff.yo, P.title); const r2 = apply(s, o, P.ctx.eff.otro, P.title);
      fx(s, { kind: 'card', pid: p.id, title: P.title, text: `Con ${o.name}.`, eff: `${p.name}: ${r1 || 'sin efecto'} · ${o.name}: ${r2 || 'sin efecto'}` });
      return endTurn(s);
    }
  }
  endTurn(s);
}


// ---------- Eventos espontáneos ----------
// Se activan la primera vez que alguien llega a los Laboratorios (3.er año).
// "lento" = retrasa la partida; "rapido" = la acelera o no la afecta.
const EVENTOS = {
  paro: { name: 'Paro en la carrera', tipo: 'rapido' },
  cambioJefe: { name: 'Cambio de jefe de carrera', tipo: 'lento', max: 3 },
  tarea: { name: 'Tarea de modelación', tipo: 'lento' },
  gta: { name: 'Salió el GTA 6', tipo: 'rapido', compra: { q: '¿Comprar el GTA 6?', text: 'Cuesta $300.000. Ganas Vida Social, pero pierdes Conocimiento.', si: 'Comprarlo', no: 'No comprarlo', e: { m: -300, v: 2, k: -1 } } },
  pandemia: { name: 'Pandemia: clases online', tipo: 'rapido' },
  estallido: { name: 'Estallido social', tipo: 'lento' },
  congreso: { name: 'Profe en congreso', tipo: 'rapido' },
  sabatico: { name: 'Profe guía de sabático', tipo: 'lento' },
  terremoto: { name: 'Terremoto', tipo: 'lento' },
  aniversario: { name: 'Aniversario de la UdeC', tipo: 'rapido' },
  toma: { name: 'Toma de la Facultad', tipo: 'lento' },
  feria: { name: 'Feria laboral', tipo: 'rapido' },
  mundial: { name: 'Mundial', tipo: 'rapido', compra: { q: '¿Ver el partido en vez de estudiar?', text: 'Juega Chile. Ganas Vida Social, pero pierdes Conocimiento.', si: 'Ver el partido', no: 'Estudiar', e: { v: 2, k: -1 } } },
  temporal: { name: 'Temporal penquista', tipo: 'lento' },
  becaEx: { name: 'Beca de excelencia', tipo: 'rapido' },
  inflacion: { name: 'Alza del costo de la vida', tipo: 'rapido' },
};
const PROFES_ALTA_TODOS = ['Montalva', 'Cendoya', 'Calderón', 'Echaveguren', 'Merino', 'Link', 'Tudela'];

// distancia de cada casilla a la meta (para medir el avance)
const DIST = (() => {
  const d = {}; const N = BOARD.nodes; const fin = Object.keys(N).find(id => N[id].type === 'fin');
  d[fin] = 0; let changed = true;
  while (changed) { changed = false; for (const id in N) for (const nx of N[id].next) if (d[nx] !== undefined && (d[id] === undefined || d[nx] + 1 < d[id])) { d[id] = d[nx] + 1; changed = true; } }
  return d;
})();
const progreso = p => p.finished ? 1 : 1 - DIST[p.pos] / DIST[BOARD.start];
const estudiantes = s => s.players.filter(p => !p.finished && !p.pega);

// ¿Qué profes de exigencia alta les importan hoy a los jugadores? (filtros cercanos o profe guía)
function profesRelevantes(s) {
  const set = new Set();
  for (const p of estudiantes(s)) {
    if (p.guia && PROFES_ALTA_TODOS.includes(p.guia)) set.add(p.guia);
    let front = [p.pos], seen = new Set();
    for (let d = 0; d < 10 && front.length; d++) {
      const nx = [];
      for (const id of front) { if (seen.has(id)) continue; seen.add(id); const n = NODE(id); if (n.type === 'filtro' && !p.passed[id] && n.profe) for (const pr of PROFES_ALTA_TODOS) if (n.profe.includes(pr)) set.add(pr); nx.push(...n.next); }
      front = nx;
    }
  }
  return [...set];
}
const tesistas = s => s.players.filter(p => !p.finished && !p.pega && p.guia && ['memoria', 'magister'].includes(NODE(p.pos).lane));
const enFiltro = s => s.players.some(p => p.stuck && p.stuck.kind === 'filtro');
function roundStart(s) {
  // ingresos por trabajar: 10% del pago asignado
  for (const p of s.players) {
    if (p.finished) { if (p.pega) apply(s, p, { m: Math.round(sueldo(p, p.pega === 'emprende' ? 'consGeo' : p.pega, p.nivel) * CFG.pasivoSenior * s.ev.gob.mult / 10) * 10 }, 'sueldo de Senior'); continue; }
    let base = 0, why = '';
    if (p.pega) { base = p.pega === 'emprende' ? 1600 * CFG.sueldoMult * CFG.nivelSueldo[p.nivel] : sueldo(p, p.pega, p.nivel); why = 'sueldo de la ronda'; }
    else if (p.fin === 'trabajando') { base = CFG.pagoEstudio.trabajando; why = 'pega de estudiante'; }
    else if (p.fin === 'beca' && !p.becaLost) { base = CFG.pagoEstudio.beca; why = 'beca (mensualidad)'; }
    if (base) apply(s, p, { m: Math.round(base * CFG.sueldoRonda * s.ev.gob.mult / 10) * 10 }, why);
    if (act(s, 'estallido')) apply(s, p, { v: 1 }, 'asambleas y cabildos', true);
    if (act(s, 'pandemia') && p.pega) apply(s, p, { v: 1 }, 'teletrabajo', true);
  }
  if (s.acc.length) fx(s, { kind: 'income', round: s.round });
  // fin de eventos con duración
  for (const k of Object.keys(s.ev.act)) if (s.round === s.ev.act[k].end) { fx(s, { kind: 'event', key: k, ended: true, title: `Terminó: ${EVENTOS[k].name}`, text: 'Todo vuelve a la normalidad.' }); s.ev.hist.push({ round: s.round, title: `Terminó: ${EVENTOS[k].name}`, text: 'Todo vuelve a la normalidad.' }); delete s.ev.act[k]; }
  if (s.ev.tarea && s.round - s.ev.tarea.r0 >= 3) tareaEnd(s);
  // activación y sorteo
  if (!s.ev.on && s.players.some(p => p.finished || ['labs', 'facultad', 'consultora'].includes(NODE(p.pos).zone))) { s.ev.on = true; log(s, 'Desde ahora pueden ocurrir eventos espontáneos.'); }
  if (!s.ev.on || s.ev.tarea || s.phase !== 'play') return;
  const avg = s.players.reduce((a, p) => a + progreso(p), 0) / s.players.length;
  const ritmo = avg / Math.min(1, s.round / CFG.ev.rondasEsperadas);
  const lento = ritmo < 0.9, rapido = ritmo > 1.1;
  const prob = lento ? CFG.ev.probLenta : rapido ? CFG.ev.probRapida : CFG.ev.prob;
  if (rngNext(s) >= prob) return;
  const pool = [];
  const lleno = s.ev.count >= CFG.ev.maxPorPartida; // tope de 4 eventos distintos (el cambio de jefe va aparte)
  const mitad = avg >= 0.35 && avg <= 0.65;
  for (const [k, E] of Object.entries(EVENTOS)) {
    const usados = s.ev.used.filter(x => x === k).length;
    if (usados >= (E.max || 1) || s.ev.act[k]) continue;
    if (k !== 'cambioJefe' && lleno) continue;
    if (k === 'cambioJefe') {
      if (s.round - s.ev.lastJefe < 4) continue; // al menos 4 rondas entre cambios
      if (usados === 0 && mitad) { if (estudiantes(s).length) for (let i = 0; i < 6; i++) pool.push(k); continue; } // el primer cambio es más probable a mitad de carrera
    }
    if (lento && E.tipo === 'lento') continue;
    if (['cambioJefe', 'paro', 'pandemia', 'estallido', 'congreso', 'becaEx', 'tarea', 'toma'].includes(k) && !estudiantes(s).length) continue;
    // solo eventos que afecten a alguien según dónde está en el tablero
    if (k === 'congreso' && !profesRelevantes(s).length) continue;
    if (k === 'sabatico' && !tesistas(s).length) continue;
    if (k === 'becaEx' && estudiantes(s).length < 2) continue;
    if (k === 'terremoto' && !s.players.some(p => !p.finished && (p.mencion === 'est' || p.mencion === 'geo' || !p.pega))) continue;
    if (k === 'temporal' && s.players.filter(p => !p.finished).length < 2) continue;
    if ((k === 'paro' || k === 'pandemia') && !enFiltro(s) && !profesRelevantes(s).length && estudiantes(s).length < 2) continue;
    if (k === 'inflacion' && !s.players.some(p => !p.finished && p.pega)) continue;
    if (k === 'toma' && !s.players.some(p => !p.finished && !p.pega && NODE(p.pos).zone === 'facultad')) continue;
    const w = (rapido && E.tipo === 'lento' ? 2 : 1) * (k === 'sabatico' ? 5 : 1); // el sabático solo puede pasar en una ventana corta
    for (let i = 0; i < w; i++) pool.push(k);
  }
  if (!pool.length) return;
  startEvent(s, pool[pickI(s, pool.length)]);
}

function startEvent(s, k) {
  if (k !== 'cambioJefe') s.ev.count++; else s.ev.lastJefe = s.round;
  s.ev.used.push(k);
  const E = EVENTOS[k]; const r = s.round; let text = '', d;
  switch (k) {
    case 'paro': d = 1 + pickI(s, 3); s.ev.act.paro = { end: r + d }; text = `Por ${d} ronda${d > 1 ? 's' : ''}: los filtros bajan 1 de dificultad y la Vida Social de las casillas se duplica.`; break;
    case 'cambioJefe': {
      const antes = s.ev.jefe;
      s.ev.jefe = antes === 'Silva' ? (pickI(s, 2) ? 'Cendoya' : 'Merino') : 'Silva';
      const up = pickI(s, 2) === 1; s.ev.gob = { mult: up ? 1 + CFG.gobierno : 1 - CFG.gobierno, name: up ? 'Gobierno expansivo' : 'Gobierno austero' };
      text = s.ev.jefe === 'Silva'
        ? `Vuelve Silva como jefe de carrera: la dificultad vuelve a la normalidad. Además cambia el gobierno: ${s.ev.gob.name}, los pagos ${up ? 'suben' : 'bajan'} ${CFG.gobierno * 100}%.`
        : `${s.ev.jefe} reemplaza a ${antes}: los filtros suben 1 de dificultad y los profes de exigencia baja pasan a media por el resto de la partida. Además cambia el gobierno: ${s.ev.gob.name}, los pagos ${up ? 'suben' : 'bajan'} ${CFG.gobierno * 100}%.`;
      break;
    }
    case 'tarea': s.ev.tarea = { r0: r, in: estudiantes(s).map(p => p.id), best: null }; text = 'Todos los que estudian quedan atrapados modelando. Para salir hay que sacar más de 8 esta ronda, más de 6 la siguiente y más de 4 la última. Quien sale avanza lo que sacó. El número más alto gana +3 Conocimiento.'; break;
    case 'gta': case 'mundial': s.ev.buy = { kind: k, left: s.players.filter(p => !p.finished).map(p => p.id) }; text = k === 'gta' ? 'En su próximo turno, cada jugador decide si compra el juego por $300.000: +2 Vida Social y −1 Conocimiento.' : 'En su próximo turno, cada jugador decide si ve el partido: +2 Vida Social y −1 Conocimiento.'; break;
    case 'pandemia': s.ev.act.pandemia = { end: r + 2 }; text = 'Por 2 rondas: pruebas en casa (filtros −1), no se gana Vida Social en las casillas y los que trabajan ganan +1 Vida Social por ronda con el teletrabajo.'; break;
    case 'estallido': d = 1 + pickI(s, 2); s.ev.act.estallido = { end: r + d }; text = `Por ${d} ronda${d > 1 ? 's' : ''}: se suspende el semestre y los que estudian avanzan la mitad de lo que sacan. Todos ganan +1 Vida Social por ronda.`; break;
    case 'congreso': { const rel = profesRelevantes(s); const prof = rel[pickI(s, rel.length)]; s.ev.act.congreso = { end: r + 2, prof }; text = `${prof} se va 2 rondas a un congreso: sus filtros bajan 2 de dificultad, pero sus tesistas no pueden defender hasta que vuelva.`; break; }
    case 'terremoto': {
      s.ev.act.terremoto = { end: r + 1 };
      for (const p of s.players) if (!p.finished) { if (['est', 'geo'].includes(p.mencion)) apply(s, p, { m: 500, k: 2 }, 'peritajes'); else apply(s, p, { m: -100 }, 'arreglos'); if (!p.pega) apply(s, p, { skip: 1 }, 'universidad cerrada'); }
      text = 'Los de Estructuras y Geotecnia hacen peritajes: +$500.000 y +2 Conocimiento. Los demás pagan $100.000 en arreglos. La universidad cierra: los que estudian pierden un turno.'; break;
    }
    case 'aniversario': s.ev.act.aniversario = { end: r + 1 }; for (const p of s.players) if (!p.finished) apply(s, p, { v: 1 }, 'aniversario', true); text = 'Todos ganan +1 Vida Social y, durante esta ronda, la Vida Social de las casillas se duplica.'; break;
    case 'toma': for (const p of s.players) if (!p.finished && !p.pega && NODE(p.pos).zone === 'facultad') apply(s, p, { skip: 1, v: 1 }, 'toma'); text = 'Quienes están en la Facultad pierden su próximo turno, pero ganan +1 Vida Social.'; break;
    case 'feria': { const res = []; for (const p of s.players) if (!p.finished) { const n = spinN(s); if (n >= 6) apply(s, p, { c: 1 }, `feria laboral (${n})`); res.push(`${p.name}: ${n}${n >= 6 ? ' ✓' : ''}`); } text = 'Todos giran: con 6 o más consiguen un contacto. ' + res.join(' · '); break; }
    case 'sabatico': {
      const t = tesistas(s); const v = t[pickI(s, t.length)]; const prof = v.guia;
      const afect = s.players.filter(p => p.guia === prof && tesistas(s).includes(p));
      s.ev.act.sabatico = { end: r + 2, prof };
      text = `Justo ahora ${prof} se fue de año sabático. ${afect.map(p => p.name).join(' y ')} ${afect.length > 1 ? 'tienen' : 'tiene'} que esperar 2 rondas para poder defender (mientras, siguen escribiendo y ganan +1 Conocimiento por turno de espera).`;
      break;
    }
    case 'temporal': s.ev.act.temporal = { end: r + 1 }; for (const p of s.players) if (!p.finished && p.mencion === 'hid') apply(s, p, { k: 1 }, 'medición de caudales'); text = 'Esta ronda todos avanzan 1 casilla menos. Los de Hidráulica ganan +1 Conocimiento midiendo caudales.'; break;
    case 'inflacion': {
      const t = s.players.filter(p => !p.finished && p.pega);
      for (const p of t) apply(s, p, { m: -800 }, 'alza del costo de la vida');
      text = t.length ? `Subieron el arriendo, la luz y el supermercado: los que trabajan pagan $800.000 (${t.map(p => p.name).join(', ')}).` : 'Subieron los precios, pero como nadie trabaja todavía, por ahora no afecta a nadie.';
      break;
    }
    case 'becaEx': {
      const st = estudiantes(s); const max = Math.max(...st.map(p => p.k)); const top = st.filter(p => p.k === max);
      if (top.length === 1) { apply(s, top[0], { m: 500 }, 'beca de excelencia'); text = `${top[0].name} tiene más Conocimiento entre los que estudian y gana $500.000.`; }
      else text = `Hay empate en Conocimiento (${top.map(p => p.name).join(', ')}): la beca queda desierta.`;
      break;
    }
  }
  log(s, `Evento: ${E.name}. ${text}`);
  s.ev.hist.push({ round: s.round, title: E.name, text });
  fx(s, { kind: 'event', key: k, title: E.name, text });
}

const tareaX = s => [8, 6, 4][Math.min(2, s.round - s.ev.tarea.r0)];
function tareaSpin(s, p, n) {
  const T = s.ev.tarea; const x = tareaX(s);
  if (!T.best || n > T.best.n) T.best = { pid: p.id, n };
  if (n > x) {
    T.in = T.in.filter(id => id !== p.id);
    log(s, `${p.name} sacó ${n} y terminó la tarea de modelación.`, p.id);
    fx(s, { kind: 'card', pid: p.id, title: '¡Tarea entregada!', text: `Sacaste ${n} (necesitabas más de ${x}).` + (p.stuck ? '' : ` Avanzas ${n}.`), good: true });
    if (!T.in.length) tareaEnd(s);
    if (p.stuck) return endTurn(s);
    return move(s, p, n);
  }
  log(s, `${p.name} sacó ${n}: sigue modelando.`, p.id);
  fx(s, { kind: 'card', pid: p.id, title: 'Sigues modelando', text: `Sacaste ${n}, necesitabas más de ${x}. La próxima ronda es más fácil.` });
  endTurn(s);
}
function tareaEnd(s) {
  const T = s.ev.tarea; if (!T) return; s.ev.tarea = null;
  if (T.best) { const w = s.players.find(p => p.id === T.best.pid); apply(s, w, { k: 3 }, 'mejor modelo'); const text = `El mejor modelo fue de ${w.name} (sacó ${T.best.n}): +3 Conocimiento.`; s.ev.hist.push({ round: s.round, title: 'Terminó la tarea de modelación', text }); fx(s, { kind: 'event', key: 'tarea', ended: true, title: 'Terminó la tarea de modelación', text }); }
}

// ---------- Puntaje ----------
function score(s) {
  const L = s.leaders || {};
  return s.players.map(p => {
    const plata = Math.floor(Math.max(0, p.m) / CFG.plataPorPunto);
    const led = ['m', 'k', 'v'].filter(k => L[k] === p.id);
    const bon = (s.firstSenior === p.id ? CFG.bonoPrimero : 0) + (p.crown ? CFG.bonoCorona : 0) + led.length * CFG.bonoLider + (led.length >= 2 ? CFG.bonoMulti : 0);
    const det = [];
    if (s.firstSenior === p.id) det.push({ i: '🏁', l: 'Primero en llegar a Ing. Senior', v: CFG.bonoPrimero });
    if (p.crown) det.push({ i: '👑', l: 'Mechón de Oro', v: CFG.bonoCorona });
    for (const k of led) det.push({ i: { m: '💰', k: '📚', v: '🎉' }[k], l: `Líder en ${{ m: 'Plata', k: 'Conocimiento', v: 'Vida Social' }[k]}`, v: CFG.bonoLider });
    if (led.length >= 2) det.push({ i: '⭐', l: 'Lidera dos o más categorías', v: CFG.bonoMulti });
    return { id: p.id, name: p.name, color: p.color, token: p.token, crown: p.crown, plata, m: p.m, k: p.k, v: p.v, bonos: bon, det, led, total: plata + p.k + p.v + bon, finished: p.finished, nivel: p.nivel };
  }).sort((a, b) => b.total - a.total);
}

// ---------- Bot (dificultad media) ----------
function botAction(s) {
  const P = s.pending; if (!P) return null; const p = cur(s);
  if (P.kind === 'spin') return { type: 'spin', pid: p.id };
  const o = P.options; const h = (s.seq * 2654435761 + s.rng + s.turn * 97) >>> 0; const r = () => rngNext({ rng: h });
  let v;
  switch (P.choice) {
    case 'via': v = r() < 0.6 ? 'paes' : 'conv'; break;
    case 'fin': v = o[h % o.length].id; break;
    case 'forkM': { const mates = o.find(x => x.sub.startsWith('Grupo')); v = mates && r() < 0.5 ? mates.id : o[h % o.length].id; break; }
    case 'forkT': v = r() < 0.35 ? 'magister' : 'memoria'; break;
    case 'pega': v = o.map(x => x.id).sort((a, b) => (PEGAS[b].base || 1500) - (PEGAS[a].base || 1500))[0]; break;
    case 'decision': v = r() < 0.5 ? 'si' : 'no'; break;
    case 'dilema': case 'compra': v = r() < 0.5 ? (P.choice === 'dilema' ? 'a' : 'si') : (P.choice === 'dilema' ? 'b' : 'no'); break;
    default: v = o[h % o.length].id;
  }
  return { type: 'choose', value: v, pid: p.id };
}

return { EVENTOS, DIST, progreso, TOKENS, COLORS, CFG, BOARD, NODE, PEGAS, MENCIONES, PROFES_MEN, GUIA, LIDER, newGame, reduce, botAction, score, bono, fmt, tierOf, umbralFiltro };
})();
if (typeof module !== 'undefined') module.exports = GAME;
