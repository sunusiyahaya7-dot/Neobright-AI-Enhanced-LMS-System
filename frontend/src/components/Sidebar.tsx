import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../services/authService';
import { 
  Home, 
  BookOpen, 
  BarChart3,
  Zap,
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
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  const toggleDarkMode = () => {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

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
    <aside className={`${
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
        {!isCollapsed && (
          <div className="pt-4 mt-4 border-t border-gray-200 dark:border-[#2A2D32]">
            <p className="px-4 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
              NeoBright AI
            </p>
            {aiMenuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive(item.path)
                    ? 'bg-[#1E5BF0] text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2D32]'
                }`}
              >
                <item.icon size={20} />
                <span className="font-medium text-sm">{item.label}</span>
              </Link>
            ))}
          </div>
        )}
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
          onClick={handleLogout}
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
  );
}
