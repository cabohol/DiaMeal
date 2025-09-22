<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()

onMounted(async () => {
  // Check if user has an active session
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    // User already logged in, go to homepage
    router.push('/home')
  } else {
    // No session, go to login
    router.push('/login')
  }

  // Listen for login/logout events
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      router.push('/login')
    }
    if (event === 'SIGNED_IN') {
      router.push('/home')
    }
  })
})
</script>

<template>
  <RouterView />
</template>
