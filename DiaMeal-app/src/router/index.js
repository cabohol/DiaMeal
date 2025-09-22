import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/utils/supabase' 
import Advertise from '@/views/auth/Advertise.vue'
import DiamealHomepage from '@/views/auth/DiamealHomepage.vue'
import LoginView from '@/views/auth/LoginView.vue'
import RegisterView from '@/views/auth/RegisterView.vue'
import TermsAndConditions from '@/views/TermsAndConditions.vue'
import ProfileView from '@/views/auth/ProfileView.vue'
import MealPlan from '@/views/auth/MealPlan.vue'
import MyProgress from '@/views/auth/MyProgress.vue'
import WeeklyMeal from '@/views/auth/WeeklyMeal.vue'
import EditProfile from '@/views/auth/EditProfile.vue'

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
      component: DiamealHomepage, 
      meta: { requiresAuth: true } 
    },

    {
      path: '/terms',
      name: 'terms',
      component: TermsAndConditions 
    },

    { 
      path: '/login', 
      name: 'login', 
      component: LoginView },

    { 
      path: '/register', 
      name: 'register', 
      component: RegisterView 
    },

    { 
      path: '/profile', 
      name: 'profile', 
      component: ProfileView, 
      meta: { requiresAuth: true } 
    },

    { 
      path: '/edit-profile', 
      name: 'edit-profile', 
      component: EditProfile, 
      meta: { requiresAuth: true } 
    },

    { 
      path: '/meal-plan', 
      name: 'meal-plan', 
      component: MealPlan, 
      meta: { requiresAuth: true } 
    },

    { 
      path: '/myprogress', 
      name: 'myprogress', 
      component: MyProgress, 
      meta: { requiresAuth: true } 
    },

    { 
      path: '/weekly-meal', 
      name: 'weekly-meal', 
      component: WeeklyMeal, 
      meta: { requiresAuth: true } },
  ],
})

/**
 * Navigation Guard Protects routes with meta.requiresAuth
 * Redirects logged-in users away from login/register
 */
router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession()

  if (to.meta.requiresAuth && !session) {
    // Not logged in, redirect to login
    return next('/login')
  }

  if ((to.path === '/login' || to.path === '/register') && session) {
    // Already logged in, prevent going back to login/register
    return next('/home')
  }

  next()
})

export default router