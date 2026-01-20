import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  AuthError,
} from "firebase/auth";
import { auth } from "../firebase";

/**
 * Register user with email and password via Firebase.
 */
export function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Login user with email and password via Firebase.
 */
export function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Logout current Firebase user.
 */
export function logout() {
  return signOut(auth);
}

/**
 * Observe Firebase auth state changes.
 * Callback fires when user logs in/out.
 */
export function observeAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get Firebase ID token for the currently authenticated user.
 * Returns null if no user is logged in.
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      return token;
    } catch (error) {
      console.error("Error getting ID token:", error);
      return null;
    }
  }
  return null;
}

/**
 * Force refresh the ID token (useful when token expires).
 */
export async function refreshIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken(true); // true = force refresh
      return token;
    } catch (error) {
      console.error("Error refreshing ID token:", error);
      return null;
    }
  }
  return null;
}

/**
 * Get current authenticated user.
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}