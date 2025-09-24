import React from 'react';
import { FiFileText, FiBookOpen, FiChevronRight } from 'react-icons/fi';
import { useSession } from '@/common/hooks/useSession';

interface ReportFileEntryProps {
  title: string;
  timestamp: number;
  content: string;
}

/**
 * ReportFileEntry - Displays a file-like entry for research reports
 *
 * This component creates a clickable file entry that opens the associated
 * research report in the workspace panel when clicked.
 */
export const ReportFileEntry: React.FC<ReportFileEntryProps> = ({ title, timestamp, content }) => {
  const { setActivePanelContent } = useSession();

  const handleClick = () => {
    setActivePanelContent({
      type: 'research_report',
      source: content,
      title: title || 'Research Report',
      timestamp,
    });
  };

  return (
    <div
      onClick={handleClick}
      className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100/40 dark:border-gray-700/20 cursor-pointer flex items-center gap-3 group transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50/50 dark:hover:bg-gray-750/50 active:scale-98"
    >
      <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center border border-accent-100/40 dark:border-accent-800/30">
        <FiBookOpen className="text-accent-600 dark:text-accent-400" size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800 dark:text-gray-200 truncate">
          {title || 'Research Report'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
          Research report • Click to view
        </div>
      </div>

      <FiChevronRight
        className="text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
        size={16}
      />
    </div>
  );
};
