import { auth } from '../firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

const googleProvider = new GoogleAuthProvider()

/**
 * Register with email and password
 */
export function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password)
}

/**
 * Login with email and password
 */
export function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

/**
 * Login with Google popup
 */
export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

/**
 * Logout current user
 */
export function logout() {
  return signOut(auth)
}

/**
 * Get Firebase ID token for current user
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser
  if (user) {
    try {
      return await user.getIdToken()
    } catch (error) {
      console.error('Error getting ID token:', error)
      return null
    }
  }
  return null
}

/**
 * Force refresh ID token
 */
export async function refreshIdToken(): Promise<string | null> {
  const user = auth.currentUser
  if (user) {
    try {
      return await user.getIdToken(true) // true = force refresh
    } catch (error) {
      console.error('Error refreshing ID token:', error)
      return null
    }
  }
  return null
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return auth.currentUser
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}