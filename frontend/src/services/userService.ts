import { User } from 'firebase/auth';

import api from '../api/client';

export interface UserProfile {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  created_at: any;
  updated_at: any;
  enrolled_courses: number[];
  role: string;
}

/**
 * Create or update user profile in Firestore after authentication
 */
export async function createOrUpdateUserProfile(user: User): Promise<void> {
  try {
    await api.post('/users/me', {
      display_name: user.displayName || user.email?.split('@')[0] || 'Student',
      photo_url: user.photoURL || null,
    });
  } catch (error) {
    console.error('❌ Error creating/updating user profile via backend:', error);
    throw error;
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    void uid; // backend infers user from Firebase ID token
    // uid is ignored; backend infers user from Firebase ID token
    const res = await api.get('/users/me');
    return (res.data?.profile || null) as UserProfile | null;
  } catch (error) {
    console.error('❌ Error fetching user profile via backend:', error);
    return null;
  }
}
