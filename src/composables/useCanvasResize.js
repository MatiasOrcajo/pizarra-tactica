import { ref, onMounted, onUnmounted } from 'vue'

/**
 * useCanvasResize(containerRef)
 *
 * Composabe que observa el tamaño real (clientWidth / clientHeight)
 * de un elemento del DOM y expone dimensiones reactivas.
 *
 * Usa ResizeObserver para reaccionar a cambios de tamaño sin polling.
 *
 * @param {Ref<HTMLElement>} containerRef — referencia al elemento contenedor
 * @returns {{ width: Ref<number>, height: Ref<number> }}
 */
export function useCanvasResize(containerRef) {
  /** Ancho actual del contenedor (por defecto 800 px, se actualiza al montar) */
  const width = ref(800)
  /** Alto actual del contenedor (por defecto 600 px, se actualiza al montar) */
  const height = ref(600)

  let observer = null

  /** Lee clientWidth / clientHeight del DOM y actualiza los refs */
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
