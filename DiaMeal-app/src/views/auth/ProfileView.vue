<script setup>
import { supabase } from '@/utils/supabase';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AlertNotification from '@/components/AlertNotification.vue';

const user = ref(null);
const profileImageUrl = ref('');
const uploading = ref(false);
const router = useRouter();
const logoutDialog = ref(false); 


// Alert messages
const formSuccessMessage = ref('');
const formErrorMessage = ref('');

const fetchUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error fetching user:', error);
    return;
  }

  user.value = data.user;

  if (user.value?.user_metadata?.avatar_url) {
    profileImageUrl.value = user.value.user_metadata.avatar_url;
  }
};

const handleImageChange = async (event) => {
  const file = event.target.files[0];
  if (!file || !user.value) return;

  uploading.value = true;

  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.value.id}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('diameal')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from('diameal')
      .getPublicUrl(filePath);

    profileImageUrl.value = publicData.publicUrl;

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicData.publicUrl },
    });

    if (updateError) throw updateError;

    showSuccess('Profile Image Updated Successfully!');
  } catch (err) {
    console.error('Error Updating Profile Image:', err);
    showError('Failed to Update Profile Image!');
  } finally {
    uploading.value = false;
  }
};

const handleLogout = async () => {
  try {
    await supabase.auth.signOut();
    showSuccess('Logged Out Successfully!');

    setTimeout(() => {
      router.push('/login');
    }, 1200);
  } catch (err) {
    console.error('Logout error:', err);
    showError('Failed to Log Out!');
  }
};

// Alert Notif Message
const showSuccess = (message) => {
  formSuccessMessage.value = message;
  formErrorMessage.value = '';
};

const showError = (message) => {
  formErrorMessage.value = message;
  formSuccessMessage.value = '';
};

onMounted(fetchUser);
</script>

<template>
  <v-app>
    <v-main>
      <div  class="moving-bg" style="background-color: #A9C46C; height: 250px; border-bottom-left-radius: 100% 40px; 
            border-bottom-right-radius: 100% 40px; position: relative; overflow: hidden;">
      </div>

      <v-container class="py-10" fluid>
        <v-row justify="center">
          <v-col cols="12" sm="8" md="6" lg="4" class="text-center">
            <!-- Avatar Profile -->
            <div style="position: relative; width: 200px; height: 200px; margin: -160px auto 0;">
              <v-avatar size="200" style="background-color: #5d8736;">
                <v-img :src="profileImageUrl || '/src/assets/default_profile.png'" cover/>
              </v-avatar>

              <v-btn
                  icon
                  size="small"
                  class="ma-0 pa-0"
                  style="
                  position: absolute;
                  bottom: 8px;
                  right: 8px;
                  background-color: #A9C46C;
                  color: black;
                  z-index: 2;
                  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                "
                @click="$refs.fileInput.click()"
              >
                <v-icon size="16">mdi-pencil</v-icon>
              </v-btn>
            </div>

            <input type="file" accept="image/*" ref="fileInput" @change="handleImageChange" style="display: none"/>

            <!-- User Info -->
            <div class="mt-10">
              <p class="text-h6 font-weight-medium" style="font-family: 'Syne', sans-serif;">
                {{ user?.user_metadata?.full_name || 'Full Name not set' }}
              </p>
              <p class="text-subtitle-1" style="font-family: 'Syne', sans-serif;">
                <strong>Email:</strong> {{ user?.email || 'Email not available' }}
              </p>
              <p class="text-subtitle-2" style="font-family: 'Syne', sans-serif; margin-top: 4px;">
                <strong>Contact Number:</strong> {{ user?.user_metadata?.contact || 'Not set' }}
              </p>
              <p class="text-subtitle-2" style="font-family: 'Syne', sans-serif; margin-top: 4px;">
                <strong>Address:</strong> {{ user?.user_metadata?.address || 'Not set' }}
              </p>
            </div>

            <v-btn
              class="mt-8 text-white"
              color="#5D8736"
              variant="flat"
              prepend-icon="mdi-account-edit"
              size="large"
              style="width: 100%; max-width: 300px; font-family: 'Syne', sans-serif;"
              @click="$router.push('/edit-profile')"> Edit Details
            </v-btn>

            <v-btn
              class="mt-4 text-white"
              color="#5D8736"
              variant="flat"
              prepend-icon="mdi-logout"
              size="large"
              style="width: 100%; max-width: 300px; font-family: 'Syne', sans-serif;"
              @click="logoutDialog = true"> Logout
            </v-btn>

            <v-dialog v-model="logoutDialog" max-width="400" persistent>
              <v-card class="pa-4" style="border-radius: 20px;">
                <v-card-title class="d-flex align-center justify-center" style="color: #5D8736; font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 600;">
                  <v-icon size="28" color="#5D8736" class="mr-2">mdi-logout</v-icon>
                  Confirm Logout
                </v-card-title>

                <v-card-text class="text-center" style="font-family: 'Syne', sans-serif; font-size: 15px; color: #444;">
                  Are you sure you want to log out from your account?
                </v-card-text>

                <v-card-actions class="d-flex justify-center mt-4">
                  <v-btn
                    variant="outlined"
                    style="border-radius: 12px; border: 1px solid #5D8736; color: #5D8736; font-family: 'Syne', sans-serif;"
                    @click="logoutDialog = false"
                  >
                    Cancel
                  </v-btn>

                  <v-btn
                    class="ml-4"
                    color="#5D8736"
                    variant="flat"
                    style="border-radius: 12px; color: white; font-family: 'Syne', sans-serif;"
                    @click="handleLogout"
                  >
                    Logout
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>
          </v-col>
        </v-row>

        <!-- AlertNotification Component -->
        <AlertNotification :formSuccessMessage="formSuccessMessage" 
                           :formErrorMessage="formErrorMessage"/>

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
.moving-bg {   /* moving bg */
  background: linear-gradient(-45deg, #A9C46C, #B6D37E, #94B55C, #A9C46C);
  background-size: 400% 400%;
  height: 250px;
  border-bottom-left-radius: 100% 40px; 
  border-bottom-right-radius: 100% 40px;
  position: relative;
  animation: gradientMove 8s ease infinite;
}

@keyframes gradientMove {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}        /* moving bg */

.icon-wrapper {   /* start nav bar */
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

.nav-bar span {    /* end nav bar */
  font-size: 12px;
  margin-top: 4px;
}
</style>
