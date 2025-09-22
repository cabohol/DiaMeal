<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/utils/supabase';
import Mp1 from "@/assets/mp1.jpg";


const router = useRouter();
const tab = ref(0);
const currentUser = ref(null);
const required = v => !!v || 'This field is required';
const infoDialog = ref(false);  // for FBS
const ppbsDialog = ref(false);  // for PPBS
const hba1cDialog = ref(false);
const glucoseToleranceDialog = ref(false);


const basicInfo = ref({
  gender: '',
  age: '',
  height: '',
  weight: '',
  diabetesType: '',
  allergies: [],     
  otherAllergy: '',     
  religiousDiet: [],   
  otherReligiousDiet: '',
  budget: ''
});

const labResults = ref({
  fbs: '',
  ppbs: '',
  hba1c: '',
  glucoseTolerance: ''
});

const mealPlanText = ref(''); // Holds the streamed meal plan

// Add computed property to check if basic info is complete
const isBasicInfoComplete = computed(() => {
  return basicInfo.value.gender && 
         basicInfo.value.age && 
         basicInfo.value.height && 
         basicInfo.value.weight && 
         basicInfo.value.diabetesType && 
         basicInfo.value.budget &&
         // If "Other" is selected for allergies, check if otherAllergy is filled
         (!basicInfo.value.allergies.includes('Other') || basicInfo.value.otherAllergy) &&
         // If "Other" is selected for religious diet, check if otherReligiousDiet is filled
         (!basicInfo.value.religiousDiet.includes('Other') || basicInfo.value.otherReligiousDiet);
});

// Add method to handle next button click
const nextToLabResults = () => {
  if (isBasicInfoComplete.value) {
    tab.value = 1;
  }
};

// On mount → get logged-in user
onMounted(async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    router.push('/login');
    return;
  }

  const lastDate = await getLastSubmissionDate(user.email);
  if (lastDate && !hasSevenDaysPassed(lastDate)) {
    router.push('/weekly-meal'); // block access
  }
});

function cancelForm() {
  labResults.value = { fbs: '', ppbs: '', hba1c: '', glucoseTolerance: '' };
  basicInfo.value = { gender: '', age: '', height: '', weight: '', diabetesType: '', allergies: '', religiousDiet: '', budget: '' };
  mealPlanText.value = '';
}

// Helper – Get last submission date
async function getLastSubmissionDate(email) {
  const { data, error } = await supabase
    .from('users')
    .select('last_submission_date')
    .eq('email', email);

  if (error) {
    console.error('Error fetching last submission date:', error);
    return null;
  }

  if (!data || data.length === 0) return null;

  const dates = data
    .map(row => row.last_submission_date)
    .filter(date => date !== null)
    .map(date => new Date(date));

  if (dates.length === 0) return null;

  return new Date(Math.max(...dates)); // latest date
}

// Helper – Check if 7 days passed
function hasSevenDaysPassed(lastDate) {
  if (!lastDate) return true; 
  const now = new Date();
  const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
  return diffDays >= 7;
}

// Navigation check for Meal Plan button
async function checkMealPlanAccess() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    router.push('/login');
    return;
  }

  const lastDate = await getLastSubmissionDate(user.email);

  if (!lastDate) {
    router.push('/meal-plan');
  } else if (hasSevenDaysPassed(lastDate)) {
    router.push('/meal-plan');
  } else {
    router.push('/weekly-meal');
  }
}

// Form submission
async function submitForm() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('User not authenticated');

    const fullName = user.user_metadata?.full_name || '';
    const email = user.email || '';

    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, last_submission_date')
      .eq('email', email)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    if (existingUser?.last_submission_date) {
      const lastDate = new Date(existingUser.last_submission_date);
      if (!hasSevenDaysPassed(lastDate)) {
      alert('You can only submit once a week. Please try again later.');
      return;
    }
    }

    let userId;
    if (existingUser) {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          gender: basicInfo.value.gender,
          age: parseInt(basicInfo.value.age),
          height_cm: parseFloat(basicInfo.value.height),
          weight_kg: parseFloat(basicInfo.value.weight),
          diabetes_type: basicInfo.value.diabetesType,
          budget: parseFloat(basicInfo.value.budget),
          last_submission_date: new Date(),
        })
        .eq('id', existingUser.id)
        .select()
        .single();
      if (updateError) throw updateError;
      userId = updatedUser.id;
    } else {
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
          last_submission_date: new Date(),
          created_at: new Date()
        })
        .select()
        .single();
      if (userError) throw userError;
      userId = userData.id;
    }

    // Insert allergies if provided
    if (basicInfo.value.allergies) {
      await supabase.from('allergies').insert({
        allergy: basicInfo.value.allergies,
        user_id: userId,
        created_at: new Date()
      });
    }

    // Insert religious diets if provided
    if (basicInfo.value.religiousDiet) {
      await supabase.from('religious_diets').insert({
        diet_type: basicInfo.value.religiousDiet,
        user_id: userId,
        created_at: new Date()
      });
    }

    // Insert lab results
    await supabase.from('lab_results').insert({
      fasting_blood_sugar: parseFloat(labResults.value.fbs),
      postprandial_blood_sugar: parseFloat(labResults.value.ppbs),
      hba1c: parseFloat(labResults.value.hba1c),
      glucose_tolerance: labResults.value.glucoseTolerance,
      user_id: userId,
      created_at: new Date()
    });

    console.log('User and lab results saved successfully!');
    // Pass userId to weekly-meal for fetching data
    router.push({ path: '/weekly-meal', query: { userId } });

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
            :src="Mp1"
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

              <!-- Gender -->
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

              <!-- Age -->
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

              <!-- Height -->
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

              <!-- Weight -->
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

              <!-- Diabetes Type -->
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

              <!-- Allergies -->
              <v-col cols="12">
                <v-select
                  v-model="basicInfo.allergies"
                  :items="[
                    'None',
                    'Peanuts', 
                    'Shrimp',
                    'Crab',
                    'Lobster', 
                    'Eggs',
                    'Other']"
                  label="Allergies (select all that apply)"
                  multiple
                  chips
                  clearable
                  deletable-chips
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-alert-octagon"
                />

                <!-- Show custom allergy input if 'Other' is selected -->
                <v-text-field
                  v-if="basicInfo.allergies.includes('Other')"
                  v-model="basicInfo.otherAllergy"
                  label="Please specify your other allergies"
                  outlined
                  dense
                  clearable
                  prepend-inner-icon="mdi-pencil"
                  color="success"
                  class="mt-2"
                />
              </v-col>

              <!-- Religious Diets -->
              <v-col cols="12">
                <v-select
                  v-model="basicInfo.religiousDiet"
                  :items="[
                    'None',
                    'Catholic (No meat on Fridays/Lent)', 
                    'Islam (Halal)', 
                    'Vegetarian', 
                    'Vegan',
                    'Other']"
                  label="Religious Diet (if any)"
                  multiple
                  chips
                  clearable
                  deletable-chips
                  color="success"
                  class="mt-n2"
                  prepend-inner-icon="mdi-food"
                />

                <!-- Show custom religious diet input if 'Other' is selected -->
                <v-text-field
                  v-if="basicInfo.religiousDiet.includes('Other')"
                  v-model="basicInfo.otherReligiousDiet"
                  label="Please specify your other religious diet"
                  outlined
                  dense
                  clearable
                  prepend-inner-icon="mdi-pencil"
                  color="success"
                  class="mt-2"
                />
              </v-col>

              <!-- Budget -->
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
              <v-btn color="#5D8736" class="mt-4 text-white" style="font-family: 'Syne', sans-serif; 
                     width: 200px;" @click="tab = 1" append-icon="mdi-arrow-right"> Next
              </v-btn>
            </div>
          </v-form>
        </v-window-item>

        <!-- Lab Result Tab -->
        <v-window-item :value="1">
          <v-form class="mt-4" style="font-family: 'Syne', sans-serif;">
            <v-row dense>

            <!-- Fasting Blood Sugar -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="labResults.fbs"
                label="Fasting Blood Sugar [mg/dL]"
                :rules="[required]"
                type="number"
                color="success"
                prepend-inner-icon="mdi-water-percent"
                placeholder="e.g., 95"
                hint="Enter your fasting blood sugar in mg/dL"
                persistent-hint
              >
                <!-- Info Icon inside the text field -->
                <template v-slot:prepend>
                  <v-icon class="ml-2" color="#5D8736"
                          @click="infoDialog = true" style="cursor: pointer"> mdi-information
                  </v-icon>
                </template>
              </v-text-field>
            </v-col>

            <!-- Dialog for Info -->
            <v-dialog v-model="infoDialog"  color="#5D8736" max-width="400px" style="font-family: 'Syne', sans-serif;">
              <v-card>
                <v-card-title class="headline" style="background-color:#5D8736; color:white;">Fasting Blood Sugar Ranges</v-card-title>
                <v-card-text>
                  <ul>
                    <li><strong>Normal (no diabetes):</strong> 70–99 mg/dL (3.9–5.5 mmol/L)</li>
                    <li><strong>Prediabetes:</strong> 100–125 mg/dL (5.6–6.9 mmol/L)</li>
                    <li><strong>Diabetes (Type 1 or Type 2):</strong> ≥126 mg/dL (7.0 mmol/L or higher) on two separate tests</li>
                  </ul>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn  color="#5D8736" dark text @click="infoDialog = false">Close</v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>

            <!-- PBS -->
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="labResults.ppbs"
                label="Postprandial Blood Sugar [mg/dL]"
                :rules="[required]"
                type="number"
                color="success"
                prepend-inner-icon="mdi-food-variant"
                placeholder="e.g., 120"
                hint="Enter your PPBS in mg/dL"
                persistent-hint
              >
                <!-- Info Icon inside the text field -->
                <template v-slot:prepend>
                  <v-icon class="ml-2" color="#5D8736"
                          @click="ppbsDialog = true" style="cursor: pointer"> mdi-information
                  </v-icon>
                </template>
              </v-text-field>
            </v-col>

            <!-- Dialog for PPBS Info -->
            <v-dialog v-model="ppbsDialog" max-width="400px" style="font-family: 'Syne', sans-serif;">
              <v-card>
                <v-card-title class="headline" style="background-color:#5D8736; color:white;">
                  Postprandial Blood Sugar Ranges
                </v-card-title>
                <v-card-text>
                  <ul>
                    <li><strong>Normal (no diabetes):</strong> Less than 140 mg/dL (7.8 mmol/L)</li>
                    <li><strong>Prediabetes:</strong> 140–199 mg/dL (7.8–11.0 mmol/L)</li>
                    <li><strong>Diabetes (Type 1 or Type 2):</strong> 200 mg/dL (11.1 mmol/L) or higher</li>
                  </ul>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn color="#5D8736" text @click="ppbsDialog = false">Close</v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>

            <!-- HBA1C -->
            <v-col cols="12" sm="6">
                <v-text-field
                  v-model="labResults.hba1c"
                  label="HbA1c [%]"
                  :rules="[required]"
                  type="number"
                  color="success"
                  prepend-inner-icon="mdi-percent"
                  placeholder="e.g., 5.6"
                  hint="Enter your HbA1c percentage"
                  persistent-hint
                >
                  <!-- Info Icon inside the text field -->
                  <template v-slot:prepend>
                    <v-icon class="ml-2" color="#5D8736"
                            @click="hba1cDialog = true" style="cursor: pointer"> mdi-information
                    </v-icon>
                  </template>
                </v-text-field>
            </v-col>

            <!-- Dialog for HbA1c Info -->
            <v-dialog v-model="hba1cDialog" max-width="400px" style="font-family: 'Syne', sans-serif;">
                <v-card>
                  <v-card-title class="headline" style="background-color:#5D8736; color:white;">
                    HbA1c Ranges
                  </v-card-title>
                  <v-card-text>
                    <ul>
                      <li><strong>Normal (no diabetes):</strong> Below 5.7%</li>
                      <li><strong>Prediabetes:</strong> 5.7% – 6.4%</li>
                      <li><strong>Diabetes (Type 1 or Type 2):</strong> 6.5% or higher</li>
                      <li><strong>Target for most people with diabetes:</strong> Below 7% (may vary based on doctor’s advice)</li>
                    </ul>
                  </v-card-text>
                  <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn color="#5D8736" text @click="hba1cDialog = false">Close</v-btn>
                  </v-card-actions>
                </v-card>
            </v-dialog>

            <!-- Glucose Tolerance -->
            <v-col cols="12" sm="6">
                <v-text-field
                  v-model="labResults.glucoseTolerance"
                  label="Glucose Tolerance [mg/dL]"
                  :rules="[required]"
                  type="number"
                  color="success"
                  prepend-inner-icon="mdi-test-tube"
                  placeholder="e.g., 135"
                  hint="Enter your 2-hour OGTT result"
                  persistent-hint
                >
                  <!-- Info Icon inside the text field -->
                  <template v-slot:prepend>
                    <v-icon class="ml-2" color="#5D8736"
                            @click="glucoseToleranceDialog = true" style="cursor: pointer"> mdi-information
                    </v-icon>
                  </template>
                </v-text-field>
            </v-col>

            <!-- Dialog for Glucose Tolerance Info -->
            <v-dialog v-model="glucoseToleranceDialog" max-width="400px" style="font-family: 'Syne', sans-serif;">
              <v-card>
                <v-card-title class="headline" style="background-color:#5D8736; color:white; ">
                  Glucose Tolerance Test Ranges
                </v-card-title>
                <v-card-text>
                  <ul>
                    <li><strong>Normal:</strong> Less than 140 mg/dL (7.8 mmol/L)</li>
                    <li><strong>Prediabetes (Impaired Tolerance):</strong> 140–199 mg/dL (7.8–11.0 mmol/L)</li>
                    <li><strong>Diabetes:</strong> 200 mg/dL (11.1 mmol/L) or higher</li>
                  </ul>
                </v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn color="#5D8736" text @click="glucoseToleranceDialog = false">Close</v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>

            </v-row>

            <!-- Cancel and Submit Buttons Centered -->
            <div class="d-flex justify-center mt-6" style="gap: 16px;">
              <!-- Cancel Button -->
              <v-btn color="#A9C46C" class="text-black" style="font-family: 'Syne', sans-serif; width: 140px;"
                @click="cancelForm" prepend-icon="mdi-close-circle">Cancel
              </v-btn>

              <!-- Submit Button -->
              <v-btn color="#5D8736" class="text-white" style="font-family: 'Syne', sans-serif; width: 140px;"
                @click="submitForm"prepend-icon="mdi-check">Submit
              </v-btn>
            </div>
            <!-- Live Meal Plan Output -->
          </v-form>
        </v-window-item>
        </v-window>
      </v-container>

        <!-- Bottom Navigation -->
        <v-bottom-navigation grow class="mt-8 nav-bar" style="background-color: #5B913B;">
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

          <v-btn @click="$router.push('/myprogress')" class="nav-tab">
            <v-icon>mdi-chart-line</v-icon><span>Progress</span>
          </v-btn>
        </v-bottom-navigation>
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