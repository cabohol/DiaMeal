<script setup>
import { supabase } from '@/utils/supabase';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const user = ref(null);
const profileImageUrl = ref('');
const uploading = ref(false);
const router = useRouter();

const fetchUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error fetching user:', error);
    return;
  }
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  user.value = currentUser;

  user.value = data.user;
  console.log('Fetched user:', user.value);

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

    // Upload image to "diameal" bucket
    const { error: uploadError } = await supabase.storage
      .from('diameal')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      alert('Failed to upload image.');
      return;
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from('diameal')
      .getPublicUrl(filePath);

    profileImageUrl.value = publicData.publicUrl;

    // Save to user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        avatar_url: publicData.publicUrl,
      },
    });

    if (updateError) {
      console.error('Error updating user metadata:', updateError);
    } else {
      console.log('Profile image updated successfully!');
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    uploading.value = false;
  }
};

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push('/login');
};

onMounted(fetchUser);
</script>




<template>
  <v-app>
    <v-main>
      <div
        style="background-color: #A9C46C; height: 250px; border-bottom-left-radius: 100% 40px; 
        border-bottom-right-radius: 100% 40px; position: relative;">
      </div>

      <v-container class="py-10" fluid>
        <v-row justify="center">
          <v-col cols="12" sm="8" md="6" lg="4" class="text-center">
            <!-- Avatar Profile -->
            <div style="position: relative; width: 200px; height: 200px; margin: -160px auto 0;">
              <v-avatar
                size="200"
                style="background-color: #5d8736;"
              >
                <v-img
                  :src="profileImageUrl || '/src/assets/default_profile.png'"
                  cover
                />
              </v-avatar>

              <!-- Edit Profile Button -->
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

            <!-- Edit Profile Button -->
            <v-btn
              class="mt-8 text-white"
              color="#5D8736"
              variant="flat"
              prepend-icon="mdi-account-edit"
              size="large"
              style="width: 100%; max-width: 300px; font-family: 'Syne', sans-serif;"
              @click="$router.push('/edit-profile')"
            >
              Edit Details
            </v-btn>

            <!-- Logout Button -->
            <v-btn
              class="mt-4 text-white"
              color="#5D8736"
              variant="flat"
              prepend-icon="mdi-logout"
              size="large"
              style="width: 100%; max-width: 300px; font-family: 'Syne', sans-serif;"
              @click="handleLogout"
            >
              Logout
            </v-btn>
          </v-col>
        </v-row>

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

          <v-btn @click="$router.push('/progress')" class="nav-tab">
            <v-icon>mdi-chart-line</v-icon><span>Progress</span>
          </v-btn>
        </v-bottom-navigation>
      </v-container>
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

