import { createRouter, createWebHistory } from 'vue-router'
import Advertise from '@/views/auth/Advertise.vue'
import LoginView from '@/views/auth/LoginView.vue' 

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/advertise' // ✅ redirect only, no component here
    },
    {
      path: '/advertise',
      component: Advertise // ✅ this is where you mount your component
    },
     {
      path: '/LoginView',
      name: 'login',
      component: LoginView
    },
  ],
})


export default router
