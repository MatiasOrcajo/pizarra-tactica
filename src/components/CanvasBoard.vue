<template>
  <div ref="containerRef" class="canvas-container"></div>
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Konva from 'konva'
import { usePizarraStore } from '../stores/pizarra'
import { useCanvasResize } from '../composables/useCanvasResize'
import { useFootballPitch, VIRTUAL_H, VIRTUAL_W } from '../composables/useFootballPitch'

const store = usePizarraStore()
const containerRef = ref(null)
const playerPopoverId = ref(null)
const { width, height } = useCanvasResize(containerRef)
const { scale, offsetX, offsetY, pitchMarkings } = useFootballPitch(width, height)

const selectedPlayer = computed(() => {
  const element = store.selectedElement
  return element?.type === 'player' && element.id === playerPopoverId.value ? element : null
})

const selectedDrawing = computed(() => {
  const element = store.selectedElement
  return element?.type !== 'player' ? element : null
})

const playerPopoverStyle = computed(() => {
  if (!selectedPlayer.value) return {}
  return {
    left: `${selectedPlayer.value.x * scale.value + offsetX.value}px`,
    top: `${selectedPlayer.value.y * scale.value + offsetY.value + 24 * scale.value}px`,
  }
})

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

const LINE_COLOR = '#ffffff'
const LINE_WIDTH = 2
const PITCH_GREEN = '#2e7d32'
const DRAW_THRESHOLD = 8
const PRESET_COLORS = ['#ffffff', '#f1c40f', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6']
const SHAPE_TOOLS = ['arrow', 'line', 'zone', 'circle', 'text']

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
let isDrawing = false
let drawStart = null
let drawCurrent = null
let handleElementId = null
let editHandles = []
let draggedHandle = null
let playerPointerDown = null

// Cada elemento del store conserva su nodo Konva durante toda su vida.
const elementNodes = new Map()

function getPlayerColors(el) {
  if (el.teamId === 1) {
    return store.teams.team1
  }
  if (el.teamId === 2) {
    return store.teams.team2
  }
  return { primaryColor: el.color || '#e74c3c', secondaryColor: '#ffffff' }
}

function isSelected(el) {
  return store.selectedElementId === el.id
}

function isFreeTool() {
  return store.selectedTool === 'free'
}

function screenToVirtual(position) {
  return {
    x: (position.x - offsetX.value) / scale.value,
    y: (position.y - offsetY.value) / scale.value,
  }
}

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

function pointNearSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t)) <= 18
}

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

function findLineAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type !== 'line') continue
    if (pointNearSegment(point, element, { x: element.x2, y: element.y2 })) return element
  }
  return null
}

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

function findCircleAt(point) {
  for (let index = store.elements.length - 1; index >= 0; index -= 1) {
    const element = store.elements[index]
    if (element.type === 'circle' && Math.hypot(point.x - element.x, point.y - element.y) <= element.radius) return element
  }
  return null
}

function selectElement(id) {
  store.selectElement(id)
}

function updateSelectedPlayerName(event) {
  if (selectedPlayer.value) {
    store.updateElement(selectedPlayer.value.id, { playerName: event.target.value })
  }
}

function updateSelectedPlayerNumber(event) {
  if (selectedPlayer.value) {
    store.updateElement(selectedPlayer.value.id, { playerNumber: event.target.value })
  }
}

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

function bindSelection(node, id) {
  node.setAttr('elementId', id)
  node.on('mousedown touchstart', () => {
    if (isFreeTool()) selectElement(id)
  })
}

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
  group.on('dragend', () => {
    store.updateElement(el.id, { x: group.x(), y: group.y() })
  })
  playerGroup.add(group)
  return group
}

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
    radius: 18,
    fill: colors.primaryColor,
    stroke: selected ? '#ffffff' : 'rgba(0,0,0,0.35)',
    strokeWidth: selected ? 3 : 2,
    listening: true,
    perfectDrawEnabled: false,
  })
  group.getChildren()[1].setAttrs({
    x: -10,
    y: -10,
    width: 20,
    height: 20,
    text: String(el.playerNumber),
    fontSize: 15,
    fontStyle: 'bold',
    fill: colors.secondaryColor,
    align: 'center',
    verticalAlign: 'middle',
    listening: false,
  })
  group.getChildren()[2].setAttrs({
    x: -60,
    y: 23,
    width: 120,
    text: el.playerName || '',
    fontSize: 13,
    fontStyle: 'bold',
    fill: '#ffffff',
    align: 'center',
    listening: false,
  })
}

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

function createArrow(el) {
  const group = new Konva.Group({ draggable: isFreeTool() })
  const visual = new Konva.Shape({ listening: false })
  const hitArea = new Konva.Shape({ listening: true })
  group.add(visual, hitArea)
  bindSelection(hitArea, el.id)
  group.on('dragend', () => {
    const current = store.elements.find((item) => item.id === el.id)
    if (!current) return
    const dx = group.x()
    const dy = group.y()
    if (!dx && !dy) return
    store.updateElement(el.id, {
      x: current.x + dx,
      y: current.y + dy,
      x2: current.x2 + dx,
      y2: current.y2 + dy,
      ...(current.cx == null ? {} : { cx: current.cx + dx, cy: current.cy + dy }),
    })
  })
  drawingGroup.add(group)
  return group
}

function updateArrow(group, el) {
  const selected = isSelected(el)
  if (!group.isDragging()) group.position({ x: 0, y: 0 })
  group.draggable(isFreeTool())
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

function createZone(el) {
  const node = new Konva.Rect({ draggable: isFreeTool() })
  bindSelection(node, el.id)
  node.on('dragend', () => {
    const current = store.elements.find((item) => item.id === el.id)
    if (!current) return
    const dx = node.x() - current.x
    const dy = node.y() - current.y
    store.updateElement(el.id, { x: node.x(), y: node.y(), x2: current.x2 + dx, y2: current.y2 + dy })
  })
  drawingGroup.add(node)
  return node
}

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
    draggable: isFreeTool(),
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

function createCircle(el) {
  const node = new Konva.Circle({ draggable: isFreeTool() })
  bindSelection(node, el.id)
  node.on('dragend', () => {
    store.updateElement(el.id, { x: node.x(), y: node.y() })
  })
  drawingGroup.add(node)
  return node
}

function updateCircle(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: el.x, y: el.y })
  node.setAttrs({
    radius: el.radius,
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    fill: `${el.color}22`,
    dash: [8, 4],
    draggable: isFreeTool(),
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

function createLine(el) {
  const node = new Konva.Line({ draggable: isFreeTool() })
  bindSelection(node, el.id)
  node.on('dragend', () => {
    const current = store.elements.find((item) => item.id === el.id)
    if (!current) return
    const dx = node.x()
    const dy = node.y()
    if (!dx && !dy) return
    store.updateElement(el.id, {
      x: current.x + dx,
      y: current.y + dy,
      x2: current.x2 + dx,
      y2: current.y2 + dy,
      startPlayerId: null,
      endPlayerId: null,
    })
  })
  drawingGroup.add(node)
  return node
}

function updateLine(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: 0, y: 0 })
  node.setAttrs({
    points: [el.x, el.y, el.x2, el.y2],
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    hitStrokeWidth: 20,
    lineCap: 'round',
    draggable: isFreeTool(),
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

function createText(el) {
  const node = new Konva.Text({ draggable: isFreeTool() })
  bindSelection(node, el.id)
  node.on('dragend', () => {
    store.updateElement(el.id, { x: node.x(), y: node.y() })
  })
  drawingGroup.add(node)
  return node
}

function updateText(node, el) {
  const selected = isSelected(el)
  if (!node.isDragging()) node.position({ x: el.x, y: el.y })
  node.setAttrs({
    text: el.text || '',
    fontSize: el.fontSize || 20,
    fontStyle: 'bold',
    fill: el.color,
    draggable: isFreeTool(),
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

function createElement(el) {
  if (el.type === 'player') return createPlayer(el)
  if (el.type === 'arrow') return createArrow(el)
  if (el.type === 'zone') return createZone(el)
  if (el.type === 'circle') return createCircle(el)
  if (el.type === 'line') return createLine(el)
  if (el.type === 'text') return createText(el)
  return null
}

function updateElement(node, el) {
  if (el.type === 'player') updatePlayer(node, el)
  else if (el.type === 'arrow') updateArrow(node, el)
  else if (el.type === 'zone') updateZone(node, el)
  else if (el.type === 'circle') updateCircle(node, el)
  else if (el.type === 'line') updateLine(node, el)
  else if (el.type === 'text') updateText(node, el)
}

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

function handleDefinitions(element) {
  if (element.type === 'arrow') {
    const middleX = element.cx ?? (element.x + element.x2) / 2
    const middleY = element.cy ?? (element.y + element.y2) / 2
    return [
      { x: element.x, y: element.y, fill: '#4a6cf7', changes: (point) => ({ x: point.x, y: point.y }) },
      { x: middleX, y: middleY, fill: '#f1c40f', changes: (point) => ({ cx: point.x, cy: point.y }) },
      { x: element.x2, y: element.y2, fill: '#e74c3c', changes: (point) => ({ x2: point.x, y2: point.y }) },
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

function startHandleDrag(point) {
  if (!isFreeTool()) return false
  const element = store.selectedElement
  if (!element) return false

  const handle = handleDefinitions(element).find((item) => Math.hypot(point.x - item.x, point.y - item.y) <= 18)
  if (!handle) return false

  draggedHandle = { elementId: element.id, changes: handle.changes }
  return true
}

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

function clearPreview() {
  if (previewNode) {
    previewNode.destroy()
    previewNode = null
  }
}

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

function finishDrawing() {
  if (!isDrawing || !drawStart || !drawCurrent) return
  isDrawing = false
  clearPreview()

  const dx = drawCurrent.x - drawStart.x
  const dy = drawCurrent.y - drawStart.y
  if (Math.abs(dx) < DRAW_THRESHOLD && Math.abs(dy) < DRAW_THRESHOLD) return

  const tool = store.selectedTool
  if (tool === 'arrow') {
    store.addElement({ type: 'arrow', x: drawStart.x, y: drawStart.y, x2: drawCurrent.x, y2: drawCurrent.y, color: store.selectedColor, strokeWidth: store.strokeWidth || 5, dashed: false })
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
      color: store.selectedColor,
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

    if (startHandleDrag(point)) {
      playerPointerDown = null
      event.evt?.preventDefault?.()
      return
    }

    // Los elementos ya seleccionan mediante sus handlers nativos y no inician dibujo.
    if (elementIdFromNode(event.target) !== null || event.target.getParent() === overlayGroup) return

    // Evita crear una ficha nueva cuando el hit-test nativo devolvió el Stage
    // pese a que el puntero cayó dentro de una ficha ya existente.
    if (playerAtPointer) {
      selectAndStartPlayerDrag(playerAtPointer, event)
      return
    }

    // Respaldo cuando el hit canvas de Konva aún no refleja una flecha recién dibujada.
    const arrow = findArrowAt(point)
    if (arrow) {
      store.selectElement(arrow.id)
      return
    }

    const line = findLineAt(point)
    if (line) {
      store.selectElement(line.id)
      return
    }

    const zone = findZoneAt(point)
    if (zone) {
      store.selectElement(zone.id)
      return
    }

    const circle = findCircleAt(point)
    if (circle) {
      store.selectElement(circle.id)
      return
    }

    store.clearSelection()

  })

  stage.on('mousemove touchmove', () => {
    if (draggedHandle) {
      const position = stage.getPointerPosition()
      if (!position || !scale.value) return
      const point = screenToVirtual(position)
      store.updateElement(draggedHandle.elementId, draggedHandle.changes(point))
      return
    }

    if (!isDrawing) return
    const position = stage.getPointerPosition()
    if (!position || !scale.value) return
    drawCurrent = screenToVirtual(position)
    updatePreview()
  })

  stage.on('mouseup touchend', () => {
    if (draggedHandle) {
      draggedHandle = null
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

function resizeStage() {
  if (!stage) return
  stage.size({ width: width.value, height: height.value })
  backgroundLayer.getChildren()[0].size({ width: width.value, height: height.value })
  const transform = { x: offsetX.value, y: offsetY.value, scaleX: scale.value, scaleY: scale.value }
  pitchGroup.setAttrs(transform)
  elementGroup.setAttrs(transform)
  overlayGroup.setAttrs(transform)
  stage.batchDraw()
}

function onKeyDown(event) {
  if (event.target?.matches('input, textarea, select, [contenteditable="true"]')) return
  if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedElementId !== null) {
    store.removeElement(store.selectedElementId)
  } else if (event.key === 'Escape') {
    store.clearSelection()
  }
}

const stopReconciliation = watch(
  () => [store.elements, store.selectedElementId, store.teams],
  reconcileElements,
  { deep: true }
)

const stopToolReconciliation = watch(
  () => store.selectedTool,
  reconcileElements,
  { flush: 'sync' }
)

const stopResize = watch([width, height, scale, offsetX, offsetY], resizeStage)

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
  elementGroup.add(drawingGroup, playerGroup)
  elementLayer.add(elementGroup)
  overlayLayer.add(overlayGroup)
  stage.add(backgroundLayer, pitchLayer, elementLayer, overlayLayer)
  drawPitch()
  bindStageEvents()
  resizeStage()
  reconcileElements()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  stopReconciliation()
  stopToolReconciliation()
  stopResize()
  elementNodes.clear()
  stage?.destroy()
  stage = null
})
</script>

<style scoped>
.canvas-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  touch-action: none;
}

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

.player-popover input {
  width: 86px;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid #b0b0b0;
  border-radius: 4px;
  font: inherit;
}

.player-popover input:last-child {
  width: 52px;
}

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

.color-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

.color-swatch.active {
  border-color: #1f2937;
  box-shadow: 0 0 0 1px #ffffff;
}

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

.delete-drawing-button svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.delete-drawing-button:hover {
  color: #991b1b;
}
</style>
