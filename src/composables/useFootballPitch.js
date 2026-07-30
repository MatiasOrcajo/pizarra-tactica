import { computed } from 'vue'

/**
 * TAMAÑO VIRTUAL DE LA CANCHA (Escala: 1 metro = 10 píxeles)
 *
 * La cancha completa ocupa 1050×680 px en el espacio virtual (105 m × 68 m).
 * Este espacio se escala automáticamente para ajustarse al viewport del navegador,
 * manteniendo siempre la proporción original.
 *
 * PITCH_MARGIN: factor de reducción (0.90 = 90 %) para dejar espacio vacío
 * alrededor de la cancha (márgenes superior, inferior y laterales).
 */
export const VIRTUAL_W = 1050
export const VIRTUAL_H = 680
const PITCH_MARGIN = 0.80

/**
 * useFootballPitch(canvasWidth, canvasHeight)
 *
 * Composabe que calcula la escala y los offsets necesarios para
 * dibujar la cancha centrada dentro del lienzo (Konva Stage).
 *
 * @param {Ref<number>} canvasWidth  — ancho real del contenedor (px)
 * @param {Ref<number>} canvasHeight — alto real del contenedor (px)
 * @returns {{ scale, offsetX, offsetY, pitchMarkings }}
 */
export function useFootballPitch(canvasWidth, canvasHeight) {
  /**
   * Escala uniforme (se aplica igual en X e Y para no deformar).
   *
   * 1. Se calcula cuánto escalar en cada eje para que la cancha «quepa».
   * 2. Se elige el menor (Math.min) para que no se recorte ningún lado.
   * 3. Se multiplica por PITCH_MARGIN para dejar margen alrededor.
   */
  const scale = computed(() => {
    const scaleX = canvasWidth.value / VIRTUAL_W
    const scaleY = canvasHeight.value / VIRTUAL_H
    return Math.min(scaleX, scaleY) * PITCH_MARGIN
  })

  /**
   * Offset horizontal: desplazamiento para centrar la cancha en el Stage.
   */
  const offsetX = computed(() => {
    return (canvasWidth.value - VIRTUAL_W * scale.value) / 2
  })

  /**
   * Offset vertical: desplazamiento para centrar la cancha en el Stage.
   */
  const offsetY = computed(() => {
    return (canvasHeight.value - VIRTUAL_H * scale.value) / 2
  })

  /**
   * pitchMarkings — datos de todas las marcaciones del campo.
   *
   * Todas las coordenadas están en el espacio virtual (1050×680).
   * Se devuelven como objetos planos para que los componentes de Vue-Konva
   * los usen directamente en sus :config.
   *
   * Referencia de medidas (1 m = 10 px):
   *   - Largo total:            1050 px  (105 m)
   *   - Ancho total:             680 px  (68 m)
   *   - Área grande:       165 × 403.2   (16.5 × 40.32 m)
   *   - Área chica:         55 × 183.2   (5.5 × 18.32 m)
   *   - Punto penal (desde línea de meta): 110 px  (11 m)
   *   - Círculo central / medialuna: radio 91.5 px  (9.15 m)
   *   - Portería:            20 × 73.2   (2 × 7.32 m)
   *   - Córner:              radio 10 px  (1 m)
   */
  const pitchMarkings = computed(() => {
    const w = VIRTUAL_W
    const h = VIRTUAL_H

    return {
      /** Rectángulo exterior (borde del campo) */
      outerRect: { x: 0, y: 0, width: w, height: h },

      /** Línea de medio campo (vertical, de arriba a abajo) */
      centerLine: { x1: w / 2, y1: 0, x2: w / 2, y2: h },

      /** Círculo central (sin relleno, solo trazo) */
      centerCircle: { x: w / 2, y: h / 2, radius: 91.5 },

      /** Punto central (círculo relleno) */
      centerSpot: { x: w / 2, y: h / 2, radius: 4 },

      /** Área grande izquierda (lado X = 0) */
      leftPenaltyArea: { x: 0, y: 138.4, width: 165, height: 403.2 },

      /** Área grande derecha (lado X = 1050) */
      rightPenaltyArea: { x: w - 165, y: 138.4, width: 165, height: 403.2 },

      /** Área chica izquierda */
      leftGoalArea: { x: 0, y: 248.4, width: 55, height: 183.2 },

      /** Área chica derecha */
      rightGoalArea: { x: w - 55, y: 248.4, width: 55, height: 183.2 },

      /** Portería izquierda (sobresale 20 px fuera de la cancha) */
      leftGoal: { x: -20, y: 303.4, width: 20, height: 73.2 },

      /** Portería derecha */
      rightGoal: { x: w, y: 303.4, width: 20, height: 73.2 },

      /** Punto penal izquierdo */
      leftPenaltySpot: { x: 110, y: h / 2, radius: 3 },

      /** Punto penal derecho */
      rightPenaltySpot: { x: w - 110, y: h / 2, radius: 3 },

      /** Medialuna izquierda (centrada en el punto penal) */
      leftPenaltyArc: { x: 110, y: h / 2, radius: 91.5 },

      /** Medialuna derecha */
      rightPenaltyArc: { x: w - 110, y: h / 2, radius: 91.5 },

      /** Arcos de córner (4 esquinas) */
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
