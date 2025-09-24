import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useSession } from '@/common/hooks/useSession';
import { useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiWifiOff, FiChevronUp, FiChevronDown, FiSearch } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import SessionItem from './SessionItem';
import { ConfirmDialog } from '@tarko/ui';
import { SessionSearch } from './SessionSearch';

interface ChatSessionProps {
  isCollapsed: boolean;
}

export const ChatSession: React.FC<ChatSessionProps> = ({ isCollapsed }) => {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    updateSessionInfo,
    deleteSession,
    loadSessions,
    connectionStatus,
    checkServerStatus,
  } = useSession();

  const navigate = useNavigate();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  const [visibleSessionsCount, setVisibleSessionsCount] = useState<Record<string, number>>({
    today: 10,
    yesterday: 10,
    thisWeek: 10,
    earlier: 10,
    searchResults: 10,
  });

  const refreshingRef = useRef(false);
  const sessionActionInProgressRef = useRef<string | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearchMode(!!query);

    if (query) {
      setVisibleSessionsCount((prev) => ({
        ...prev,
        searchResults: 10,
      }));
    }
  }, []);

  const toggleSectionCollapse = useCallback((sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  }, []);

  const loadMoreSessions = useCallback((groupKey: string) => {
    setVisibleSessionsCount((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey] + 10,
    }));
  }, []);

  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions;

    return sessions.filter(
      (session) =>
        session.metadata?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.metadata?.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );
  }, [sessions, searchQuery]);

  const groupedSessions = useMemo(() => {
    if (isSearchMode) {
      return [
        {
          label: `Search Results`,
          sessions: filteredSessions,
          key: 'searchResults',
        },
      ];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: Array<{ label: string; sessions: Array<any>; key: string }> = [
      { label: 'Today', sessions: [], key: 'today' },
      { label: 'Yesterday', sessions: [], key: 'yesterday' },
      { label: 'This Week', sessions: [], key: 'thisWeek' },
      { label: 'Earlier', sessions: [], key: 'earlier' },
    ];

    sessions.forEach((session) => {
      const sessionDate = new Date(session.updatedAt || session.createdAt);

      if (sessionDate >= today) {
        groups[0].sessions.push(session);
      } else if (sessionDate >= yesterday) {
        groups[1].sessions.push(session);
      } else if (sessionDate >= lastWeek) {
        groups[2].sessions.push(session);
      } else {
        groups[3].sessions.push(session);
      }
    });

    return groups.filter((group) => group.sessions.length > 0);
  }, [sessions, isSearchMode, filteredSessions]);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      if (
        sessionActionInProgressRef.current === sessionId ||
        !connectionStatus.connected ||
        loadingSessionId ||
        switchingSessionId
      ) {
        return;
      }

      sessionActionInProgressRef.current = sessionId;
      setSwitchingSessionId(sessionId);

      requestAnimationFrame(() => {
        navigate(`/${sessionId}`);

        setTimeout(() => {
          setSwitchingSessionId(null);
          sessionActionInProgressRef.current = null;
        }, 100);
      });
    },
    [connectionStatus.connected, loadingSessionId, switchingSessionId, navigate],
  );

  const refreshSessions = useCallback(async () => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      const [isConnected] = await Promise.all([checkServerStatus()]);

      if (isConnected) {
        await loadSessions();
      }
    } catch (error) {
      console.error('Failed to refresh sessions:', error);
    } finally {
      setIsRefreshing(false);
      refreshingRef.current = false;
    }
  }, [checkServerStatus, loadSessions]);

  const handleEditSession = useCallback((sessionId: string, currentName?: string) => {
    setEditingSessionId(sessionId);
    setEditedName(currentName || '');
  }, []);

  const handleSaveEdit = useCallback(
    async (sessionId: string) => {
      try {
        await updateSessionInfo({ sessionId, updates: { metadata: { name: editedName } } });
        setEditingSessionId(null);
      } catch (error) {
        console.error('Failed to update session name:', error);
      }
    },
    [updateSessionInfo, editedName],
  );

  const handleDeleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(sessionId);
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;

    try {
      if (sessionToDelete === activeSessionId && sessions.length > 1) {
        const nextSession = sessions.find((s) => s.id !== sessionToDelete);
        if (nextSession) {
          navigate(`/${nextSession.id}`);

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      await deleteSession(sessionToDelete);
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeleteConfirmOpen(false);
      setSessionToDelete(null);
    }
  }, [deleteSession, sessionToDelete, sessions, activeSessionId, navigate]);

  if (isCollapsed) {
    return null; // Don't render anything when collapsed in modal mode
  }

  return (
    <div className="w-72 bg-white dark:bg-gray-900/95 flex flex-col h-full backdrop-blur-sm">
      <div className="p-4 flex items-center justify-between border-b border-gray-100/40 dark:border-gray-700/20">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Tasks</div>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connectionStatus.connected
                ? 'bg-green-500 animate-pulse'
                : connectionStatus.reconnecting
                  ? 'bg-yellow-500 animate-ping'
                  : 'bg-gray-400'
            }`}
            title={
              connectionStatus.connected
                ? 'Connected to server'
                : connectionStatus.reconnecting
                  ? 'Reconnecting...'
                  : 'Disconnected from server'
            }
          />

          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.3 }}
            onClick={refreshSessions}
            disabled={isRefreshing || !connectionStatus.connected}
            className={`text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100/40 dark:hover:bg-gray-800/40 text-xs transition-all ${
              !connectionStatus.connected && 'opacity-50 cursor-not-allowed'
            }`}
            title={connectionStatus.connected ? 'Refresh tasks' : 'Server disconnected'}
          >
            <FiRefreshCw className={isRefreshing ? 'animate-spin' : ''} size={12} />
          </motion.button>
        </div>
      </div>

      <SessionSearch onSearch={handleSearch} />

      {!connectionStatus.connected && sessions.length > 0 && (
        <div className="px-3 py-2">
          <div className="p-3 rounded-xl bg-red-50/30 dark:bg-red-900/15 text-gray-700 dark:text-gray-300 text-sm border border-red-200/50 dark:border-red-800/30 shadow-sm">
            <div className="flex items-center">
              <FiWifiOff className="mr-2 flex-shrink-0 text-red-500 dark:text-red-400" />
              <div className="font-medium text-red-700 dark:text-red-400">Offline Mode</div>
            </div>
            <p className="mt-1 text-xs">
              You can view tasks but can't create new ones until reconnected.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => checkServerStatus()}
              className="w-full mt-2 py-1.5 px-3 bg-red-100/70 dark:bg-red-800/30 hover:bg-red-200/70 dark:hover:bg-red-700/40 rounded-xl text-xs font-medium transition-colors flex items-center justify-center border border-red-200/30 dark:border-red-700/30 text-red-700 dark:text-red-300"
            >
              <FiRefreshCw
                className={`mr-1.5 ${connectionStatus.reconnecting ? 'animate-spin' : ''}`}
                size={12}
              />
              {connectionStatus.reconnecting ? 'Reconnecting...' : 'Reconnect to Server'}
            </motion.button>
          </div>
        </div>
      )}

      {isSearchMode && filteredSessions.length === 0 && (
        <div className="p-6 text-center">
          <div className="flex justify-center mb-3 text-gray-400 dark:text-gray-500">
            <FiSearch size={24} />
          </div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">No tasks found</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Try a different search term or clear the search
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto sidebar-scrollbar px-3 pb-3">
        <AnimatePresence>
          {groupedSessions.map((group) => (
            <div key={group.key} className="mb-4">
              <motion.button
                onClick={() => toggleSectionCollapse(group.key)}
                className="w-full flex items-center justify-between px-1 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300"
                whileHover={{ x: 2 }}
              >
                <span>
                  {group.label} ({group.sessions.length})
                </span>
                <motion.div
                  animate={{ rotate: collapsedSections[group.key] ? 0 : 180 }}
                  transition={{ duration: 0.2 }}
                >
                  <FiChevronUp size={14} />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                {!collapsedSections[group.key] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1">
                      {group.sessions
                        .slice(0, visibleSessionsCount[group.key] || 10)
                        .map((session) => (
                          <SessionItem
                            key={session.id}
                            session={session}
                            isActive={activeSessionId === session.id}
                            isLoading={
                              loadingSessionId === session.id || switchingSessionId === session.id
                            }
                            isConnected={connectionStatus.connected}
                            searchQuery={isSearchMode ? searchQuery : ''}
                            onSessionClick={handleSessionClick}
                            onEditSession={handleEditSession}
                            onDeleteSession={handleDeleteSession}
                            onSaveEdit={handleSaveEdit}
                            editingSessionId={editingSessionId}
                            editedName={editedName}
                            setEditedName={setEditedName}
                          />
                        ))}
                    </div>

                    {group.sessions.length > visibleSessionsCount[group.key] && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => loadMoreSessions(group.key)}
                        className="w-full mt-2 py-2 text-xs text-accent-600 dark:text-accent-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 rounded-lg flex items-center justify-center"
                      >
                        <FiChevronDown className="mr-1" size={14} />
                        Load More ({group.sessions.length - visibleSessionsCount[group.key]}{' '}
                        remaining)
                      </motion.button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteSession}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};
