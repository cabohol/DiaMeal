<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Vegan2 from "@/assets/vegan2.jpg"
import Logo1 from "@/assets/logo1.png"

const theme = ref('light')
const router = useRouter()
const showContent = ref(false)

function getStarted() {
  router.push('/terms')
}


onMounted(() => {
  setTimeout(() => (showContent.value = true), 200)
})
</script>

<template>
  <v-app :theme="theme">
    <v-main>
      <v-container
        fluid
        class="d-flex flex-column align-center justify-center text-center pa-0"
        style="height: 100vh; position: relative; overflow: hidden; background-color: #A9C46C;"
      >
        <!-- Background Image -->
        <v-img
          :src="Vegan2"
          cover
          height="100%"
          width="100%"
          class="position-absolute"
          style="opacity: 0.4; filter: brightness(0.9);"
        ></v-img>

        <!-- Fade-in Transition Wrapper -->
        <transition name="fade">
          <div v-if="showContent" style="z-index: 1;">
            <!-- Logo -->
            <v-img
              :src="Logo1"
              width="120"
              class="mx-auto mb-6"
            ></v-img>

            <!-- Title -->
            <p
              style="
                font-family: 'Syne', sans-serif;
                font-weight: 800;
                font-size: 2.5rem;
                color: black;
                line-height: 1.4;
                margin-bottom: 2rem;
              "
            >
              Welcome <br />
              to <br />
              DiaMeal
            </p>

            <br><br>

            <!-- Get Started Button -->
            <v-btn
              color="green-darken-2"
              class="text-white px-10"
              rounded
              size="large"
              elevation="4"
              style="
                font-family: 'Syne', sans-serif;
                letter-spacing: 0.5px;
              "
              @click="getStarted"
            >
              Get Started
            </v-btn>
          </div>
        </transition>
      </v-container>
    </v-main>
  </v-app>
</template>

<style scoped>
.fade-enter-active {
  transition: opacity 1.2s ease;
}
.fade-enter-from {
  opacity: 0;
}
</style>
