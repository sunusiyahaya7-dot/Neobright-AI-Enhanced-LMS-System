import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

const db = getFirestore();

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
  const userRef = doc(db, 'users', user.uid);
  
  try {
    // Check if user already exists
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Create new user profile
      const newUserProfile: UserProfile = {
        firebase_uid: user.uid,
        email: user.email || '',
        display_name: user.displayName || user.email?.split('@')[0] || 'Student',
        photo_url: user.photoURL || undefined,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        enrolled_courses: [],
        role: 'student',
      };
      
      await setDoc(userRef, newUserProfile);
      console.log('✅ User profile created in Firestore:', user.uid);
    } else {
      // User exists, optionally update fields
      const updates = {
        display_name: user.displayName || userDoc.data().display_name,
        photo_url: user.photoURL || userDoc.data().photo_url,
        updated_at: serverTimestamp(),
      };
      
      await setDoc(userRef, updates, { merge: true });
      console.log('✅ User profile updated in Firestore:', user.uid);
    }
  } catch (error) {
    console.error('❌ Error creating/updating user profile:', error);
    throw error;
  }
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    return null;
  }
}
