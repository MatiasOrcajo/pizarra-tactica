import { computed } from 'vue'

export const VIRTUAL_W = 1050
export const VIRTUAL_H = 680

export function useFootballPitch(canvasWidth, canvasHeight) {
  const scale = computed(() => {
    return Math.min(canvasWidth.value / VIRTUAL_W, canvasHeight.value / VIRTUAL_H)
  })

  const offsetX = computed(() => {
    return (canvasWidth.value - VIRTUAL_W * scale.value) / 2
  })

  const offsetY = computed(() => {
    return (canvasHeight.value - VIRTUAL_H * scale.value) / 2
  })

  const pitchMarkings = computed(() => {
    const w = VIRTUAL_W
    const h = VIRTUAL_H

    return {
      outerRect: { x: 0, y: 0, width: w, height: h },
      centerLine: { x1: w / 2, y1: 0, x2: w / 2, y2: h },
      centerCircle: { x: w / 2, y: h / 2, radius: 91.5 },
      centerSpot: { x: w / 2, y: h / 2, radius: 4 },
      leftPenaltyArea: { x: 0, y: 138.4, width: 165, height: 403.2 },
      rightPenaltyArea: { x: w - 165, y: 138.4, width: 165, height: 403.2 },
      leftGoalArea: { x: 0, y: 248.4, width: 55, height: 183.2 },
      rightGoalArea: { x: w - 55, y: 248.4, width: 55, height: 183.2 },
      leftGoal: { x: -20, y: 303.4, width: 20, height: 73.2 },
      rightGoal: { x: w, y: 303.4, width: 20, height: 73.2 },
      leftPenaltySpot: { x: 110, y: h / 2, radius: 3 },
      rightPenaltySpot: { x: w - 110, y: h / 2, radius: 3 },
      leftPenaltyArc: { x: 110, y: h / 2, radius: 91.5 },
      rightPenaltyArc: { x: w - 110, y: h / 2, radius: 91.5 },
      corners: [
        { x: 0, y: 0, radius: 10 },
        { x: w, y: 0, radius: 10 },
        { x: w, y: h, radius: 10 },
        { x: 0, y: h, radius: 10 },
      ],
    }
  })

  return { scale, offsetX, offsetY, pitchMarkings }
}
