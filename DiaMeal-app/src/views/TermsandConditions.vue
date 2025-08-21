<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const agree = ref(false)
const router = useRouter()

function onContinue() {
  if (agree.value) {
    router.push('/login')
  }
}
</script>

<template>
  <v-app>
    <v-main>
      <v-container fluid
        class="fill-height d-flex justify-center align-center"
        style="background-color: #A9C46C;"
      >
        <v-card width="550" height="700" elevation="4" rounded="xl" color="#E1F3C2">
            <v-card-title class="d-flex align-center justify-center" style="font-size: 22px;">
              <div class="d-flex align-center w-100">
                <div class="flex-grow-1" style="height: 1px; background-color: black;"></div>
                <span class="mx-4 font-weight-bold text-black" style="font-family: 'Syne', sans-serif; ">Terms and Conditions</span>
                <div class="flex-grow-1" style="height: 1px; background-color: black;"></div>
              </div>
            </v-card-title>

          <!-- Scrollable content -->
          <v-card-text
            class="text-black"
            style="max-height: 570px; overflow-y: auto; text-align: justify; font-size: 17px; margin-top: 10px;">

            <p style="font-family: 'Syne', sans-serif; ">
              Welcome to DiaMeal. By using this system,
              you agree to the collection of certain personal and health-related information such as
              lab results, food preferences, budget, food allergies, and religious or cultural dietary
              restrictions to provide personalized diabetic meal suggestions and improve system performance.
            </p>
            <p style="font-family: 'Syne', sans-serif; ">
              The DiaMeal system is committed to protecting your privacy and follows the Data Privacy Act of
              2012 (RA 10173). Sensitive information like your name, email, or contact number will not be
              stored or shared outside the system.
            </p>
            <p style="font-family: 'Syne', sans-serif; ">
              This system is meant to assist with meal planning and is not a substitute for medical advice.
              You are responsible for providing accurate information, and it is advised to consult your
              healthcare provider before making major dietary changes.
            </p>
            <p style="font-family: 'Syne', sans-serif; ">
              By proceeding, you confirm that you have read and understood these Terms and Conditions and
              that you consent to the collection and use of your data as described above.
            </p>

            <!-- Checkbox -->
           <v-checkbox
              v-model="agree"
              label="I have read and agree to the Terms and Condition"
              hide-details
              class="mt-4 custom-checkbox"
              color="green-darken-2"
              style="font-family: 'Syne', sans-serif;"/>
          </v-card-text>

            <v-card-actions class="justify-center px-4 pb-4">
              <v-btn
              variant="outlined"
              color="grey-darken-1"
              class="custom-cancel-btn rounded-pill px-6 me-2"
              size="large"
              elevation="2"
              @click="router.back()"
              style="font-family: 'Syne', sans-serif;"> Cancel
              </v-btn>

              <v-btn
              :disabled="!agree"
              color="green-darken-2"
              class="custom-continue-btn text-white rounded-pill px-8"
              size="large"
              elevation="4"
              @click="onContinue"
              style="font-family: 'Syne', sans-serif; "> Continue
              </v-btn>
            </v-card-actions>
        </v-card>
      </v-container>
    </v-main>
  </v-app>
</template>


<style scoped>
p {
  margin-bottom: 12px;
  font-family: 'Poppins', sans-serif;
  line-height: 1.6;
}

:deep(.custom-cancel-btn.v-btn:hover) {
  background-color: #757575 !important;
  color: white !important;
  transition: all 0.9s ease;
}

:deep(.custom-continue-btn.v-btn:hover) {
  background-color: #1b5e20 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.9s ease;
}
</style>

