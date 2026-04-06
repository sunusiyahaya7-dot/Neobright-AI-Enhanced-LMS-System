import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../services/authService';
import { 
  Home, 
  BookOpen, 
  BarChart3,
  Brain,
  Lightbulb,
  Moon,
  Settings,
  LogOut,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const toggleDarkMode = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoggingOut(false);
      setShowLogoutConfirm(false);
    }
  };

  useEffect(() => {
    if (!showLogoutConfirm) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLogoutConfirm(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLogoutConfirm]);

  const isActive = (path: string) => location.pathname === path;

  const menuItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/courses', icon: BookOpen, label: 'My Courses' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  ];

  const aiMenuItems = [
    { path: '/ai-dashboard', icon: Brain, label: 'AI Dashboard' },
    { path: '/ai-insights', icon: Lightbulb, label: 'AI Insights' },
  ];

  return (
    <>
    <aside className={`$
      isCollapsed ? 'w-20' : 'w-64'
    } bg-white dark:bg-[#1A1C20] border-r border-gray-200 dark:border-[#2A2D32] h-screen flex flex-col transition-all duration-300 sticky top-0`}>
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-10 h-10 bg-gradient-to-br from-[#1E5BF0] to-[#2C7CF0] rounded-xl flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">NeoBright</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">UNITEN LMS</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-[#2A2D32] rounded-lg transition-colors"
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              isActive(item.path)
                ? 'bg-[#1E5BF0] text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2D32]'
            } ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? item.label : ''}
          >
            <item.icon size={20} />
            {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
          </Link>
        ))}

        {/* AI Section */}
        <div className={`pt-4 mt-4 border-t border-gray-200 dark:border-[#2A2D32] ${isCollapsed ? 'space-y-2' : ''}`}>
          {!isCollapsed && (
            <p className="px-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
              NeoBright AI
            </p>
          )}
          {aiMenuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive(item.path)
                  ? 'bg-[#1E5BF0] text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2D32]'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.label : ''}
            >
              <item.icon size={20} />
              {!isCollapsed && <span className="font-medium text-sm">{item.label}</span>}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom Actions */}
      <div className="border-t border-gray-200 dark:border-[#2A2D32] p-3 space-y-2">
        <button
          onClick={toggleDarkMode}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2D32] transition-all ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Dark Mode' : ''}
        >
          <Moon size={20} />
          {!isCollapsed && <span className="font-medium text-sm">Dark Mode</span>}
        </button>

        <Link
          to="/settings"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2D32] transition-all ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Settings' : ''}
        >
          <Settings size={20} />
          {!isCollapsed && <span className="font-medium text-sm">Settings</span>}
        </Link>

        <button
          onClick={() => setShowLogoutConfirm(true)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Logout' : ''}
        >
          <LogOut size={20} />
          {!isCollapsed && <span className="font-medium text-sm">Logout</span>}
        </button>
      </div>
    </aside>

    {showLogoutConfirm && (
      <>
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => !isLoggingOut && setShowLogoutConfirm(false)}
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1C20] rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-gray-200 dark:border-[#2A2D32]">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Log out?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Are you sure you want to log out?
            </p>

            <div className="flex items-center gap-3 justify-end mt-6">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-[#111418] text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#1E2025] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {isLoggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          </div>
        </div>
      </>
    )}
    </>
  );
}
