import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Calendar, Upload, MessageSquare, Award, RotateCcw, Trash2, AlertCircle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { submitAssignment, getSubmissionDetails, deleteSubmission } from '../services/moodleService';

interface ModuleFile {
  filename?: string;
  fileurl?: string;
  proxy_url?: string;
  mimetype?: string;
  filesize?: number;
}

interface SubmissionDetail {
  submission?: {
    status?: string;
    timemodified?: number;
    attempt?: number;
  };
  feedback?: {
    grade?: string;
    gradefordisplay?: string;
    gradeddate?: number;
    plugins?: Array<{
      type?: string;
      name?: string;
      output?: string;
    }>;
  };
  canstudentmanageownsubmission?: boolean;
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
  submitted_at?: string;
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
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionDetail | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  // Load submission details when modal opens or assignment changes
  useEffect(() => {
    if (isOpen && assignment?.assignment_id) {
      loadSubmissionDetails();
    }
  }, [isOpen, assignment?.assignment_id]);

  const loadSubmissionDetails = async () => {
    if (!assignment?.assignment_id) return;
    
    setIsLoadingDetails(true);
    try {
      const result = await getSubmissionDetails(courseId, assignment.assignment_id);
      if (result.submission_details) {
        setSubmissionDetails(result.submission_details);
      }
    } catch (error) {
      console.error('Failed to load submission details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

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

  const handleDeleteSubmission = async () => {
    if (!assignment?.assignment_id) {
      alert('Assignment ID not found');
      return;
    }

    const confirmDelete = window.confirm(
      'Are you sure you want to delete this submission? This action cannot be undone.'
    );

    if (!confirmDelete) return;

    setIsSubmitting(true);
    try {
      console.log('Deleting submission for assignment:', assignment.assignment_id);
      const result = await deleteSubmission(courseId, assignment.assignment_id);
      console.log('Delete result:', result);
      
      if (result.success) {
        alert('Submission deleted successfully. You can now resubmit.');
        setSubmissionFile(null);
        setShowSubmitForm(false);
        
        // Reload submission details to update UI
        await loadSubmissionDetails();
        onSubmitSuccess?.();
      } else {
        alert('Failed to delete submission: ' + (result.error || result.message));
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        'Unknown error occurred';
      alert('Failed to delete submission: ' + errorMessage);
    } finally {
      setIsSubmitting(false);
    }
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
      
      const moodleSuccess = result?.moodle_success;
      const message = moodleSuccess 
        ? 'File submitted successfully to Moodle!' 
        : 'File saved locally - Moodle sync pending';
      
      alert(message);
      setSubmissionFile(null);
      setShowSubmitForm(false);
      
      // Reload submission details
      await loadSubmissionDetails();
      onSubmitSuccess?.();
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
      {isOpen && assignment && (
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
            <div className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-[#2A2D32]">
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
                {/* Status, Grade, and Dates */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-[#1E5BF0]/10 to-[#2C7CF0]/10 dark:from-[#1E5BF0]/15 dark:to-[#2C7CF0]/15 rounded-xl p-4 border border-[#1E5BF0]/20">
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1">Submission Status</p>
                    <p className="text-lg font-bold text-[#1E5BF0]">{assignment.status || 'Not submitted'}</p>
                    {assignment.submitted_at && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                        {new Date(assignment.submitted_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Grading Status and Grade */}
                  <div className={`rounded-xl p-4 border ${
                    submissionDetails?.feedback?.gradefordisplay
                      ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800/30'
                      : 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-200 dark:border-yellow-800/30'
                  }`}>
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1 flex items-center gap-2">
                      <Award size={14} />
                      Grading Status
                    </p>
                    {submissionDetails?.feedback?.gradefordisplay ? (
                      <>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          Graded
                        </p>
                        <p className="text-sm font-semibold text-green-700 dark:text-green-300 mt-2">
                          Grade: {submissionDetails.feedback.gradefordisplay}
                        </p>
                        {submissionDetails.feedback.gradeddate && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Date(submissionDetails.feedback.gradeddate * 1000).toLocaleDateString()}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                        Not Graded
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

                {/* Feedback/Comments Section */}
                {submissionDetails?.feedback && (
                  <div className="border-t border-gray-200 dark:border-[#2A2D32] pt-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <MessageSquare size={18} />
                      Teacher Feedback
                    </h3>
                    
                    {/* Feedback Plugins (comments, rubric, etc.) */}
                    {submissionDetails.feedback.plugins && submissionDetails.feedback.plugins.length > 0 ? (
                      <div className="space-y-3">
                        {submissionDetails.feedback.plugins.map((plugin, idx) => (
                          <div
                            key={idx}
                            className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800/30"
                          >
                            {plugin.name && (
                              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
                                {plugin.name}
                              </p>
                            )}
                            {plugin.output ? (
                              <div className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
                                {plugin.output}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-600 dark:text-gray-400">No feedback provided</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[#111418] rounded-xl p-4">
                        No feedback provided yet
                      </p>
                    )}
                  </div>
                )}

                {/* Submission Form - Show only if not submitted or if can re-submit */}
                {(assignment.status === 'Not submitted' || showSubmitForm) && (
                  <div className="border-t border-gray-200 dark:border-[#2A2D32] pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Upload size={18} />
                        {assignment.status === 'Not submitted' ? 'Submit Assignment' : 'Resubmit Assignment'}
                      </h3>
                      {assignment.status !== 'Not submitted' && (
                        <button
                          onClick={() => setShowSubmitForm(false)}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

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
                        className="mt-4 w-full px-4 py-3 rounded-lg bg-[#1E5BF0] hover:bg-[#184AD0] disabled:opacity-50 text-white font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader size={18} className="animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          'Submit File'
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Submission Actions */}
                {assignment.status !== 'Not submitted' && submissionDetails?.canstudentmanageownsubmission && (
                  <div className="border-t border-gray-200 dark:border-[#2A2D32] pt-6 flex gap-3">
                    <button
                      onClick={() => setShowSubmitForm(true)}
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-3 rounded-lg bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <RotateCcw size={18} />
                      Resubmit
                    </button>
                    <button
                      onClick={handleDeleteSubmission}
                      disabled={isSubmitting}
                      className="flex-1 px-4 py-3 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 size={18} />
                      Delete
                    </button>
                  </div>
                )}

                {/* Loading State */}
                {isLoadingDetails && (
                  <div className="border-t border-gray-200 dark:border-[#2A2D32] pt-6">
                    <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
                      <Loader size={18} className="animate-spin" />
                      Loading submission details...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
