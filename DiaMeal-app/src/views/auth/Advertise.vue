<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Vegan2 from "@/assets/vegan2.jpg";

const theme = ref('light')
const router = useRouter()

function onClick() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}

function getStarted() {
  router.push('/terms')
}
</script>

<template>
  <v-app :theme="theme">
    <v-main style=" background-color: #A9C46C;">
      <v-container
        class="d-flex flex-column align-center justify-center text-center pa-0"
        style="height: 100vh; background-color: #A9C46C; position: relative; overflow: hidden;">

        <div style="position: absolute; top: 0; width: 100%; height: 100%; z-index: 0; opacity: 0.4;">
          <v-img :src="Vegan2" cover height="100%" gradient="to bottom, rgba(0,0,0,0.3), rgba(169,196,108,0)"/>
        </div>

        <!-- Logo or Brand Icon (Optional) -->
        <v-icon size="100" class="mb-4" color="green-darken-3" style="z-index: 1; margin-top: -50px;">
          mdi-food
        </v-icon>

        <!-- Welcome Text -->
        <div class="text-black mb-7" style="z-index: 1;">
          <p style="font-family: 'Syne', sans-serif; font-size: 35px; font-weight: 500;">Start Your Healthy Journey with DiaMeal</p>
        </div>

        <!-- Get Started Button -->
        <v-btn
          color="green-darken-2"
          class="text-white px-10"
          rounded
          size="x-large"
          style="z-index: 1; font-family: 'Syne', sans-serif;"
          @click="getStarted"> Get Started
        </v-btn>
      </v-container>
    </v-main>
  </v-app>
</template>
