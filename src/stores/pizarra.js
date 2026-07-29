import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'pizarra-tactica-autosave'

export const usePizarraStore = defineStore('pizarra', () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  const initialElements = saved ? JSON.parse(saved) : []

  const elements = ref(initialElements)
  const selectedTool = ref('player')
  const selectedColor = ref('#e74c3c')
  const playerNumber = ref(10)
  const playerName = ref('')
  const fontSize = ref(20)
  const strokeWidth = ref(3)

  watch(
    elements,
    (val) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    },
    { deep: true }
  )

  let nextId = elements.value.reduce((max, el) => Math.max(max, el.id || 0), 0) + 1

  function addElement(el) {
    const element = { ...el, id: nextId++ }
    elements.value.push(element)
    return element
  }

  function updateElement(id, changes) {
    const index = elements.value.findIndex((el) => el.id === id)
    if (index !== -1) {
      elements.value[index] = { ...elements.value[index], ...changes }
    }
  }

  function removeElement(id) {
    elements.value = elements.value.filter((el) => el.id !== id)
  }

  function clearAll() {
    elements.value = []
  }

  function exportToJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tool: selectedTool.value,
      color: selectedColor.value,
      elements: elements.value,
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tactica_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function importFromJSON(jsonString) {
    const data = JSON.parse(jsonString)
    if (data.elements && Array.isArray(data.elements)) {
      elements.value = data.elements
      nextId = elements.value.reduce((max, el) => Math.max(max, el.id || 0), 0) + 1
    }
  }

  return {
    elements,
    selectedTool,
    selectedColor,
    playerNumber,
    playerName,
    fontSize,
    strokeWidth,
    addElement,
    updateElement,
    removeElement,
    clearAll,
    exportToJSON,
    importFromJSON,
  }
})
