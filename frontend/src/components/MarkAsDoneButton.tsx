import React, { useState } from 'react';
import { Check, Loader } from 'lucide-react';
import { progressService } from '../services/progressService';

interface MarkAsDoneButtonProps {
  activityId: number;
  courseId: number;
  isComplete: boolean;
  onComplete: (activityId: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const MarkAsDoneButton: React.FC<MarkAsDoneButtonProps> = ({
  activityId,
  courseId,
  isComplete,
  onComplete,
  size = 'md'
}) => {
  const [loading, setLoading] = useState(false);

  const handleMarkDone = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isComplete) return; // Already marked as done

    try {
      setLoading(true);
      const success = await progressService.markActivityComplete(courseId, activityId);

      if (success) {
        onComplete(activityId);
      } else {
        console.error('Failed to mark activity as done');
      }
    } catch (error) {
      console.error('Error marking activity as done:', error);
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  const iconSize = {
    sm: 14,
    md: 16,
    lg: 18
  };

  if (isComplete) {
    return (
      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800">
        <Check size={iconSize[size]} />
        <span className="font-semibold text-sm">Done</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleMarkDone}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm"
    >
      {loading ? (
        <Loader size={iconSize[size]} className="animate-spin" />
      ) : (
        <>
          <Check size={iconSize[size]} />
          <span>Mark as done</span>
        </>
      )}
    </button>
  );
};
