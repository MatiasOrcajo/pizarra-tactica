<template>
  <aside class="toolbar">
    <section class="section">
      <h2>Acciones</h2>
      <button class="action-button" @click="store.exportToJSON()">Exportar</button>
      <label class="action-button file-button">
        Importar
        <input type="file" accept=".json" @change="handleImport" />
      </label>
      <button class="action-button danger" @click="clearDrawings">Limpiar todo</button>
      <button class="action-button danger" @click="factoryReset">Restablecer fábrica</button>
      <button class="action-button" @click="restoreFormations">Reestablecer tácticas</button>
      <button
        :class="['action-button', { active: store.showTacticalZones }]"
        @click="store.toggleTacticalZones()"
      >Zonas tácticas</button>
      <label
        :class="['action-button', 'mirror-toggle', { active: store.mirrorHorizontal }]"
      >
        <input
          type="checkbox"
          :checked="store.mirrorHorizontal"
          @change="store.toggleMirrorHorizontal()"
        />
        Espejo horizontal
      </label>
    </section>

    <section class="section">
      <h2>Herramientas</h2>
      <div class="tool-grid">
        <button
          v-for="tool in tools"
          :key="tool.value"
          :class="['tool-button', { active: store.selectedTool === tool.value }]"
          @click="store.selectedTool = tool.value"
        >{{ tool.label }}</button>
      </div>
    </section>
  </aside>
</template>

<script setup>
import { usePizarraStore } from '../stores/pizarra'

const store = usePizarraStore()

const tools = [
  { value: 'free', label: 'Libre' },
  { value: 'arrow', label: 'Flecha' },
  { value: 'zone', label: 'Zona' },
  { value: 'circle', label: 'Círculo' },
  { value: 'line', label: 'Linea' },
  { value: 'text', label: 'Texto' },
]

function handleImport(event) {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (loadEvent) => store.importFromJSON(loadEvent.target.result)
  reader.readAsText(file)
  event.target.value = ''
}

function clearDrawings() {
  if (confirm('Se eliminarán todas las anotaciones dibujadas.')) {
    store.clearDrawings()
  }
}

function factoryReset() {
  if (confirm('Se borrará todo: nombres, números, colores y dibujos. ¿Continuar?')) {
    store.factoryReset()
  }
}

function restoreFormations() {
  const clearAll = confirm('¿Desea también borrar todos los dibujos del lienzo?')
  store.resetToSelectedFormations(clearAll)
}
</script>

<style scoped>
.toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  width: 180px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(30, 30, 40, 0.94);
  backdrop-filter: blur(10px);
  color: #eee;
  font-family: 'Segoe UI', system-ui, sans-serif;
  user-select: none;
}

.section + .section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #333;
}

h2 {
  margin: 0 0 7px;
  color: #999;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.action-button,
.tool-button {
  border: 1px solid #444;
  border-radius: 6px;
  background: #2a2a38;
  color: #ccc;
  cursor: pointer;
  font: inherit;
  transition: background 0.15s, border-color 0.15s;
}

.action-button {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 4px;
  padding: 7px 10px;
  font-size: 12px;
  text-align: center;
}

.action-button:hover,
.tool-button:hover {
  border-color: #666;
  background: #3a3a4a;
}

.action-button.active {
  border-color: #4a6cf7;
  background: #4a6cf7;
  color: #fff;
}

.danger {
  color: #e74c3c;
  border-color: #e74c3c44;
}

.file-button {
  position: relative;
}

.file-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.tool-button {
  padding: 8px 4px;
  font-size: 11px;
}

.tool-button.active {
  border-color: #4a6cf7;
  background: #4a6cf7;
  color: #fff;
}

.mirror-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.mirror-toggle input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin: 0;
  cursor: pointer;
  accent-color: #4a6cf7;
}

@media (max-width: 760px) {
  .toolbar {
    top: 62px;
  }
}
</style>
