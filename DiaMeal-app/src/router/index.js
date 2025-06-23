import { createRouter, createWebHistory } from 'vue-router'
import Advertise from '@/views/auth/Advertise.vue'
import LoginView from '@/views/auth/LoginView.vue' 
import RegisterView from '@/views/auth/RegisterView.vue'
import TermsAndConditions from '@/views/TermsAndConditions.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/advertise' // redirect only, no component here
    },
    {
      path: '/advertise',
      component: Advertise // this is where you mount your component
    },
     {
      path: '/terms', // route to terms and conditions
      name: 'terms',
      component: TermsAndConditions
    },
     {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView
    },
  ],
})


export default router
