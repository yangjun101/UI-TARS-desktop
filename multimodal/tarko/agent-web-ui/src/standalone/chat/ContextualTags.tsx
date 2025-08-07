import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFile, FiFolder, FiX, FiHome } from 'react-icons/fi';
import { ContextualItem } from './ContextualSelector';

interface ContextualTagsProps {
  items: ContextualItem[];
  onRemove: (id: string) => void;
}

/**
 * ContextualTags - Display selected contextual items as removable tags
 *
 * Features:
 * - Visual distinction between files, directories, and workspace
 * - Smooth animations for add/remove operations
 * - Hover effects and clear remove actions
 * - Compact layout to preserve input space
 */
export const ContextualTags: React.FC<ContextualTagsProps> = ({ items, onRemove }) => {
  if (items.length === 0) return null;

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'workspace':
        return <FiHome size={14} className="text-indigo-500 dark:text-indigo-400 flex-shrink-0" />;
      case 'directory':
        return <FiFolder size={14} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />;
      default:
        return <FiFile size={14} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />;
    }
  };

  const getDisplayText = (item: ContextualItem) => {
    if (item.type === 'workspace') {
      return {
        name: 'workspace',
        path: 'Current workspace root',
      };
    } else {
      return {
        name: item.name,
        path: `${item.type === 'directory' ? '@dir:' : '@file:'}${item.relativePath}`,
      };
    }
  };

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {items.map((item) => {
            const displayText = getDisplayText(item);
            
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.8, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -10 }}
                whileHover={{ scale: 1.02 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700/40 rounded-lg shadow-sm backdrop-blur-sm group"
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {getItemIcon(item.type)}
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {displayText.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {displayText.path}
                    </span>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onRemove(item.id)}
                  className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 text-gray-400 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0"
                  title="Remove context"
                >
                  <FiX size={14} />
                </motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
