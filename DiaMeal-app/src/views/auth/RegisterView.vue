<script setup>
import { supabase } from '@/utils/supabase';
import { requiredValidator, emailValidator, passwordValidator, confirmedValidator } from '@/utils/validator';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertNotification from '@/components/AlertNotification.vue';
import Logo1 from "@/assets/logo1.png";


const router = useRouter();

const formDataDefault = {
  fullName: '',
  email: '',
  contact: '',
  address: '',
  password: '',
  confirmPassword: '',
};

const formActionDefault = {
  formProcess: false,
  formErrorMessage: '',
  formSuccessMessage: '',
  formStatus: 200,
};

const contactValidator = value => {
  return /^09\d{9}$/.test(value) || 'Enter a valid PH number (11 digits)';
};

const onlyNumbers = (e) => {
  if (!/[0-9]/.test(e.key)) {
    e.preventDefault();
  }
};

const formData = ref({ ...formDataDefault });
const formAction = ref({ ...formActionDefault });
const isPasswordVisible = ref(false);
const refVForm = ref();

const onFormSubmit = () => {
  if (refVForm.value?.validate()) {
    onSubmit();
  }
};

const onSubmit = async () => {
  formAction.value = { ...formActionDefault };
  formAction.value.formProcess = true;

  const { email, password, fullName, contact, address } = formData.value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        contact,
        address,
        role: 'customer',
      },
    },
  });

  if (error) {
    console.error(error);
    formAction.value.formErrorMessage = error.message;
    formAction.value.formStatus = error.status;
  } else {
    // Updated message - no email confirmation needed
    formAction.value.formSuccessMessage = 'Successfully registered! Redirecting to login...';
    
    await supabase.auth.signOut();
    
    setTimeout(() => {
      router.push('/login');
    }, 1500);
  }

  formAction.value.formProcess = false;
};



</script>

<template>
  <v-app>
    <v-main>
      <v-container-fluid
        class="d-flex flex-column align-center justify-center text-center px-4"
        style="min-height: 100vh; background-color: #A9C46C; position: relative; overflow: hidden;"
      >
        <!-- Logo -->
        <v-img :src="Logo1" width="100" style="z-index: 1; margin-top: 15px;" />

        <!-- Slogan -->
        <p
          style="
            font-family: 'Syne', sans-serif;
            font-weight: 500;
            font-size: 1.2rem;
            margin-top: 5px;
            color: black;
            display: inline-block;
          "
        >
          Join DiaMeal – Where Smart Planning Meets Healthy Living.
        </p>
        <br />

        <v-row class="w-100" justify="center">
          <v-col cols="12" sm="10" md="8" lg="6" xl="4">
            <v-form ref="refVForm" style="z-index: 1;" @submit.prevent="onFormSubmit">
              <!-- Full Name -->
              <v-text-field
                v-model="formData.fullName"
                label="Full Name"
                :rules="[requiredValidator]"
                placeholder="Enter your full name"
                prepend-inner-icon="mdi-account"
                variant="outlined"
                density="comfortable"
                color="green-darken-2"
                style="font-family: 'Syne', sans-serif;"
                class="mb-2"
              />

              <!-- Email -->
              <v-text-field
                v-model="formData.email"
                label="Email"
                :rules="[requiredValidator, emailValidator]"
                type="email"
                placeholder="Email"
                prepend-inner-icon="mdi-email-outline"
                variant="outlined"
                density="comfortable"
                color="green-darken-2"
                style="font-family: 'Syne', sans-serif;"
                class="mb-2"
              />

              <!-- Contact Number -->
              <v-text-field
                v-model="formData.contact"
                label="Contact Number"
                :rules="[requiredValidator, contactValidator]"
                type="tel"
                placeholder="09XXXXXXXXX"
                prepend-inner-icon="mdi-phone"
                variant="outlined"
                density="comfortable"
                color="green-darken-2"
                @keypress="onlyNumbers"
                maxlength="11"
                style="font-family: 'Syne', sans-serif;"
                class="mb-2"
              />


              <!-- Address -->
              <v-text-field
                v-model="formData.address"
                label="Address"
                :rules="[requiredValidator]"
                placeholder="Enter your address"
                prepend-inner-icon="mdi-map-marker"
                variant="outlined"
                density="comfortable"
                color="green-darken-2"
                style="font-family: 'Syne', sans-serif;"
                class="mb-2"
              />

              <!-- Password -->
              <v-text-field
                v-model="formData.password"
                label="Password"
                :rules="[requiredValidator, passwordValidator]"
                :type="isPasswordVisible ? 'text' : 'password'"
                placeholder="Password"
                prepend-inner-icon="mdi-lock-outline"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                variant="outlined"
                density="comfortable"
                color="green-darken-2"
                style="font-family: 'Syne', sans-serif;"
                class="mb-2"
              />

              <!-- Confirm Password -->
              <v-text-field
                v-model="formData.confirmPassword"
                label="Confirm Password"
                :rules="[requiredValidator, confirmedValidator(formData.confirmPassword, formData.password)]"
                :type="isPasswordVisible ? 'text' : 'password'"
                placeholder="Confirm Password"
                prepend-inner-icon="mdi-lock-check"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                variant="outlined"
                density="comfortable"
                color="green-darken-2"
                style="font-family: 'Syne', sans-serif;"
                class="mb-4"
              />

              <!-- AlertNotification Component -->
              <AlertNotification
                :formSuccessMessage="formAction.formSuccessMessage"
                :formErrorMessage="formAction.formErrorMessage"
              />

              <!-- Submit Button -->
              <v-btn
                color="green-darken-2"
                class="text-white mb-4"
                rounded
                block
                size="large"
                type="submit"
                :loading="formAction.formProcess"
                style="font-family: 'Syne', sans-serif;"
              >
                <v-icon start>mdi-account-check</v-icon>
                Register
              </v-btn>

              <!-- Redirect to Login -->
              <div style="font-family: 'Syne', sans-serif; font-size: 15px;">
                Already have an account?
                <span
                  class="text-green-darken-4 text-decoration-underline"
                  style="cursor: pointer; font-family: 'Syne', sans-serif; font-size: 15px; font-weight: bold;"
                  @click="$router.push('/login')"
                >
                  Log in
                </span>
              </div>
            </v-form>
          </v-col>
        </v-row>
      </v-container-fluid>
    </v-main>
  </v-app>
</template>
