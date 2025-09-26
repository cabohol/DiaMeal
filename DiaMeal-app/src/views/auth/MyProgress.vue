<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'vue-router';

const router = useRouter();
const userFirstName = ref('User');
const avatarUrl = ref(null); 

// Computed total calories for TODAY
const totalCalories = computed(() => {
  const completions = loadMealCompletions()
  let total = 0

  Object.keys(completions).forEach(key => {
    const completion = completions[key]
    if (
      completion &&
      completion.completed &&
      completion.date === today &&
      typeof completion.calories === 'number'
    ) {
      total += completion.calories
    }
  })

  return total
})


// Load meal completions from localStorage
const loadMealCompletions = () => {
  const stored = localStorage.getItem('mealCompletions')
  return stored ? JSON.parse(stored) : {}
}

// Get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0]

// Computed progress based on actual completions for TODAY only
const todayProgress = computed(() => {
  const completions = loadMealCompletions()
  
  // Count unique meal types completed TODAY only
  const todayMealTypes = new Set()
  
  Object.keys(completions).forEach(key => {
    const completion = completions[key]
    // Check if completion exists, is marked as completed, and date matches today
    if (completion && 
        completion.completed && 
        completion.date === today) {
      
      const mealType = completion.mealType?.toLowerCase() || ''
      if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
        todayMealTypes.add(mealType)
      }
    }
  })
  
  const totalMeals = 3 // breakfast, lunch, dinner
  const completedMeals = todayMealTypes.size
  const percentage = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0
  
  return {
    completed: completedMeals,
    total: totalMeals,
    percentage: percentage
  }
})

// Generate meal status array for TODAY only
const completedMeals = computed(() => {
  const completions = loadMealCompletions()
  const mealTypes = ['breakfast', 'lunch', 'dinner']
  const mealNames = ['BREAKFAST', 'LUNCH', 'DINNER']
  const colors = ['#e7f5d9', '#fff7d9', '#e7f5d9']
  
  return mealTypes.map((type, index) => {
    // Find completion for this meal type TODAY only
    let todayCompletion = null
    
    Object.keys(completions).forEach(key => {
      const completion = completions[key]
      if (completion && 
          completion.completed && 
          completion.date === today && 
          completion.mealType === mealNames[index]) {
        todayCompletion = completion
      }
    })
    
    if (todayCompletion) {
      const completedDate = new Date(todayCompletion.timestamp)
      const timeString = completedDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      }) + ' – ' + completedDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
      
      return {
        name: mealNames[index],
        status: 'Completed',
        time: timeString,
        color: colors[index]
      }
    }
    
    return {
      name: mealNames[index],
      status: 'Not Started',
      time: null,
      color: colors[index]
    }
  })
})

// Fetch user metadata
onMounted(async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    router.push('/login');
  } else {
    const meta = data.user.user_metadata;
    const fullName = meta.full_name || 'User';
    userFirstName.value = fullName.split(' ')[0];
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
            <v-icon v-else size="85" color="white">mdi-account-circle</v-icon>
          </v-avatar>

          <div>
            <p class="mb-0" style="color: white; font-size: 20px;">
              {{ userFirstName }}! Here's your progress update.
            </p>
          </div>
        </div>

        <div class="progress-container">
          <!-- Image -->
          <div class="image-wrapper">
            <img src="/src/assets/veg.png" alt="Broccoli" class="progress-image" />
          </div>

          <!-- Card -->
          <v-card class="progress-card" rounded="lg" elevation="3">
            <!-- <div class="d-flex align-center justify-center mb-2">
              <v-icon color="green" class="mr-2">mdi-trophy</v-icon>
              <h3 class="mb-0 font-extrabold text-2xl text-gray-900"> Your Meal Plan Progress </h3>
            </div> -->

              <!-- Calories Line -->
              <div class="d-flex align-center justify-center mb-2">
                <v-icon color="red" class="mr-2">mdi-fire</v-icon>
                <h3 class="mb-0 text-lg font-semibold">{{ totalCalories }} kcal consumed today</h3>
              </div>

            <p class="mb-2 text-lg">
              {{ todayProgress.completed }} out of {{ todayProgress.total }} meals completed today!
            </p>

            <v-progress-linear color="#66BB6A" height="10" :model-value="todayProgress.percentage" striped></v-progress-linear>

            <div class="mt-2 font-weight-bold">{{ todayProgress.percentage }}%</div>
          </v-card>

        </div>

        
        <!-- Meal Cards -->
        <v-container class="mt-4">
          <v-row>
            <v-col
              v-for="meal in completedMeals"
              :key="meal.name"
              cols="12"
              sm="4"
              md="4"
              lg="4"
            >
              <v-card
                class="meal-progress-card px-4 py-4 d-flex flex-column h-100 text-center"
                :color="meal.color"
                rounded="lg"
                elevation="2"
              >
                <!-- Meal name -->
                <p class="mb-3 font-weight-bold text-h6">{{ meal.name }}</p>
                
                <!-- Status -->
                <div class="d-flex align-center justify-center mb-2">
                  <v-icon 
                    small 
                    :color="meal.status === 'Completed' ? 'green' : 'orange'" 
                    class="mr-2"
                  >
                    {{ meal.status === 'Completed' ? 'mdi-check-circle' : 'mdi-progress-clock' }}
                  </v-icon>
                  <span class="font-weight-medium" :class="meal.status === 'Completed' ? 'text-green' : 'text-orange'">
                    {{ meal.status }}
                  </span>
                </div>
                
                <p class="text-xl mb-0 mt-auto">
                  <strong>Completed:</strong> {{ meal.time || '---' }}
                </p>
              </v-card>
            </v-col>
          </v-row>
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
body, p, span, div, button, h1, h2, h3, h4, h5, h6 {
  font-family: 'Syne', sans-serif !important;
}

.meal-progress-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  min-height: 150px;
}

.meal-progress-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

/* Mobile */
@media (max-width: 599px) {
  .meal-progress-card {
    min-height: 120px;
  }
}

/* Tablet */
@media (min-width: 600px) {
  .meal-progress-card {
    min-height: 160px;
  }
}

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

.progress-container {
  position: relative;
  display: flex;
  justify-content: center;
  margin-top: 120px;
}

.image-wrapper {
  position: absolute;
  top: -140px; 
  z-index: 1;
  display: flex;
  justify-content: center;
  width: 100%;
}

.progress-image {
  width: clamp(250px, 40vw, 200px); 
  height: auto;
  object-fit: contain;
}

.progress-card {
  position: relative;
  z-index: 2;
  width: 90%;
  max-width: 750px;
  padding: 16px;
  text-align: center;
}
</style>