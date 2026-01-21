import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { logout } from '../services/authService';
import api from '../api/client';
import { FileText, LogOut, Loader2, Download } from 'lucide-react';

interface Material {
  id: number;
  name: string;
  filename?: string;
  fileurl?: string;
  timemodified?: number;
}

interface CourseDetails {
  id: number;
  fullname: string;
  shortname: string;
  materials?: Material[];
}

export default function CourseContent() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<CourseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      fetchCourseContent();
    }
  }, [id]);

  const fetchCourseContent = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/enrollment/courses/${id}/materials`);
      setCourse(response.data);
    } catch (err: any) {
      console.error('Failed to fetch course content:', err);
      setError(err.response?.data?.error || 'Failed to load course content');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link to="/courses" className="text-blue-600 hover:text-blue-700">
                ← Back to Courses
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {course?.fullname || 'Course Content'}
              </h1>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-600" size={48} />
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Course Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {course?.fullname}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {course?.shortname}
              </p>
            </div>

            {/* Materials */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Course Materials
                </h3>
              </div>
              
              {course?.materials && course.materials.length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {course.materials.map((material) => (
                    <div key={material.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="text-blue-600 dark:text-blue-400" size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {material.name}
                          </h4>
                          {material.filename && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {material.filename}
                            </p>
                          )}
                        </div>
                        {material.fileurl && (
                          <a
                            href={material.fileurl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <Download size={16} />
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <FileText className="mx-auto text-gray-400" size={48} />
                  <h4 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                    No materials yet
                  </h4>
                  <p className="mt-2 text-gray-600 dark:text-gray-400">
                    Course materials will appear here when available.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
