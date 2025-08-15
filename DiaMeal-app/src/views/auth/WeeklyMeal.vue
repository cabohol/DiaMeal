<script setup>
import { ref } from 'vue'

// Days
const days = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']
const selectedDay = ref('Day 1')

 console.log('User and lab results saved successfully!');

    // Step 5: Call backend API for Groq DeepSeek streaming
    // mealPlanText.value = '';
    // const response = await fetch('/api/generateMealPlan', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     userData: {
    //       ...basicInfo.value,
    //       ...labResults.value,
    //       full_name: fullName,
    //       email: email
    //     }
    //   })
    // });
// Meals data per day
const allMeals = {
  'Day 1': [
    {
      title: 'BREAKFAST',
      name: 'Vegetable Omelette with Rice',
      time: '15 mins',
      calories: '495 kcal',
      image: 'https://via.placeholder.com/200'
    },
    {
      title: 'LUNCH',
      name: 'Grilled Chicken with Rice',
      time: '20 mins',
      calories: '520 kcal',
      image: 'https://via.placeholder.com/200'
    },
    {
      title: 'DINNER',
      name: 'Salmon with Steamed Veggies',
      time: '25 mins',
      calories: '480 kcal',
      image: 'https://via.placeholder.com/200'
    }
  ],
  // You can repeat or modify for Day 2 - Day 7
  'Day 2': [],
  'Day 3': [],
  'Day 4': [],
  'Day 5': [],
  'Day 6': [],
  'Day 7': []
}

const goBack = () => {
  window.history.back()
}

const viewMeal = (meal) => {
  alert(`Viewing details for ${meal.name}`)
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
    
    <br>
    <br>
    <br>
    <br>
    <!-- Day Selector Scroll -->
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

    <!-- Meals List -->
    <v-container>
      <v-card
        v-for="(meal, index) in allMeals[selectedDay]"
        :key="index"
        class="pa-4 my-4"
        rounded="lg"
        elevation="0"
        style="background-color: #E8F5C8;"
      >
        <v-img
          :src="meal.image"
          aspect-ratio="1"
          class="rounded-circle mx-auto"
          max-width="200"
        ></v-img>

        <v-card-text class="text-center">
          <h4 class="font-weight-bold">{{ meal.title }}</h4>
          <p class="mb-1">{{ meal.name }}</p>
          <p class="text-grey-darken-1">
            Time: {{ meal.time }}<br>
            Calories: {{ meal.calories }}
          </p>
          <v-btn
            color="#5D8736"
            rounded
            class="mt-2 text-white"
            @click="viewMeal(meal)"
          >
            View
            <v-icon end>mdi-chevron-right</v-icon>
          </v-btn>
        </v-card-text>
      </v-card>
      <br>
      <br>
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
