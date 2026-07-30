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
