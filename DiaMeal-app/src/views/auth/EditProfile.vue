<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'
import AlertNotification from '@/components/AlertNotification.vue'

const router = useRouter()
const user = ref(null)

const fullName = ref('')
const email = ref('')
const contact = ref('')
const address = ref('')
const profileImageUrl = ref('')
const uploading = ref(false)

// Alert messages
const formSuccessMessage = ref('')
const formErrorMessage = ref('')

const fetchUser = async () => {
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  if (currentUser) {
    user.value = currentUser
    fullName.value = currentUser.user_metadata?.full_name || ''
    email.value = currentUser.email || ''
    contact.value = currentUser.user_metadata?.contact || ''
    address.value = currentUser.user_metadata?.address || ''
    profileImageUrl.value = currentUser.user_metadata?.avatar_url || ''
  }
}

const handleImageChange = async (event) => {
  const file = event.target.files[0]
  if (!file || !user.value) return

  uploading.value = true
  try {
    const fileExt = file.name.split('.').pop()
    const fileName = `${user.value.id}_${Date.now()}.${fileExt}`
    const filePath = `avatars/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('diameal')
      .upload(filePath, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data: publicData } = supabase.storage
      .from('diameal')
      .getPublicUrl(filePath)

    profileImageUrl.value = publicData.publicUrl

    // Update user metadata
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        avatar_url: publicData.publicUrl,
        full_name: fullName.value,
        contact: contact.value,
        address: address.value
      }
    })

    if (updateError) throw updateError

    showSuccess('Profile Image Updated Successfully!')

  } catch (err) {
    console.error(err)
    showError('Failed to Update Profile Image!')
  } finally {
    uploading.value = false
  }
}

const saveDetails = async () => {
  if (!user.value) return

  try {
    const { error } = await supabase.auth.updateUser({
      email: email.value,
      data: {
        full_name: fullName.value,
        contact: contact.value,
        address: address.value,
        avatar_url: profileImageUrl.value
      }
    })

    if (error) throw error

    showSuccess('Information Updated Successfully!')

    setTimeout(() => {
      router.push('/profile')
    }, 1500)

  } catch (err) {
    console.error(err)
    showError('Failed to Update Information!')
  }
}

// Alert Notification
const showSuccess = (message) => {
  formSuccessMessage.value = message
  formErrorMessage.value = ''
}

const showError = (message) => {
  formErrorMessage.value = message
  formSuccessMessage.value = ''
}

onMounted(fetchUser)
</script>

<template>
  <v-app>
    <v-main>
      <!-- HEADER -->
      <div style="background-color: #A9C46C; height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 0 16px;">
        <div style="padding: 16px; margin-bottom: 12px;">
          <v-icon size="40" color="white">mdi-file-document-edit</v-icon>
        </div>
        <p style="font-family: 'Syne', sans-serif; font-size: clamp(25px, 3vw, 28px); margin: 0;">
          Update Profile Information
        </p>
      </div>

      <v-container class="py-5" fluid>
        <v-row justify="center">
          <v-col cols="12" sm="10" md="8" lg="6">

            <!-- Profile Picture Upload -->
            <div class="text-center mb-6">
              <v-avatar size="130" style="background-color: #5D8736;">
                <v-img :src="profileImageUrl || '/src/assets/default_profile.png'" cover />
              </v-avatar>
              <div class="mt-2" style="font-family: 'Syne', sans-serif;">
                <v-btn size="small" color="#5D8736" class="text-white" @click="$refs.fileInput.click()">
                  <v-icon start>mdi-camera</v-icon> Change Photo
                </v-btn>
                <input type="file" accept="image/*" ref="fileInput" @change="handleImageChange" style="display: none" />
              </div>
            </div>

            <!-- Fields -->
            <v-row dense :gutter="24">
              <v-col cols="12" md="6">
                <v-text-field v-model="fullName" label="Full Name" variant="outlined" prepend-inner-icon="mdi-account" class="mb-4 syne-font custom-field" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="email" label="Email" type="email" variant="outlined" prepend-inner-icon="mdi-email" class="mb-4 syne-font custom-field" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="contact" label="Contact Number" variant="outlined" prepend-inner-icon="mdi-phone" class="mb-4 syne-font custom-field" />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="address" label="Address" variant="outlined" prepend-inner-icon="mdi-map-marker" class="mb-6 syne-font custom-field" />
              </v-col>
            </v-row>

            <!-- Buttons -->
            <v-row class="mt-1" justify="space-between">
              <v-col cols="12" md="6">
                <v-btn color="#5D8736" variant="flat" class="text-white" style="width: 100%; font-family: 'Syne', sans-serif;" @click="saveDetails">
                  <v-icon start>mdi-check-circle</v-icon> Save
                </v-btn>
              </v-col>
              <v-col cols="12" md="6">
                <v-btn color="grey" variant="flat" class="text-white" style="width: 100%; font-family: 'Syne', sans-serif;" @click="router.push('/profile')">
                  <v-icon start>mdi-close-circle</v-icon> Cancel
                </v-btn>
              </v-col>
            </v-row>

          </v-col>
        </v-row>

        <!-- AlertNotification Component -->
        <AlertNotification :formSuccessMessage="formSuccessMessage" 
                           :formErrorMessage="formErrorMessage" />
      </v-container>

    </v-main>
  </v-app>
</template>

<style scoped>
.syne-font {
  font-family: 'Syne', sans-serif !important;
}

:deep(.custom-field .v-field--focused .v-field__outline__start),
:deep(.custom-field .v-field--focused .v-field__outline__end),
:deep(.custom-field .v-field--focused .v-field__outline__notch) {
  border-color: #5D8736 !important;
}
</style>

