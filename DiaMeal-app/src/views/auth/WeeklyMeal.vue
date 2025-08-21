<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/utils/supabase'

// Days (we'll show "Day 1" for now; you can expand to more later)
const days = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']
const selectedDay = ref('Day 1')

const loading = ref(false)
const errorMsg = ref('')
const mealsByType = ref({
  breakfast: [],
  lunch: [],
  dinner: []
})

// Fetch the current user id, then call API
const fetchMealPlan = async () => {
  loading.value = true
  errorMsg.value = ''

  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('User not authenticated')

    // If your 'users' table uses auth uid as id, map accordingly.
    // Otherwise you might need to query users table by email to get its numeric/uuid id.
    // Here we assume you used the 'users' table id returned when saving in MealPlan.vue.
    // If you saved by email, fetch that row first to get its id:
    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .single()
    if (userRowErr || !userRow) throw userRowErr || new Error('User row not found')

    const resp = await fetch('/api/generateMealPlan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userRow.id })
    })

    // ensure JSON only
    const text = await resp.text()
    let json
    try {
      json = JSON.parse(text)
    } catch (e) {
      console.error('Non-JSON response:', text)
      throw new Error('Response was not valid JSON')
    }

    if (!json.success) {
      throw new Error(json.error || 'Failed to generate meal plan')
    }

    // Store per meal type
    mealsByType.value = {
      breakfast: json.mealsByType?.breakfast || [],
      lunch: json.mealsByType?.lunch || [],
      dinner: json.mealsByType?.dinner || []
    }
  } catch (err) {
    console.error('Error fetching meal plan:', err)
    errorMsg.value = err.message || 'Something went wrong'
  } finally {
    loading.value = false
  }
}

onMounted(fetchMealPlan)

const goBack = () => window.history.back()

const sections = computed(() => ([
  { key: 'breakfast', title: 'BREAKFAST' },
  { key: 'lunch', title: 'LUNCH' },
  { key: 'dinner', title: 'DINNER' }
]))

const viewMeal = (meal) => {
  const details = [
    `Name: ${meal.name}`,
    `Time: ${meal.preparation_time || 'N/A'}`,
    `Calories: ${typeof meal.calories === 'number' ? `${meal.calories} kcal` : 'N/A'}`,
    `Ingredients: ${(meal.ingredients || []).join(', ')}`,
    `Procedure: ${meal.procedures || 'N/A'}`
  ].join('\n')
  alert(details)
}
</script>

<template>
  <v-app>
    <!-- Top App Bar -->
    <v-app-bar flat color="#A9C46C">
      <v-btn icon @click="goBack">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-white">Weekly Menu</v-toolbar-title>
    </v-app-bar>

    <br><br><br><br>

    <!-- Day Selector (only Day 1 has content for now) -->
    <div class="day-scroll">
      <div class="day-buttons">
        <v-btn
          v-for="day in days"
          :key="day"
          :color="selectedDay === day ? '#A9C46C' : 'white'"
          :class="selectedDay === day ? 'text-white' : 'text-black'"
          rounded
          @click="selectedDay = day"
          style="min-width: 90px; border: 1px solid #A9C46C; flex-shrink: 0;"
        >
          {{ day }}
        </v-btn>
      </div>
      <br>
    </div>

    <v-container>
      <v-alert
        v-if="errorMsg"
        type="error"
        variant="tonal"
        class="mb-4"
      >
        {{ errorMsg }}
      </v-alert>

      <v-skeleton-loader
        v-if="loading"
        type="image, article, actions"
        class="mb-6"
      />

      <!-- Sections: Breakfast / Lunch / Dinner -->
      <template v-if="!loading && !errorMsg">
        <v-card
          v-for="sec in sections"
          :key="sec.key"
          class="pa-4 my-6"
          rounded="lg"
          elevation="0"
          style="background-color: #E8F5C8;"
        >
          <h3 class="text-center font-weight-bold mb-3">{{ sec.title }}</h3>

          <v-slide-group
            show-arrows
            class="px-2"
          >
            <v-slide-group-item
              v-for="(meal, idx) in mealsByType[sec.key]"
              :key="sec.key + '-' + idx"
            >
              <v-card
                class="ma-3 pa-4 d-flex flex-column align-center"
                max-width="280"
                rounded="lg"
                elevation="1"
              >
                <v-img
                  :src="'https://via.placeholder.com/280x180'"
                  width="100%"
                  height="180"
                  cover
                  class="rounded-lg mb-3"
                />
                <div class="text-center">
                  <div class="font-weight-bold mb-1">{{ meal.name }}</div>
                  <div class="text-grey-darken-1 mb-1">
                    Time: {{ meal.preparation_time || 'N/A' }}
                  </div>
                  <div class="text-grey-darken-1">
                    Calories:
                    <span>
                      {{ typeof meal.calories === 'number' ? meal.calories + ' kcal' : 'N/A' }}
                    </span>
                  </div>
                  <v-btn
                    color="#5D8736"
                    rounded
                    class="mt-3 text-white"
                    @click="viewMeal(meal)"
                  >
                    View
                    <v-icon end>mdi-chevron-right</v-icon>
                  </v-btn>
                </div>
              </v-card>
            </v-slide-group-item>
          </v-slide-group>

          <div v-if="!mealsByType[sec.key]?.length" class="text-center py-6">
            <em>No {{ sec.title.toLowerCase() }} options yet.</em>
          </div>
        </v-card>
      </template>

      <br><br>
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
  </v-app>
</template>




<style scoped>
/* Horizontal Scroll for Days */
.day-scroll {
  overflow-x: auto;
  white-space: nowrap;
  padding: 10px;
  background: white;
}
.day-buttons {
  display: flex;
  gap: 8px;
}

/* Scrollbar hidden for mobile */
.day-scroll::-webkit-scrollbar {
  display: none;
}
.day-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Bottom Navigation */
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