import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'

/**
 * Clave usada en localStorage para el autoguardado completo
 * (elementos + configuración de equipos).
 */
const STORAGE_KEY = 'pizarra-tactica-autosave'
const HISTORY_LIMIT = 100
const NEUTRAL_LINE_COLOR = '#ffffff'
const CENTER_SPOT = { x: 525, y: 340 }

/**
 * FORMATIONS — Plantillas de posiciones para 11 jugadores.
 *
 * Cada clave es el nombre de la formación (ej. '4-4-2').
 * El valor es un array de 11 objetos { x, y } en el espacio
 * virtual 1050×680, orientado para el Equipo 1 (ataca → derecha).
 * Al aplicarse, sus coordenadas X se expanden hasta campo rival; el Equipo 2
 * recibe el espejo de esas posiciones para atacar hacia la izquierda.
 *
 * Orden del array: [0] = GK, [1..10] = jugadores de campo.
 */
const FORMATIONS = {
  '4-4-2': [
    { x: 30,  y: 340 },   // GK
    { x: 170, y: 550 },   // RB
    { x: 170, y: 420 },   // RCB
    { x: 170, y: 260 },   // LCB
    { x: 170, y: 130 },   // LB
    { x: 360, y: 520 },   // RM
    { x: 380, y: 380 },   // RCM
    { x: 380, y: 300 },   // LCM
    { x: 360, y: 160 },   // LM
    { x: 510, y: 440 },   // RS
    { x: 510, y: 240 },   // LS
  ],

  '4-3-3': [
    { x: 30,  y: 340 },   // GK
    { x: 170, y: 550 },
    { x: 170, y: 420 },
    { x: 170, y: 260 },
    { x: 170, y: 130 },
    { x: 360, y: 480 },   // RCM
    { x: 380, y: 340 },   // CM
    { x: 360, y: 200 },   // LCM
    { x: 510, y: 550 },   // RW
    { x: 520, y: 340 },   // ST
    { x: 510, y: 130 },   // LW
  ],

  '5-3-2': [
    { x: 30,  y: 340 },
    { x: 150, y: 580 },
    { x: 150, y: 470 },
    { x: 170, y: 340 },
    { x: 150, y: 210 },
    { x: 150, y: 100 },
    { x: 330, y: 500 },
    { x: 360, y: 340 },
    { x: 330, y: 180 },
    { x: 480, y: 440 },
    { x: 480, y: 240 },
  ],

  '4-2-3-1': [
    { x: 30,  y: 340 },
    { x: 170, y: 550 },
    { x: 170, y: 420 },
    { x: 170, y: 260 },
    { x: 170, y: 130 },
    { x: 320, y: 440 },   // CDM-R
    { x: 320, y: 240 },   // CDM-L
    { x: 440, y: 520 },   // RAM
    { x: 460, y: 340 },   // CAM
    { x: 440, y: 160 },   // LAM
    { x: 550, y: 340 },   // ST
  ],

  '3-5-2': [
    { x: 30,  y: 340 },
    { x: 150, y: 500 },
    { x: 170, y: 340 },
    { x: 150, y: 180 },
    { x: 320, y: 580 },
    { x: 350, y: 440 },
    { x: 370, y: 340 },
    { x: 350, y: 240 },
    { x: 320, y: 100 },
    { x: 500, y: 440 },
    { x: 500, y: 240 },
  ],

  '4-1-4-1': [
    { x: 30,  y: 340 },
    { x: 170, y: 550 },
    { x: 170, y: 420 },
    { x: 170, y: 260 },
    { x: 170, y: 130 },
    { x: 280, y: 340 },   // CDM
    { x: 400, y: 530 },
    { x: 420, y: 400 },
    { x: 420, y: 280 },
    { x: 400, y: 150 },
    { x: 530, y: 340 },   // ST
  ],

  '3-4-3': [
    { x: 30,  y: 340 },
    { x: 150, y: 500 },
    { x: 170, y: 340 },
    { x: 150, y: 180 },
    { x: 340, y: 550 },
    { x: 360, y: 400 },
    { x: 360, y: 280 },
    { x: 340, y: 130 },
    { x: 510, y: 550 },
    { x: 520, y: 340 },
    { x: 510, y: 130 },
  ],
}

/** Dorsales por defecto para cada posición (1 = GK, luego de campo) */
const DEFAULT_NUMBERS = [1, 2, 4, 5, 3, 8, 6, 10, 7, 9, 11]

// Las plantillas base terminan cerca del mediocampo. Al desplegarlas se
// expanden hasta campo rival para representar un equipo en fase de ataque.
const ATTACK_ORIGIN_X = 30
const ATTACK_END_X = 850
const FORMATION_REFERENCE_END_X = 550

function positionForTeam(pos, teamId) {
  const attackingX = ATTACK_ORIGIN_X +
    (pos.x - ATTACK_ORIGIN_X) * (ATTACK_END_X - ATTACK_ORIGIN_X) /
    (FORMATION_REFERENCE_END_X - ATTACK_ORIGIN_X)

  return {
    x: teamId === 1 ? attackingX : 1050 - attackingX,
    y: pos.y,
  }
}

/**
 * Crea los 11 jugadores de un equipo según su formación actual.
 * Cada jugador recibe un id único a partir de startId.
 *
 * @param {number} teamId  — 1 para Equipo 1, 2 para Equipo 2
 * @param {object} team    — configuración del equipo (name, colors, formation)
 * @param {number} startId — primer id a asignar (se usa startId .. startId+10)
 * @returns {Array<object>} — 11 objetos player con id y teamId
 */
function generateTeamPlayers(teamId, team, startId = 0) {
  const positions = FORMATIONS[team.formation] || FORMATIONS['4-4-2']

  return positions.map((pos, i) => {
    const position = positionForTeam(pos, teamId)
    return {
      id: startId + i,
      type: 'player',
      x: position.x,
      y: position.y,
      teamId,
      playerNumber: DEFAULT_NUMBERS[i] || i + 1,
      playerName: i === 0 ? 'POR' : '',
    }
  })
}

/** Crea el balón en el punto central del campo virtual. */
function createBall(id) {
  return { id, type: 'ball', x: CENTER_SPOT.x, y: CENTER_SPOT.y }
}

/** Configuración por defecto de los equipos */
function defaultTeams() {
  return {
    team1: {
      name: 'Equipo 1',
      primaryColor: '#e74c3c',
      secondaryColor: '#ffffff',
      formation: '4-4-2',
    },
    team2: {
      name: 'Equipo 2',
      primaryColor: '#3498db',
      secondaryColor: '#ffffff',
      formation: '4-4-2',
    },
  }
}

/**
 * usePizarraStore — Store Pinia que gestiona todo el estado de la pizarra.
 *
 * Persiste en localStorage: elementos + configuración de equipos.
 */
export const usePizarraStore = defineStore('pizarra', () => {
  // --- Recuperar datos guardados ---
  const savedRaw = localStorage.getItem(STORAGE_KEY)
  const saved = savedRaw ? JSON.parse(savedRaw) : null

  // ======================
  // EQUIPOS
  // ======================

  /**
   * Configuración de los dos equipos.
   * Cada equipo tiene: name, primaryColor, secondaryColor, formation.
   */
  const teams = reactive(saved?.teams || defaultTeams())

  // ======================
  // ELEMENTOS
  // ======================

  /** Lista de todos los elementos sobre la cancha (jugadores, flechas, etc.) */
  const elements = ref(saved?.elements || [])

  // Migración: asegurar que TODOS los elementos tengan un id numérico único.
  // Sin esto, jugadores cargados de formaciones antiguas quedan con id=undefined
  // y al seleccionar uno se marcan TODOS (undefined === undefined).
  {
    let maxId = -1
    elements.value = elements.value.map((el, i) => {
      if (el.id == null || Number.isNaN(Number(el.id))) {
        return { ...el, id: i }
      }
      maxId = Math.max(maxId, Number(el.id))
      return el
    })
    // Si hubo colisiones de id (varios sin id que recibieron i), reasignamos todos
    const ids = elements.value.map((el) => el.id)
    const hasDupes = ids.length !== new Set(ids).size
    if (hasDupes) {
      elements.value = elements.value.map((el, i) => ({ ...el, id: i }))
    }
  }

  /** ID del elemento actualmente seleccionado (null = ninguno) */
  const selectedElementId = ref(null)

  /** Elemento seleccionado (computado desde elements + selectedElementId) */
  const selectedElement = computed(() => {
    if (selectedElementId.value === null || selectedElementId.value === undefined) return null
    return elements.value.find((el) => el.id === selectedElementId.value) || null
  })

  // ======================
  // HERRAMIENTA ACTIVA
  // ======================

  const selectedTool = ref('free')
  const selectedColor = ref('#e74c3c')
  const playerNumber = ref(10)
  const playerName = ref('')
  const fontSize = ref(20)
  const strokeWidth = ref(4)

  /** Equipo al que se asignan los jugadores creados manualmente (1 o 2) */
  const activeTeam = ref(1)

  // ======================
  // ZONAS TÁCTICAS
  // ======================

  /** Bandera para mostrar/ocultar la rejilla de 18 zonas tácticas. */
  const showTacticalZones = ref(false)

  /** Alterna la visibilidad de la superposición de zonas tácticas. */
  function toggleTacticalZones() {
    showTacticalZones.value = !showTacticalZones.value
  }

  // ======================
  // ESPEJO HORIZONTAL
  // ======================

  /** Bandera que indica si la cancha está reflejada horizontalmente (equipos cambiados de lado). */
  const mirrorHorizontal = ref(saved?.mirrorHorizontal ?? false)

  /**
   * Rotación 180° de todos los elementos respecto al centro del campo (525, 340),
   * simulando el cambio de lado real del fútbol. Intercambia teamId de jugadores
   * y nombres/colores/formaciones de equipos para mantener la coherencia visual.
   */
  function toggleMirrorHorizontal() {
    recordHistory()

    const virtualW = 1050
    const virtualH = 680

    // Rotar 180°: invertir X e Y de todos los elementos e intercambiar teamId de jugadores
    elements.value = elements.value.map((el) => {
      const mirrored = { ...el }
      mirrored.x = virtualW - el.x
      mirrored.y = virtualH - el.y
      if (el.x2 != null) mirrored.x2 = virtualW - el.x2
      if (el.y2 != null) mirrored.y2 = virtualH - el.y2
      if (el.cx != null) mirrored.cx = virtualW - el.cx
      if (el.cy != null) mirrored.cy = virtualH - el.cy
      if (el.type === 'player') {
        mirrored.teamId = el.teamId === 1 ? 2 : 1
      }
      return mirrored
    })

    // Intercambiar configuración completa de equipos (nombres, colores y formaciones)
    const tempName = teams.team1.name
    const tempPrimary = teams.team1.primaryColor
    const tempSecondary = teams.team1.secondaryColor
    const tempFormation = teams.team1.formation
    teams.team1.name = teams.team2.name
    teams.team1.primaryColor = teams.team2.primaryColor
    teams.team1.secondaryColor = teams.team2.secondaryColor
    teams.team1.formation = teams.team2.formation
    teams.team2.name = tempName
    teams.team2.primaryColor = tempPrimary
    teams.team2.secondaryColor = tempSecondary
    teams.team2.formation = tempFormation

    syncLineColors()

    mirrorHorizontal.value = !mirrorHorizontal.value
  }

  // ======================
  // AUTOGUARDADO
  // ======================

  watch(
    [elements, teams, mirrorHorizontal],
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        elements: elements.value,
        teams: { ...teams },
        mirrorHorizontal: mirrorHorizontal.value,
      }))
    },
    { deep: true }
  )

  // ======================
  // GENERADOR DE IDs
  // ======================

  let nextId = elements.value.length
    ? elements.value.reduce((max, el) => Math.max(max, el.id ?? -1), -1) + 1
    : 0

  // Historial en memoria: no se persiste para que una recarga abra el tablero guardado.
  const undoStack = ref([])
  const redoStack = ref([])
  let historyBatchDepth = 0
  let historyBatchRecorded = false

  function createSnapshot() {
    return JSON.parse(JSON.stringify({
      elements: elements.value,
      teams: { ...teams },
      nextId,
      mirrorHorizontal: mirrorHorizontal.value,
    }))
  }

  function recordHistory() {
    if (historyBatchDepth && historyBatchRecorded) return
    undoStack.value.push(createSnapshot())
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift()
    redoStack.value = []
    historyBatchRecorded = true
  }

  function beginHistoryBatch() {
    historyBatchDepth += 1
    if (historyBatchDepth === 1) historyBatchRecorded = false
    recordHistory()
  }

  function endHistoryBatch() {
    if (!historyBatchDepth) return
    historyBatchDepth -= 1
    if (!historyBatchDepth) historyBatchRecorded = false
  }

  function restoreSnapshot(snapshot) {
    elements.value = snapshot.elements
    Object.assign(teams.team1, snapshot.teams.team1)
    Object.assign(teams.team2, snapshot.teams.team2)
    nextId = snapshot.nextId
    mirrorHorizontal.value = snapshot.mirrorHorizontal ?? false
    selectedElementId.value = null
  }

  function undo() {
    const snapshot = undoStack.value.pop()
    if (!snapshot) return
    redoStack.value.push(createSnapshot())
    restoreSnapshot(snapshot)
  }

  function redo() {
    const snapshot = redoStack.value.pop()
    if (!snapshot) return
    undoStack.value.push(createSnapshot())
    restoreSnapshot(snapshot)
  }

  // ======================
  // CRUD DE ELEMENTOS
  // ======================

  /** Determina el color de una línea según los jugadores que conecta. */
  function getLineColor(startPlayerId, endPlayerId) {
    const startPlayer = elements.value.find((el) => el.id === startPlayerId && el.type === 'player')
    const endPlayer = elements.value.find((el) => el.id === endPlayerId && el.type === 'player')

    if (!startPlayer || !endPlayer || startPlayer.teamId !== endPlayer.teamId) {
      return NEUTRAL_LINE_COLOR
    }

    return startPlayer.teamId === 1
      ? teams.team1.primaryColor
      : startPlayer.teamId === 2
        ? teams.team2.primaryColor
        : NEUTRAL_LINE_COLOR
  }

  /** Recalcula los colores de líneas existentes tras un cambio de equipo o ficha. */
  function syncLineColors() {
    elements.value = elements.value.map((element) => element.type === 'line'
      ? { ...element, color: getLineColor(element.startPlayerId, element.endPlayerId) }
      : element)
  }

  // Normalize saved lines so persisted diagrams also follow the current team colors.
  syncLineColors()

  function addElement(el) {
    recordHistory()
    const element = {
      ...el,
      ...(el.type === 'line' ? { color: getLineColor(el.startPlayerId, el.endPlayerId) } : {}),
      id: nextId++,
    }
    elements.value.push(element)
    return element
  }

  function updateElement(id, changes) {
    const index = elements.value.findIndex((el) => el.id === id)
    if (index !== -1) {
      recordHistory()
      const updated = {
        ...elements.value[index],
        ...changes,
        ...(elements.value[index].type === 'line'
          ? {
              color: getLineColor(
                'startPlayerId' in changes ? changes.startPlayerId : elements.value[index].startPlayerId,
                'endPlayerId' in changes ? changes.endPlayerId : elements.value[index].endPlayerId
              ),
            }
          : {}),
      }
      elements.value[index] = updated

      // Los extremos de líneas y flechas anclados a un jugador siempre usan su centro.
      if (updated.type === 'player' && ('x' in changes || 'y' in changes)) {
        elements.value = elements.value.map((element) => {
          if (element.type !== 'line' && element.type !== 'arrow') return element

          const endpointChanges = {}
          if (element.startPlayerId === id) {
            endpointChanges.x = updated.x
            endpointChanges.y = updated.y
          }
          if (element.endPlayerId === id) {
            endpointChanges.x2 = updated.x
            endpointChanges.y2 = updated.y
          }

          return Object.keys(endpointChanges).length ? { ...element, ...endpointChanges } : element
        })
        syncLineColors()
      }
      if (updated.type === 'player' && 'teamId' in changes) syncLineColors()
    }
  }

  function removeElement(id) {
    if (!elements.value.some((el) => el.id === id)) return
    recordHistory()
    if (selectedElementId.value === id) selectedElementId.value = null
    elements.value = elements.value
      .filter((el) => el.id !== id)
      .map((el) => {
        if (el.type !== 'line' && el.type !== 'arrow') return el
        if (el.startPlayerId !== id && el.endPlayerId !== id) return el
        return {
          ...el,
          ...(el.startPlayerId === id ? { startPlayerId: null } : {}),
          ...(el.endPlayerId === id ? { endPlayerId: null } : {}),
        }
      })
    syncLineColors()
  }

  function selectElement(id) {
    // Solo acepta ids definidos (evita seleccionar con undefined)
    if (id === null || id === undefined) return
    selectedElementId.value = id
  }

  function clearSelection() {
    selectedElementId.value = null
  }

  function clearDrawings() {
    if (!elements.value.some((el) => el.type !== 'player' && el.type !== 'ball')) return
    recordHistory()
    elements.value = elements.value.filter((el) => el.type === 'player' || el.type === 'ball')
    selectedElementId.value = null
  }

  /**
   * Restaura ambos equipos a la configuración por defecto
   * y regenera todos los jugadores desde cero (con ids únicos).
   */
  function resetToDefaults() {
    recordHistory()
    mirrorHorizontal.value = false
    nextId = 0
    const def = defaultTeams()
    Object.assign(teams.team1, def.team1)
    Object.assign(teams.team2, def.team2)
    const t1 = generateTeamPlayers(1, teams.team1, nextId)
    nextId += t1.length
    const t2 = generateTeamPlayers(2, teams.team2, nextId)
    nextId += t2.length
    elements.value = [...t1, ...t2, createBall(nextId++)]
    selectedElementId.value = null
  }

  /**
   * Restablecimiento de fábrica completo.
   * Elimina localStorage y restaura todo el estado a valores originales:
   * sin nombres, sin dorsales personalizados, colores por defecto.
   */
  function factoryReset() {
    localStorage.removeItem(STORAGE_KEY)
    undoStack.value = []
    redoStack.value = []
    mirrorHorizontal.value = false
    selectedElementId.value = null
    nextId = 0
    const def = defaultTeams()
    Object.assign(teams.team1, def.team1)
    Object.assign(teams.team2, def.team2)
    const t1 = generateTeamPlayers(1, teams.team1, nextId)
    nextId += t1.length
    const t2 = generateTeamPlayers(2, teams.team2, nextId)
    nextId += t2.length
    elements.value = [...t1, ...t2, createBall(nextId++)]
  }

  /**
   * Restaura las posiciones de jugadores a las formaciones elegidas
   * actualmente, conservando nombres y números de camiseta existentes.
   *
   * @param {boolean} clearAll — si es true, también elimina todas las
   *   anotaciones dibujadas (flechas, zonas, líneas, texto, etc.).
   *   Si es false, solo reposiciona jugadores y balón.
   */
  function resetToSelectedFormations(clearAll = false) {
    beginHistoryBatch()

    if (clearAll) {
      // Eliminar todas las anotaciones dibujadas, conservar solo jugadores y balón
      elements.value = elements.value.filter((el) => el.type === 'player' || el.type === 'ball')
    }

    // Reposicionar jugadores de ambos equipos a sus formaciones actuales
    // conservando nombres y números existentes
    ;[1, 2].forEach((teamId) => {
      const key = teamId === 1 ? 'team1' : 'team2'
      const positions = FORMATIONS[teams[key].formation] || FORMATIONS['4-4-2']
      const teamPlayers = elements.value
        .filter((el) => el.type === 'player' && el.teamId === teamId)
        .sort((a, b) => a.id - b.id)
        .slice(0, 11)

      teamPlayers.forEach((player, i) => {
        const pos = positions[i] || positions[0]
        const position = positionForTeam(pos, teamId)
        updateElement(player.id, {
          x: position.x,
          y: position.y,
        })
      })
    })

    // Resetear posición del balón al centro si existe
    const ball = elements.value.find((el) => el.type === 'ball')
    if (ball) {
      updateElement(ball.id, { x: CENTER_SPOT.x, y: CENTER_SPOT.y })
    }

    selectedElementId.value = null
    endHistoryBatch()
  }

  // ======================
  // GESTIÓN DE EQUIPOS
  // ======================

  /**
   * Actualiza el nombre de un equipo.
   * @param {1|2} teamId
   * @param {string} name
   */
  function setTeamName(teamId, name) {
    const key = teamId === 1 ? 'team1' : 'team2'
    if (teams[key].name === name) return
    recordHistory()
    teams[key].name = name
  }

  /**
   * Cambia el color primario (fondo de la ficha) de un equipo.
   * @param {1|2} teamId
   * @param {string} color — hex (#rrggbb)
   */
  function setTeamPrimaryColor(teamId, color) {
    const key = teamId === 1 ? 'team1' : 'team2'
    if (teams[key].primaryColor === color) return
    recordHistory()
    teams[key].primaryColor = color
    syncLineColors()
  }

  /**
   * Cambia el color secundario (número de la camiseta) de un equipo.
   * @param {1|2} teamId
   * @param {string} color — hex (#rrggbb)
   */
  function setTeamSecondaryColor(teamId, color) {
    const key = teamId === 1 ? 'team1' : 'team2'
    if (teams[key].secondaryColor === color) return
    recordHistory()
    teams[key].secondaryColor = color
  }

  /**
   * Cambia la formación táctica de un equipo.
   * Reposiciona los jugadores existentes de ese equipo según la nueva formación.
   * Si no hay exactamente 11 jugadores, regenera el equipo completo.
   *
   * @param {1|2} teamId
   * @param {string} formation — clave en FORMATIONS (ej. '4-3-3')
   */
  function setTeamFormation(teamId, formation) {
    if (!FORMATIONS[formation]) return

    const key = teamId === 1 ? 'team1' : 'team2'
    if (teams[key].formation === formation) return
    beginHistoryBatch()
    teams[key].formation = formation

    const teamPlayers = elements.value.filter(
      (el) => el.type === 'player' && el.teamId === teamId
    )

    // Si no hay 11 jugadores del equipo, los regeneramos con ids nuevos
    if (teamPlayers.length < 11) {
      const others = elements.value.filter(
        (el) => !(el.type === 'player' && el.teamId === teamId)
      )
      const newPlayers = generateTeamPlayers(teamId, teams[key], nextId)
      nextId += newPlayers.length
      elements.value = [...others, ...newPlayers]
      syncLineColors()
      selectedElementId.value = null
      endHistoryBatch()
      return
    }

    // Reposicionar los 11 jugadores existentes según la formación
    const positions = FORMATIONS[formation]
    const sorted = [...teamPlayers]
      .filter((p) => p.id != null)
      .sort((a, b) => a.id - b.id)
      .slice(0, 11)

    sorted.forEach((player, i) => {
      const pos = positions[i] || positions[0]
      const position = positionForTeam(pos, teamId)
      updateElement(player.id, {
        x: position.x,
        y: position.y,
      })
    })
    endHistoryBatch()
  }

  // ======================
  // EXPORTAR / IMPORTAR
  // ======================

  function exportToJSON() {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      elements: elements.value,
      teams: { ...teams },
      mirrorHorizontal: mirrorHorizontal.value,
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

  function importFromJSON(jsonString) {
    const data = JSON.parse(jsonString)
    if (!Array.isArray(data.elements) && !data.teams) return
    recordHistory()
    if (Array.isArray(data.elements)) {
      elements.value = data.elements
      nextId = elements.value.reduce((max, el) => Math.max(max, el.id || 0), 0) + 1
    }
    if (data.teams) {
      if (data.teams.team1) Object.assign(teams.team1, data.teams.team1)
      if (data.teams.team2) Object.assign(teams.team2, data.teams.team2)
    }
    mirrorHorizontal.value = data.mirrorHorizontal ?? false
    syncLineColors()
  }

  // ======================
  // RETORNO PÚBLICO
  // ======================

  return {
    // Equipos
    teams,
    formations: FORMATIONS,

    // Elementos
    elements,
    selectedElementId,
    selectedElement,
    undoStack,
    redoStack,

    // Herramienta
    selectedTool,
    selectedColor,
    playerNumber,
    playerName,
    fontSize,
    strokeWidth,
    activeTeam,

    // Zonas tácticas
    showTacticalZones,
    toggleTacticalZones,

    // Espejo horizontal
    mirrorHorizontal,
    toggleMirrorHorizontal,

    // CRUD
    addElement,
    updateElement,
    removeElement,
    selectElement,
    clearSelection,
    clearDrawings,
    resetToDefaults,
    factoryReset,
    resetToSelectedFormations,
    getLineColor,
    undo,
    redo,
    beginHistoryBatch,
    endHistoryBatch,

    // Equipos
    setTeamName,
    setTeamPrimaryColor,
    setTeamSecondaryColor,
    setTeamFormation,
    generateTeamPlayers,

    // Persistencia
    exportToJSON,
    importFromJSON,
  }
})
