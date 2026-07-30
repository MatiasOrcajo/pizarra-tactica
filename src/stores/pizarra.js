import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

/**
 * Clave usada en localStorage para el autoguardado de la pizarra.
 * Cada cambio en los elementos se persiste automáticamente.
 */
const STORAGE_KEY = 'pizarra-tactica-autosave'

/**
 * DEFAULT_PLAYERS — Formación inicial 4-4-2 (22 jugadores).
 *
 * Se colocan 11 jugadores por equipo en el espacio virtual 1050×680:
 *   - Equipo rojo (#e74c3c): ataca hacia la derecha (portería en X=1050).
 *   - Equipo azul  (#3498db): ataca hacia la izquierda (portería en X=0).
 *   - Porteros: amarillo (#f1c40f) y verde (#2ecc71).
 *
 * Cada jugador es un objeto con:
 *   type:         'player'
 *   x, y:         posición en el espacio virtual
 *   playerNumber: dorsal (1-99)
 *   playerName:   nombre opcional (ej. 'POR' para el arquero)
 *   color:        color del círculo
 */
const DEFAULT_PLAYERS = [
  // --- Equipo rojo (ataca → derecha) ---
  { type: 'player', x: 30,  y: 340, playerNumber: 1,  playerName: 'POR', color: '#f1c40f' },
  { type: 'player', x: 200, y: 560, playerNumber: 2,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 170, y: 420, playerNumber: 4,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 170, y: 260, playerNumber: 5,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 200, y: 120, playerNumber: 3,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 380, y: 530, playerNumber: 8,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 350, y: 340, playerNumber: 6,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 380, y: 150, playerNumber: 10, playerName: '', color: '#e74c3c' },
  { type: 'player', x: 550, y: 560, playerNumber: 7,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 570, y: 340, playerNumber: 9,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 550, y: 120, playerNumber: 11, playerName: '', color: '#e74c3c' },

  // --- Equipo azul (ataca ← izquierda) ---
  { type: 'player', x: 660, y: 120, playerNumber: 7,  playerName: '', color: '#3498db' },
  { type: 'player', x: 650, y: 340, playerNumber: 9,  playerName: '', color: '#3498db' },
  { type: 'player', x: 660, y: 560, playerNumber: 11, playerName: '', color: '#3498db' },
  { type: 'player', x: 830, y: 530, playerNumber: 8,  playerName: '', color: '#3498db' },
  { type: 'player', x: 860, y: 340, playerNumber: 6,  playerName: '', color: '#3498db' },
  { type: 'player', x: 830, y: 150, playerNumber: 10, playerName: '', color: '#3498db' },
  { type: 'player', x: 990, y: 560, playerNumber: 2,  playerName: '', color: '#3498db' },
  { type: 'player', x: 1020, y: 420, playerNumber: 4,  playerName: '', color: '#3498db' },
  { type: 'player', x: 1020, y: 260, playerNumber: 5,  playerName: '', color: '#3498db' },
  { type: 'player', x: 990, y: 120, playerNumber: 3,  playerName: '', color: '#3498db' },
  { type: 'player', x: 1020, y: 340, playerNumber: 1,  playerName: 'POR', color: '#2ecc71' },
]

/**
 * usePizarraStore — Store Pinia que gestiona todo el estado de la pizarra.
 *
 * Estado persistente (autoguardado en localStorage):
 *   elements[]     → lista de elementos (jugadores, flechas, zonas, líneas, texto)
 *
 * Estado de la herramienta activa:
 *   selectedTool   → 'player' | 'arrow' | 'line' | 'zone' | 'text'
 *   selectedColor  → color del siguiente elemento
 *   playerNumber   → dorsal del siguiente jugador
 *   playerName     → nombre del siguiente jugador
 *   fontSize       → tamaño de fuente para textos
 *   strokeWidth    → grosor de trazo para flechas/líneas/zonas
 */
export const usePizarraStore = defineStore('pizarra', () => {
  // --- Recuperar datos guardados de la sesión anterior ---
  const saved = localStorage.getItem(STORAGE_KEY)
  const initialElements = saved ? JSON.parse(saved) : []

  // ======================
  // ESTADO REACTIVO
  // ======================

  /** Lista de todos los elementos sobre la cancha */
  const elements = ref(initialElements)

  /** Herramienta seleccionada en el toolbar */
  const selectedTool = ref('player')

  /** Color para el próximo elemento creado */
  const selectedColor = ref('#e74c3c')

  /** Dorsal para el próximo jugador (por defecto 10) */
  const playerNumber = ref(10)

  /** Nombre opcional para el próximo jugador */
  const playerName = ref('')

  /** Tamaño de fuente para textos libres */
  const fontSize = ref(20)

  /** Grosor del trazo para flechas, líneas y zonas */
  const strokeWidth = ref(3)

  // ======================
  // AUTOGUARDADO
  // ======================

  /**
   * Cada vez que cambia la lista de elementos, se guarda
   * automáticamente en localStorage como JSON.
   */
  watch(
    elements,
    (val) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    },
    { deep: true }
  )

  // ======================
  // GENERADOR DE IDs
  // ======================

  /**
   * Contador incremental para IDs únicos.
   * Si hay elementos previos (cargados de localStorage), comienza
   * desde el máximo ID encontrado + 1. Si no, arranca en 100.
   */
  let nextId = elements.value.length
    ? elements.value.reduce((max, el) => Math.max(max, el.id || 0), 0) + 1
    : 100

  // ======================
  // CRUD DE ELEMENTOS
  // ======================

  /** Agrega un nuevo elemento a la pizarra y devuelve el elemento creado. */
  function addElement(el) {
    const element = { ...el, id: nextId++ }
    elements.value.push(element)
    return element
  }

  /** Actualiza propiedades de un elemento existente (por ID). */
  function updateElement(id, changes) {
    const index = elements.value.findIndex((el) => el.id === id)
    if (index !== -1) {
      elements.value[index] = { ...elements.value[index], ...changes }
    }
  }

  /** Elimina un elemento por su ID. */
  function removeElement(id) {
    elements.value = elements.value.filter((el) => el.id !== id)
  }

  /** Borra todos los elementos de la pizarra. */
  function clearAll() {
    elements.value = []
  }

  /**
   * Restaura la formación por defecto (DEFAULT_PLAYERS).
   * Reinicia el contador de IDs a 100.
   */
  function resetToDefaults() {
    nextId = 100
    elements.value = DEFAULT_PLAYERS.map((p, i) => ({ ...p, id: i }))
  }

  // ======================
  // EXPORTAR / IMPORTAR
  // ======================

  /**
   * Exporta la pizarra actual como archivo JSON descargable.
   * Incluye versión, fecha de exportación y la lista de elementos.
   */
  function exportToJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      elements: elements.value,
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tactica_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Importa elementos desde un string JSON.
   * Reemplaza completamente los elementos actuales.
   */
  function importFromJSON(jsonString) {
    const data = JSON.parse(jsonString)
    if (data.elements && Array.isArray(data.elements)) {
      elements.value = data.elements
      nextId = elements.value.reduce((max, el) => Math.max(max, el.id || 0), 0) + 1
    }
  }

  // ======================
  // RETORNO PÚBLICO
  // ======================

  return {
    elements,
    selectedTool,
    selectedColor,
    playerNumber,
    playerName,
    fontSize,
    strokeWidth,
    addElement,
    updateElement,
    removeElement,
    clearAll,
    resetToDefaults,
    exportToJSON,
    importFromJSON,
  }
})
