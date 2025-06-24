<script setup>
import { supabase } from '@/utils/supabase';
import { requiredValidator, emailValidator } from '@/utils/validator';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertNotification from '@/components/AlertNotification.vue';

const router = useRouter();

const formDataDefault = {
  email: '',
  password: '',
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

const onFormSubmit = () => {
  if (refVForm.value?.validate()) {
    onSubmit();
  }
};

const onSubmit = async () => {
  formAction.value = { ...formActionDefault };
  formAction.value.formProcess = true;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.value.email,
    password: formData.value.password,
  });

  if (error) {
    console.error(error);
    formAction.value.formErrorMessage = error.message;
    formAction.value.formStatus = error.status;
  } else if (data?.user) {
    formAction.value.formSuccessMessage = 'Successfully Logged In!';
    const userRole = data.user.user_metadata.role;
  }

  formAction.value.formProcess = false;
};
</script>

<template>
  <v-app>
    <v-main>
      <v
        class="d-flex flex-column align-center justify-center text-center px-4"
        style="
          min-height: 100vh;
          background-color: #A9C46C;
          position: relative;
          overflow: hidden;
        "
      >
        <!-- Top Image -->
        <v-img
          src="/src/assets/diameal-header.jpg"
          cover
          height="40%"
          class="position-absolute top-0 left-0 w-100"
          style="z-index: 0; opacity: 0.70"
        />

        <!-- Logo -->
        <v-img
          src="/src/assets/logo1.png"
          width="150"
          style="z-index: 1; margin-top: 250px;"
        />
          
          <!-- Slogan -->
          <p
            style="
              font-family: 'Syne', sans-serif;
              font-weight: 500;
              font-size: 1.2rem;
              margin-bottom: 50px;
              color: black;
              display: inline-block;
            "
          >
            "For diabetic meals, choose DiaMeal!<br />
            Plan your meals with DiaMeal, <br />
            Track your meals with DiaMeal"
          </p>



        <!-- Form -->
        <v-form
          ref="refVForm"
          class="w-100"
          style="max-width: 400px; z-index: 1;"
          @submit.prevent="onFormSubmit"
        >
          <!-- Email -->
          <v-text-field
            v-model="formData.email"
            label="Email"
            :rules="[requiredValidator, emailValidator]"
            type="email"
            placeholder="Email"
            style=" font-family: 'Syne', sans-serif;"
            prepend-inner-icon="mdi-email-outline"
            variant="outlined"
            density="comfortable"
            color="green-darken-2"
            class="mb-4"
          />

          <!-- Password -->
          <v-text-field
            v-model="formData.password"
            label="Password"
            :rules="[requiredValidator]"
            :type="isPasswordVisible ? 'text' : 'password'"
            placeholder="Password"
            style=" font-family: 'Syne', sans-serif;"
            prepend-inner-icon="mdi-lock-outline"
            :append-inner-icon="isPasswordVisible ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="isPasswordVisible = !isPasswordVisible"
            variant="outlined"
            density="comfortable"
            color="green-darken-2"
            class="mb-6"
          />

          <!-- Alert Messages -->
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

          <!-- Login Button -->
          <v-btn
            color="green-darken-2"
            class="text-white mb-4"
            rounded
            block
            size="large"
            type="submit"
            :loading="formAction.formProcess"
             style=" font-family: 'Syne', sans-serif;"
          >
            <v-icon start>mdi-login</v-icon>
            Log in
          </v-btn>

          <!-- Sign up link -->
          <div class="text-caption" style=" font-family: 'Syne', sans-serif;">
            Don’t have an account?
            <span
              class="text-green-darken-4 text-decoration-underline"
              style="cursor: pointer; font-weight: bold;"
              @click="$router.push('/register')"
            >
              Sign up
            </span>
          </div>
        </v-form>
        <br>
        <br>
      </v>
    </v-main>
  </v-app>
</template>
