import { createRouter, createWebHistory } from 'vue-router'
import Advertise from '@/views/auth/Advertise.vue'
import DiamealHomepage from '@/views/auth/DiamealHomepage.vue'
import LoginView from '@/views/auth/LoginView.vue'
import RegisterView from '@/views/auth/RegisterView.vue'
import TermsAndConditions from '@/views/TermsAndConditions.vue'
import ProfileView from '@/views/auth/ProfileView.vue'
import MealPlan from '@/views/auth/MealPlan.vue' 

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/advertise'
    },
    {
      path: '/advertise',
      component: Advertise
    },
    {
      path: '/home',
      name: 'home',
      component: DiamealHomepage
    },
    {
      path: '/terms',
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
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView
    },
    {
      path: '/meal-plan', 
      name: 'meal-plan',
      component: MealPlan
    },
  ],
})

export default router
