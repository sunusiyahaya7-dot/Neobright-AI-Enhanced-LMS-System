import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, Sparkles, AlertCircle } from 'lucide-react'
import { loginWithEmail, loginWithGoogle } from '../services/authService'

interface LoginPageProps {
  onLogin: () => void
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await loginWithEmail(email, password)
      onLogin() // Notify parent that login succeeded
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)

    try {
      await loginWithGoogle()
      onLogin() // Notify parent that login succeeded
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F6FA] to-white dark:from-[#0E0F11] dark:to-[#111418] flex items-center justify-center p-6">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Side - Illustration (keep existing) */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden lg:flex flex-col items-center justify-center"
        >
          <div className="relative w-full max-w-md">
            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-full aspect-square bg-gradient-to-br from-[#1E5BF0] to-[#2C7CF0] rounded-3xl flex items-center justify-center shadow-2xl"
            >
              <Sparkles size={120} className="text-white opacity-90" />
            </motion.div>
            {/* Animated background blobs */}
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -top-10 -right-10 w-40 h-40 bg-[#2C7CF0] rounded-full blur-3xl"
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#1E5BF0] rounded-full blur-3xl"
            />
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-12 text-center"
          >
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
              AI-Powered Learning Made Simple
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Your intelligent companion for academic success
            </p>
          </motion.div>
        </motion.div>

        {/* Right Side - Login Form */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md mx-auto"
        >
          <div className="bg-white dark:bg-[#1A1C20] rounded-3xl shadow-xl dark:shadow-2xl p-8 border border-gray-100 dark:border-[#2A2D32]">
            {/* Logo and Title */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#1E5BF0] to-[#2C7CF0] rounded-2xl mb-4">
                <Sparkles size={32} className="text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                NeoBright Student Login
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Sign in using your UNITEN account to access AI-assisted learning
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3"
              >
                <AlertCircle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </motion.div>
            )}

            {/* Google Sign-In */}
            <button
             onClick={handleGoogleLogin}
             disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white dark:bg-[#111418] border-2 border-gray-200 dark:border-[#2A2D32] rounded-xl hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] transition-all mb-6 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="font-medium text-gray-700 dark:text-gray-300 group-hover:text-[#1E5BF0] dark:group-hover:text-[#2C7CF0]">
                {loading ? 'Signing in...' : 'Continue with Google'}
              </span>
            </button>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-[#2A2D32]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white dark:bg-[#1A1C20] text-gray-500 dark:text-gray-400">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@uniten.edu.my"
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-[#F5F6FA] dark:bg-[#111418] border border-gray-200 dark:border-[#2A2D32] rounded-xl focus:outline-none focus:border-[#1E5BF0] dark:focus:border-[#2C7CF0] focus:ring-2 focus:ring-[#1E5BF0]/20 dark:focus:ring-[#2C7CF0]/20 text-gray-900 dark:text-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-[#F5F6FA] dark:bg-[#111418] border border-gray-200 dark:border-[#2A2D32] rounded-xl focus:outline-none focus:border-[#1E5BF0] dark:focus:border-[#2C7CF0] focus:ring-2 focus:ring-[#1E5BF0]/20 dark:focus:ring-[#2C7CF0]/20 text-gray-900 dark:text-white transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 dark:border-[#2A2D32] text-[#1E5BF0] focus:ring-[#1E5BF0] dark:bg-[#111418]"
                  />
                  <span className="text-gray-600 dark:text-gray-400">Remember me</span>
                </label>
                <a href="#" className="text-[#1E5BF0] dark:text-[#2C7CF0] hover:underline">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-[#1E5BF0] to-[#2C7CF0] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-[#1E5BF0]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <a href="#" className="text-[#1E5BF0] dark:text-[#2C7CF0] font-medium hover:underline">
                Contact IT Support
              </a>
            </p>
          </div>

          {/* NeoBright Branding */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Powered by <span className="font-semibold text-[#1E5BF0] dark:text-[#2C7CF0]">NeoBright</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}