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
        <div class="py-8 rounded-bottom"
          style="z-index: 1; position: relative; background-color: #5D8736;">
          <v-container class="d-flex justify-space-between align-center">
            <!-- Greeting -->
            <div>
              <p
                class="text-left"
                style="font-family: 'Syne', sans-serif; font-size: clamp(22px, 2.5vw, 30px); color: white;"
              >
                Hi, <span style="font-family: 'Syne', sans-serif;">{{ userFirstName }}</span>!
              </p>
            </div>
          </v-container>

          <!-- Welcome Message -->
          <v-container>
            <p
              class="text-center"
              style="font-size: clamp(16px, 2vw, 18px); font-family: 'Syne', sans-serif; color: white; margin-top: -1px;"
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
          <v-card
              class="mx-4 mt-4 pa-4 text-center progress-card floating-card"
              elevation="4  "
              rounded="xl"
            >
              <v-icon size="36" color="#5D8736" class="mb-2">mdi-food-variant</v-icon>

              <p class="text-h6 mb-1" style="font-family:'Syne', sans-serif; font-weight: 600;">
                Your Meal Plan Progress
              </p>

              <p class="text-body-1 mb-2" style="font-family:'Syne', sans-serif;">
                1 out of 3 meals completed this day!
              </p>

              <v-progress-linear
                :model-value="progress"
                color="green"
                height="12"
                class="rounded-pill mt-2"
              />

              <div class="text-subtitle-1 mt-1" style="font-family:'Syne', sans-serif;">
                {{ progress }}%
              </div>
          </v-card>

        <!-- Why It Matters Section -->
        <div class="px-4 mt-6">
          <!-- Title with Dividers -->
          <div class="d-flex align-center justify-center my-6">
            <div style="flex: 1; height: 1px; background-color: #5D8736; margin-right: 12px;"></div>
            <p class="text-h6 mb-0" style="font-family:'Syne', sans-serif; white-space: nowrap;">
              Why Living a Healthy Lifestyle Matters
            </p>
            <div style="flex: 1; height: 1px; background-color: #5D8736; margin-left: 12px;"></div>
          </div>

          <!-- Cards Section -->
          <v-card class="mt-4 pa-4 d-flex align-center" color="#EAF4D3" rounded="xl" elevation="2">
            <v-icon color="red" size="36" class="mr-4">mdi-heart-pulse</v-icon>
            <div>
              <p class="card-title">Regulates Blood Sugar & Pressure</p>
              <p class="card-description">Healthy meals help control blood sugar levels and maintain stable blood pressure.</p>
            </div>
          </v-card>

          <v-card class="mt-4 pa-4 d-flex align-center" color="#FFE5E5" rounded="xl" elevation="2">
            <v-icon color="red" size="36" class="mr-4">mdi-cancel</v-icon>
            <div>
              <p class="card-title">Prevents Complications</p>
              <p class="card-description">Healthy meals reduce the risk of heart disease and kidney problems.</p>
            </div>
          </v-card>

          <v-card class="mt-4 pa-4 d-flex align-center" color="#D3F4EA" rounded="xl" elevation="2">
            <v-icon color="green" size="36" class="mr-4">mdi-battery-high</v-icon>
            <div>
              <p class="card-title">Boosts Energy Levels</p>
              <p class="card-description">Nutritious meals fuel your body and keep you active throughout the day.</p>
            </div>
          </v-card>

          <v-card class="mt-4 pa-4 d-flex align-center" color="#FFF1DC" rounded="xl" elevation="2">
            <v-icon color="amber" size="36" class="mr-4">mdi-emoticon-happy</v-icon>
            <div>
              <p class="card-title">Improves Mood</p>
              <p class="card-description">Eating balanced meals can improve your mood and reduce stress.</p>
            </div>
          </v-card>

          <v-card class="mt-4 pa-4 d-flex align-center" color="#E3F4D3" rounded="xl" elevation="2">
            <v-icon color="blue" size="36" class="mr-4">mdi-shield-check</v-icon>
            <div>
              <p class="card-title">Supports Immune System</p>
              <p class="card-description">Healthy food strengthens your immune defenses against illness.</p>
            </div>
          </v-card>
        </div>
        <br>

        <!-- Bottom Navigation -->
        <v-bottom-navigation grow class="mt-8" style="background-color: #5B913B;">
        <v-btn @click="$router.push('/home')" value="home" class="d-flex flex-column align-center">
            <v-icon style="color: white; font-size: 24px;">mdi-home</v-icon>
            <span
            class="text-white mt-1"
            style="font-family: 'Syne', sans-serif; font-size: 12px;"
            >Home</span>
        </v-btn>

        <v-btn @click="$router.push('/meal-plan')" value="meal-plan" class="d-flex flex-column align-center">
            <v-icon style="color: white; font-size: 24px;">mdi-heart-pulse</v-icon>
            <span
            class="text-white mt-1"
            style="font-family: 'Syne', sans-serif; font-size: 12px;"
            >Meal Plan</span>
        </v-btn>

        <v-btn @click="$router.push('/profile')" value="profile" class="d-flex flex-column align-center">
            <v-icon style="color: white; font-size: 24px;">mdi-account</v-icon>
            <span
            class="text-white mt-1"
            style="font-family: 'Syne', sans-serif; font-size: 12px;"
            >Profile</span>
        </v-btn>

        <v-btn @click="$router.push('/progress')" value="progress" class="d-flex flex-column align-center">
            <v-icon style="color: white; font-size: 24px;">mdi-chart-line</v-icon>
            <span
            class="text-white mt-1"
            style="font-family: 'Syne', sans-serif; font-size: 12px;"
            >Progress</span>
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

.progress-card {
  border: 3px #5D8736;
  background-color: #f9fff2;
  transition: transform 0.3s ease-in-out;
}

.floating-card {
  animation: floatUpDown 4s ease-in-out infinite;
}

@keyframes floatUpDown {
  0% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-6px);
  }
  100% {
    transform: translateY(0px);
  }
}

.card-title {
  font-size: 18px;
  font-family: 'Syne', sans-serif;
  font-weight: 500;
  margin-bottom: 3px;
}

.card-description {
  font-size: 15px;
  font-family: 'Syne', sans-serif;
  line-height: 1.5;
  color: #444;
}
</style>

