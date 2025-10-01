<script setup>
import { ref, onMounted, computed } from 'vue';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'vue-router';

const router = useRouter();
const userFirstName = ref('User');
const avatarUrl = ref(null); 
const currentUserId = ref(null);
const dbCompletedMeals = ref([]);
const dbProgressData = ref(null);
const calculatedTotalCalories = ref(0);
const userLastSubmissionDate = ref(null);
const currentDayInSequence = ref(1);
const generatedDays = ref([]);

// Load meal completions from localStorage with user-specific key
const loadMealCompletions = () => {
  if (!currentUserId.value) return {}
  
  const userSpecificKey = `mealCompletions_${currentUserId.value}`
  const stored = localStorage.getItem(userSpecificKey)
  return stored ? JSON.parse(stored) : {}
}

// Helper function to get local date string (YYYY-MM-DD format) - same as WeeklyMeal
const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Generate day labels with actual dates based on user's last_submission_date
const generateDaysWithDates = (startDate) => {
  const days = [];
  const baseDate = new Date(startDate);
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const dayLabel = `Day ${i + 1}`;
    days.push({ label: dayLabel, date: dateStr, dayNumber: i + 1 });
  }
  
  return days;
};

// Calculate which day should be selected based on today - same logic as WeeklyMeal
const calculateSelectedDay = () => {
  if (!userLastSubmissionDate.value) return 1;
  
  // Use the same logic as WeeklyMeal for date calculation
  const todayLocal = getLocalDateString(); // This gets local date correctly
  const todayIndex = generatedDays.value.findIndex(day => day.date === todayLocal);
  
  console.log('Today (local):', todayLocal);
  console.log('Generated days:', generatedDays.value.map(d => d.date));
  console.log('Today index found:', todayIndex);
  
  // If today matches one of the generated days, select it; otherwise default to Day 1
  return todayIndex >= 0 ? todayIndex + 1 : 1;
};

// Fetch user's last submission date and generate days
const fetchUserData = async () => {
  if (!currentUserId.value) return;
  
  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('last_submission_date')
      .eq('id', currentUserId.value)
      .single();

    if (error) {
      console.error('Error fetching user data:', error);
      return;
    }

    userLastSubmissionDate.value = userData.last_submission_date;
    
    // Generate days based on last submission date
    if (userData.last_submission_date) {
      generatedDays.value = generateDaysWithDates(userData.last_submission_date);
      currentDayInSequence.value = calculateSelectedDay();
    } else {
      // If no last submission date, generate from today
      const today = getLocalDateString();
      generatedDays.value = generateDaysWithDates(today);
      currentDayInSequence.value = 1;
    }
    
    console.log('User last submission date:', userData.last_submission_date);
    console.log('Generated days:', generatedDays.value);
    console.log('Current day in sequence:', currentDayInSequence.value);
    
  } catch (err) {
    console.error('Error fetching user data:', err);
  }
};

// Get the date for the current selected day
const getCurrentSelectedDate = () => {
  if (!generatedDays.value.length || !currentDayInSequence.value) {
    return getLocalDateString(); // fallback to today
  }
  
  const selectedDay = generatedDays.value.find(day => day.dayNumber === currentDayInSequence.value);
  return selectedDay ? selectedDay.date : getLocalDateString();
};

// Fetch completed meals from Supabase - UNIFIED WITH WeeklyMeal.vue
const fetchCompletedMeals = async () => {
  if (!currentUserId.value) return;
  
  const selectedDate = getCurrentSelectedDate();
  
  try {
    console.log('Fetching completed meals for user:', currentUserId.value, 'date:', selectedDate);
    
    // Use the EXACT same query structure as WeeklyMeal.vue
    const { data: completedMeals, error } = await supabase
      .from('completed_meals')
      .select(`
        *,
        meals (
          calories,
          name,
          carbohydrates,
          protein,
          fiber,
          glycemic_load
        )
      `)
      .eq('user_id', currentUserId.value)
      .eq('meal_date', selectedDate);

    if (error) {
      console.error('Error fetching completed meals:', error);
      return;
    }

    // Use the EXACT same processing logic as WeeklyMeal.vue
    const processedMeals = await Promise.all(completedMeals?.map(async (meal) => {
      let calories = 0;
      let mealName = meal.meal_name || 'Unknown Meal';
      let nutritionalInfo = {
        carbohydrates: 0,
        protein: 0,
        fiber: 0,
        glycemic_load: 0
      };

      // First, check if we have data from meals table
      if (meal.meals && meal.meals.calories) {
        calories = meal.meals.calories;
        mealName = meal.meals.name || meal.meal_name || 'Unknown Meal';
        nutritionalInfo = {
          carbohydrates: meal.meals.carbohydrates || 0,
          protein: meal.meals.protein || 0,
          fiber: meal.meals.fiber || 0,
          glycemic_load: meal.meals.glycemic_load || 0
        };
      } else {
        // If no data from meals table, check ingredients table (same as WeeklyMeal.vue)
        console.log('No data from meals table for:', meal.meal_name, 'checking ingredients table...');
        
        const { data: ingredientData, error: ingredientError } = await supabase
          .from('ingredients')
          .select('name, calories_p, category')
          .ilike('name', `%${meal.meal_name}%`)
          .single();

        if (!ingredientError && ingredientData) {
          calories = ingredientData.calories_p || 0;
          mealName = ingredientData.name || meal.meal_name;
          console.log(`Found in ingredients table: ${mealName} = ${calories} calories`);
        } else {
          // Final fallback to stored calories in completed_meals table
          calories = meal.calories || 0;
          console.log(`Using stored calories from completed_meals: ${calories}`);
        }
      }

      return {
        ...meal,
        calories: calories,
        meal_name: mealName,
        carbohydrates: nutritionalInfo.carbohydrates,
        protein: nutritionalInfo.protein,
        fiber: nutritionalInfo.fiber,
        glycemic_load: nutritionalInfo.glycemic_load
      };
    }) || []);

    dbCompletedMeals.value = processedMeals;
    console.log('Fetched completed meals with accurate calories:', processedMeals);
    
    // Calculate total calories using the accurate calories (same as WeeklyMeal.vue)
    let totalCalories = 0;
    if (processedMeals && processedMeals.length > 0) {
      totalCalories = processedMeals.reduce((sum, meal) => {
        const mealCalories = meal.calories || 0;
        console.log(`Meal: ${meal.meal_name}, Calories: ${mealCalories}`);
        return sum + mealCalories;
      }, 0);
      
      console.log('Total calories from meals table:', totalCalories);
    }
    
    // Update calculated calories
    calculatedTotalCalories.value = totalCalories;
    
    // Count unique meal types and update progress (same as WeeklyMeal.vue)
    const completedMealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) {
        completedMealTypes.add(meal.meal_type.toLowerCase());
      }
    });
    
    console.log('Completed meal types:', Array.from(completedMealTypes));
    console.log('Total completed meals count:', completedMealTypes.size);
    
    await updateProgressInDB(totalCalories, completedMealTypes.size);
    
    // Add debugging log for comparison
    console.log('Calories comparison - MyProgress:', {
      dbCalories: dbProgressData.value?.calories_consumed,
      calculatedCalories: calculatedTotalCalories.value,
      completedMeals: dbCompletedMeals.value.map(m => ({ name: m.meal_name, calories: m.calories }))
    });
    
  } catch (err) {
    console.error('Error fetching completed meals:', err);
  }
};

// Update or create progress in database using day number from sequence
const updateProgressInDB = async (accurateCalories, completedMealsCount) => {
  if (!currentUserId.value || !currentDayInSequence.value) return;

  const selectedDate = getCurrentSelectedDate();

  try {
    console.log('Updating progress with accurate calories:', {
      user_id: currentUserId.value,
      day: currentDayInSequence.value,
      date: selectedDate,
      calories_consumed: accurateCalories,
      completed_meals_count: completedMealsCount,
      status: completedMealsCount >= 1 ? 'completed' : 'in_progress'
    });

    const { data, error } = await supabase
      .from('progress')
      .upsert({
        user_id: currentUserId.value,
        day: currentDayInSequence.value,
        calories_consumed: accurateCalories,
        status: completedMealsCount >= 1 ? 'completed' : 'in_progress',
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating progress:', error);
      return;
    }

    console.log('Progress updated with accurate calories:', data);
    
    // Refresh progress data
    await fetchProgressFromDB();
    
  } catch (err) {
    console.error('Error updating progress:', err);
  }
};

// Optional: Add a function to sync existing completed_meals calories with meals table
const syncCompletedMealsCalories = async () => {
  if (!currentUserId.value) return;
  
  try {
    console.log('Starting calories sync for user:', currentUserId.value);
    
    // Get all completed meals for this user that might have incorrect calories
    const { data: completedMeals, error: fetchError } = await supabase
      .from('completed_meals')
      .select(`
        id,
        meal_id,
        calories,
        meal_name,
        meals (
          calories
        )
      `)
      .eq('user_id', currentUserId.value);

    if (fetchError) {
      console.error('Error fetching completed meals for sync:', fetchError);
      return;
    }

    // Update each completed meal with the correct calories from meals table
    const updatePromises = completedMeals?.map(async (completedMeal) => {
      const correctCalories = completedMeal.meals?.calories;
      
      // Only update if the calories are different
      if (correctCalories && correctCalories !== completedMeal.calories) {
        console.log(`Syncing meal ${completedMeal.meal_name}: ${completedMeal.calories} -> ${correctCalories} calories`);
        
        const { error: updateError } = await supabase
          .from('completed_meals')
          .update({ calories: correctCalories })
          .eq('id', completedMeal.id);

        if (updateError) {
          console.error(`Error updating completed meal ${completedMeal.id}:`, updateError);
        }
      }
    }) || [];

    await Promise.all(updatePromises);
    console.log('Completed meals calories sync finished');
    
  } catch (err) {
    console.error('Error syncing completed meals calories:', err);
  }
};

// Computed total calories with localStorage fallback 
const totalCalories = computed(() => {
  // PRIORITY 1: Use freshly calculated calories from completed meals
  if (calculatedTotalCalories.value > 0) {
    return calculatedTotalCalories.value;
  }
  
  // PRIORITY 2: Use database progress data as fallback
  if (dbProgressData.value && dbProgressData.value.calories_consumed !== null) {
    return dbProgressData.value.calories_consumed;
  }

  // PRIORITY 3: Calculate from localStorage
  const completions = loadMealCompletions();
  let total = 0;
  const selectedDate = getCurrentSelectedDate();

  Object.keys(completions).forEach(key => {
    const completion = completions[key];
    if (
      completion &&
      completion.completed &&
      completion.date === selectedDate &&
      typeof completion.calories === 'number'
    ) {
      total += completion.calories;
    }
  });

  return total;
});

// Computed progress with localStorage fallback
const todayProgress = computed(() => {
  // Primary: Use database data
  if (dbCompletedMeals.value && dbCompletedMeals.value.length > 0) {
    const mealTypes = new Set();
    dbCompletedMeals.value.forEach(meal => {
      if (meal.meal_type) {
        mealTypes.add(meal.meal_type.toLowerCase());
      }
    });

    const totalMeals = 3; // breakfast, lunch, dinner
    const completedMeals = mealTypes.size;
    const percentage = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

    return {
      completed: completedMeals,
      total: totalMeals,
      percentage: percentage
    };
  }

  // Fallback: Use localStorage data
  const completions = loadMealCompletions()
  const selectedDate = getCurrentSelectedDate();
  
  // Count unique meal types completed for selected date
  const selectedDateMealTypes = new Set()
  
  Object.keys(completions).forEach(key => {
    const completion = completions[key]
    // Check if completion exists, is marked as completed, and date matches selected date
    if (completion && 
        completion.completed && 
        completion.date === selectedDate) {
      
      const mealType = completion.mealType?.toLowerCase() || ''
      if (mealType === 'breakfast' || mealType === 'lunch' || mealType === 'dinner') {
        selectedDateMealTypes.add(mealType)
      }
    }
  })
  
  const totalMeals = 3 // breakfast, lunch, dinner
  const completedMeals = selectedDateMealTypes.size
  const percentage = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0
  
  return {
    completed: completedMeals,
    total: totalMeals,
    percentage: percentage
  }
});

// Generate meal status array with localStorage fallback - UNIFIED WITH WeeklyMeal.vue
const completedMeals = computed(() => {
  const mealTypes = ['breakfast', 'lunch', 'dinner'];
  const mealNames = ['BREAKFAST', 'LUNCH', 'DINNER'];
  const colors = ['#e7f5d9', '#fff7d9', '#e7f5d9'];
  
  return mealTypes.map((type, index) => {
    // Primary: Find completion for this meal type from database
    const dbCompletion = dbCompletedMeals.value.find(meal => 
      meal.meal_type && meal.meal_type.toLowerCase() === type
    );
    
    if (dbCompletion) {
      // Use database data with the SAME calorie logic as WeeklyMeal.vue
      let timeString = '---';
      if (dbCompletion.completed_at) {
        const completedDateTime = new Date(dbCompletion.completed_at);
        const dateStr = completedDateTime.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const timeStr = completedDateTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        timeString = `${dateStr} at ${timeStr}`;
      } else if (dbCompletion.completed_date) {
        const completedDate = new Date(dbCompletion.completed_date + 'T00:00:00');
        timeString = completedDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        }) + ' – Completed';
      }
      
      return {
        name: mealNames[index],
        status: 'Completed',
        time: timeString,
        color: colors[index],
        mealName: dbCompletion.meal_name,
        calories: dbCompletion.calories || 0 // This now uses the processed calories from fetchCompletedMeals
      };
    }

    // Fallback: Find completion for this meal type from localStorage
    const completions = loadMealCompletions()
    const selectedDate = getCurrentSelectedDate();
    let localCompletion = null
    
    Object.keys(completions).forEach(key => {
      const completion = completions[key]
      if (completion && 
          completion.completed && 
          completion.date === selectedDate && 
          completion.mealType === mealNames[index]) {
        localCompletion = completion
      }
    })
    
    if (localCompletion) {
      const completedDate = new Date(localCompletion.timestamp)
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
        color: colors[index],
        mealName: localCompletion.mealName || 'Meal',
        calories: localCompletion.calories || 0
      }
    }
    
    // Not completed in either database or localStorage
    return {
      name: mealNames[index],
      status: 'Not Started',
      time: null,
      color: colors[index],
      mealName: null,
      calories: 0
    };
  });
});

// Fetch progress data using the calculated day number
const fetchProgressFromDB = async () => {
  if (!currentUserId.value || !currentDayInSequence.value) return;
  
  try {
    console.log('Fetching progress for user:', currentUserId.value, 'day:', currentDayInSequence.value);
    
    const { data: progressData, error } = await supabase
      .from('progress')
      .select('*')
      .eq('user_id', parseInt(currentUserId.value))
      .eq('day', parseInt(currentDayInSequence.value))
      .limit(1);

    if (error) {
      console.error('Error fetching progress from DB:', error);
      return;
    }

    // Take the first result or null if no results
    dbProgressData.value = progressData && progressData.length > 0 ? progressData[0] : null;
    console.log('Database progress data:', dbProgressData.value);
  } catch (err) {
    console.error('Error fetching progress:', err);
  }
};

// Get the current selected date for display
const getCurrentDateDisplay = computed(() => {
  const selectedDate = getCurrentSelectedDate();
  const date = new Date(selectedDate + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric'
  });
});

// Get the current day number for display
const getCurrentDayDisplay = computed(() => {
  return `Day ${currentDayInSequence.value}`;
});

// Updated onMounted function
onMounted(async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      router.push('/login');
      return;
    }

    // Set user metadata
    const meta = data.user.user_metadata;
    const fullName = meta.full_name || 'User';
    userFirstName.value = fullName.split(' ')[0];
    avatarUrl.value = meta.avatar_url || null;

    // Get user ID from database
    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', data.user.email)
      .single();

    if (userRowErr || !userRow) {
      console.error('Error fetching user ID:', userRowErr);
      return;
    }

    // Set the current user ID
    currentUserId.value = userRow.id;
    console.log('User ID set for progress tracking:', userRow.id);

    // Fetch user data to get last_submission_date and calculate current day
    await fetchUserData();
    
    // Fetch progress data from existing table
    await fetchProgressFromDB();
    
    // Fetch completed meals (calories are now fetched from meals table)
    await fetchCompletedMeals();

    // Optional: Uncomment this line if you want to sync existing calories once
    // await syncCompletedMealsCalories();

  } catch (err) {
    console.error('Error in onMounted:', err);
    router.push('/login');
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
            <!-- Calories Line -->
            <div class="d-flex align-center justify-center mb-2">
              <v-icon color="red" class="mr-2">mdi-fire</v-icon>
              <h3 class="mb-0 text-lg font-semibold">{{ totalCalories }} Calories Consumed for {{ getCurrentDayDisplay }}</h3>
            </div>

            <p class="mb-2 text-lg">
              {{ todayProgress.completed }} out of {{ todayProgress.total }} meals completed!
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
                
                <!-- Show meal name and calories if completed -->
                <div v-if="meal.mealName" class="mb-2">
                  <p class="text-sm font-weight-medium">{{ meal.mealName }}</p>
                 <p v-if="meal.calories > 0" class="text-xs text-grey-darken-1">
                    <v-icon size="x-small" color="#EF7722" class="mr-1">mdi-fire</v-icon>
                    {{ meal.calories }} cal
                  </p> 
                </div>
                
                <p class="text-xl mb-0 mt-auto">
                  {{ meal.time || '---' }}
                </p>
                <!-- <strong>Completed:</strong> -->
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

/* start nav bar */
.nav-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: auto;
  min-height: 56px;
  padding: 4px 0;
}

.icon-wrapper {  
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;   
  height: 32px;
  border-radius: 50%;
  transition: all 0.2s ease;
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
  min-width: 64px;
  padding: 8px 12px;
  height: auto;
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
  font-size: 11px;
  margin-top: 4px;
  white-space: nowrap;
}

/* Mobile responsive nav */
@media (max-width: 360px) {
  .nav-bar {
    min-height: 52px;
    padding: 2px 0;
  }
  
  .nav-bar .v-btn {
    min-width: 56px;
    padding: 6px 8px;
  }
  
  .icon-wrapper {
    width: 28px;
    height: 28px;
  }
  
  .nav-bar .v-icon {
    font-size: 20px;
  }
  
  .nav-bar span {
    font-size: 10px;
    margin-top: 2px;
  }
}

@media (min-width: 361px) and (max-width: 480px) {
  .nav-bar {
    min-height: 56px;
  }
  
  .nav-bar .v-btn {
    min-width: 60px;
    padding: 6px 10px;
  }
  
  .icon-wrapper {
    width: 30px;
    height: 30px;
  }
  
  .nav-bar .v-icon {
    font-size: 22px;
  }
  
  .nav-bar span {
    font-size: 10px;
  }
}

@media (min-width: 481px) {
  .nav-bar {
    min-height: 60px;
  }
  
  .nav-bar .v-btn {
    padding: 8px 16px;
  }
  
  .nav-bar span {
    font-size: 12px;
  }
}
/* end nav bar */

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