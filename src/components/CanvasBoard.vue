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

        <template v-for="el in store.elements" :key="el.id">
          <!-- Player: circle with number -->
          <template v-if="el.type === 'player'">
            <v-circle
              :config="playerCircleConfig(el)"
              @dragstart="selectElement(el.id)"
              @click="selectElement(el.id)"
            />
            <v-text
              :config="playerTextConfig(el)"
              @click="selectElement(el.id)"
            />
          </template>

          <!-- Arrow -->
          <v-arrow
            v-else-if="el.type === 'arrow'"
            :config="arrowConfig(el)"
            @dragstart="selectElement(el.id)"
            @click="selectElement(el.id)"
          />

          <!-- Zone (rectangle) -->
          <v-rect
            v-else-if="el.type === 'zone'"
            :config="zoneConfig(el)"
            @dragstart="selectElement(el.id)"
            @click="selectElement(el.id)"
          />

          <!-- Line -->
          <v-line
            v-else-if="el.type === 'line'"
            :config="lineConfig(el)"
            @dragstart="selectElement(el.id)"
            @click="selectElement(el.id)"
          />

          <!-- Text -->
          <v-text
            v-else-if="el.type === 'text'"
            :config="textElConfig(el)"
            @dragstart="selectElement(el.id)"
            @click="selectElement(el.id)"
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
      </v-layer>
    </v-stage>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePizarraStore } from '../stores/pizarra'
import { useCanvasResize } from '../composables/useCanvasResize'

const store = usePizarraStore()
const containerRef = ref(null)
const stageRef = ref(null)
const { width, height } = useCanvasResize(containerRef)

const selectedElementId = ref(null)
const isDrawing = ref(false)
const drawStart = ref({ x: 0, y: 0 })
const drawCurrent = ref({ x: 0, y: 0 })

const stageConfig = computed(() => ({
  width: width.value,
  height: height.value,
}))

const bgConfig = computed(() => ({
  x: 0,
  y: 0,
  width: width.value,
  height: height.value,
  fill: '#2e7d32',
  listening: false,
}))

function getPointerPos(e) {
  const stage = stageRef.value?.getStage()
  if (!stage) return { x: 0, y: 0 }
  const pos = stage.getPointerPosition()
  return pos || { x: 0, y: 0 }
}

function handleStageClick(e) {
  if (e.target !== e.currentTarget) return

  const pos = getPointerPos(e)
  if (!pos) return

  if (store.selectedTool === 'player') {
    store.addElement({
      type: 'player',
      x: pos.x,
      y: pos.y,
      color: store.selectedColor,
      playerNumber: store.playerNumber,
      playerName: store.playerName,
    })
  }

  if (store.selectedTool === 'text') {
    store.addElement({
      type: 'text',
      x: pos.x,
      y: pos.y,
      color: store.selectedColor,
      text: store.playerName || 'Texto',
      fontSize: store.fontSize,
    })
  }

  selectedElementId.value = null
}

function handleMouseDown(e) {
  const tool = store.selectedTool
  if (!['arrow', 'line', 'zone'].includes(tool)) return

  if (e.target !== e.currentTarget && e.target !== e.currentTarget?.findOne('Rect')) return

  const pos = getPointerPos(e)
  isDrawing.value = true
  drawStart.value = { x: pos.x, y: pos.y }
  drawCurrent.value = { x: pos.x, y: pos.y }
}

function handleMouseMove() {
  if (!isDrawing.value) return

  const stage = stageRef.value?.getStage()
  if (!stage) return
  const pos = stage.getPointerPosition()
  if (pos) {
    drawCurrent.value = { x: pos.x, y: pos.y }
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
        x: drawStart.value.x,
        y: drawStart.value.y,
        x2: drawCurrent.value.x,
        y2: drawCurrent.value.y,
        color: store.selectedColor,
        strokeWidth: store.strokeWidth,
      })
    }
    if (tool === 'line') {
      store.addElement({
        type: 'line',
        x: drawStart.value.x,
        y: drawStart.value.y,
        x2: drawCurrent.value.x,
        y2: drawCurrent.value.y,
        color: store.selectedColor,
        strokeWidth: store.strokeWidth,
      })
    }
    if (tool === 'zone') {
      const x = Math.min(drawStart.value.x, drawCurrent.value.x)
      const y = Math.min(drawStart.value.y, drawCurrent.value.y)
      const w = Math.abs(drawCurrent.value.x - drawStart.value.x)
      const h = Math.abs(drawCurrent.value.y - drawStart.value.y)
      store.addElement({
        type: 'zone',
        x,
        y,
        x2: x + w,
        y2: y + h,
        color: store.selectedColor,
        strokeWidth: store.strokeWidth,
      })
    }
  }

  isDrawing.value = false
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
    x: el.x,
    y: el.y,
    radius: 22,
    fill: el.color,
    stroke: isSelected ? '#fff' : '#222',
    strokeWidth: isSelected ? 3 : 1.5,
    draggable: true,
    name: 'player',
  }
}

function playerTextConfig(el) {
  return {
    x: el.x - 10,
    y: el.y - 10,
    width: 20,
    height: 20,
    text: String(el.playerNumber),
    fontSize: 16,
    fontStyle: 'bold',
    fill: '#fff',
    align: 'center',
    verticalAlign: 'middle',
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
    pointerLength: 10,
    pointerWidth: 10,
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
    x: el.x,
    y: el.y,
    width: w,
    height: h,
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
    draggable: true,
    name: 'line',
    ...(isSelected && { shadowColor: '#fff', shadowBlur: 6, shadowOffset: { x: 0, y: 0 } }),
  }
}

function textElConfig(el) {
  const isSelected = selectedElementId.value === el.id
  return {
    x: el.x,
    y: el.y,
    text: el.text || '',
    fontSize: el.fontSize || 20,
    fill: el.color,
    fontStyle: 'bold',
    draggable: true,
    name: 'text',
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
