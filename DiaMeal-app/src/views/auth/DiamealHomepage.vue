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
    const fullName = `${data.user.user_metadata.firstName || ''} ${data.user.user_metadata.lastName || ''}`.trim() || 'User';
     userFirstName.value = fullName.split(' ')[0];

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
              <div>
                <p
                  class="text-left"
                  style="font-family: 'Syne', sans-serif; font-size: clamp(22px, 2.5vw, 30px); color: white; font-size: 35px;"
                >
                  Hi, <span style="font-family: 'Syne', sans-serif;">{{ userFirstName }}</span>!
                </p>
              </div>

              <!-- GIF -->
              <div style="margin-top: -50px;">
                <img
                  src="/src/assets/giphy.gif"
                  alt="Food Mascot"
                  class="greeting-mascot"
                />
              </div>
          </v-container>

          <!-- Welcome Message -->
          <v-container>
            <p
              class="text-center"
              style="font-size: clamp(16px, 2vw, 18px); font-family: 'Syne', sans-serif; color: white; margin-top: -35px;"
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
          <br>
          <v-card
              class="mx-4 mt-4 pa-4 text-center progress-card floating-card" elevation="4" rounded="xl">
              <v-icon size="36" color="#5D8736" class="mb-2">	mdi-silverware-fork-knife</v-icon>
              <p class="text-h6 mb-1" style="font-family:'Syne', sans-serif; font-weight: 600;">Your Meal Plan Progress</p>
              <p class="text-body-1 mb-2" style="font-family:'Syne', sans-serif;">1 out of 3 meals completed this day!</p>
              <v-progress-linear :model-value="progress" color="green" height="12" class="rounded-pill mt-2"/>
              <div class="text-subtitle-1 mt-1" style="font-family:'Syne', sans-serif;">{{ progress }}%</div>
          </v-card>

          <!-- Why It Matters Section -->
          <div class="px-4 mt-6">
            <div class="d-flex align-center justify-center my-6">
              <div style="flex: 1; height: 1px; background-color: #5D8736; margin-right: 12px;"></div>
              <p class="text-h6 mb-0" style="font-family:'Syne', sans-serif; white-space: nowrap;">
                Why Living a Healthy Lifestyle Matters
              </p>
              <div style="flex: 1; height: 1px; background-color: #5D8736; margin-left: 12px;"></div>
            </div>

            <!-- Card 1 -->
            <v-card class="mt-4 pa-4 d-flex align-center" color="#e9f8ec" rounded="xl" elevation="2">
              <v-icon color="#ff6b6b" size="40" class="mr-4">mdi-heart-pulse</v-icon>
              <div>
                <p class="card-title">Manages Blood Sugar</p>
                <p class="card-description">Balanced meals help stabilize your glucose levels and prevent dangerous spikes or crashes.</p>
              </div>
            </v-card>

            <!-- Card 2 -->
            <v-card class="mt-4 pa-4 d-flex align-center" color="#def5dc" rounded="xl" elevation="2">
              <v-icon color="#f9a825" size="40" class="mr-4">mdi-eye-check</v-icon>
              <div>
                <p class="card-title">Protects Vision</p>
                <p class="card-description">Proper nutrition reduces the risk of diabetic retinopathy and supports eye health.</p>
              </div>
            </v-card>

            <!-- Card 3 -->
            <v-card class="mt-4 pa-4 d-flex align-center" color="#d3f1df" rounded="xl" elevation="2">
              <v-icon color="#42a5f5" size="40" class="mr-4">mdi-foot-print</v-icon>
              <div>
                <p class="card-title">Improves Circulation</p>
                <p class="card-description">Healthy food helps blood flow, lowering the risk of nerve damage and foot complications.</p>
              </div>
            </v-card>

            <!-- Card 4 -->
            <v-card class="mt-4 pa-4 d-flex align-center" color="#f0f9e5" rounded="xl" elevation="2">
              <v-icon color="#ab47bc" size="40" class="mr-4">mdi-emoticon-happy</v-icon>
              <div>
                <p class="card-title">Supports Mental Well-being</p>
                <p class="card-description">A healthy diet contributes to better mood and helps manage stress and anxiety linked to diabetes.</p>
              </div>
            </v-card>

            <!-- Card 5 -->
            <v-card class="mt-4 pa-4 d-flex align-center" color="#e3f4e0" rounded="xl" elevation="2">
              <v-icon color="#26a69a" size="40" class="mr-4">mdi-shield-check</v-icon>
              <div>
                <p class="card-title">Boosts Immunity</p>
                <p class="card-description">Nutritious meals enhance your immune system, helping fight infections more effectively.</p>
              </div>
            </v-card>
          </div>
          <br>
        
          <!-- Bottom Navigation -->
          <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B;">
            <v-btn @click="$router.push('/home')" class="nav-tab">
              <v-icon>mdi-home</v-icon><span>Home</span>
            </v-btn>

            <v-btn @click="$router.push('/meal-plan')" class="nav-tab">
              <v-icon>mdi-heart-pulse</v-icon><span>Meal Plan</span>
            </v-btn>

            <v-btn @click="$router.push('/profile')" class="nav-tab">
              <v-icon>mdi-account</v-icon><span>Profile</span>
            </v-btn>

            <v-btn @click="$router.push('/myprogress')" class="nav-tab">
              <v-icon>mdi-chart-line</v-icon><span>Progress</span>
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

.greeting-mascot {
  width: 120px; 
  animation: floatBounce 2.5s ease-in-out infinite;
}

@keyframes floatBounce {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
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

.nav-bar .v-btn {
  flex-direction: column;
  color: white;
  font-family: 'Syne', sans-serif;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.nav-bar .v-btn:hover {
  background-color: rgba(255, 255, 255, 0.08);
}

.nav-bar .v-btn:active {
  transform: scale(0.96);
}

.nav-bar .v-icon {
  font-size: 24px;
}

.nav-bar span {
  font-size: 12px;
  margin-top: 4px;
}
</style>

