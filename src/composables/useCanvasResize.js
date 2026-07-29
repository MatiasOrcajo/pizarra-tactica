import { ref, onMounted, onUnmounted } from 'vue'

export function useCanvasResize(containerRef) {
  const width = ref(800)
  const height = ref(600)

  let observer = null

  function updateSize() {
    const el = containerRef.value
    if (el) {
      width.value = el.clientWidth
      height.value = el.clientHeight
    }
  }

  onMounted(() => {
    updateSize()
    observer = new ResizeObserver(() => updateSize())
    if (containerRef.value) {
      observer.observe(containerRef.value)
    }
  })

  onUnmounted(() => {
    if (observer) observer.disconnect()
  })

  return { width, height }
}
