<template>
  <!--
    CanvasBoard.vue — Componente principal del tablero táctico.

    Renderiza una cancha de fútbol con todas sus marcaciones oficiales
    (escala 1 m = 10 px) sobre un lienzo Konva escalable, y permite
    añadir jugadores, flechas, líneas, zonas y texto mediante el store.
  -->
  <div ref="containerRef" class="canvas-container">
    <!-- Konva Stage: ocupa todo el viewport, se redimensiona automáticamente -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @click="handleStageClick"
    >
      <v-layer>
        <!-- Fondo verde sólido (detrás de la cancha) -->
        <v-rect :config="bgConfig" />

        <!-- Grupo escalado y centrado que contiene toda la cancha -->
        <v-group :config="groupConfig">
          <!-- ========== FRANJAS DE CÉSPED ========== -->
          <template v-for="s in grassStripes" :key="s.id">
            <v-rect :config="s" />
          </template>

          <!-- ========== BORDE DEL CAMPO ========== -->
          <v-rect :config="pitchBoundaryConfig" />

          <!-- ========== LÍNEA CENTRAL ========== -->
          <v-line :config="centerLineConfig" />

          <!-- ========== CÍRCULO Y PUNTO CENTRAL ========== -->
          <v-circle :config="centerCircleConfig" />
          <v-circle :config="centerSpotConfig" />

          <!-- ========== ÁREAS GRANDES (16.5 m) ========== -->
          <v-rect :config="leftPenaltyAreaConfig" />
          <v-rect :config="rightPenaltyAreaConfig" />

          <!-- ========== ÁREAS CHICAS (5.5 m) ========== -->
          <v-rect :config="leftGoalAreaConfig" />
          <v-rect :config="rightGoalAreaConfig" />

          <!-- ========== PORTERÍAS ========== -->
          <v-rect :config="leftGoalConfig" />
          <v-rect :config="rightGoalConfig" />

          <!-- ========== MEDIALUNA (ARCO PENAL, 9.15 m) ========== -->
          <v-arc :config="leftPenaltyArcConfig" />
          <v-arc :config="rightPenaltyArcConfig" />

          <!-- ========== PUNTOS PENALES (11 m) ========== -->
          <v-circle :config="leftPenaltySpotConfig" />
          <v-circle :config="rightPenaltySpotConfig" />

          <!-- ========== ARCOS DE CÓRNER (1 m) ========== -->
          <v-arc v-for="c in cornerConfigs" :key="c.id" :config="c" />

          <!-- ============================================
               ELEMENTOS DEL STORE (jugadores, flechas, etc.)
               ============================================ -->
          <template v-for="el in store.elements" :key="el.id">
            <!-- Jugador: círculo con número y nombre -->
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

            <!-- Flecha (pase / dirección) -->
            <v-arrow
              v-else-if="el.type === 'arrow'"
              :config="arrowConfig(el)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />

            <!-- Zona (rectángulo punteado) -->
            <v-rect
              v-else-if="el.type === 'zone'"
              :config="zoneConfig(el)"
              @dragend="handleZoneDrag(el, $event)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />

            <!-- Línea recta -->
            <v-line
              v-else-if="el.type === 'line'"
              :config="lineConfig(el)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />

            <!-- Texto libre -->
            <v-text
              v-else-if="el.type === 'text'"
              :config="textElConfig(el)"
              @dragend="handleTextDrag(el, $event)"
              @click="selectElement(el.id)"
              @tap="selectElement(el.id)"
            />
          </template>

          <!-- ========== VISTA PREVIA DE DIBUJO ========== -->
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
/**
 * CanvasBoard.vue (script) — Lógica del tablero táctico.
 *
 * Responsabilidades:
 *   1. Configurar el Stage y el Group escalado de Konva.
 *   2. Definir todas las marcaciones de la cancha como computed().
 *   3. Manejar los eventos del mouse para crear y arrastrar elementos.
 *   4. Generar los :config de cada tipo de elemento del store.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePizarraStore } from '../stores/pizarra'
import { useCanvasResize } from '../composables/useCanvasResize'
import { useFootballPitch, VIRTUAL_W, VIRTUAL_H } from '../composables/useFootballPitch'

// ========================
// STORE Y REFERENCIAS
// ========================

/** Store Pinia con todos los elementos y herramientas */
const store = usePizarraStore()

/** Referencia al div contenedor (para medir su tamaño real) */
const containerRef = ref(null)
/** Referencia al Stage de Konva (para obtener coordenadas del puntero) */
const stageRef = ref(null)

/** Tamaño real del contenedor (reactivo, vía ResizeObserver) */
const { width, height } = useCanvasResize(containerRef)
/** Escala uniforme, offsets y datos de marcaciones */
const { scale, offsetX, offsetY, pitchMarkings } = useFootballPitch(width, height)

// ========================
// ESTADO LOCAL DEL LIENZO
// ========================

/** ID del elemento actualmente seleccionado (null = ninguno) */
const selectedElementId = ref(null)
/** Indica si se está dibujando una flecha / línea / zona */
const isDrawing = ref(false)
/** Punto de inicio del dibujo (en coordenadas virtuales) */
const drawStart = ref({ x: 0, y: 0 })
/** Punto actual del cursor durante el dibujo (coordenadas virtuales) */
const drawCurrent = ref({ x: 0, y: 0 })

// ========================
// CONSTANTES DE ESTILO
// ========================

/** Color de todas las líneas de la cancha */
const LINE_COLOR = '#ffffff'
/** Grosor de las líneas (px) */
const LINE_WIDTH = 2
/** Color de fondo verde oscuro de la cancha */
const PITCH_GREEN = '#2e7d32'

// ====================================================
// CONFIGS DEL STAGE, FONDO Y GRUPO ESCALADO
// ====================================================

/** Stage de Konva: ocupa todo el viewport */
const stageConfig = computed(() => ({
  width: width.value,
  height: height.value,
}))

/** Fondo sólido verde (cubre todo el Stage, incluso fuera de la cancha) */
const bgConfig = computed(() => ({
  x: 0, y: 0, width: width.value, height: height.value,
  fill: PITCH_GREEN, listening: false,
}))

/**
 * Grupo escalado: aplica la escala uniforme y los offsets de centrado.
 * Todo el contenido de la cancha se dibuja dentro de este grupo.
 */
const groupConfig = computed(() => ({
  scaleX: scale.value,
  scaleY: scale.value,
  x: offsetX.value,
  y: offsetY.value,
}))

// ====================================================
// FRANJAS DE CÉSPED (16 bandas verticales alternadas)
// ====================================================

const grassStripes = computed(() => {
  const stripes = []
  const n = 16                    // número de franjas
  const w = VIRTUAL_W / n        // ancho de cada franja
  for (let i = 0; i < n; i++) {
    stripes.push({
      id: `stripe-${i}`,
      x: i * w, y: 0, width: w + 1, height: VIRTUAL_H,
      fill: i % 2 === 0 ? '#2e7d32' : '#388e3c',  // alterna dos tonos de verde
      listening: false,          // no responde a eventos del mouse
    })
  }
  return stripes
})

// ====================================================
// BORDE Y LÍNEA CENTRAL
// ====================================================

/** Rectángulo exterior que delimita el campo (1050 × 680 px) */
const pitchBoundaryConfig = computed(() => ({
  x: 0, y: 0, width: VIRTUAL_W, height: VIRTUAL_H,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

/** Línea de medio campo (vertical, divide el campo en dos mitades) */
const centerLineConfig = computed(() => ({
  points: [VIRTUAL_W / 2, 0, VIRTUAL_W / 2, VIRTUAL_H],
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, listening: false,
}))

// ====================================================
// CÍRCULO Y PUNTO CENTRAL
// ====================================================

/** Círculo central: radio 9.15 m (91.5 px), sin relleno */
const centerCircleConfig = computed(() => ({
  x: VIRTUAL_W / 2, y: VIRTUAL_H / 2,
  radius: 91.5,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

/** Punto central: radio 0.4 m (4 px), relleno blanco */
const centerSpotConfig = computed(() => ({
  x: VIRTUAL_W / 2, y: VIRTUAL_H / 2,
  radius: 4, fill: LINE_COLOR, listening: false,
}))

// ====================================================
// ÁREAS (grande → 16.5 m, chica → 5.5 m)
// ====================================================

/** Área grande izquierda: 165 × 403.2 px (16.5 × 40.32 m) */
const leftPenaltyAreaConfig = computed(() => ({
  x: 0, y: 138.4, width: 165, height: 403.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

/** Área grande derecha: simétrica a la izquierda */
const rightPenaltyAreaConfig = computed(() => ({
  x: VIRTUAL_W - 165, y: 138.4, width: 165, height: 403.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

/** Área chica izquierda: 55 × 183.2 px (5.5 × 18.32 m) */
const leftGoalAreaConfig = computed(() => ({
  x: 0, y: 248.4, width: 55, height: 183.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

/** Área chica derecha */
const rightGoalAreaConfig = computed(() => ({
  x: VIRTUAL_W - 55, y: 248.4, width: 55, height: 183.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

// ====================================================
// PORTERÍAS (2 × 7.32 m → 20 × 73.2 px)
// ====================================================

/** Portería izquierda: sobresale 20 px fuera del campo */
const leftGoalConfig = computed(() => ({
  x: -20, y: 303.4, width: 20, height: 73.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

/** Portería derecha: a partir del borde X = 1050 */
const rightGoalConfig = computed(() => ({
  x: VIRTUAL_W, y: 303.4, width: 20, height: 73.2,
  stroke: LINE_COLOR, strokeWidth: LINE_WIDTH, fill: null, listening: false,
}))

// ====================================================
// MEDIALUNA (ARCO PENAL) — <v-arc> con radios iguales
// ====================================================
// Se usa innerRadius = outerRadius para que el arco
// se dibuje como una línea en lugar de un segmento relleno.
// rotation = ángulo de inicio, angle = barrido (grados).

/** Medialuna izquierda: centrada en el punto penal (110, 340),
 *  radio 9.15 m (91.5 px), barre 106° hacia la derecha. */
const leftPenaltyArcConfig = computed(() => ({
  x: 110, y: 340,
  innerRadius: 91.5, outerRadius: 91.5,
  rotation: 307, angle: 106,
  stroke: LINE_COLOR, strokeWidth: 2,
  listening: false,
}))

/** Medialuna derecha: centrada en (940, 340), barre 106° hacia la izquierda. */
const rightPenaltyArcConfig = computed(() => ({
  x: 940, y: 340,
  innerRadius: 91.5, outerRadius: 91.5,
  rotation: 127, angle: 106,
  stroke: LINE_COLOR, strokeWidth: 2,
  listening: false,
}))

// ====================================================
// PUNTOS PENALES (11 m desde la línea de meta)
// ====================================================

/** Punto penal izquierdo (X = 110, centrado verticalmente) */
const leftPenaltySpotConfig = computed(() => ({
  x: 110, y: VIRTUAL_H / 2,
  radius: 3, fill: LINE_COLOR, listening: false,
}))

/** Punto penal derecho (X = 940) */
const rightPenaltySpotConfig = computed(() => ({
  x: VIRTUAL_W - 110, y: VIRTUAL_H / 2,
  radius: 3, fill: LINE_COLOR, listening: false,
}))

// ====================================================
// ARCOS DE CÓRNER (radio 1 m = 10 px, cuarto de círculo)
// ====================================================

const cornerConfigs = computed(() => {
  return [
    { id: 'corner-tl', x: 0, y: 0, innerRadius: 10, outerRadius: 10, rotation: 0, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
    { id: 'corner-tr', x: 1050, y: 0, innerRadius: 10, outerRadius: 10, rotation: 90, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
    { id: 'corner-br', x: 1050, y: 680, innerRadius: 10, outerRadius: 10, rotation: 180, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
    { id: 'corner-bl', x: 0, y: 680, innerRadius: 10, outerRadius: 10, rotation: 270, angle: 90, stroke: LINE_COLOR, strokeWidth: 2, listening: false },
  ]
})

// ====================================================
// UTILIDAD: convertir coordenadas del Stage a virtuales
// ====================================================

/**
 * Convierte una posición en píxeles del Stage a coordenadas virtuales
 * (espacio 1050×680), teniendo en cuenta la escala y el offset.
 */
function screenToVirtual(pos) {
  return {
    x: (pos.x - offsetX.value) / scale.value,
    y: (pos.y - offsetY.value) / scale.value,
  }
}

// ====================================================
// MANEJADORES DE EVENTOS DEL STAGE
// ====================================================

/**
 * Click en el fondo de la cancha (no sobre un elemento existente).
 * Crea un jugador o un texto libre según la herramienta activa.
 */
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
      teamId: store.activeTeam,
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

/** Inicia el dibujo de flecha / línea / zona (solo si la herramienta activa lo permite). */
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

/** Actualiza la posición del cursor mientras se dibuja. */
function handleMouseMove() {
  if (!isDrawing.value) return
  const stage = stageRef.value?.getStage()
  if (!stage) return
  const pos = stage.getPointerPosition()
  if (pos) {
    drawCurrent.value = screenToVirtual(pos)
  }
}

/**
 * Finaliza el dibujo y crea el elemento correspondiente
 * (flecha, línea o zona) si el trazo supera los 5 px.
 */
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

// ====================================================
// MANEJADORES DE ARRASTRE DE ELEMENTOS
// ====================================================

/** Al soltar un jugador, actualiza su posición en el store. */
function handlePlayerDrag(el, e) {
  const node = e.target
  store.updateElement(el.id, { x: node.x(), y: node.y() })
}

/** Al soltar una zona, actualiza su posición manteniendo su tamaño. */
function handleZoneDrag(el, e) {
  const node = e.target
  const dx = node.x() - el.x
  const dy = node.y() - el.y
  store.updateElement(el.id, {
    x: node.x(), y: node.y(),
    x2: el.x2 + dx, y2: el.y2 + dy,
  })
}

/** Al soltar un texto, actualiza su posición en el store. */
function handleTextDrag(el, e) {
  const node = e.target
  store.updateElement(el.id, { x: node.x(), y: node.y() })
}

// ====================================================
// SELECCIÓN Y TECLADO
// ====================================================

/** Marca un elemento como seleccionado (resalta su borde). */
function selectElement(id) {
  selectedElementId.value = id
}

/** Elimina el elemento seleccionado con Supr/Backspace; Escape deselecciona. */
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

// ====================================================
// VISTA PREVIA DE DIBUJO (mientras se arrastra el mouse)
// ====================================================

/** Config de la flecha / línea temporal durante el dibujo. */
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

/** Config del rectángulo punteado temporal (zona). */
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

// ====================================================
// CONFIGS DE RENDERIZADO DE ELEMENTOS
// ====================================================

/**
 * Obtiene los colores de un jugador según su equipo.
 * Si el jugador no tiene teamId, usa sus colores propios (compatibilidad).
 */
function getPlayerColors(el) {
  if (el.teamId === 1 && store.teams.team1) {
    return {
      primary: store.teams.team1.primaryColor,
      secondary: store.teams.team1.secondaryColor,
    }
  }
  if (el.teamId === 2 && store.teams.team2) {
    return {
      primary: store.teams.team2.primaryColor,
      secondary: store.teams.team2.secondaryColor,
    }
  }
  return {
    primary: el.color || '#e74c3c',
    secondary: '#ffffff',
  }
}

/** Círculo del jugador: radio 18 px, color primario del equipo, borde al seleccionar. */
function playerCircleConfig(el) {
  const isSelected = selectedElementId.value === el.id
  const colors = getPlayerColors(el)
  return {
    x: 0, y: 0, radius: 18,
    fill: colors.primary,
    stroke: isSelected ? '#fff' : 'rgba(0,0,0,0.35)',
    strokeWidth: isSelected ? 3 : 2,
    listening: true,
  }
}

/** Número del jugador (centrado dentro del círculo). Usa el color secundario del equipo. */
function playerTextConfig(el) {
  const colors = getPlayerColors(el)
  return {
    x: -10, y: -10, width: 20, height: 20,
    text: String(el.playerNumber),
    fontSize: 15, fontStyle: 'bold',
    fill: colors.secondary, align: 'center', verticalAlign: 'middle',
    listening: false,
  }
}

/** Flecha (pase / desplazamiento). */
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

/** Zona (rectángulo con borde punteado). */
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

/** Línea recta. */
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

/** Texto libre (arrastrable). */
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
/* El contenedor ocupa todo el viewport de forma absoluta */
.canvas-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}
</style>
