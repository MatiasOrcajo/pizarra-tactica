<template>
  <section class="team-toolbar" aria-label="Configuracion de equipos">
    <div
      v-for="team in teams"
      :key="team.id"
      class="team-control"
      :style="{ '--team-color': team.config.primaryColor }"
    >
      <input
        class="team-name"
        :value="team.config.name"
        maxlength="20"
        :aria-label="`Nombre de ${team.config.name}`"
        @input="store.setTeamName(team.id, $event.target.value)"
      />
      <label class="color-control">
        <span>Ficha</span>
        <input
          type="color"
          :value="team.config.primaryColor"
          :aria-label="`Color de ficha de ${team.config.name}`"
          @input="store.setTeamPrimaryColor(team.id, $event.target.value)"
        />
      </label>
      <label class="color-control">
        <span>Numero</span>
        <input
          type="color"
          :value="team.config.secondaryColor"
          :aria-label="`Color de numero de ${team.config.name}`"
          @input="store.setTeamSecondaryColor(team.id, $event.target.value)"
        />
      </label>
      <label class="formation-control">
        <span>Formacion</span>
        <select
          :value="team.config.formation"
          :aria-label="`Formacion de ${team.config.name}`"
          @change="store.setTeamFormation(team.id, $event.target.value)"
        >
          <option v-for="formation in formations" :key="formation" :value="formation">
            {{ formation }}
          </option>
        </select>
      </label>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { usePizarraStore } from '../stores/pizarra'

const store = usePizarraStore()

const teams = computed(() => [
  { id: 1, config: store.teams.team1 },
  { id: 2, config: store.teams.team2 },
])

const formations = computed(() => Object.keys(store.formations))
</script>

<style scoped>
.team-toolbar {
  position: absolute;
  top: 0px;
  left: 50%;
  z-index: 10;
  display: flex;
  justify-content: center;
  gap: 6px;
  transform: translateX(-50%);
  pointer-events: none;
}

.team-control {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 8px;
  border-left: 3px solid var(--team-color);
  border-radius: 8px;
  background: rgba(30, 30, 40, 0.94);
  backdrop-filter: blur(10px);
  color: #aaa;
  font-family: 'Segoe UI', system-ui, sans-serif;
  pointer-events: auto;
}

.team-name {
  width: 105px;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #eee;
  font: 600 13px 'Segoe UI', system-ui, sans-serif;
}

.team-name:focus {
  color: #fff;
}

.color-control,
.formation-control {
  display: grid;
  gap: 2px;
  color: #888;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-align: center;
  text-transform: uppercase;
}

.color-control input {
  width: 26px;
  height: 20px;
  padding: 1px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #2a2a38;
  cursor: pointer;
}

.formation-control select {
  height: 20px;
  padding: 0 3px;
  border: 1px solid #555;
  border-radius: 4px;
  outline: none;
  background: #2a2a38;
  color: #ddd;
  cursor: pointer;
  font: 600 10px 'Segoe UI', system-ui, sans-serif;
}

.color-control input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-control input::-webkit-color-swatch {
  border: 0;
  border-radius: 2px;
}

@media (max-width: 760px) {
  .team-toolbar {
    left: 8px;
    right: 8px;
    justify-content: stretch;
    transform: none;
  }

  .team-control {
    flex: 1;
    gap: 5px;
    padding: 7px;
  }

  .team-name {
    width: 100%;
  }

  .color-control span,
  .formation-control span {
    display: none;
  }
}
</style>
