<template>
  <v-app>
    <v-main>
      <v-container class="pa-0">
        <!-- Header -->
        <div class="d-flex align-center px-4 py-3" style="background-color: #5D8736;">
          
          <h2 class="ml-4 text-center" style="color: white; font-family: 'Syne', sans-serif;">My Progress</h2>
        </div>

        <!-- Welcome Message -->
        <v-card class="mx-4 mt-4 pa-4" color="#f5f5f5" rounded="lg" elevation="2">
          <v-row>
            <v-col cols="3">
              <v-avatar size="64">
                <v-icon size="64">mdi-account-circle</v-icon>
              </v-avatar>
            </v-col>
            <v-col cols="9">
              <p class="mb-0" style="font-size: 16px; color: #444;">Welcome,</p>
              <p class="font-weight-bold" style="font-size: 18px;">{{ fullName }}!</p>
            </v-col>
          </v-row>
        </v-card>

        <!-- Progress Card -->
        <v-card class="mx-4 mt-4 pa-4 text-center" rounded="lg" elevation="2">
          <p class="mb-2" style="font-weight: 500;">Your mealplan progress</p>
          <p class="mb-2" style="color: gray;">2 out of 3 meals completed this day!</p>
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
            elevation="1"
          >
            <v-img :src="meal.icon" width="50" height="50" class="mr-4" />
            <div class="flex-grow-1">
              <p class="mb-1 font-weight-bold" style="font-size: 16px;">{{ meal.name }}</p>
              <p class="mb-1" style="color: #555;">
                <v-icon small :color="meal.status === 'Completed' ? 'green' : 'yellow'">
                  {{ meal.status === 'Completed' ? 'mdi-check-circle' : 'mdi-progress-clock' }}
                </v-icon>
                {{ meal.status }}
              </p>
              <p v-if="meal.time" class="text-caption">Completed : {{ meal.time }}</p>
              <p v-else class="text-caption">Completed : ---</p>
            </div>
          </v-card>
        </v-container>

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

<script setup>
import { ref, onMounted } from 'vue';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'vue-router';

const router = useRouter();
const fullName = ref('Juan Dela Cruz');
const progress = ref(66);

const completedMeals = ref([
  {
    name: 'BREAKFAST',
    status: 'Completed',
    time: 'Apr 22, 2025 – 9:30 AM',
    icon: '/src/assets/breakfast.png',
    color: '#e7f5d9'
  },
  {
    name: 'LUNCH',
    status: 'Completed',
    time: 'Apr 22, 2025 – 12:30 AM',
    icon: '/src/assets/lunch.png',
    color: '#e7f5d9'
  },
  {
    name: 'DINNER',
    status: 'In Progress',
    time: null,
    icon: '/src/assets/dinner.png',
    color: '#fff7d9'
  }
]);

onMounted(async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    router.push('/login');
  } else {
    const meta = data.user.user_metadata;
    const name = `${meta.firstName || ''} ${meta.lastName || ''}`.trim() || 'User';
    fullName.value = name;
  }
});

const goBack = () => {
  router.back();
};
</script>

<style scoped>
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
