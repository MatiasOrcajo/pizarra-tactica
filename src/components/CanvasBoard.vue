<template>
  <div ref="containerRef" class="canvas-container">
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @click="handleStageClick"
    >
      <v-layer>
        <v-rect :config="bgConfig" />
        <v-group :config="groupConfig">
          <!-- Grass stripes -->
          <template v-for="s in grassStripes" :key="s.id">
            <v-rect :config="s" />
          </template>

          <!-- Pitch boundary -->
          <v-rect :config="pitchBoundaryConfig" />

          <!-- Center line -->
          <v-line :config="centerLineConfig" />

          <!-- Center circle -->
          <v-circle :config="centerCircleConfig" />
          <v-circle :config="centerSpotConfig" />

          <!-- Penalty areas -->
          <v-rect :config="leftPenaltyAreaConfig" />
          <v-rect :config="rightPenaltyAreaConfig" />

          <!-- Goal areas -->
          <v-rect :config="leftGoalAreaConfig" />
          <v-rect :config="rightGoalAreaConfig" />

          <!-- Goals -->
          <v-rect :config="leftGoalConfig" />
          <v-rect :config="rightGoalConfig" />

          <!-- Penalty arcs (medialunas) -->
          <v-arc :config="leftPenaltyArcConfig" />
          <v-arc :config="rightPenaltyArcConfig" />

          <!-- Penalty spots -->
          <v-circle :config="leftPenaltySpotConfig" />
          <v-circle :config="rightPenaltySpotConfig" />

          <!-- Corner arcs -->
          <v-arc v-for="c in cornerConfigs" :key="c.id" :config="c" />

          <!-- Store elements -->
          <template v-for="el in store.elements" :key="el.id">
            <!-- Player as group -->
            <v-group
              v-if="el.type === 'player'"
              :config="{ x: el.x, y: el.y, draggable: true, name: 'player-group' }"
              @dragend="handlePlayerDrag(el, $event)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            >
              <v-circle :config="playerCircleConfig(el)" />
              <v-text :config="playerTextConfig(el)" />
            </v-group>

            <!-- Arrow -->
            <v-arrow
              v-else-if="el.type === 'arrow'"
              :config="arrowConfig(el)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />

            <!-- Zone -->
            <v-rect
              v-else-if="el.type === 'zone'"
              :config="zoneConfig(el)"
              @dragend="handleZoneDrag(el, $event)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />

            <!-- Line -->
            <v-line
              v-else-if="el.type === 'line'"
              :config="lineConfig(el)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />

            <!-- Text -->
            <v-text
              v-else-if="el.type === 'text'"
              :config="textElConfig(el)"
              @dragend="handleTextDrag(el, $event)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />
          </template>

          <!-- Drawing preview -->
          <v-arrow
            v-if="isDrawing && (store.selectedTool === 'arrow' || store.selectedTool === 'line')"
            :config="previewArrowConfig"
          />
          <v-rect
            v-if="isDrawing && store.selectedTool === 'zone'"
            :config="previewRectConfig"
          />
        </v-group>
      </v-layer>
    </v-stage>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePizarraStore } from '../stores/pizarra'
import { useCanvasResize } from '../composables/useCanvasResize'
import { useFootballPitch, VIRTUAL_W, VIRTUAL_H } from '../composables/useFootballPitch'

const store = usePizarraStore()
const containerRef = ref(null)
const stageRef = ref(null)
const { width, height } = useCanvasResize(containerRef)
const { scale, offsetX, offsetY, pitchMarkings } = useFootballPitch(width, height)

const selectedElementId = ref(null)
const isDrawing = ref(false)
const drawStart = ref({ x: 0, y: 0 })
const drawCurrent = ref({ x: 0, y: 0 })

const LINE_COLOR = '#ffffff'
const LINE_WIDTH = 2
const PITCH_GREEN = '#2e7d32'

const stageConfig = computed(() => ({
  width: width.value,
  height: height.value,
}))

const bgConfig = computed(() => ({
  x: 0, y: 0, width: width.value, height: height.value,
  fill: PITCH_GREEN, listening: false,
}))

const groupConfig = computed(() => ({
  scaleX: scale.value,
  scaleY: scale.value,
  x: offsetX.value,
  y: offsetY.value,
}))

const grassStripes = computed(() => {
  const stripes = []
  const n = 16
  const w = VIRTUAL_W / n
  for (let i = 0; i < n; i++) {
    stripes.push({
      id: `stripe-${i}`,
      x: i * w, y: 0, width: w + 1, height: VIRTUAL_H,
      fill: i % 2 === 0 ? '#2e7d32' : '#388e3c',
      listening: false,
    })
  }
  return stripes
})

const pitchBoundaryConfig = computed(() => ({
  x: 0, y: 0, width: VIRTUAL_W, height: VIRTUAL_H,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const centerLineConfig = computed(() => ({
  points: [VIRTUAL_W / 2, 0, VIRTUAL_W / 2, VIRTUAL_H],
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, listening: false,
}))

const centerCircleConfig = computed(() => ({
  x: VIRTUAL_W / 2, y: VIRTUAL_H / 2,
  radius: 91.5,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const centerSpotConfig = computed(() => ({
  x: VIRTUAL_W / 2, y: VIRTUAL_H / 2,
  radius: 4, fill: LINE_COLOR, listening: false,
}))

const leftPenaltyAreaConfig = computed(() => ({
  x: 0, y: 138.4, width: 165, height: 403.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const rightPenaltyAreaConfig = computed(() => ({
  x: VIRTUAL_W - 165, y: 138.4, width: 165, height: 403.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const leftGoalAreaConfig = computed(() => ({
  x: 0, y: 248.4, width: 55, height: 183.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const rightGoalAreaConfig = computed(() => ({
  x: VIRTUAL_W - 55, y: 248.4, width: 55, height: 183.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const leftGoalConfig = computed(() => ({
  x: -20, y: 303.4, width: 20, height: 73.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const rightGoalConfig = computed(() => ({
  x: VIRTUAL_W, y: 303.4, width: 20, height: 73.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

const leftPenaltyArcConfig = computed(() => ({
  x: 110, y: 340,
  innerRadius: 91.5, outerRadius: 91.5,
  rotation: 307, angle: 106,
  stroke: LINE_COLOR, strokeWidth: 2,
  listening: false,
}))

const rightPenaltyArcConfig = computed(() => ({
  x: 940, y: 340,
  innerRadius: 91.5, outerRadius: 91.5,
  rotation: 127, angle: 106,
  stroke: LINE_COLOR, strokeWidth: 2,
  listening: false,
}))

const leftPenaltySpotConfig = computed(() => ({
  x: 110, y: VIRTUAL_H / 2,
  radius: 3, fill: LINE_COLOR, listening: false,
}))

const rightPenaltySpotConfig = computed(() => ({
  x: VIRTUAL_W - 110, y: VIRTUAL_H / 2,
  radius: 3, fill: LINE_COLOR, listening: false,
}))

const cornerConfigs = computed(() => {
  return [
    { id: 'corner-tl', x: 0, y: 0, innerRadius: 10, outerRadius: 10, rotation: 0, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
    { id: 'corner-tr', x: 1050, y: 0, innerRadius: 10, outerRadius: 10, rotation: 90, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
    { id: 'corner-br', x: 1050, y: 680, innerRadius: 10, outerRadius: 10, rotation: 180, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
    { id: 'corner-bl', x: 0, y: 680, innerRadius: 10, outerRadius: 10, rotation: 270, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
  ]
})

function screenToVirtual(pos) {
  return {
    x: (pos.x - offsetX.value) / scale.value,
    y: (pos.y - offsetY.value) / scale.value,
  }
}

function handleStageClick(e) {
  if (e.target !== e.currentTarget) return

  const pos = e.currentTarget.getPointerPosition()
  if (!pos) return

  const v = screenToVirtual(pos)

  if (store.selectedTool === 'player') {
    store.addElement({
      type: 'player',
      x: v.x,
      y: v.y,
      color: store.selectedColor,
      playerNumber: store.playerNumber,
      playerName: store.playerName,
    })
  }

  if (store.selectedTool === 'text') {
    store.addElement({
      type: 'text',
      x: v.x,
      y: v.y,
      color: store.selectedColor,
      text: store.playerName || 'Texto',
      fontSize: store.fontSize,
    })
  }

  selectedElementId.value = null
}

function handleMouseDown(e) {
  if (!['arrow', 'line', 'zone'].includes(store.selectedTool)) return
  if (e.target !== e.currentTarget) return

  const pos = e.currentTarget.getPointerPosition()
  if (!pos) return

  const v = screenToVirtual(pos)
  isDrawing.value = true
  drawStart.value = { x: v.x, y: v.y }
  drawCurrent.value = { x: v.x, y: v.y }
}

function handleMouseMove() {
  if (!isDrawing.value) return
  const stage = stageRef.value?.getStage()
  if (!stage) return
  const pos = stage.getPointerPosition()
  if (pos) {
    drawCurrent.value = screenToVirtual(pos)
  }
}

function handleMouseUp() {
  if (!isDrawing.value) return
  const tool = store.selectedTool
  const dx = drawCurrent.value.x - drawStart.value.x
  const dy = drawCurrent.value.y - drawStart.value.y

  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
    if (tool === 'arrow') {
      store.addElement({
        type: 'arrow',
        x: drawStart.value.x, y: drawStart.value.y,
        x2: drawCurrent.value.x, y2: drawCurrent.value.y,
        color: store.selectedColor,
        strokeWidth: store.strokeWidth,
      })
    }
    if (tool === 'line') {
      store.addElement({
        type: 'line',
        x: drawStart.value.x, y: drawStart.value.y,
        x2: drawCurrent.value.x, y2: drawCurrent.value.y,
        color: store.selectedColor,
        strokeWidth: store.strokeWidth,
      })
    }
    if (tool === 'zone') {
      store.addElement({
        type: 'zone',
        x: Math.min(drawStart.value.x, drawCurrent.value.x),
        y: Math.min(drawStart.value.y, drawCurrent.value.y),
        x2: Math.max(drawStart.value.x, drawCurrent.value.x),
        y2: Math.max(drawStart.value.y, drawCurrent.value.y),
        color: store.selectedColor,
        strokeWidth: store.strokeWidth,
      })
    }
  }

  isDrawing.value = false
}

function handlePlayerDrag(el, e) {
  const node = e.target
  store.updateElement(el.id, { x: node.x(), y: node.y() })
}

function handleZoneDrag(el, e) {
  const node = e.target
  const dx = node.x() - el.x
  const dy = node.y() - el.y
  store.updateElement(el.id, {
    x: node.x(), y: node.y(),
    x2: el.x2 + dx, y2: el.y2 + dy,
  })
}

function handleTextDrag(el, e) {
  const node = e.target
  store.updateElement(el.id, { x: node.x(), y: node.y() })
}

function selectElement(id) {
  selectedElementId.value = id
}

function onKeyDown(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId.value !== null) {
    store.removeElement(selectedElementId.value)
    selectedElementId.value = null
  }
  if (e.key === 'Escape') {
    selectedElementId.value = null
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

const previewArrowConfig = computed(() => ({
  points: [drawStart.value.x, drawStart.value.y, drawCurrent.value.x, drawCurrent.value.y],
  stroke: store.selectedColor,
  strokeWidth: store.strokeWidth,
  fill: store.selectedTool === 'arrow' ? store.selectedColor : undefined,
  pointerLength: 10,
  pointerWidth: 10,
  dash: store.selectedTool === 'line' ? [10, 5] : undefined,
  listening: false,
}))

const previewRectConfig = computed(() => ({
  x: Math.min(drawStart.value.x, drawCurrent.value.x),
  y: Math.min(drawStart.value.y, drawCurrent.value.y),
  width: Math.abs(drawCurrent.value.x - drawStart.value.x),
  height: Math.abs(drawCurrent.value.y - drawStart.value.y),
  stroke: store.selectedColor,
  strokeWidth: store.strokeWidth,
  fill: store.selectedColor + '22',
  dash: [8, 4],
  listening: false,
}))

function playerCircleConfig(el) {
  const isSelected = selectedElementId.value === el.id
  return {
    x: 0, y: 0, radius: 18,
    fill: el.color,
    stroke: isSelected ? '#fff' : 'rgba(0,0,0,0.35)',
    strokeWidth: isSelected ? 3 : 2,
    listening: true,
  }
}

function playerTextConfig(el) {
  return {
    x: -10, y: -10, width: 20, height: 20,
    text: String(el.playerNumber),
    fontSize: 15, fontStyle: 'bold',
    fill: '#fff', align: 'center', verticalAlign: 'middle',
    listening: false,
  }
}

function arrowConfig(el) {
  const isSelected = selectedElementId.value === el.id
  return {
    points: [el.x, el.y, el.x2, el.y2],
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    fill: el.color,
    pointerLength: 10, pointerWidth: 10,
    strokeScaleEnabled: false,
    name: 'arrow',
    ...(isSelected && { shadowColor: '#fff', shadowBlur: 6, shadowOffset: { x: 0, y: 0 } }),
  }
}

function zoneConfig(el) {
  const isSelected = selectedElementId.value === el.id
  const w = el.x2 - el.x
  const h = el.y2 - el.y
  return {
    x: el.x, y: el.y, width: w, height: h,
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    fill: el.color + '22',
    dash: [8, 4],
    draggable: true,
    name: 'zone',
    ...(isSelected && { shadowColor: '#fff', shadowBlur: 6, shadowOffset: { x: 0, y: 0 } }),
  }
}

function lineConfig(el) {
  const isSelected = selectedElementId.value === el.id
  return {
    points: [el.x, el.y, el.x2, el.y2],
    stroke: el.color,
    strokeWidth: el.strokeWidth || 3,
    lineCap: 'round',
    name: 'line',
    ...(isSelected && { shadowColor: '#fff', shadowBlur: 6, shadowOffset: { x: 0, y: 0 } }),
  }
}

function textElConfig(el) {
  const isSelected = selectedElementId.value === el.id
  return {
    x: el.x, y: el.y,
    text: el.text || '',
    fontSize: el.fontSize || 20,
    fill: el.color, fontStyle: 'bold',
    draggable: true, name: 'text',
    ...(isSelected && { shadowColor: '#fff', shadowBlur: 6, shadowOffset: { x: 0, y: 0 } }),
  }
}
</script>

<style scoped>
.canvas-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
