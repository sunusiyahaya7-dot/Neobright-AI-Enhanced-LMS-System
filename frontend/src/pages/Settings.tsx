import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, UserProfile } from '../services/userService';
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Loader2 } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const loadProfile = async () => {
      if (user) {
        try {
          const data = await getUserProfile(user.uid);
          setProfile(data);
        } catch (err) {
          console.error('Failed to load profile:', err);
        } finally {
          setLoading(false);
        }
      }
    };
    loadProfile();
  }, [user]);

  const toggleDarkMode = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl">
            <SettingsIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Settings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage your account and preferences
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-[#1E5BF0]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Section */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-6">
                  <User className="w-5 h-5 text-[#1E5BF0]" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Profile</h2>
                </div>
                
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1E5BF0] to-[#2C7CF0] flex items-center justify-center text-white text-2xl font-bold">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {profile?.display_name || user?.displayName || 'Student'}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={profile?.display_name || ''}
                      readOnly
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2A2D32] border border-gray-200 dark:border-[#3A3D42] rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      readOnly
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2A2D32] border border-gray-200 dark:border-[#3A3D42] rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      value={profile?.role || 'Student'}
                      readOnly
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-[#2A2D32] border border-gray-200 dark:border-[#3A3D42] rounded-lg text-gray-900 dark:text-white capitalize"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Settings */}
            <div className="space-y-6">
              {/* Appearance */}
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Palette className="w-5 h-5 text-[#1E5BF0]" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Appearance</h2>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Dark Mode</span>
                  <button
                    onClick={toggleDarkMode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isDark ? 'bg-[#1E5BF0]' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isDark ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Notifications (Placeholder) */}
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="w-5 h-5 text-[#1E5BF0]" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Notification settings coming soon
                </p>
              </div>

              {/* Privacy (Placeholder) */}
              <div className="bg-white dark:bg-[#1A1C20] border border-gray-200 dark:border-[#2A2D32] rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5 text-[#1E5BF0]" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Privacy</h2>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Privacy settings coming soon
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
