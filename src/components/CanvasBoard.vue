<template>
  <!-- CANVAS: contenedor que Konva usa para montar el Stage imperativo. -->
  <div ref="containerRef" class="canvas-container"></div>
  <!-- OVERLAY JUGADOR: editor HTML, sincronizado con la ficha seleccionada. -->
  <div v-if="selectedPlayer" class="player-popover" :style="playerPopoverStyle">
    <input
      :value="selectedPlayer.playerName || ''"
      type="text"
      placeholder="Nombre"
      aria-label="Nombre del jugador"
      @input="updateSelectedPlayerName"
    >
    <input
      :value="selectedPlayer.playerNumber ?? ''"
      type="text"
      inputmode="numeric"
      placeholder="Número"
      aria-label="Número del jugador"
      @input="updateSelectedPlayerNumber"
    >
  </div>
  <!-- OVERLAY DIBUJO: colores y eliminación del elemento gráfico seleccionado. -->
  <div v-if="selectedDrawing" class="color-popover" :style="colorPopoverStyle">
    <button
      v-for="color in PRESET_COLORS"
      :key="color"
      class="color-swatch"
      :class="{ active: selectedDrawing.color === color }"
      :style="{ backgroundColor: color }"
      :aria-label="`Color ${color}`"
      @click="store.updateElement(selectedDrawing.id, { color })"
    ></button>
    <button
      class="delete-drawing-button"
      aria-label="Eliminar elemento"
      title="Eliminar elemento"
      @click="store.removeElement(selectedDrawing.id)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
      </svg>
    </button>
  </div>
</template>

<script setup>
/**
 * CANVAS BOARD / KONVA
 *
 * Renderizador imperativo de la pizarra táctica. Pinia conserva el modelo de
 * datos y este componente reconcilia sus elementos con nodos Konva duraderos.
 * Palabras clave: CANVAS, KONVA, PINIA, RECONCILIACION, HIT-TEST, DRAG,
 * COORDENADAS VIRTUALES, OVERLAY, JUGADORES, DIBUJOS.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Konva from 'konva'
import { usePizarraStore } from '../stores/pizarra'
import { useCanvasResize } from '../composables/useCanvasResize'
import { useFootballPitch, VIRTUAL_H, VIRTUAL_W } from '../composables/useFootballPitch'

// ESTADO: Pinia es la única fuente de verdad de elementos y selección.
const store = usePizarraStore()
// REFERENCIAS VUE: nodo HTML del canvas y ficha que mantiene abierto su editor.
const containerRef = ref(null)
const playerPopoverId = ref(null)
// RESPONSIVE: dimensiones visibles y transformación al campo virtual 1050x680.
const { width, height } = useCanvasResize(containerRef)
const { scale, offsetX, offsetY, pitchMarkings } = useFootballPitch(width, height)

/** SELECCION JUGADOR: solo muestra el editor cuando coincide selección y pulsación. */
const selectedPlayer = computed(() => {
  const element = store.selectedElement
  return element?.type === 'player' && element.id === playerPopoverId.value ? element : null
})

/** SELECCION DIBUJO: expone la anotación activa para el selector de color. */
const selectedDrawing = computed(() => {
  const element = store.selectedElement
  return element && !['player', 'ball'].includes(element.type) ? element : null
})

/** OVERLAY JUGADOR: convierte la posición virtual de la ficha a píxeles HTML. */
const playerPopoverStyle = computed(() => {
  if (!selectedPlayer.value) return {}
  return {
    left: `${selectedPlayer.value.x * scale.value + offsetX.value}px`,
    top: `${selectedPlayer.value.y * scale.value + offsetY.value + 24 * scale.value}px`,
  }
})

/** OVERLAY DIBUJO: posiciona el menú cerca del centro o borde superior del dibujo. */
const colorPopoverStyle = computed(() => {
  if (!selectedDrawing.value) return {}
  const element = selectedDrawing.value
  const x = element.x2 == null ? element.x : (element.x + element.x2) / 2
  const y = element.type === 'circle'
    ? element.y - element.radius
    : element.y2 == null ? element.y : Math.min(element.y, element.y2)
  return {
    left: `${x * scale.value + offsetX.value}px`,
    top: `${y * scale.value + offsetY.value - 12}px`,
  }
})

// CONSTANTES VISUALES Y GESTOS: colores del campo, tolerancia y herramientas de dibujo.
const LINE_COLOR = '#ffffff'
const LINE_WIDTH = 2
const PITCH_GREEN = '#2e7d32'
const DRAW_THRESHOLD = 8
const PRESET_COLORS = ['#ffffff', '#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6']
const SHAPE_TOOLS = ['arrow', 'line', 'zone', 'circle', 'text']

// GRAFO KONVA: capas separadas para fondo, campo, elementos y controles temporales.
let stage = null
let backgroundLayer = null
let pitchLayer = null
let elementLayer = null
let overlayLayer = null
let pitchGroup = null
let elementGroup = null
let drawingGroup = null
let playerGroup = null
let overlayGroup = null
let previewNode = null
let tacticalZonesGroup = null
let isDrawing = false
let drawStart = null
let drawCurrent = null
let handleElementId = null
let editHandles = []
let draggedHandle = null
let draggedDrawing = null
let playerPointerDown = null

// RECONCILIACION: cada id del store conserva su nodo Konva durante toda su vida.
const elementNodes = new Map()

/** EQUIPOS: obtiene los colores actuales de una ficha, incluso si no pertenece a un equipo. */
function getPlayerColors(el) {
  if (el.teamId === 1) {
    return store.teams.team1
  }
  if (el.teamId === 2) {
    return store.teams.team2
  }
  return { primaryColor: el.color || '#e74c3c', secondaryColor: '#ffffff' }
}

/** SELECCION: comprueba si un elemento es el activo en Pinia. */
function isSelected(el) {
  return store.selectedElementId === el.id
}

/** HERRAMIENTA LIBRE: permite seleccionar y arrastrar en vez de crear un dibujo. */
function isFreeTool() {
  return store.selectedTool === 'free'
}

/**
 * COORDENADAS: transforma un puntero de pantalla al espacio virtual fijo del
 * campo. Nunca se persisten coordenadas dependientes del tamaño del viewport.
 */
function screenToVirtual(position) {
  return {
    x: (position.x - offsetX.value) / scale.value,
    y: (position.y - offsetY.value) / scale.value,
  }
}

/** HIT-TEST KONVA: sube por el árbol de nodos hasta encontrar su elementId. */
function elementIdFromNode(node) {
  let current = node
  while (current && current !== stage) {
    const id = current.getAttr('elementId')
    if (id !== undefined) return id
    current = current.getParent()
  }
  return null
}

/**
 * Respaldo del hit-test de Konva para fichas. Si el canvas aún no actualizó
 * su hit graph, el Stage puede reportarse como target; el modelo sigue siendo
 * la fuente de verdad para decidir si el puntero está sobre una ficha.
 */
function findPlayerAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type !== 'player') continue
    if (Math.hypot(point.x - element.x, point.y - element.y) <= 20) return element
  }
  return null
}

/** HIT-TEST BALON: respaldo para iniciar su arrastre si Konva aún no actualizó el hit graph. */
function findBallAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type === 'ball' && Math.hypot(point.x - element.x, point.y - element.y) <= 16) return element
  }
  return null
}

/** HIT-TEST GEOMETRICO: detecta si un punto está dentro de la tolerancia de un segmento. */
function pointNearSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t)) <= 18
}

/** HIT-TEST FLECHA: aproxima curvas cuadráticas por segmentos para el respaldo manual. */
function findArrowAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type !== 'arrow') continue

    let previous = { x: element.x, y: element.y }
    const steps = element.cx == null ? 1 : 24
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const current = element.cx == null
        ? { x: element.x2, y: element.y2 }
        : {
            x: (1 - t) ** 2 * element.x + 2 * (1 - t) * t * element.cx + t ** 2 * element.x2,
            y: (1 - t) ** 2 * element.y + 2 * (1 - t) * t * element.cy + t ** 2 * element.y2,
          }
      if (pointNearSegment(point, previous, current)) return element
      previous = current
    }
  }
  return null
}

/** HIT-TEST LINEA: encuentra la línea más reciente próxima al puntero. */
function findLineAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type !== 'line') continue
    if (pointNearSegment(point, element, { x: element.x2, y: element.y2 })) return element
  }
  return null
}

/** HIT-TEST ZONA: comprueba si el puntero está dentro del rectángulo anotado. */
function findZoneAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type !== 'zone') continue
    const left = Math.min(element.x, element.x2)
    const right = Math.max(element.x, element.x2)
    const top = Math.min(element.y, element.y2)
    const bottom = Math.max(element.y, element.y2)
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return element
  }
  return null
}

/** HIT-TEST CIRCULO: comprueba la distancia del puntero a su centro. */
function findCircleAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type === 'circle' && Math.hypot(point.x - element.x, point.y - element.y) <= element.radius) return element
  }
  return null
}

/** SELECCION: delegación mínima para mantener los listeners Konva desacoplados del store. */
function selectElement(id) {
  store.selectElement(id)
}

/** OVERLAY JUGADOR: persiste el nombre escrito en el editor HTML. */
function updateSelectedPlayerName(event) {
  if (selectedPlayer.value) {
    store.updateElement(selectedPlayer.value.id, { playerName: event.target.value })
  }
}

/** OVERLAY JUGADOR: persiste el dorsal escrito en el editor HTML. */
function updateSelectedPlayerNumber(event) {
  if (selectedPlayer.value) {
    store.updateElement(selectedPlayer.value.id, { playerNumber: event.target.value })
  }
}

/**
 * DRAG JUGADOR: selecciona y arranca el drag nativo cuando el HIT-TEST manual
 * detectó una ficha bajo otro dibujo y Konva entregó el evento al nodo incorrecto.
 */
function selectAndStartPlayerDrag(player, event) {
  if (!isFreeTool()) return
  playerPopoverId.value = null
  store.selectElement(player.id)

  const group = elementNodes.get(player.id)
  if (!group || !group.draggable() || group.isDragging()) return

  // El target fue el Stage y Konva no entregó este gesto al Group. Iniciamos
  // su drag nativo con el mismo evento para conservar offset y dragend.
  event.evt?.preventDefault?.()
  group.startDrag(event)
}

/** DRAG DIBUJO: guarda una copia inicial para trasladar la anotación desde el Stage. */
function startDrawingDrag(element, point, event) {
  if (!isFreeTool() || element.type === 'player') return
  playerPopoverId.value = null
  store.selectElement(element.id)
  store.beginHistoryBatch()
  draggedDrawing = { element: { ...element }, point }
  event.evt?.preventDefault?.()
}

/**
 * DRAG DIBUJO: calcula el desplazamiento según el tipo. Las líneas se desligan
 * de jugadores al moverlas manualmente para no volver a anclarse a sus centros.
 */
function drawingDragChanges(element, dx, dy) {
  if (element.type === 'arrow') {
    return {
      x: element.x + dx,
      y: element.y + dy,
      x2: element.x2 + dx,
      y2: element.y2 + dy,
      ...(element.cx == null ? {} : { cx: element.cx + dx, cy: element.cy + dy }),
      startPlayerId: null,
      endPlayerId: null,
    }
  }
  if (element.type === 'line') {
    return {
      x: element.x + dx,
      y: element.y + dy,
      x2: element.x2 + dx,
      y2: element.y2 + dy,
      startPlayerId: null,
      endPlayerId: null,
    }
  }
  if (element.type === 'zone') {
    return { x: element.x + dx, y: element.y + dy, x2: element.x2 + dx, y2: element.y2 + dy }
  }
  return { x: element.x + dx, y: element.y + dy }
}

/** EVENTOS KONVA: identifica el elemento y habilita su selección en herramienta libre. */
function bindSelection(node, id) {
  node.setAttr('elementId', id)
  node.on('mousedown touchstart', () => {
    if (isFreeTool()) selectElement(id)
  })
}

/** RENDER JUGADOR: crea el grupo draggable con círculo, dorsal y nombre. */
function createPlayer(el) {
  const group = new Konva.Group({ draggable: isFreeTool(), listening: true, elementId: el.id })
  const circle = new Konva.Circle()
  const number = new Konva.Text({ listening: false })
  const name = new Konva.Text({ listening: false })
  group.add(circle, number, name)
  bindSelection(group, el.id)
  // Konva no emite click después de un drag, así que el editor solo se abre
  // cuando la ficha se pulsó sin moverla.
  group.on('mousedown touchstart', () => {
    playerPopoverId.value = null
  })
  group.on('dragstart', () => {
    store.beginHistoryBatch()
  })
  group.on('dragend', () => {
    store.updateElement(el.id, { x: group.x(), y: group.y() })
    store.endHistoryBatch()
  })
  playerGroup.add(group)
  return group
}

/**
 * RENDER JUGADOR: actualiza apariencia y posición sin interrumpir un DRAG
 * nativo que todavía no ha confirmado sus coordenadas en Pinia.
 */
function updatePlayer(group, el) {
  const colors = getPlayerColors(el)
  const selected = isSelected(el)
  // Pinia puede cambiar mientras Konva está en pleno drag. No devolvemos la
  // ficha a la posición anterior hasta que el dragend persista su posición.
  if (!group.isDragging()) group.position({ x: el.x, y: el.y })
  group.draggable(isFreeTool())
  group.getChildren()[0].setAttrs({
    x: 0,
    y: 0,
    radius: 15,
    fill: colors.primaryColor,
    stroke: selected ? '#ffffff' : 'rgba(0,0,0,0.35)',
    strokeWidth: selected ? 3 : 2,
    listening: true,
    perfectDrawEnabled: false,
  })
  const numText = String(el.playerNumber)
  const numWidth = Math.max(20, numText.length * 16)
  group.getChildren()[1].setAttrs({
    x: -numWidth / 2,
    y: -10,
    width: numWidth,
    height: 20,
    text: numText,
    fontSize: 22,
    fontStyle: 'bold',
    fill: colors.secondaryColor,
    stroke: '#000000',
    strokeWidth:0.5,
    align: 'center',
    verticalAlign: 'middle',
    listening: false,
  })
  group.getChildren()[2].setAttrs({
    x: -60,
    y: 23,
    width: 120,
    text: el.playerName || '',
    fontSize: 16,
    fontStyle: 'bold',
    fill: '#ffffff',
    stroke: '#000000',
    strokeWidth: 0.5,
    align: 'center',
    listening: false,
  })
}

/** RENDER BALON: crea un Telstar inspirado en el balón del Mundial México 1970. */
function createBall(el) {
  const group = new Konva.Group({ draggable: false, listening: true, elementId: el.id })
  const ball = new Konva.Circle()
  const centerPatch = new Konva.RegularPolygon({ sides: 5, radius: 4.5, fill: '#171717', rotation: -90, listening: false })
  const patches = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / 5)
    return new Konva.RegularPolygon({
      x: Math.cos(angle) * 9,
      y: Math.sin(angle) * 9,
      sides: 5,
      radius: 2.8,
      fill: '#171717',
      rotation: angle * 180 / Math.PI - 90,
      listening: false,
    })
  })
  group.add(ball, centerPatch, ...patches)
  bindSelection(group, el.id)
  playerGroup.add(group)
  return group
}

/** RENDER BALON: dibuja un balón clásico y sincroniza su posición virtual. */
function updateBall(group, el) {
  const selected = isSelected(el)
  group.position({ x: el.x, y: el.y })
  group.draggable(false)
  group.getChildren()[0].setAttrs({
    x: 0,
    y: 0,
    radius: 14,
    fill: '#ffffff',
    stroke: selected ? '#4a6cf7' : '#1f2937',
    strokeWidth: selected ? 3 : 2,
    shadowColor: '#000000',
    shadowBlur: 3,
    shadowOpacity: 0.35,
    shadowOffset: { x: 1, y: 2 },
  })
}

/** RENDER FLECHA: dibuja la trayectoria recta o curva y su punta con Canvas 2D. */
function drawArrow(ctx, el) {
  const controlX = el.cx ?? (el.x + el.x2) / 2
  const controlY = el.cy ?? (el.y + el.y2) / 2
  const angle = el.cx == null
    ? Math.atan2(el.y2 - el.y, el.x2 - el.x)
    : Math.atan2(el.y2 - controlY, el.x2 - controlX)
  const headLength = 14
  const headAngle = Math.PI / 6

  ctx.beginPath()
  ctx.moveTo(el.x, el.y)
  if (el.cx == null) ctx.lineTo(el.x2, el.y2)
  else ctx.quadraticCurveTo(controlX, controlY, el.x2, el.y2)
  ctx.strokeStyle = el.color
  ctx.lineWidth = el.strokeWidth || 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(el.dashed ? [12, 6] : [])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.moveTo(el.x2, el.y2)
  ctx.lineTo(el.x2 - headLength * Math.cos(angle - headAngle), el.y2 - headLength * Math.sin(angle - headAngle))
  ctx.lineTo(el.x2 - headLength * Math.cos(angle + headAngle), el.y2 - headLength * Math.sin(angle + headAngle))
  ctx.closePath()
  ctx.fillStyle = el.color
  ctx.fill()
}

/** RENDER FLECHA: crea visual y área HIT-TEST independiente para una pulsación tolerante. */
function createArrow(el) {
  const group = new Konva.Group()
  const visual = new Konva.Shape({ listening: false })
  const hitArea = new Konva.Shape({ listening: true })
  group.add(visual, hitArea)
  bindSelection(hitArea, el.id)
  drawingGroup.add(group)
  return group
}

/** RENDER FLECHA: actualiza el dibujo visible y el hit graph imperativo de Konva. */
function updateArrow(group, el) {
  const selected = isSelected(el)
  if (!group.isDragging()) group.position({ x: 0, y: 0 })
  const visual = group.getChildren()[0]
  const hitArea = group.getChildren()[1]
  visual.setAttrs({
    sceneFunc(ctx) {
      drawArrow(ctx, el)
    },
    listening: false,
    shadowColor: selected ? '#4a6cf7' : undefined,
    shadowBlur: selected ? 10 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
  hitArea.setAttrs({
    hitFunc(ctx, shape) {
      const controlX = el.cx ?? (el.x + el.x2) / 2
      const controlY = el.cy ?? (el.y + el.y2) / 2
      const angle = el.cx == null
        ? Math.atan2(el.y2 - el.y, el.x2 - el.x)
        : Math.atan2(el.y2 - controlY, el.x2 - controlX)
      const headLength = 14
      const headAngle = Math.PI / 6

      // Konva escribe el color interno del nodo mediante strokeShape/fillShape.
      ctx.beginPath()
      ctx.moveTo(el.x, el.y)
      if (el.cx == null) ctx.lineTo(el.x2, el.y2)
      else ctx.quadraticCurveTo(controlX, controlY, el.x2, el.y2)
      ctx.strokeShape(shape)

      ctx.beginPath()
      ctx.moveTo(el.x2, el.y2)
      ctx.lineTo(el.x2 - headLength * Math.cos(angle - headAngle), el.y2 - headLength * Math.sin(angle - headAngle))
      ctx.lineTo(el.x2 - headLength * Math.cos(angle + headAngle), el.y2 - headLength * Math.sin(angle + headAngle))
      ctx.closePath()
      ctx.fillShape(shape)
    },
    hitStrokeWidth: 28,
    lineCap: 'round',
    listening: true,
  })
}

/** RENDER ZONA: crea el rectángulo seleccionable que representa una zona táctica. */
function createZone(el) {
  const node = new Konva.Rect()
  bindSelection(node, el.id)
  drawingGroup.add(node)
  return node
}

/** RENDER ZONA: aplica dimensiones, color y realce de selección al rectángulo. */
function updateZone(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: el.x, y: el.y })
  node.setAttrs({
    width: el.x2 - el.x,
    height: el.y2 - el.y,
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    fill: `${el.color}22`,
    dash: [8, 4],
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

/** RENDER CIRCULO: crea el área circular seleccionable. */
function createCircle(el) {
  const node = new Konva.Circle()
  bindSelection(node, el.id)
  drawingGroup.add(node)
  return node
}

/** RENDER CIRCULO: aplica radio, estilo y realce de selección. */
function updateCircle(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: el.x, y: el.y })
  node.setAttrs({
    radius: el.radius,
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    fill: `${el.color}22`,
    dash: [8, 4],
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

/** RENDER LINEA: crea una línea seleccionable que puede estar anclada a jugadores. */
function createLine(el) {
  const node = new Konva.Line()
  bindSelection(node, el.id)
  drawingGroup.add(node)
  return node
}

/** RENDER LINEA: actualiza puntos, tolerancia de HIT-TEST y estilo de selección. */
function updateLine(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: 0, y: 0 })
  node.setAttrs({
    points: [el.x, el.y, el.x2, el.y2],
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    hitStrokeWidth: 20,
    lineCap: 'round',
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

/** RENDER TEXTO: crea la anotación textual seleccionable. */
function createText(el) {
  const node = new Konva.Text()
  bindSelection(node, el.id)
  drawingGroup.add(node)
  return node
}

/** RENDER TEXTO: actualiza contenido, tipografía, posición y realce de selección. */
function updateText(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: el.x, y: el.y })
  node.setAttrs({
    text: el.text || '',
    fontSize: el.fontSize || 20,
    fontStyle: 'bold',
    fill: el.color,
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

/** FACTORIA KONVA: construye el nodo correcto para cada tipo persistido en Pinia. */
function createElement(el) {
  if (el.type === 'player') return createPlayer(el)
  if (el.type === 'ball') return createBall(el)
  if (el.type === 'arrow') return createArrow(el)
  if (el.type === 'zone') return createZone(el)
  if (el.type === 'circle') return createCircle(el)
  if (el.type === 'line') return createLine(el)
  if (el.type === 'text') return createText(el)
  return null
}

/** DESPACHO RENDER: aplica la actualización específica al nodo Konva existente. */
function updateElement(node, el) {
  if (el.type === 'player') updatePlayer(node, el)
  else if (el.type === 'ball') updateBall(node, el)
  else if (el.type === 'arrow') updateArrow(node, el)
  else if (el.type === 'zone') updateZone(node, el)
  else if (el.type === 'circle') updateCircle(node, el)
  else if (el.type === 'line') updateLine(node, el)
  else if (el.type === 'text') updateText(node, el)
}

/**
 * RECONCILIACION: elimina nodos sin modelo, crea los nuevos y actualiza los
 * existentes. Es el puente principal entre `store.elements` y Konva.
 */
function reconcileElements() {
  if (!elementLayer) return
  const currentIds = new Set(store.elements.map((el) => el.id))

  for (const [id, node] of elementNodes) {
    if (!currentIds.has(id)) {
      node.destroy()
      elementNodes.delete(id)
    }
  }

  for (const el of store.elements) {
    let node = elementNodes.get(el.id)
    if (!node) {
      node = createElement(el)
      if (!node) continue
      elementNodes.set(el.id, node)
    }
    updateElement(node, el)
  }

  renderEditHandles()
  elementLayer.batchDraw()
  overlayLayer.batchDraw()
}

/**
 * CONTROLES DE EDICION: define los tiradores virtuales para ajustar extremos,
 * curvatura, esquinas de zonas y radio de círculos.
 */
function handleDefinitions(element) {
  if (element.type === 'arrow') {
    const middleX = element.cx ?? (element.x + element.x2) / 2
    const middleY = element.cy ?? (element.y + element.y2) / 2
    return [
      { x: element.x, y: element.y, fill: '#4a6cf7', changes: (point) => ({ x: point.x, y: point.y, startPlayerId: null }) },
      { x: middleX, y: middleY, fill: '#f1c40f', changes: (point) => ({ cx: point.x, cy: point.y }) },
      { x: element.x2, y: element.y2, fill: '#e74c3c', changes: (point) => ({ x2: point.x, y2: point.y, endPlayerId: null }) },
    ]
  }
  if (element.type === 'line') {
    return [
      { x: element.x, y: element.y, changes: (point) => ({ x: point.x, y: point.y, startPlayerId: null }) },
      { x: element.x2, y: element.y2, changes: (point) => ({ x2: point.x, y2: point.y, endPlayerId: null }) },
    ]
  }
  if (element.type === 'zone') {
    return [
      { x: element.x, y: element.y, changes: (point) => ({ x: point.x, y: point.y }) },
      { x: element.x2, y: element.y, changes: (point) => ({ x2: point.x, y: point.y }) },
      { x: element.x2, y: element.y2, changes: (point) => ({ x2: point.x, y2: point.y }) },
      { x: element.x, y: element.y2, changes: (point) => ({ x: point.x, y2: point.y }) },
    ]
  }
  if (element.type === 'circle') {
    return [{
      x: element.x + element.radius,
      y: element.y,
      changes: (point) => ({ radius: Math.max(DRAW_THRESHOLD, Math.hypot(point.x - element.x, point.y - element.y)) }),
    }]
  }
  return []
}

/** DRAG TIRADOR: inicia edición si el puntero cae dentro de un control activo. */
function startHandleDrag(point) {
  if (!isFreeTool()) return false
  const element = store.selectedElement
  if (!element) return false

  const handle = handleDefinitions(element).find((item) => Math.hypot(point.x - item.x, point.y - item.y) <= 18)
  if (!handle) return false

  draggedHandle = { elementId: element.id, changes: handle.changes }
  store.beginHistoryBatch()
  return true
}

/** RENDER CONTROLES: crea, elimina o reposiciona los tiradores del dibujo seleccionado. */
function renderEditHandles() {
  const element = store.selectedElement
  const definitions = element ? handleDefinitions(element) : []
  if (!element || !definitions.length) {
    overlayGroup.destroyChildren()
    handleElementId = null
    editHandles = []
    draggedHandle = null
    return
  }

  if (handleElementId !== element.id) {
    overlayGroup.destroyChildren()
    handleElementId = element.id
    editHandles = definitions.map((handle) => {
      const node = new Konva.Circle({ x: handle.x, y: handle.y, radius: 8, fill: handle.fill || '#4a6cf7', stroke: '#ffffff', strokeWidth: 2, listening: false })
      overlayGroup.add(node)
      return node
    })
    return
  }

  definitions.forEach((handle, index) => {
    const node = editHandles[index]
    if (node) node.position({ x: handle.x, y: handle.y })
  })
}

/** PREVISUALIZACION: elimina el nodo temporal de una herramienta de dibujo. */
function clearPreview() {
  if (previewNode) {
    previewNode.destroy()
    previewNode = null
  }
}

/** PREVISUALIZACION: crea y actualiza la guía temporal durante el gesto de dibujo. */
function updatePreview() {
  if (!drawStart || !drawCurrent) return
  const tool = store.selectedTool
  if (!previewNode) {
    previewNode = tool === 'zone' ? new Konva.Rect({ listening: false })
      : tool === 'circle' ? new Konva.Circle({ listening: false })
        : new Konva.Arrow({ listening: false })
    overlayGroup.add(previewNode)
  }

  if (tool === 'zone') {
    previewNode.setAttrs({
      x: Math.min(drawStart.x, drawCurrent.x),
      y: Math.min(drawStart.y, drawCurrent.y),
      width: Math.abs(drawCurrent.x - drawStart.x),
      height: Math.abs(drawCurrent.y - drawStart.y),
      stroke: store.selectedColor,
      strokeWidth: store.strokeWidth,
      fill: `${store.selectedColor}22`,
      dash: [8, 4],
    })
  } else if (tool === 'circle') {
    previewNode.setAttrs({
      x: drawStart.x,
      y: drawStart.y,
      radius: Math.hypot(drawCurrent.x - drawStart.x, drawCurrent.y - drawStart.y),
      stroke: store.selectedColor,
      strokeWidth: store.strokeWidth,
      fill: `${store.selectedColor}22`,
      dash: [8, 4],
    })
  } else {
    previewNode.setAttrs({
      points: [drawStart.x, drawStart.y, drawCurrent.x, drawCurrent.y],
      stroke: store.selectedColor,
      fill: tool === 'arrow' ? store.selectedColor : undefined,
      strokeWidth: store.strokeWidth,
      pointerLength: 10,
      pointerWidth: 10,
      dash: tool === 'line' ? [10, 5] : undefined,
    })
  }
  overlayLayer.batchDraw()
}

/**
 * FINALIZAR DIBUJO: valida la distancia mínima, guarda una anotación en Pinia
 * y vuelve a la herramienta libre. Las líneas detectan jugadores para anclarse.
 */
function finishDrawing() {
  if (!isDrawing || !drawStart || !drawCurrent) return
  isDrawing = false
  clearPreview()

  const dx = drawCurrent.x - drawStart.x
  const dy = drawCurrent.y - drawStart.y
  if (Math.abs(dx) < DRAW_THRESHOLD && Math.abs(dy) < DRAW_THRESHOLD) return

  const tool = store.selectedTool
  if (tool === 'arrow') {
    const startPlayer = findPlayerAt(drawStart)
    const endPlayer = findPlayerAt(drawCurrent)
    store.addElement({
      type: 'arrow',
      x: startPlayer?.x ?? drawStart.x,
      y: startPlayer?.y ?? drawStart.y,
      x2: endPlayer?.x ?? drawCurrent.x,
      y2: endPlayer?.y ?? drawCurrent.y,
      ...(startPlayer ? { startPlayerId: startPlayer.id } : {}),
      ...(endPlayer ? { endPlayerId: endPlayer.id } : {}),
      color: store.selectedColor,
      strokeWidth: store.strokeWidth || 5,
      dashed: false,
    })
  } else if (tool === 'line') {
    const startPlayer = findPlayerAt(drawStart)
    const endPlayer = findPlayerAt(drawCurrent)
    store.addElement({
      type: 'line',
      x: startPlayer?.x ?? drawStart.x,
      y: startPlayer?.y ?? drawStart.y,
      x2: endPlayer?.x ?? drawCurrent.x,
      y2: endPlayer?.y ?? drawCurrent.y,
      ...(startPlayer ? { startPlayerId: startPlayer.id } : {}),
      ...(endPlayer ? { endPlayerId: endPlayer.id } : {}),
      color: store.getLineColor(startPlayer?.id, endPlayer?.id),
      strokeWidth: store.strokeWidth,
    })
  } else if (tool === 'zone') {
    store.addElement({ type: 'zone', x: Math.min(drawStart.x, drawCurrent.x), y: Math.min(drawStart.y, drawCurrent.y), x2: Math.max(drawStart.x, drawCurrent.x), y2: Math.max(drawStart.y, drawCurrent.y), color: store.selectedColor, strokeWidth: store.strokeWidth })
  } else if (tool === 'circle') {
    store.addElement({ type: 'circle', x: drawStart.x, y: drawStart.y, radius: Math.hypot(dx, dy), color: store.selectedColor, strokeWidth: store.strokeWidth })
  }
  store.selectedTool = 'free'
}

function bindStageEvents() {
  /**
   * EVENTOS PUNTERO INICIO: prioriza herramientas de dibujo y, en modo libre,
   * prioriza siempre JUGADORES sobre dibujos, zonas y tiradores superpuestos.
   */
  stage.on('mousedown touchstart', (event) => {
    const position = stage.getPointerPosition()
    if (!position || !scale.value) return
    const point = screenToVirtual(position)
    const playerAtPointer = findPlayerAt(point)
    playerPointerDown = null

    // Drawing tools own the entire gesture, including gestures that begin over
    // an existing element. This prevents Konva's native node drag from winning.
    if (SHAPE_TOOLS.includes(store.selectedTool)) {
      store.clearSelection()
      if (store.selectedTool === 'text') {
        store.addElement({ type: 'text', x: point.x, y: point.y, color: store.selectedColor, text: store.playerName || 'Texto', fontSize: store.fontSize })
        store.selectedTool = 'free'
        return
      }
      isDrawing = true
      drawStart = point
      drawCurrent = point
      return
    }

    playerPointerDown = playerAtPointer ? { id: playerAtPointer.id, point } : null

    const targetId = elementIdFromNode(event.target)
    const targetElement = store.elements.find((element) => element.id === targetId)

    // PRIORIDAD JUGADOR / HIT-TEST: un dibujo puede ser el target de Konva aun
    // con una ficha encima; el modelo de Pinia resuelve primero la ficha.
    if (playerAtPointer) {
      if (targetElement?.type !== 'player') {
        selectAndStartPlayerDrag(playerAtPointer, event)
      }
      return
    }

    if (startHandleDrag(point)) {
      playerPointerDown = null
      event.evt?.preventDefault?.()
      return
    }

    if (targetElement && targetElement.type !== 'player') {
      startDrawingDrag(targetElement, point, event)
      return
    }
    if (targetElement) return
    if (event.target.getParent() === overlayGroup) return

    // RESPALDO HIT-TEST: cubre dibujos cuyo hit canvas de Konva aún no se actualizó.
    const ball = findBallAt(point)
    if (ball) {
      startDrawingDrag(ball, point, event)
      return
    }

    const arrow = findArrowAt(point)
    if (arrow) {
      startDrawingDrag(arrow, point, event)
      return
    }

    const line = findLineAt(point)
    if (line) {
      startDrawingDrag(line, point, event)
      return
    }

    const zone = findZoneAt(point)
    if (zone) {
      startDrawingDrag(zone, point, event)
      return
    }

    const circle = findCircleAt(point)
    if (circle) {
      startDrawingDrag(circle, point, event)
      return
    }

    store.clearSelection()

  })

  /** EVENTOS PUNTERO MOVIMIENTO: actualiza, en orden, tirador, dibujo o previsualización. */
  stage.on('mousemove touchmove', () => {
    if (draggedHandle) {
      const position = stage.getPointerPosition()
      if (!position || !scale.value) return
      const point = screenToVirtual(position)
      store.updateElement(draggedHandle.elementId, draggedHandle.changes(point))
      return
    }

    if (draggedDrawing) {
      const position = stage.getPointerPosition()
      if (!position || !scale.value) return
      const point = screenToVirtual(position)
      const { element, point: start } = draggedDrawing
      store.updateElement(element.id, drawingDragChanges(element, point.x - start.x, point.y - start.y))
      return
    }

    if (!isDrawing) return
    const position = stage.getPointerPosition()
    if (!position || !scale.value) return
    drawCurrent = screenToVirtual(position)
    updatePreview()
  })

  /** EVENTOS PUNTERO FIN: termina el gesto activo o abre el editor tras un clic de ficha. */
  stage.on('mouseup touchend', () => {
    if (draggedHandle) {
      draggedHandle = null
      store.endHistoryBatch()
      return
    }

    if (draggedDrawing) {
      draggedDrawing = null
      store.endHistoryBatch()
      return
    }

    if (playerPointerDown) {
      const position = stage.getPointerPosition()
      const pointerDown = playerPointerDown
      playerPointerDown = null
      if (!position || !scale.value) return

      const point = screenToVirtual(position)
      if (Math.hypot(point.x - pointerDown.point.x, point.y - pointerDown.point.y) < DRAW_THRESHOLD) {
        store.selectElement(pointerDown.id)
        playerPopoverId.value = pointerDown.id
        return
      }
    }

    finishDrawing()
  })
}

/** ZONAS TÁCTICAS: constantes de la rejilla de 18 zonas. */
const TACTICAL_ZONE_LINES_H = [138.4, 541.6]
const TACTICAL_ZONE_LINES_V = [165, 345, 525, 705, 885]
const TACTICAL_ZONE_COLOR = '#f1c40f80'
const TACTICAL_ZONE_DASH = [10, 6]
const TACTICAL_ZONE_TEXT_COLOR = '#f1c40f'

/**
 * ZONAS TÁCTICAS: dibuja la rejilla de 18 zonas imperativamente con Konva.Line
 * y Konva.Text. Numeración en orden vertical por columna (Col1→1,2,3…).
 */
function drawTacticalZones() {
  if (!tacticalZonesGroup) return
  tacticalZonesGroup.destroyChildren()

  // Líneas horizontales
  for (const y of TACTICAL_ZONE_LINES_H) {
    tacticalZonesGroup.add(new Konva.Line({
      points: [0, y, VIRTUAL_W, y],
      stroke: TACTICAL_ZONE_COLOR,
      strokeWidth: 2,
      dash: TACTICAL_ZONE_DASH,
      listening: false,
    }))
  }

  // Líneas verticales
  for (const x of TACTICAL_ZONE_LINES_V) {
    tacticalZonesGroup.add(new Konva.Line({
      points: [x, 0, x, VIRTUAL_H],
      stroke: TACTICAL_ZONE_COLOR,
      strokeWidth: 2,
      dash: TACTICAL_ZONE_DASH,
      listening: false,
    }))
  }

  // Numeración de zonas: orden vertical por columna
  const xBounds = [0, ...TACTICAL_ZONE_LINES_V, VIRTUAL_W]
  const yBounds = [0, ...TACTICAL_ZONE_LINES_H, VIRTUAL_H]
  let zoneNum = 1

  for (let col = 0; col < xBounds.length - 1; col++) {
    for (let row = 0; row < yBounds.length - 1; row++) {
      const cx = (xBounds[col] + xBounds[col + 1]) / 2
      const cy = (yBounds[row] + yBounds[row + 1]) / 2
      tacticalZonesGroup.add(new Konva.Text({
        x: cx,
        y: cy,
        text: String(zoneNum),
        fontSize: 18,
        fontStyle: 'bold',
        fill: TACTICAL_ZONE_TEXT_COLOR,
        align: 'center',
        verticalAlign: 'middle',
        offsetX: 5,
        offsetY: 9,
        listening: false,
      }))
      zoneNum++
    }
  }

  pitchLayer.batchDraw()
}

/** ZONAS TÁCTICAS: alterna la visibilidad de la rejilla. */
function toggleTacticalZones(show) {
  if (!tacticalZonesGroup) return
  tacticalZonesGroup.visible(show)
  drawTacticalZones()
  pitchLayer.batchDraw()
}

/**
 * RENDER CAMPO: construye una vez las franjas, líneas y marcas reglamentarias
 * del terreno de juego virtual. Todos los nodos son `listening: false`.
 */
function drawPitch() {
  const markings = pitchMarkings.value
  const staticAttrs = { stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, listening: false }
  const add = (node) => pitchGroup.add(node)

  for (let index = 0; index < 16; index += 1) {
    add(new Konva.Rect({ x: index * (VIRTUAL_W / 16), y: 0, width: VIRTUAL_W / 16 + 1, height: VIRTUAL_H, fill: index % 2 === 0 ? '#2e7d32' : '#388e3c', listening: false }))
  }
  add(new Konva.Rect({ ...markings.outerRect, ...staticAttrs }))
  add(new Konva.Line({ points: [markings.centerLine.x1, markings.centerLine.y1, markings.centerLine.x2, markings.centerLine.y2], ...staticAttrs }))
  add(new Konva.Circle({ ...markings.centerCircle, ...staticAttrs }))
  add(new Konva.Circle({ ...markings.centerSpot, fill: LINE_COLOR, listening: false }))
  for (const area of [markings.leftPenaltyArea, markings.rightPenaltyArea, markings.leftGoalArea, markings.rightGoalArea, markings.leftGoal, markings.rightGoal]) {
    add(new Konva.Rect({ ...area, ...staticAttrs }))
  }
  add(new Konva.Arc({ x: markings.leftPenaltyArc.x, y: markings.leftPenaltyArc.y, innerRadius: 91.5, outerRadius: 91.5, rotation: 307, angle: 106, ...staticAttrs }))
  add(new Konva.Arc({ x: markings.rightPenaltyArc.x, y: markings.rightPenaltyArc.y, innerRadius: 91.5, outerRadius: 91.5, rotation: 127, angle: 106, ...staticAttrs }))
  add(new Konva.Circle({ ...markings.leftPenaltySpot, fill: LINE_COLOR, listening: false }))
  add(new Konva.Circle({ ...markings.rightPenaltySpot, fill: LINE_COLOR, listening: false }))
  for (const [index, corner] of markings.corners.entries()) {
    add(new Konva.Arc({ x: corner.x, y: corner.y, innerRadius: corner.radius, outerRadius: corner.radius, rotation: index * 90, angle: 90, ...staticAttrs }))
  }
}

/** RESPONSIVE CANVAS: redimensiona el Stage y aplica la misma transformación a cada grupo. */
function resizeStage() {
  if (!stage) return
  stage.size({ width: width.value, height: height.value })
  backgroundLayer.getChildren()[0].size({ width: width.value, height: height.value })
  const transform = { x: offsetX.value, y: offsetY.value, scaleX: scale.value, scaleY: scale.value }
  pitchGroup.setAttrs(transform)
  elementGroup.setAttrs(transform)
  overlayGroup.setAttrs(transform)
  if (tacticalZonesGroup) {
    tacticalZonesGroup.setAttrs(transform)
    if (store.showTacticalZones) drawTacticalZones()
  }
  stage.batchDraw()
}

/** TECLADO: historial y selección, sin capturar escritura en controles HTML. */
function onKeyDown(event) {
  if (event.target?.matches('input, textarea, select, [contenteditable="true"]')) return
  if (event.ctrlKey && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    store.undo()
  } else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    store.redo()
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedElementId !== null) {
    store.removeElement(store.selectedElementId)
  } else if (event.key === 'Escape') {
    store.clearSelection()
  }
}

/**
 * WATCH RECONCILIACION: cualquier cambio profundo en elementos, selección o
 * equipos actualiza los nodos Konva y sus estilos dependientes.
 */
const stopReconciliation = watch(
  () => [store.elements, store.selectedElementId, store.teams],
  reconcileElements,
  { deep: true }
)

/** WATCH HERRAMIENTA: refleja de inmediato qué jugadores son draggable. */
const stopToolReconciliation = watch(
  () => store.selectedTool,
  reconcileElements,
  { flush: 'sync' }
)

/** WATCH RESPONSIVE: recalcula tamaño y escala al cambiar el contenedor o viewport. */
const stopResize = watch([width, height, scale, offsetX, offsetY], resizeStage)

/** WATCH ZONAS TÁCTICAS: dibuja o oculta la rejilla al cambiar la bandera. */
const stopTacticalZones = watch(
  () => store.showTacticalZones,
  (show) => toggleTacticalZones(show)
)

/**
 * CICLO DE VIDA MONTAJE: crea el árbol imperativo Stage > Layers > Groups,
 * dibuja el campo, registra eventos y reconcilia el estado inicial de Pinia.
 */
onMounted(() => {
  stage = new Konva.Stage({ container: containerRef.value, width: width.value, height: height.value })
  backgroundLayer = new Konva.Layer()
  pitchLayer = new Konva.Layer()
  elementLayer = new Konva.Layer()
  overlayLayer = new Konva.Layer()
  backgroundLayer.add(new Konva.Rect({ x: 0, y: 0, width: width.value, height: height.value, fill: PITCH_GREEN, listening: false }))
  pitchGroup = new Konva.Group()
  elementGroup = new Konva.Group()
  drawingGroup = new Konva.Group()
  playerGroup = new Konva.Group()
  overlayGroup = new Konva.Group()
  pitchLayer.add(pitchGroup)
  tacticalZonesGroup = new Konva.Group({ visible: store.showTacticalZones })
  pitchLayer.add(tacticalZonesGroup)
  elementGroup.add(drawingGroup, playerGroup)
  elementLayer.add(elementGroup)
  overlayLayer.add(overlayGroup)
  stage.add(backgroundLayer, pitchLayer, elementLayer, overlayLayer)
  drawPitch()
  if (store.showTacticalZones) drawTacticalZones()
  bindStageEvents()
  resizeStage()
  reconcileElements()
  window.addEventListener('keydown', onKeyDown)
})

/** CICLO DE VIDA DESMONTAJE: libera eventos, watchers, nodos Konva y referencias. */
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  stopReconciliation()
  stopToolReconciliation()
  stopResize()
  stopTacticalZones()
  elementNodes.clear()
  stage?.destroy()
  stage = null
})
</script>

<style scoped>
/* CONTENEDOR CANVAS: ocupa por completo el área del tablero y desactiva gestos táctiles del navegador. */
.canvas-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  touch-action: none;
}

/* OVERLAY JUGADOR: formulario HTML flotante para nombre y dorsal de la ficha. */
.player-popover {
  position: absolute;
  z-index: 1;
  display: flex;
  gap: 4px;
  width: max-content;
  padding: 6px;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: translateX(-50%);
}

/* CAMPOS OVERLAY JUGADOR: ancho compacto y estilo consistente de los inputs. */
.player-popover input {
  width: 86px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #b0b0b0;
  border-radius: 4px;
  font: inherit;
}

/* DORSAL OVERLAY JUGADOR: el segundo input requiere menos espacio horizontal. */
.player-popover input:last-child {
  width: 52px;
}

/* OVERLAY DIBUJO: menú flotante con color y acción de eliminar. */
.color-popover {
  position: absolute;
  z-index: 1;
  display: flex;
  gap: 5px;
  padding: 6px;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, -100%);
}

/* PALETA DIBUJO: cada botón representa un color predefinido. */
.color-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

/* PALETA DIBUJO ACTIVA: resalta el color que ya tiene el elemento seleccionado. */
.color-swatch.active {
  border-color: #1f2937;
  box-shadow: 0 0 0 1px #ffffff;
}

/* ACCION ELIMINAR: separada visualmente de la paleta para evitar pulsaciones accidentales. */
.delete-drawing-button {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  padding: 0;
  margin-left: 2px;
  border: 0;
  border-left: 1px solid #d1d5db;
  background: transparent;
  color: #dc2626;
  cursor: pointer;
}

/* ICONO ELIMINAR: trazo SVG heredado del color de la acción. */
.delete-drawing-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

/* ESTADO HOVER ELIMINAR: refuerza visualmente la acción destructiva. */
.delete-drawing-button:hover {
  color: #991b1b;
}
</style>
