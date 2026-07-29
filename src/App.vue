<template>
  <div class="app-root">
    <Toolbar />
    <CanvasBoard />
  </div>
</template>

<script setup>
import Toolbar from './components/Toolbar.vue'
import CanvasBoard from './components/CanvasBoard.vue'
</script>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
</style>
