<script setup>
import { supabase } from '@/utils/supabase';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const user = ref(null);
const profileImageUrl = ref('');
const uploading = ref(false);
const router = useRouter();

const fetchUser = async () => {
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  user.value = currentUser;

  if (currentUser?.user_metadata?.avatar_url) {
    profileImageUrl.value = currentUser.user_metadata.avatar_url;
  }
};

const handleImageChange = async (event) => {
  const file = event.target.files[0];
  if (!file || !user.value) return;

  uploading.value = true;

  const fileExt = file.name.split('.').pop();
  const fileName = `${user.value.id}.${fileExt}`;
  const filePath = `avatars/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    alert('Failed to upload image.');
    uploading.value = false;
    return;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  profileImageUrl.value = data.publicUrl;

  await supabase.auth.updateUser({
    data: {
      avatar_url: data.publicUrl,
    },
  });

  uploading.value = false;
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
      <v-container class="py-10" fluid>
        <v-row justify="center">
          <v-col cols="12" sm="8" md="6" lg="4" class="text-center">
            
            <!-- Avatar -->
            <v-avatar size="120" class="mx-auto">
              <v-img
                :src="profileImageUrl || 'https://via.placeholder.com/120'"
                cover
              />
            </v-avatar>

            <!-- Change Photo -->
            <div class="mt-4">
              <v-btn
                color="green-darken-2"
                @click="$refs.fileInput.click()"
                :loading="uploading"
              >
                Change Photo
              </v-btn>
              <input
                type="file"
                accept="image/*"
                ref="fileInput"
                @change="handleImageChange"
                style="display: none"
              />
            </div>

            <!-- User Info -->
            <div class="mt-6">
              <p class="text-h6" style="font-family: 'Syne', sans-serif;">
                {{ user?.user_metadata?.full_name || 'Full name not set' }}
              </p>
              <p class="text-subtitle-1" style="font-family: 'Syne', sans-serif;">
                {{ user?.email || 'Email not available' }}
              </p>
              <p class="text-subtitle-2" style="font-family: 'Syne', sans-serif; margin-top: 4px;">
               <strong>Contact Number:</strong>{{ user?.user_metadata?.contact || 'Not set' }}
              </p>
              <p class="text-subtitle-2" style="font-family: 'Syne', sans-serif; margin-top: 4px;">
               <strong>Address:</strong>{{ user?.user_metadata?.address || 'Not set' }}
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
              Edit Profile
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

