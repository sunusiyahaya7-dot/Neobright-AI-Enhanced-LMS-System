import React from 'react';
import { X, Download, FileText, Calendar, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModuleFile {
  filename?: string;
  fileurl?: string;
  proxy_url?: string;
  mimetype?: string;
  filesize?: number;
}

interface ModuleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  module: {
    id: number;
    name?: string;
    modname?: string;
    description?: string;
    files: ModuleFile[];
  };
  sectionName?: string;
}

export default function ModuleDetailsModal({ isOpen, onClose, module, sectionName }: ModuleDetailsModalProps) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
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
            <div className="bg-white dark:bg-[#1A1C20] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto border border-gray-200 dark:border-[#2A2D32]">
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-[#1A1C20] border-b border-gray-200 dark:border-[#2A2D32] px-6 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {sectionName || 'Module'}
                  </p>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {module.name || 'Untitled'}
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
                {/* Module Type Badge */}
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-[#1E5BF0] text-white text-xs font-semibold rounded-lg capitalize">
                    {module.modname || 'resource'}
                  </span>
                </div>

                {/* Description */}
                {module.description ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Description</h3>
                    <div className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
                      {module.description.replace(/<[^>]*>/g, '')}
                    </div>
                  </div>
                ) : null}

                {/* Files Section */}
                {module.files && module.files.length > 0 ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <FileText size={18} />
                      Files ({module.files.length})
                    </h3>
                    <div className="space-y-2">
                      {module.files.map((file, idx) => (
                        <div
                          key={`${module.id}-${idx}`}
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
                          ) : (
                            <div className="text-xs text-gray-500 dark:text-gray-400 px-4 py-2">
                              No URL
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                    <FileText size={32} className="mx-auto mb-2 text-gray-400" />
                    <p>No files attached</p>
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
