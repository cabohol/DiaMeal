<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = useRouter()
const route = useRoute()

onMounted(async () => {

  const { data: { session } } = await supabase.auth.getSession()


  if (session && (route.path === '/' || route.path === '/advertise')) {
    router.push('/home')
  }

  // Listen for login/logout events
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      router.push('/advertise')
    }
    if (event === 'SIGNED_IN') {
      
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