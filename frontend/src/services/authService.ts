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
import { createOrUpdateUserProfile } from './userService'

const googleProvider = new GoogleAuthProvider()

/**
 * Register with email and password
 */
export async function registerWithEmail(email: string, password: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password)
  // Create user profile in Firestore
  await createOrUpdateUserProfile(userCredential.user)
  return userCredential
}

/**
 * Login with email and password
 */
export async function loginWithEmail(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password)
  // Create or update user profile in Firestore
  await createOrUpdateUserProfile(userCredential.user)
  return userCredential
}

/**
 * Login with Google popup
 */
export async function loginWithGoogle() {
  const userCredential = await signInWithPopup(auth, googleProvider)
  // Create or update user profile in Firestore
  await createOrUpdateUserProfile(userCredential.user)
  return userCredential
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