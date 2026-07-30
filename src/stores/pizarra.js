import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'pizarra-tactica-autosave'

const DEFAULT_PLAYERS = [
  { type: 'player', x: 30,  y: 340, playerNumber: 1,  playerName: 'POR', color: '#f1c40f' },
  { type: 'player', x: 200, y: 560, playerNumber: 2,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 170, y: 420, playerNumber: 4,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 170, y: 260, playerNumber: 5,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 200, y: 120, playerNumber: 3,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 380, y: 530, playerNumber: 8,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 350, y: 340, playerNumber: 6,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 380, y: 150, playerNumber: 10, playerName: '', color: '#e74c3c' },
  { type: 'player', x: 550, y: 560, playerNumber: 7,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 570, y: 340, playerNumber: 9,  playerName: '', color: '#e74c3c' },
  { type: 'player', x: 550, y: 120, playerNumber: 11, playerName: '', color: '#e74c3c' },
  { type: 'player', x: 660, y: 120, playerNumber: 7,  playerName: '', color: '#3498db' },
  { type: 'player', x: 650, y: 340, playerNumber: 9,  playerName: '', color: '#3498db' },
  { type: 'player', x: 660, y: 560, playerNumber: 11, playerName: '', color: '#3498db' },
  { type: 'player', x: 830, y: 530, playerNumber: 8,  playerName: '', color: '#3498db' },
  { type: 'player', x: 860, y: 340, playerNumber: 6,  playerName: '', color: '#3498db' },
  { type: 'player', x: 830, y: 150, playerNumber: 10, playerName: '', color: '#3498db' },
  { type: 'player', x: 990, y: 560, playerNumber: 2,  playerName: '', color: '#3498db' },
  { type: 'player', x: 1020, y: 420, playerNumber: 4, playerName: '', color: '#3498db' },
  { type: 'player', x: 1020, y: 260, playerNumber: 5, playerName: '', color: '#3498db' },
  { type: 'player', x: 990, y: 120, playerNumber: 3,  playerName: '', color: '#3498db' },
  { type: 'player', x: 1020, y: 340, playerNumber: 1,  playerName: 'POR', color: '#2ecc71' },
]

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

  let nextId = elements.value.length
    ? elements.value.reduce((max, el) => Math.max(max, el.id || 0), 0) + 1
    : 100

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

  function resetToDefaults() {
    nextId = 100
    elements.value = DEFAULT_PLAYERS.map((p, i) => ({ ...p, id: i }))
  }

  function exportToJSON() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
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
    resetToDefaults,
    exportToJSON,
    importFromJSON,
  }
})
