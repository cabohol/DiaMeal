<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/utils/supabase';

const router = useRouter();
const tab = ref(0);
const currentUser = ref(null); // Will store the authenticated user

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
                    color="success"
                    class="mt-2"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="basicInfo.age"
                    label="Age"
                    type="number"
                    color="success"
                    class="mt-2"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="basicInfo.height"
                    label="Height (cm)"
                    type="number"
                    color="success"
                    class="mt-n2"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="basicInfo.weight"
                    label="Weight (kg)"
                    type="number"
                    color="success"
                    class="mt-n2"
                  />
                </v-col>
                <v-col cols="12">
                  <v-select
                    v-model="basicInfo.diabetesType"
                    :items="['Type 1', 'Type 2']"
                    label="Diabetes Type"
                    color="success"
                    class="mt-n2"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="basicInfo.allergies"
                    label="Allergies"
                    color="success"
                    class="mt-n2"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="basicInfo.religiousDiet"
                    label="Religious Diet (if any)"
                    color="success"
                    class="mt-n2"
                  />
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    v-model="basicInfo.budget"
                    label="Budget (₱)"
                    type="number"
                    color="success"
                    class="mt-n2"
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
                type="number"
                color="success"
                />
            </v-col>

            <v-col cols="12" sm="6">
                <v-text-field
                v-model="labResults.ppbs"
                label="Postprandial Blood Sugar [mg/dL]"
                type="number"
                color="success"
                />
            </v-col>

            <v-col cols="12" sm="6">
                <v-text-field
                v-model="labResults.hba1c"
                label="HbA1c [%]"
                type="number"
                color="success"
                />
            </v-col>

            <v-col cols="12" sm="6">
                <v-text-field
                v-model="labResults.glucoseTolerance"
                label="Glucose Tolerance"
                type="number"
                color="success"
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
                append-icon="mdi-close-circle"
            >
                Cancel
            </v-btn>

            <!-- Submit Button -->
            <v-btn
                color="#5D8736"
                class="text-white"
                style="font-family: 'Syne', sans-serif; width: 140px;"
                @click="submitForm"
                append-icon="mdi-check"
            >
                Submit
            </v-btn>
            </div>
        </v-form>
        </v-window-item>

        </v-window>
      </v-container>

      <!-- Bottom Navigation -->
      <v-bottom-navigation grow app fixed style="background-color: #5B913B;">
        <v-btn @click="$router.push('/home')" class="d-flex flex-column align-center">
          <v-icon style="color: white;">mdi-home</v-icon>
          <span class="text-white mt-1" style="font-family: 'Syne', sans-serif; font-size: 12px;">Home</span>
        </v-btn>

        <v-btn @click="$router.push('/meal-plan')" class="d-flex flex-column align-center">
          <v-icon style="color: white;">mdi-heart-pulse</v-icon>
          <span class="text-white mt-1" style="font-family: 'Syne', sans-serif; font-size: 12px;">Meal Plan</span>
        </v-btn>

        <v-btn @click="$router.push('/profile')" class="d-flex flex-column align-center">
          <v-icon style="color: white;">mdi-account</v-icon>
          <span class="text-white mt-1" style="font-family: 'Syne', sans-serif; font-size: 12px;">Profile</span>
        </v-btn>

        <v-btn @click="$router.push('/progress')" class="d-flex flex-column align-center">
          <v-icon style="color: white;">mdi-chart-line</v-icon>
          <span class="text-white mt-1" style="font-family: 'Syne', sans-serif; font-size: 12px;">Progress</span>
        </v-btn>
      </v-bottom-navigation>
    </v-main>
  </v-app>
</template>
