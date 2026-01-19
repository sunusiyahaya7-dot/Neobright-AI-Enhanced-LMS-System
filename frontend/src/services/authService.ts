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
 * Get Firebase ID token for API authentication.
 * Token is sent to Flask backend in Authorization header.
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(/* forceRefresh */ true);
}

/**
 * Get current authenticated user.
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}