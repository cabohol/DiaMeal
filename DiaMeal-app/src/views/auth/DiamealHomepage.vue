<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'vue-router';

const router = useRouter();
const userFirstName = ref('');
const progress = ref(33); // Example static progress

// Fetch user metadata
onMounted(async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    router.push('/login'); // redirect if not logged in
  } else {
    userFirstName.value = data.user.user_metadata.firstName || 'User';
  }
});
</script>

<template>
  <v-app>
    <v-main >
      <v-container class="pa-0" style="position: relative; overflow: hidden;">

          <div
            class="py-8 rounded-bottom"
            style="z-index: 1; position: relative; background-color: #5D8736;"
          >
            <v-container>
              <p
                class="text-left"
                style="font-family: 'Syne', sans-serif; font-size: clamp(22px, 2.5vw, 30px); color: white;"
              >
                Hi, <span style="font-family: 'Syne', sans-serif;">{{ userFirstName }}</span>!
              </p>

              <p
                class="text-center mt-3"
                style="font-size: clamp(16px, 2vw, 18px); font-family: 'Syne', sans-serif; color: white;"
              >
                “ Welcome to DiaMeal - an AI meal planner for healthier living.
                Get personalized meal plans tailored to your health, preferences, and budget! ”
              </p>
            </v-container>
          </div>

        <!-- Food Images -->
          <br>
          <div class="infinite-scroll-wrapper">
            <div class="infinite-scroll-track">
              <!-- First Set of Images -->
              <v-img src="/src/assets/h1.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h2.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h3.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h4.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h5.jpg" class="scroll-img" cover />

              <!-- Duplicate Set for seamless loop -->
              <v-img src="/src/assets/h1.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h2.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h3.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h4.jpg" class="scroll-img" cover />
              <v-img src="/src/assets/h5.jpg" class="scroll-img" cover />
            </div>
          </div>


        <!-- Meal Plan Progress -->
        <v-card class="mx-4 mt-4 pa-4" elevation="2" rounded="xl">
          <p class="text-subtitle-1 font-weight-medium mb-1">Your mealplan progress</p>
          <p class="text-caption">1 out of 3 meals completed this day!</p>
          <v-progress-linear :model-value="progress" color="green" height="10" class="rounded-pill mt-2" />
          <div class="text-right text-subtitle-2 mt-1">{{ progress }}%</div>
        </v-card>

        <!-- Why It Matters Section -->
        <div class="px-4 mt-6">
         <div class="d-flex align-center justify-center my-4">
              <div style="flex: 1; height: 1px; background-color: #ccc; margin-right: 12px;"></div>
                  <p class="text-h6 mb-0" style="font-family:'Syne', sans-serif; white-space: nowrap;">
                    Why Living a Healthy Lifestyle Matters
                  </p>
                  <div style="flex: 1; height: 1px; background-color: #ccc; margin-left: 12px;"></div>
              </div>

          <v-card class="mt-3 pa-3 d-flex align-center" color="#EAF4D3" rounded="lg">
            <v-icon color="red" class="mr-3">mdi-heart-pulse</v-icon>
            <div>
              <p class="font-weight-medium mb-1">Regulates Blood Sugar & Pressure</p>
              <p class="text-caption">Healthy meals help control blood sugar levels and maintain stable blood pressure.</p>
            </div>
          </v-card>

          <v-card class="mt-3 pa-3 d-flex align-center" color="#EAF4D3" rounded="lg">
            <v-icon color="red" class="mr-3">mdi-cancel</v-icon>
            <div>
              <p class="font-weight-medium mb-1">Prevents Complications</p>
              <p class="text-caption">Healthy meals reduce the risk of heart disease and kidney problems.</p>
            </div>
          </v-card>
          <br>
        </div>

        <!-- Bottom Navigation -->
        <v-bottom-navigation
          grow
          class="mt-8"
          style="background-color: #5B913B;"
        >
          <v-btn icon @click="$router.push('/home')">
            <v-icon style="color: white;">mdi-home</v-icon>
          </v-btn>
          <v-btn icon @click="$router.push('/meal-plan')">
            <v-icon style="color: white;">mdi-food-apple</v-icon>
          </v-btn>
          <v-btn icon @click="$router.push('/profile')">
            <v-icon style="color: white;">mdi-account</v-icon>
          </v-btn>
          <v-btn icon @click="$router.push('/progress')">
            <v-icon style="color: white;">mdi-chart-line</v-icon>
          </v-btn>
        </v-bottom-navigation>

      </v-container>
    </v-main>
  </v-app>
</template>


<style scoped>
.rounded-bottom {
  border-bottom-left-radius: 40px;
  border-bottom-right-radius: 40px;
}

.infinite-scroll-wrapper {
  overflow: hidden;
  width: 100%;
  background-color: transparent;
}

.infinite-scroll-track {
  display: flex;
  width: max-content;
  animation: scroll-left 20s linear infinite;
}

.scroll-img {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  margin: 0 8px;
  flex-shrink: 0;
}

@keyframes scroll-left {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
</style>

