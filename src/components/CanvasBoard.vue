<template>
  <div ref="containerRef" class="canvas-container"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import Konva from 'konva'
import { usePizarraStore } from '../stores/pizarra'
import { useCanvasResize } from '../composables/useCanvasResize'
import { useFootballPitch, VIRTUAL_H, VIRTUAL_W } from '../composables/useFootballPitch'

const store = usePizarraStore()
const containerRef = ref(null)
const { width, height } = useCanvasResize(containerRef)
const { scale, offsetX, offsetY, pitchMarkings } = useFootballPitch(width, height)

const LINE_COLOR = '#ffffff'
const LINE_WIDTH = 2
const PITCH_GREEN = '#2e7d32'
const DRAW_THRESHOLD = 8

let stage = null
let backgroundLayer = null
let pitchLayer = null
let elementLayer = null
let overlayLayer = null
let pitchGroup = null
let elementGroup = null
let overlayGroup = null
let previewNode = null
let isDrawing = false
let drawStart = null
let drawCurrent = null
let handleArrowId = null
let arrowHandles = []

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

function selectElement(id) {
  store.selectElement(id)
}

function selectAndStartPlayerDrag(player, event) {
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
  node.on('mousedown touchstart', () => selectElement(id))
}

function createPlayer(el) {
  const group = new Konva.Group({ draggable: true, listening: true, elementId: el.id })
  const circle = new Konva.Circle()
  const number = new Konva.Text({ listening: false })
  group.add(circle, number)
  bindSelection(group, el.id)
  group.on('dragend', () => {
    store.updateElement(el.id, { x: group.x(), y: group.y() })
  })
  elementGroup.add(group)
  return group
}

function updatePlayer(group, el) {
  const colors = getPlayerColors(el)
  const selected = isSelected(el)
  // Pinia puede cambiar mientras Konva está en pleno drag. No devolvemos la
  // ficha a la posición anterior hasta que el dragend persista su posición.
  if (!group.isDragging()) group.position({ x: el.x, y: el.y })
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
  const group = new Konva.Group()
  const visual = new Konva.Shape({ listening: false })
  const hitArea = new Konva.Line({ listening: true })
  group.add(visual, hitArea)
  bindSelection(group, el.id)
  elementGroup.add(group)
  return group
}

function updateArrow(group, el) {
  const selected = isSelected(el)
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
    points: el.cx == null ? [el.x, el.y, el.x2, el.y2] : [el.x, el.y, el.cx, el.cy, el.x2, el.y2],
    stroke: 'rgba(0,0,0,0.01)',
    strokeWidth: 28,
    hitStrokeWidth: 28,
    tension: el.cx == null ? 0 : 0.4,
    lineCap: 'round',
    lineJoin: 'round',
    listening: true,
  })
}

function createZone(el) {
  const node = new Konva.Rect({ draggable: true })
  bindSelection(node, el.id)
  node.on('dragend', () => {
    const current = store.elements.find((item) => item.id === el.id)
    if (!current) return
    const dx = node.x() - current.x
    const dy = node.y() - current.y
    store.updateElement(el.id, { x: node.x(), y: node.y(), x2: current.x2 + dx, y2: current.y2 + dy })
  })
  elementGroup.add(node)
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
    draggable: true,
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

function createLine(el) {
  const node = new Konva.Line()
  bindSelection(node, el.id)
  elementGroup.add(node)
  return node
}

function updateLine(node, el) {
  const selected = isSelected(el)
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

function createText(el) {
  const node = new Konva.Text({ draggable: true })
  bindSelection(node, el.id)
  node.on('dragend', () => {
    store.updateElement(el.id, { x: node.x(), y: node.y() })
  })
  elementGroup.add(node)
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
    draggable: true,
    shadowColor: selected ? '#ffffff' : undefined,
    shadowBlur: selected ? 6 : 0,
    shadowOffset: { x: 0, y: 0 },
  })
}

function createElement(el) {
  if (el.type === 'player') return createPlayer(el)
  if (el.type === 'arrow') return createArrow(el)
  if (el.type === 'zone') return createZone(el)
  if (el.type === 'line') return createLine(el)
  if (el.type === 'text') return createText(el)
  return null
}

function updateElement(node, el) {
  if (el.type === 'player') updatePlayer(node, el)
  else if (el.type === 'arrow') updateArrow(node, el)
  else if (el.type === 'zone') updateZone(node, el)
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

  renderArrowHandles()
  elementLayer.batchDraw()
  overlayLayer.batchDraw()
}

function renderArrowHandles() {
  const arrow = store.selectedElement
  if (!arrow || arrow.type !== 'arrow') {
    overlayGroup.destroyChildren()
    handleArrowId = null
    arrowHandles = []
    return
  }

  const middleX = arrow.cx ?? (arrow.x + arrow.x2) / 2
  const middleY = arrow.cy ?? (arrow.y + arrow.y2) / 2
  const definitions = [
    { x: arrow.x, y: arrow.y, fill: '#4a6cf7', update: (node) => ({ x: node.x(), y: node.y() }) },
    { x: middleX, y: middleY, fill: '#f1c40f', update: (node) => ({ cx: node.x(), cy: node.y() }) },
    { x: arrow.x2, y: arrow.y2, fill: '#e74c3c', update: (node) => ({ x2: node.x(), y2: node.y() }) },
  ]

  if (handleArrowId !== arrow.id) {
    overlayGroup.destroyChildren()
    handleArrowId = arrow.id
    arrowHandles = definitions.map((handle) => {
      const node = new Konva.Circle({ x: handle.x, y: handle.y, radius: 8, fill: handle.fill, stroke: '#ffffff', strokeWidth: 2, hitStrokeWidth: 12, draggable: true })
      node.on('dragmove', () => store.updateElement(arrow.id, handle.update(node)))
      overlayGroup.add(node)
      return node
    })
    return
  }

  // No se destruye el handle que el usuario está arrastrando: Konva mantiene
  // su ciclo nativo de drag aun cuando Pinia actualiza la flecha.
  definitions.forEach((handle, index) => {
    const node = arrowHandles[index]
    if (node && !node.isDragging()) node.position({ x: handle.x, y: handle.y })
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
    previewNode = tool === 'zone'
      ? new Konva.Rect({ listening: false })
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

  if (store.selectedTool === 'arrow') {
    store.addElement({ type: 'arrow', x: drawStart.x, y: drawStart.y, x2: drawCurrent.x, y2: drawCurrent.y, color: store.selectedColor, strokeWidth: store.strokeWidth || 5, dashed: false })
  } else if (store.selectedTool === 'line') {
    store.addElement({ type: 'line', x: drawStart.x, y: drawStart.y, x2: drawCurrent.x, y2: drawCurrent.y, color: store.selectedColor, strokeWidth: store.strokeWidth })
  } else if (store.selectedTool === 'zone') {
    store.addElement({ type: 'zone', x: Math.min(drawStart.x, drawCurrent.x), y: Math.min(drawStart.y, drawCurrent.y), x2: Math.max(drawStart.x, drawCurrent.x), y2: Math.max(drawStart.y, drawCurrent.y), color: store.selectedColor, strokeWidth: store.strokeWidth })
  }
}

function bindStageEvents() {
  stage.on('mousedown touchstart', (event) => {
    // Los elementos ya seleccionan mediante sus handlers nativos y no inician dibujo.
    if (elementIdFromNode(event.target) !== null || event.target.getParent() === overlayGroup) return

    const position = stage.getPointerPosition()
    if (!position || !scale.value) return
    const point = screenToVirtual(position)

    // Evita crear una ficha nueva cuando el hit-test nativo devolvió el Stage
    // pese a que el puntero cayó dentro de una ficha ya existente.
    const player = findPlayerAt(point)
    if (player) {
      selectAndStartPlayerDrag(player, event)
      return
    }

    store.clearSelection()

    if (store.selectedTool === 'player') {
      store.addElement({
        type: 'player',
        x: point.x,
        y: point.y,
        teamId: store.activeTeam,
        playerNumber: store.playerNumber,
        playerName: store.playerName,
      })
      return
    }

    if (store.selectedTool === 'text') {
      store.addElement({ type: 'text', x: point.x, y: point.y, color: store.selectedColor, text: store.playerName || 'Texto', fontSize: store.fontSize })
      return
    }

    if (['arrow', 'line', 'zone'].includes(store.selectedTool)) {
      isDrawing = true
      drawStart = point
      drawCurrent = point
    }
  })

  stage.on('mousemove touchmove', () => {
    if (!isDrawing) return
    const position = stage.getPointerPosition()
    if (!position || !scale.value) return
    drawCurrent = screenToVirtual(position)
    updatePreview()
  })

  stage.on('mouseup touchend', finishDrawing)
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
  overlayGroup = new Konva.Group()
  pitchLayer.add(pitchGroup)
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
</style>
