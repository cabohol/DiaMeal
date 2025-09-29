<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

onMounted(async () => {
  // Check if user has an active session
  const { data: { session } } = await supabase.auth.getSession()

  // Only redirect if we're on the root path or advertise page AND not authenticated
  if (!session && (route.path === '/' || route.path === '/advertise')) {
    router.push('/login')
  } 
  // Only redirect from landing/auth pages if user is authenticated
  else if (session && (route.path === '/' || route.path === '/advertise')) {
    router.push('/home')
  }

  // Listen for login/logout events
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      router.push('/login')
    }
    if (event === 'SIGNED_IN') {
      // Only redirect to home if user is currently on login/register page
      if (route.path === '/login' || route.path === '/register') {
        router.push('/home')
      }
    }
  })
})
</script>

<template>
  <RouterView />
</template>