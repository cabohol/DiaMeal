<script setup>
import { supabase } from '@/utils/supabase';
import { requiredValidator, emailValidator, passwordValidator, confirmedValidator } from '@/utils/validator';
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AlertNotification from '@/components/AlertNotification.vue';

const router = useRouter();

const formDataDefault = {
  firstName: '',
  lastName: '',
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

const formData = ref({ ...formDataDefault });
const formAction = ref({ ...formActionDefault });
const isPasswordVisible = ref(false);
const refVForm = ref();

// Password confirmation validator
const confirmPasswordValidator = (value) =>
  value === formData.value.password || 'Passwords do not match';

const onFormSubmit = () => {
  if (refVForm.value?.validate()) {
    onSubmit();
  }
};

const onSubmit = async () => {
  formAction.value = { ...formActionDefault };
  formAction.value.formProcess = true;

  const { email, password, firstName, lastName, contact, address } = formData.value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        firstName,
        lastName,
        contact,
        address,
        role: 'customer', // you can change the role based on your logic
      },
    },
  });

  if (error) {
    console.error(error);
    formAction.value.formErrorMessage = error.message;
    formAction.value.formStatus = error.status;
  } else {
    formAction.value.formSuccessMessage = 'Successfully registered! Please check your email to confirm your account.';
    // Optionally redirect to login
    setTimeout(() => {
      router.push('/login');
    }, 2000);
  }

  formAction.value.formProcess = false;
};
</script>
<template>
  <v-app>
    <v-main>
      <v-container-fluid
        class="d-flex flex-column align-center justify-center text-center px-4"
        style="
          min-height: 100vh;
          background-color: #A9C46C;
          position: relative;
          overflow: hidden;
        "
      >
      <br>
      <br>
        <v-form
          ref="refVForm"
          class="w-100"
          style="max-width: 500px; z-index: 1;"
          @submit.prevent="onFormSubmit"
        >
          <!-- First Name -->
          <v-text-field
            v-model="formData.firstName"
            label="First Name"
            :rules="[requiredValidator]"
            placeholder="Enter your first name"
            prepend-inner-icon="mdi-account"
            variant="outlined"
            density="comfortable"
            color="green-darken-2"
            class="mb-4"
          />

          <!-- Last Name -->
          <v-text-field
            v-model="formData.lastName"
            label="Last Name"
            :rules="[requiredValidator]"
            placeholder="Enter your last name"
            prepend-inner-icon="mdi-account"
            variant="outlined"
            density="comfortable"
            color="green-darken-2"
            class="mb-4"
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
            class="mb-4"
          />

          <!-- Contact Number -->
          <v-text-field
            v-model="formData.contact"
            label="Contact Number"
            :rules="[requiredValidator]"
            type="tel"
            placeholder="09XXXXXXXXX"
            prepend-inner-icon="mdi-phone"
            variant="outlined"
            density="comfortable"
            color="green-darken-2"
            class="mb-4"
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
            class="mb-4"
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
        class="mb-4"
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
                class="mb-6"
                />

          <!-- Alert Notifications -->
          <AlertNotification
            v-if="formAction.formErrorMessage"
            type="error"
            :message="formAction.formErrorMessage"
            class="mb-4"
          />
          <AlertNotification
            v-if="formAction.formSuccessMessage"
            type="success"
            :message="formAction.formSuccessMessage"
            class="mb-4"
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
          >
            <v-icon start>mdi-account-check</v-icon>
            Register
          </v-btn>

          <!-- Redirect to Login -->
          <div class="text-caption">
            Already have an account?
            <span
              class="text-green-darken-4 text-decoration-underline"
              style="cursor: pointer"
              @click="$router.push('/login')"
            >
              Log in
            </span>
          </div>
        </v-form>
        <br>
        <br>
      </v-container-fluid>
    </v-main>
  </v-app>
</template>

