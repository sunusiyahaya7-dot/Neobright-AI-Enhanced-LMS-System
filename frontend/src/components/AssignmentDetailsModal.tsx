import React, { useState } from 'react';
import { X, Download, FileText, Calendar, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { submitAssignment } from '../services/moodleService';

interface ModuleFile {
  filename?: string;
  fileurl?: string;
  proxy_url?: string;
  mimetype?: string;
  filesize?: number;
}

interface CourseAssignment {
  id: number;
  module_id: number;
  assignment_id?: number;
  name?: string;
  description?: string;
  intro_files?: ModuleFile[];
  duedate?: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  status?: string;
  section_name?: string;
}

interface AssignmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: CourseAssignment | null;
  courseId: number;
  onSubmitSuccess?: () => void;
}

export default function AssignmentDetailsModal({ isOpen, onClose, assignment, courseId, onSubmitSuccess }: AssignmentDetailsModalProps) {
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!assignment) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'No date';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleFileSubmit = async () => {
    if (!submissionFile) return;
    if (!assignment?.assignment_id) {
      alert('Assignment ID not found');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const result = await submitAssignment(courseId, assignment.assignment_id, submissionFile);
      console.log('Submission result:', result);
      
      // Check if Moodle submission was successful
      const moodleSuccess = result?.moodle_success;
      const message = moodleSuccess 
        ? 'File submitted successfully to Moodle!' 
        : 'File saved locally - Moodle sync pending';
      
      alert(message);
      setSubmissionFile(null);
      onSubmitSuccess?.(); // Refresh assignment data
      onClose(); // Close modal after success
    } catch (error: any) {
      console.error('Submission error:', error);
      const errorMessage = 
        error?.response?.data?.error || 
        error?.message || 
        'Unknown error occurred';
      alert('Failed to submit file: ' + errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-[#2A2D32]">
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32] px-6 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {assignment.section_name}
                  </p>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {assignment.name}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-[#111418] rounded-lg transition-colors"
                >
                  <X size={24} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-6 space-y-6">
                {/* Status and Dates */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-[#1E5BF0]/10 to-[#2C7CF0]/10 dark:from-[#1E5BF0]/15 dark:to-[#2C7CF0]/15 rounded-xl p-4 border border-[#1E5BF0]/20">
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1">Status</p>
                    <p className="text-lg font-bold text-[#1E5BF0]">{assignment.status || 'Not submitted'}</p>
                    {assignment.submitted_at && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                        Submitted: {new Date(assignment.submitted_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {assignment.duedate && (
                    <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800/30">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1 flex items-center gap-2">
                        <Calendar size={14} />
                        Due Date
                      </p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatDate(assignment.duedate)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {assignment.description ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Description</h3>
                    <div className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none bg-gray-50 dark:bg-[#111418] rounded-xl p-4">
                      {assignment.description.replace(/<[^>]*>/g, '')}
                    </div>
                  </div>
                ) : null}

                {/* Assignment Files */}
                {assignment.intro_files && assignment.intro_files.length > 0 ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <FileText size={18} />
                      Assignment Files ({assignment.intro_files.length})
                    </h3>
                    <div className="space-y-2">
                      {assignment.intro_files.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-[#111418] rounded-xl p-4 border border-gray-200 dark:border-[#2A2D32] hover:border-[#1E5BF0] dark:hover:border-[#2C7CF0] transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <FileText size={20} className="text-[#1E5BF0] flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {file.filename || 'File'}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                {formatFileSize(file.filesize)}
                              </p>
                            </div>
                          </div>
                          {(file.proxy_url || file.fileurl) ? (
                            <a
                              href={file.proxy_url || file.fileurl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1E5BF0] hover:bg-[#184AD0] text-white text-sm font-medium transition-colors flex-shrink-0"
                            >
                              <Download size={16} />
                              Download
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Submission Section */}
                <div className="border-t border-gray-200 dark:border-[#2A2D32] pt-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Upload size={18} />
                    Submit Assignment
                  </h3>

                  {/* File Upload */}
                  <div className="bg-gray-50 dark:bg-[#111418] rounded-xl p-6 border-2 border-dashed border-gray-200 dark:border-[#2A2D32] hover:border-[#1E5BF0] transition-all">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                      disabled={isSubmitting}
                    />
                    <label
                      htmlFor="file-upload"
                      className="flex flex-col items-center justify-center cursor-pointer"
                    >
                      <Upload size={32} className="text-gray-400 mb-2" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {submissionFile ? submissionFile.name : 'Choose a file or drag it here'}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Maximum file size: 2 MB
                      </p>
                    </label>
                  </div>

                  {submissionFile && (
                    <button
                      onClick={handleFileSubmit}
                      disabled={isSubmitting}
                      className="mt-4 w-full px-4 py-3 rounded-lg bg-[#1E5BF0] hover:bg-[#184AD0] disabled:opacity-50 text-white font-semibold transition-colors"
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit File'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
