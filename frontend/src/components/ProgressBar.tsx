import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  completed: number;
  total: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  completed,
  total,
  showLabel = true,
  size = 'md',
  animated = true
}) => {
  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const isComplete = progress === 100;
  const barColor = isComplete 
    ? 'from-green-400 to-emerald-500' 
    : 'from-blue-400 to-cyan-500';

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className={`w-full ${sizeClasses[size]} rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden relative`}>
        <div
          className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-500 ease-out ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{
            width: `${Math.min(progress, 100)}%`
          }}
        />
      </div>

      {/* Label */}
      {showLabel && (
        <div className="flex items-center justify-between mt-2">
          <div className={`flex items-center gap-2 ${textSizeClasses[size]}`}>
            {isComplete ? (
              <CheckCircle2 size={16} className="text-green-500" />
            ) : (
              <Circle size={16} className="text-gray-400" />
            )}
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {completed} / {total} completed
            </span>
          </div>
          <span className={`font-bold ${isComplete ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'} ${textSizeClasses[size]}`}>
            {progress.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
};
