<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'vue-router';

const router = useRouter();
const userFirstName = ref('User');
const avatarUrl = ref(null); 
const progress = ref(66);

const completedMeals = ref([
  {
    name: 'BREAKFAST',
    status: 'Completed',
    time: 'Apr 22, 2025 – 9:30 AM',
    icon: '/src/assets/h4.jpg',
    color: '#e7f5d9'
  },
  {
    name: 'LUNCH',
    status: 'Completed',
    time: 'Apr 22, 2025 – 12:30 AM',
    icon: '/src/assets/h1.jpg',
    color: '#fff7d9'
  },
  {
    name: 'DINNER',
    status: 'In Progress',
    time: null,
    icon: '/src/assets/h2.jpg',
    color: '#e7f5d9'
  }
]);

// Fetch user metadata
onMounted(async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    router.push('/login'); // redirect if not logged in
  } else {
    const meta = data.user.user_metadata;

    // Get full name or fallback
    const fullName = meta.full_name || 'User';

    // Extract first name only
    userFirstName.value = fullName.split(' ')[0];

    // Avatar (if you store one in metadata)
    avatarUrl.value = meta.avatar_url || null;
  }
});

const goBack = () => {
  router.back();
};
</script>



<template>
  <v-app>
    <v-main>
      <v-container fluid class="pa-0">
      <div class="d-flex align-center px-4 py-3" style="background-color: #5D8736; height: 130px;">
        <!-- Avatar -->
        <v-avatar size="100" class="mr-3">
          <v-img v-if="avatarUrl" :src="avatarUrl" alt="User Avatar" />
          <v-icon v-else size="56" color="white">mdi-account-circle</v-icon>
        </v-avatar>

        <div>
          <p class="mb-0" style="color: white; font-family: 'Syne', sans-serif; font-size: 20px;">
            {{ userFirstName }}! Here’s your progress update.
          </p>

        </div>
      </div>

      <!-- Progress Card -->
      <v-card class="mx-4 mt-4 pa-4 text-center" rounded="lg" elevation="2" style="background-color: #f9fff2;">
        <div class="d-flex align-center justify-center mb-2">
          <v-icon color="green" class="mr-2">mdi-trophy</v-icon>
          <p class="mb-0" style="font-weight: 500; font-family: 'Syne', sans-serif; font-size: 18px;">
            Your Meal Plan Progress
          </p>
        </div>
        
        <p class="mb-2" style="color: gray; font-family: 'Syne', sans-serif;">2 out of 3 meals completed today!</p>
        <v-progress-linear :model-value="progress" color="green" height="10" class="rounded-pill"/>
        <div class="mt-2" style="font-weight: bold;">{{ progress }}%</div>
      </v-card>

        <!-- Meal Cards -->
        <v-container class="mt-4">
          <v-card
            v-for="meal in completedMeals"
            :key="meal.name"
            class="mb-4 px-4 py-2 d-flex align-center"
            :color="meal.color"
            rounded="lg"
            style="font-family: 'Syne', sans-serif;"
            elevation="1"
          >
            <v-img :src="meal.icon" width="50" height="50" class="mr-4" />
            <div class="flex-grow-1">
              <p class="mb-1 font-weight-bold" style="font-size: 16px; font-family: 'Syne', sans-serif;">{{ meal.name }}</p>
              <p class="mb-1" style="color: #555; font-family: 'Syne', sans-serif;">
                <v-icon small :color="meal.status === 'Completed' ? 'green' : 'yellow'">
                  {{ meal.status === 'Completed' ? 'mdi-check-circle' : 'mdi-progress-clock' }}
                </v-icon>
                {{ meal.status }}
              </p>
              <p v-if="meal.time" class="text-caption" style="font-family: 'Syne', sans-serif;">Completed : {{ meal.time }}</p>
              <p v-else class="text-caption" style="font-family: 'Syne', sans-serif;">Completed : ---</p>
            </div>
          </v-card>
        </v-container>

        <!-- Bottom Navigation -->
        <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B; margin-bottom: -1px;">
          <v-btn @click="$router.push('/home')" class="nav-tab" :class="{ active: $route.path === '/home' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/home' }">
              <v-icon>mdi-home</v-icon>
            </span>
            <span>Home</span>
          </v-btn>

          <v-btn @click="$router.push('/meal-plan')" class="nav-tab" :class="{ active: $route.path === '/meal-plan' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/meal-plan' }">
              <v-icon>mdi-heart-pulse</v-icon>
            </span>
            <span>Meal Plan</span>
          </v-btn>

          <v-btn @click="$router.push('/profile')" class="nav-tab" :class="{ active: $route.path === '/profile' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/profile' }">
              <v-icon>mdi-account</v-icon>
            </span>
            <span>Profile</span>
          </v-btn>

          <v-btn @click="$router.push('/myprogress')" class="nav-tab" :class="{ active: $route.path === '/myprogress' }">
            <span class="icon-wrapper" :class="{ active: $route.path === '/myprogress' }">
              <v-icon>mdi-chart-line</v-icon>
            </span>
            <span>Progress</span>
          </v-btn>
        </v-bottom-navigation>
      </v-container>
    </v-main>
  </v-app>
</template>



<style scoped>
.icon-wrapper {  /* start nav bar */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;   
  height: 30px;
  border-radius: 50%;
}

.icon-wrapper.active {
  background-color: white;
  color: #5B913B;
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

.nav-bar span { /* end nav bar */
  font-size: 12px;
  margin-top: 4px;
}
</style>
