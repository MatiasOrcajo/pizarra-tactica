<!--
  App.vue — Componente raíz de la aplicación.

  Renderiza el Toolbar (panel flotante de herramientas) y el
  CanvasBoard (cancha interactiva). Si no hay elementos guardados
  en localStorage, carga la formación por defecto al montar.
-->
<template>
  <div class="app-root">
    <Toolbar />
    <CanvasBoard />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import Toolbar from './components/Toolbar.vue'
import CanvasBoard from './components/CanvasBoard.vue'
import { usePizarraStore } from './stores/pizarra'

const store = usePizarraStore()

/**
 * Al montar la app, si no hay elementos en el store (ni en localStorage),
 * se carga la formación por defecto (DEFAULT_PLAYERS).
 */
onMounted(() => {
  if (store.elements.length === 0) {
    store.resetToDefaults()
  }
})
</script>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
</style>
