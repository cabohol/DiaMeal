<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/utils/supabase';

const router = useRouter();
const tab = ref(0);
const currentUser = ref(null); // Will store the authenticated user
const required = v => !!v || 'This field is required';

const basicInfo = ref({
  gender: '',
  age: '',
  height: '',
  weight: '',
  diabetesType: '',
  allergies: '',
  religiousDiet: '',
  budget: ''
});

const labResults = ref({
  fbs: '',
  ppbs: '',
  hba1c: '',
  glucoseTolerance: ''
});

// Fetch authenticated user on mount
onMounted(async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Auth error:', error.message);
  } else {
    currentUser.value = user;
  }
});

function cancelForm() {
  labResults.value = {
    fbs: '',
    ppbs: '',
    hba1c: '',
    glucoseTolerance: ''
  };
}

async function submitForm() {
  try {
    // Check if user is logged in
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('User not authenticated');

    const fullName = user.user_metadata?.full_name || '';
    const email = user.email || '';

    // Step 1: Insert into 'users' table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        full_name: fullName,
        email: email,
        gender: basicInfo.value.gender,
        age: parseInt(basicInfo.value.age),
        height_cm: parseFloat(basicInfo.value.height),
        weight_kg: parseFloat(basicInfo.value.weight),
        diabetes_type: basicInfo.value.diabetesType,
        budget: parseFloat(basicInfo.value.budget),
        created_at: new Date()
      })
      .select()
      .single();

    if (userError) throw userError;

    const userId = userData.id;

    // Step 2: Insert allergies
    if (basicInfo.value.allergies) {
      await supabase.from('allergies').insert({
        allergy: basicInfo.value.allergies,
        user_id: userId,
        created_at: new Date()
      });
    }

    // Step 3: Insert religious diet
    if (basicInfo.value.religiousDiet) {
      await supabase.from('religious_diets').insert({
        diet_type: basicInfo.value.religiousDiet,
        user_id: userId,
        created_at: new Date()
      });
    }

    // Step 4: Insert lab results
    await supabase.from('lab_results').insert({
      fasting_blood_sugar: parseFloat(labResults.value.fbs),
      postprandial_blood_sugar: parseFloat(labResults.value.ppbs),
      hba1c: parseFloat(labResults.value.hba1c),
      glucose_tolerance: labResults.value.glucoseTolerance,
      user_id: userId,
      created_at: new Date()
    });

    console.log('User and lab results saved successfully!');
  } catch (error) {
    console.error('Error submitting form:', error.message);
  }
}
</script>




<template>
  <v-app>
    <v-main>
      <!-- IMAGE SECTION -->
     <v-container fluid class="pa-0">
        <v-img
            src="/src/assets/mp1.jpg"
            class="mb-6 rounded-lg"
            cover
            width="100%"
            :height="$vuetify.display.smAndDown ? 180 : 250"
        />
     </v-container>

      <v-container style="margin-top: -30px">
        <!-- Tabs -->
        <v-tabs v-model="tab" bg-color="#A9C46C" class="mb-4" grow>
          <v-tab class="text-center" style=" font-family: 'Syne', sans-serif; color: #0B2E33; min-width: 160px; flex: 1 1 auto;">Basic Information</v-tab>
          <v-tab class="text-center" style=" font-family: 'Syne', sans-serif; color: #0B2E33; min-width: 160px; flex: 1 1 auto;">Lab Results</v-tab>
        </v-tabs>

        <!-- Tab Content -->
        <v-window v-model="tab">
          <!-- Basic Info Tab -->
        <v-window-item :value="0">
          <v-form class="mt-4" style="font-family: 'Syne', sans-serif;">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="basicInfo.gender"
                  :items="['Male', 'Female']"
                  label="Gender"
                  :rules="[required]"
                  color="success"
                  class="mt-2"
                  prepend-inner-icon="mdi-gender-male-female"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="basicInfo.age"
                  label="Age"
                  :rules="[required]"
                  type="number"
                  color="success"
                  class="mt-2"
                  prepend-inner-icon="mdi-cake-variant"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="basicInfo.height"
                  label="Height (cm)"
                  :rules="[required]"
                  type="number"
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-ruler"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="basicInfo.weight"
                  label="Weight (kg)"
                  :rules="[required]"
                  type="number"
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-scale-bathroom"
                />
              </v-col>

              <v-col cols="12">
                <v-select
                  v-model="basicInfo.diabetesType"
                  :items="['Type 1', 'Type 2']"
                  :rules="[required]"
                  label="Diabetes Type"
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-alpha-d-box"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="basicInfo.allergies"
                  label="Allergies"
                  :rules="[required]"
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-alert-octagon"
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="basicInfo.religiousDiet"
                  label="Religious Diet (if any)"
                  :rules="[required]"
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-food"  
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="basicInfo.budget"
                  label="Budget"
                  :rules="[required]"
                  type="number"
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-currency-php"  
                />
              </v-col>

            </v-row>

            <!-- NEXT BUTTON -->
            <div class="d-flex justify-end">
              <v-btn
                color="#5D8736"
                class="mt-4 text-white"
                style="font-family: 'Syne', sans-serif; width: 200px;"
                @click="tab = 1"
                append-icon="mdi-arrow-right"
              >
                Next
              </v-btn>
            </div>
          </v-form>
        </v-window-item>

        <!-- Lab Result Tab -->
        <v-window-item :value="1">
          <v-form class="mt-4" style="font-family: 'Syne', sans-serif;">
            <v-row dense>
              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="labResults.fbs"
                  label="Fasting Blood Sugar [mg/dL]"
                  :rules="[required]"
                  type="number"
                  color="success"
                  prepend-inner-icon="mdi-water-percent"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="labResults.ppbs"
                  label="Postprandial Blood Sugar [mg/dL]"
                  :rules="[required]"
                  type="number"
                  color="success"
                  prepend-inner-icon="mdi-food-variant"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="labResults.hba1c"
                  label="HbA1c [%]"
                  :rules="[required]"
                  type="number"
                  color="success"
                  prepend-inner-icon="mdi-percent"
                />
              </v-col>

              <v-col cols="12" sm="6">
                <v-text-field
                  v-model="labResults.glucoseTolerance"
                  label="Glucose Tolerance"
                  :rules="[required]"
                  type="number"
                  color="success"
                  prepend-inner-icon="mdi-test-tube"
                />
              </v-col>
            </v-row>

            <!-- Cancel and Submit Buttons Centered -->
            <div class="d-flex justify-center mt-6" style="gap: 16px;">
              <!-- Cancel Button -->
              <v-btn
                color="#A9C46C"
                class="text-black"
                style="font-family: 'Syne', sans-serif; width: 140px;"
                @click="cancelForm"
                prepend-icon="mdi-close-circle"
              >
                Cancel
              </v-btn>

              <!-- Submit Button -->
              <v-btn
                color="#5D8736"
                class="text-white"
                style="font-family: 'Syne', sans-serif; width: 140px;"
                @click="submitForm"
                prepend-icon="mdi-check"
              >
                Submit
              </v-btn>
            </div>
          </v-form>
        </v-window-item>
        </v-window>
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
    </v-main>
  </v-app>
</template>

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
