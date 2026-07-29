<template>
  <div class="toolbar">
    <h2 class="toolbar-title">Pizarra</h2>

    <div class="tool-section">
      <label class="section-label">Herramienta</label>
      <div class="tool-grid">
        <button
          v-for="tool in tools"
          :key="tool.value"
          :class="['tool-btn', { active: store.selectedTool === tool.value }]"
          :title="tool.label"
          @click="store.selectedTool = tool.value"
        >
          <span class="tool-icon">{{ tool.icon }}</span>
          <span class="tool-label">{{ tool.label }}</span>
        </button>
      </div>
    </div>

    <div class="tool-section">
      <label class="section-label">Color</label>
      <div class="color-palette">
        <button
          v-for="c in colors"
          :key="c"
          :class="['color-btn', { active: store.selectedColor === c }]"
          :style="{ background: c }"
          @click="store.selectedColor = c"
        />
        <input
          type="color"
          :value="store.selectedColor"
          class="color-picker"
          @input="store.selectedColor = $event.target.value"
        />
      </div>
    </div>

    <div v-if="store.selectedTool === 'player'" class="tool-section">
      <label class="section-label">Jugador</label>
      <div class="input-group">
        <input
          type="number"
          :value="store.playerNumber"
          min="1"
          max="99"
          class="input"
          placeholder="N°"
          @input="store.playerNumber = Number($event.target.value)"
        />
        <input
          type="text"
          :value="store.playerName"
          class="input"
          placeholder="Nombre"
          @input="store.playerName = $event.target.value"
        />
      </div>
    </div>

    <div v-if="store.selectedTool === 'text'" class="tool-section">
      <label class="section-label">Texto</label>
      <div class="input-group">
        <input
          type="text"
          :value="store.playerName"
          class="input"
          placeholder="Texto"
          @input="store.playerName = $event.target.value"
        />
      </div>
      <div class="input-group" style="margin-top: 4px;">
        <input
          type="number"
          :value="store.fontSize"
          min="8"
          max="120"
          class="input"
          placeholder="Tamaño"
          @input="store.fontSize = Number($event.target.value)"
        />
      </div>
    </div>

    <div
      v-if="['arrow', 'line', 'zone'].includes(store.selectedTool)"
      class="tool-section"
    >
      <label class="section-label">Grosor</label>
      <input
        type="range"
        :value="store.strokeWidth"
        min="1"
        max="10"
        class="slider"
        @input="store.strokeWidth = Number($event.target.value)"
      />
      <span class="slider-value">{{ store.strokeWidth }}px</span>
    </div>

    <div class="tool-section actions-section">
      <label class="section-label">Acciones</label>
      <button class="action-btn" @click="store.exportToJSON()">
        Exportar
      </button>

      <label class="action-btn file-label">
        Importar
        <input
          type="file"
          accept=".json"
          class="file-input"
          @change="handleImport"
        />
      </label>

      <button class="action-btn danger" @click="confirmClear()">
        Limpiar todo
      </button>
    </div>
  </div>
</template>

<script setup>
import { usePizarraStore } from '../stores/pizarra'

const store = usePizarraStore()

const tools = [
  { value: 'player', label: 'Jugador', icon: '●' },
  { value: 'arrow', label: 'Flecha', icon: '→' },
  { value: 'zone', label: 'Zona', icon: '◻' },
  { value: 'line', label: 'Línea', icon: '╱' },
  { value: 'text', label: 'Texto', icon: 'T' },
]

const colors = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f1c40f',
  '#9b59b6',
  '#e67e22',
  '#1abc9c',
  '#ecf0f1',
]

function handleImport(e) {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    store.importFromJSON(event.target.result)
  }
  reader.readAsText(file)
  e.target.value = ''
}

function confirmClear() {
  if (store.elements.length === 0) return
  if (confirm('¿Borrar todos los elementos de la pizarra?')) {
    store.clearAll()
  }
}
</script>

<style scoped>
.toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  background: rgba(30, 30, 40, 0.94);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 12px;
  width: 200px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  color: #eee;
  font-family: 'Segoe UI', system-ui, sans-serif;
  user-select: none;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 10px;
  text-align: center;
  letter-spacing: 0.5px;
}

.tool-section {
  margin-bottom: 12px;
}

.section-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #999;
  margin-bottom: 6px;
}

.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #2a2a38;
  color: #ccc;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 11px;
}

.tool-btn:hover {
  background: #3a3a4a;
  border-color: #666;
}

.tool-btn.active {
  background: #4a6cf7;
  border-color: #4a6cf7;
  color: #fff;
}

.tool-icon {
  font-size: 18px;
  line-height: 1;
}

.tool-label {
  font-size: 10px;
  font-weight: 500;
}

.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.color-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
  padding: 0;
}

.color-btn:hover {
  transform: scale(1.15);
}

.color-btn.active {
  border-color: #fff;
  transform: scale(1.1);
}

.color-picker {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  background: none;
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border-radius: 50%;
  border: 2px solid #555;
}

.input-group {
  display: flex;
  gap: 4px;
}

.input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #444;
  border-radius: 6px;
  background: #2a2a38;
  color: #eee;
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}

.input:focus {
  border-color: #4a6cf7;
}

.slider {
  width: 100%;
  accent-color: #4a6cf7;
  cursor: pointer;
}

.slider-value {
  font-size: 11px;
  color: #999;
}

.actions-section {
  border-top: 1px solid #333;
  padding-top: 10px;
}

.action-btn {
  display: block;
  width: 100%;
  padding: 7px 12px;
  margin-bottom: 4px;
  border: 1px solid #444;
  border-radius: 6px;
  background: #2a2a38;
  color: #ccc;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.action-btn:hover {
  background: #3a3a4a;
  border-color: #666;
}

.action-btn.danger {
  color: #e74c3c;
  border-color: #e74c3c44;
}

.action-btn.danger:hover {
  background: #e74c3c22;
  border-color: #e74c3c;
}

.file-label {
  position: relative;
  cursor: pointer;
}

.file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
