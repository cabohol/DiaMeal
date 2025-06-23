<script setup>
import { supabase } from '@/utils/supabase';
import { requiredValidator, emailValidator } from '@/utils/validator';
import { ref } from 'vue'
import AlertNotification from '@/components/AlertNotification.vue';
import { useRouter } from 'vue-router';

const router = useRouter()

const formDataDefault = {
  email: '',
  password: '',
}

const formActionDefault = {
  formProcess: false,
  formErrorMessage: '',
  formSuccessMessage: '',
  formStatus: 200,
}

const formData = ref({ ...formDataDefault });
const formAction = ref({ ...formActionDefault });
const isPasswordVisible = ref(false);
const refVForm = ref();

const onFormSubmit = () => {
  // Validate the form
  if (refVForm.value?.validate()) {
    onSubmit();
  }
}




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
  } else if (data?.user) {  // Check if login succeeded
    formAction.value.formSuccessMessage = 'Successfully Logged In!';

    // Access the role directly from user metadata
    const userRole = data.user.user_metadata.role;

    // Redirect based on role
    if (userRole === 'admin') {
      router.replace('/dashboard');  // Route for Admins
    } else if (userRole === 'renter') {
      router.replace('/homepage');  // Route for Renters
    } else {
      formAction.value.formErrorMessage = 'User role not recognized.';
    }
  }

  // Reset form and stop processing
  refVForm.value?.reset();
  formAction.value.formProcess = false;
};


</script>


<template>
  <v-app>
    <v-main class="main-container">
      <v-container class="form-container">
        <v-row justify="center">
          <v-col cols="12" sm="10">
            <v-card class="custom-card elevation-5">
              <v-window v-model="step">
                <!-- Login Window -->
                <v-window-item :value="1">
                  <v-row>
                    <v-col cols="12" md="6" class="left-panel">
                      <br />
                      <br />
                      <br />
                      <v-card-text class="text-center">
                        <h4 class="form-title">Log in to LaptopLynx</h4>
                        <p class="form-description">Access your account and continue exploring our services.</p>
                        
                        <br>
                          <AlertNotification
                           :form-success-message="formAction.formSuccessMessage" 
                           :form-error-message="formAction.formErrorMessage"
                            >
                          </AlertNotification>
                           <br>
                        
                        <v-form ref="refVForm" @submit.prevent="onFormSubmit">
                          <v-text-field
                            v-model="formData.email"
                            hide-details="auto"
                            label="Email"
                            clearable
                            outlined
                            dense
                            class="custom-input mt-4"
                            prepend-inner-icon="mdi-email"
                            :rules="[requiredValidator, emailValidator]"
                          ></v-text-field>
                          <v-text-field
                            v-model="formData.password"
                            hint="Enter your password to access this website"
                            hide-details="auto"
                            label="Password"
                            clearable
                            outlined
                            dense
                            :type="isPasswordVisible ? 'text' : 'password'" 
                            class="custom-input"
                            prepend-inner-icon="mdi-lock"
                            :append-icon="isPasswordVisible ? 'mdi-eye' : 'mdi-eye-off'" 
                            @click:append="isPasswordVisible = !isPasswordVisible" 
                            :rules="[requiredValidator]"
                            append-icon-class="white--text" 
                          />
                        
                          <br>
                          <v-btn class="login-btn" type="submit" block
                          :disabled="formAction.formProcess"
                          :loading="formAction.formProcess">
                            <v-icon left>mdi-login</v-icon> Log In
                          </v-btn>
                        </v-form>
                      </v-card-text>
                    </v-col>
                    
                    <v-col cols="12" md="6" class="right-panel d-flex flex-column align-center">
                      <img src="/src/assets/diameal-header.jpg" alt="Your Logo" class="logo" style="margin: 10px 0; max-width: 100%;" />
                      
                      <br>
                      <br>
                      <br>
                      <v-btn class="signup-btn mt-4" to="/RegisterView">
                        New Here? <span class="no-underline">Create an Account</span>
                      </v-btn>
                    </v-col>


                  </v-row>
                </v-window-item>
              </v-window>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
      <!-- Footer -->
      <footer class="footer">
        <div class="footer-content">
          © 2024 LaptopLynx Inc. All Rights Reserved. Developed by LaptopLynx Team
        </div>
      </footer>

    </v-main>
  </v-app>
</template>




<style scoped>
.main-container {
  background: linear-gradient(135deg, #0B0C10, #1F2833, #45A29E, #66FCF1, #C5C6C7);
  background-size: 300% 300%; 
  animation: oceanGradient 6s ease infinite; 
  min-height: 100vh;
  padding: 40px 0;
}

@keyframes oceanGradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}


.form-container {
  margin-top: 30px;
}

/* .custom-card {
  border-radius: 16px;
  padding: 30px;
  background-color: #1F2833;
} */


.custom-card {
  border-radius: 16px;
  padding: 30px;
  background: linear-gradient(145deg, #1F2833, #212d3a);
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.2);
  transform: scale(0.98);
  transition: transform 0.3s ease, box-shadow 0.3s ease, background 0.5s ease;
  opacity: 0;
  animation: fadeInUp 0.8s ease forwards;
  position: relative;
  overflow: hidden;
}


.custom-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at top left, rgba(102, 252, 241, 0.1), transparent);
  pointer-events: none;
  transition: opacity 0.3s ease;
}


.custom-card:hover {
  transform: scale(1.02);
  box-shadow: 0px 12px 24px rgba(102, 252, 241, 0.4);
  background: linear-gradient(145deg, #1a222d, #1F2833);
}

.custom-card:hover::before {
  opacity: 0.4;
}

@keyframes fadeInUp {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.left-panel {
  padding: 40px;
}

.right-panel {
  background: linear-gradient(to bottom, #0B0C10, #1F2024);
  color: #C5C6C7;
  text-align: center;
  padding: 50px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* .form-title {
  font-family: 'Poppins', sans-serif;
  font-size: 26px;
  font-weight: bold;
  color: #66FCF1;
}

.form-description {
  font-family: 'Poppins', sans-serif;
  font-size: 16px;
  color: #C5C6C7;
} */

.form-title {
  font-family: 'Poppins', sans-serif;
  font-size: 28px;
  font-weight: 600;
  color: #66FCF1;
  letter-spacing: 1.2px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(102, 252, 241, 0.4);
}


.form-description {
  font-family: 'Poppins', sans-serif;
  font-size: 17px;
  color: #FFFFFF;
  margin-top: 10px;
  line-height: 1.8;
  padding-left: 10px;
  letter-spacing: 0.4px;
}

.custom-input {
  margin-top: 15px;
  color: #C5C6C7;
}
.login-btn, .signup-btn, .back-to-login {
  margin-top: 20px;
  background: linear-gradient(135deg, #66FCF1 0%, #45A29E 100%); 
  color: #0B0C10;
  text-transform: none;
  font-weight: bold;
  font-size: 16px;
  border-radius: 8px;
}

.login-btn:hover, .signup-btn:hover, .back-to-login:hover {
  background: linear-gradient(135deg, #45A29E 0%, #66FCF1 100%); 
}



.footer {
  color: #0B0C10; 
  text-align: center;
  padding: 20px;
  position: relative;
  bottom: 0;
  width: 100%;
}

.footer-content {
  font-size: 14px; 
}


.v-btn .v-icon {
  margin-right: 8px;
  font-size: 20px; 
  transition: transform 0.2s ease; 
}

.login-btn .v-icon:hover,
.signup-btn .v-icon:hover {
  transform: scale(1.1);
}



.logo {
  animation: floatLogo 3s ease-in-out infinite;
}

@keyframes floatLogo {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px); 
  }
}


.login-btn a {
  text-decoration: none;
  color: inherit; 
}

.no-underline {
  text-decoration: none;
}

.signup-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 20px; 
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; 
  font-size: 1rem;
}

@media (max-width: 768px) {
  .signup-btn {
    font-size: 0.7rem;
  }
}

@media (max-width: 480px) {
  .signup-btn {
    font-size: 0.8rem;
    padding: 8px 15px; 
  }
}

@media (max-width: 400px) {
  .signup-btn {
    font-size: 0.7rem;
    padding: 8px 15px;
  }
}



.back-to-login {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 20px; 
  white-space: nowrap; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  font-size: 1rem; 
}

@media (max-width: 768px) {
  .back-to-login {
    font-size: 0.7rem;
  }
}

@media (max-width: 480px) {
  .back-to-login {
    font-size: 0.8rem;
    padding: 8px 15px; 
  }
}

@media (max-width: 400px) {
  .back-to-login{
    font-size: 0.7rem; 
    padding: 8px 15px; 
  }
}


</style>