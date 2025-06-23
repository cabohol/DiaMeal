<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const theme = ref('light')
const router = useRouter()

function onClick() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}

function getStarted() {
  // Replace with actual route
  router.push('/LoginView')
}
</script>

<template>
  <v-app :theme="theme">
    <v-main>
      <v-container
        class="d-flex flex-column align-center justify-center text-center pa-0"
        style="
          height: 100vh;
          background-color: #A9C46C;
          position: relative;
          overflow: hidden;
        "
      >
        <!-- Top Decorative Image with Fade -->
        <div style="position: absolute; top: 0; width: 100%; height: 45%; z-index: 0;">
          <v-img
            src="/src/assets/diameal-header.jpg"
            cover
            height="100%"
            gradient="to bottom, rgba(0,0,0,0.3), rgba(169,196,108,0)"
          />
        </div>

        <!-- Logo or Brand Icon (Optional) -->
        <v-icon size="80" class="mt-16 mb-6" color="green-darken-3" style="z-index: 1;">
          mdi-food
        </v-icon>

        <!-- Welcome Text -->
        <div class="text-black mb-12" style="z-index: 1;">
          <h2 class="font-weight-bold mb-1">Welcome</h2>
          <h2 class="font-weight-bold">to DiaMeal</h2>
        </div>

        <!-- Get Started Button -->
        <v-btn
          color="green-darken-2"
          class="text-white px-10"
          rounded
          size="x-large"
          style="z-index: 1;"
          @click="getStarted"
        >
          Get Started
        </v-btn>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
h2 {
  margin: 0;
  font-family: 'Poppins', sans-serif;
}
</style>
