import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  fetchWorkspace,
  fetchWorkspaceMe,
  fetchTeamMembers,
  fetchAllContacts,
  fetchAllChats,
  fetchChatMessages,
  startNewChat,
  sendChatMessage,
  updateChatTitle,
  deleteChat,
  fetchUserChatsExport
} from './api'
import { extractDataWithDeepSeek, fetchColumnsFromGoogleSheet } from './deepseekApi'
import './App.css'

export default function App() {
  const [activeTab, setActiveTab] = useState('chats')

  // Global State
  const [workspace, setWorkspace] = useState(null)
  const [owner, setOwner] = useState(null)
  const [team, setTeam] = useState([])
  const [users, setUsers] = useState([])
  const [contacts, setContacts] = useState([])

  // Chats Pagination & Real-time Polling State
  const [chats, setChats] = useState([])
  const [chatsPage, setChatsPage] = useState(1)
  const [chatsTotalPages, setChatsTotalPages] = useState(1)
  const [chatsTotalCount, setChatsTotalCount] = useState(0)
  const [loadingChats, setLoadingChats] = useState(false)

  const [selectedUserGuid, setSelectedUserGuid] = useState(null)
  const [userExportMap, setUserExportMap] = useState({})
  const [loadingExport, setLoadingExport] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])

  // Guard against overlapping polling requests
  const isPollingRef = useRef(false)

  // DeepSeek API Key (Embedded from .env or localStorage)
  const [deepseekApiKey] = useState(
    import.meta.env.VITE_DEEPSEEK_API_KEY || localStorage.getItem('DEEPSEEK_API_KEY') || ''
  )
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [extractedRows, setExtractedRows] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('EXTRACTED_SHEET_ROWS') || '[]')
    } catch (_) {
      return []
    }
  })

  // Save extracted rows
  useEffect(() => {
    localStorage.setItem('EXTRACTED_SHEET_ROWS', JSON.stringify(extractedRows))
  }, [extractedRows])

  const addToast = (msg, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  const loadChatsPage = useCallback(async (pageNum, fetchAll = false, silent = false) => {
    if (!silent) setLoadingChats(true)
    try {
      if (fetchAll) {
        const allChatsList = await fetchAllChats(1, 100, true)
        setChats(prev => {
          if (prev.length === allChatsList.length && prev[0]?.guid === allChatsList[0]?.guid) {
            return prev
          }
          return allChatsList
        })
        setChatsPage(1)
        setChatsTotalPages(1)
        setChatsTotalCount(allChatsList.length)
        if (!silent) addToast(`Fetched all ${allChatsList.length} chats!`, 'success')
      } else {
        const res = await fetchAllChats(pageNum, 100, false)
        const newItems = res.data || []
        setChats(prev => {
          if (prev.length === newItems.length) {
            const pF = prev[0]
            const nF = newItems[0]
            if (pF?.guid === nF?.guid && (pF?.last_message_at || pF?.updated_at) === (nF?.last_message_at || nF?.updated_at)) {
              return prev
            }
          }
          return newItems
        })
        setChatsPage(res.page || 1)
        setChatsTotalPages(res.pages || 1)
        setChatsTotalCount(res.total || newItems.length)
      }
    } catch (e) {
      if (!silent) addToast(`Error loading chats page: ${e.message}`, 'error')
    } finally {
      if (!silent) setLoadingChats(false)
    }
  }, [])

  const loadAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [ws, ow, tm, csRes] = await Promise.all([
        fetchWorkspace().catch(() => null),
        fetchWorkspaceMe().catch(() => null),
        fetchTeamMembers().catch(() => []),
        fetchAllContacts(1, 50, false).catch(() => ({ data: [] }))
      ])
      setWorkspace(ws)
      setOwner(ow)
      setTeam(tm)
      setContacts(csRes.data || csRes || [])
      await loadChatsPage(1, false, false)
    } catch (e) {
      addToast(`Error loading dashboard: ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [loadChatsPage])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  useEffect(() => {
    if (!selectedUserGuid) return
    if (userExportMap[selectedUserGuid]) return

    setLoadingExport(true)
    fetchUserChatsExport(selectedUserGuid)
      .then(exportedThreads => {
        setUserExportMap(prev => ({ ...prev, [selectedUserGuid]: exportedThreads }))
      })
      .catch(err => {
        console.warn('Export chat fallback:', err.message)
      })
      .finally(() => setLoadingExport(false))
  }, [selectedUserGuid, userExportMap])

  return (
    <div className="app-container">
      {/* Top Header Navigation — Refine Skin and Body Clinic */}
      <header className="top-nav">
        <div className="brand">
          <div className="brand-icon">RS</div>
          <div>
            <div className="brand-title">Refine Skin & Body Clinic</div>
            <div className="brand-subtitle">Leads Status & Messages</div>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            id="tab-btn-chats"
            className={`nav-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            💬 Messages & Chats ({chatsTotalCount || chats.length})
            {selectedUserGuid && <span className="badge badge-purple" style={{ marginLeft: 6, fontSize: 10 }}>Filtered</span>}
          </button>
          <button
            id="tab-btn-extraction"
            className={`nav-btn ${activeTab === 'extraction' ? 'active' : ''}`}
            onClick={() => setActiveTab('extraction')}
          >
            📊 Lead Status & Sheet ({extractedRows.length} leads)
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="status-badge" id="api-status-badge">
            <span className="pulse-dot"></span>
            Real-time Sync Active
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-layout">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
              <div>Loading Clinic Dashboard...</div>
            </div>
          </div>
        ) : (
          <div className="content-body">
            {activeTab === 'chats' && (
              <ChatsView
                chats={chats}
                setChats={setChats}
                chatsPage={chatsPage}
                chatsTotalPages={chatsTotalPages}
                chatsTotalCount={chatsTotalCount}
                loadingChats={loadingChats}
                loadChatsPage={loadChatsPage}
                users={users}
                selectedUserGuid={selectedUserGuid}
                setSelectedUserGuid={setSelectedUserGuid}
                userExportMap={userExportMap}
                loadingExport={loadingExport}
                contacts={contacts}
                team={team}
                workspace={workspace}
                addToast={addToast}
                isPollingRef={isPollingRef}
                deepseekApiKey={deepseekApiKey}
                autoSyncEnabled={autoSyncEnabled}
                setExtractedRows={setExtractedRows}
              />
            )}

            {activeTab === 'extraction' && (
              <DataExtractionView
                chats={chats}
                contacts={contacts}
                deepseekApiKey={deepseekApiKey}
                extractedRows={extractedRows}
                setExtractedRows={setExtractedRows}
                autoSyncEnabled={autoSyncEnabled}
                setAutoSyncEnabled={setAutoSyncEnabled}
                addToast={addToast}
              />
            )}
          </div>
        )}
      </main>

      {/* Toast Overlay */}
      <div className="toast-container" id="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ====================================================
// CHATS & MESSAGES VIEW (Mobile Responsive Sticky Header + Smooth Touch Scrolling)
// ====================================================
function ChatsView({
  chats,
  setChats,
  chatsPage,
  chatsTotalPages,
  chatsTotalCount,
  loadingChats,
  loadChatsPage,
  users,
  selectedUserGuid,
  setSelectedUserGuid,
  userExportMap,
  loadingExport,
  contacts,
  team,
  workspace,
  addToast,
  isPollingRef,
  deepseekApiKey,
  autoSyncEnabled,
  setExtractedRows
}) {
  const [selectedChatGuid, setSelectedChatGuid] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [msgInput, setMsgInput] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [selectedSource, setSelectedSource] = useState('')
  const [globalSearching, setGlobalSearching] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  const extractedHistoryRef = useRef(new Map())

  // Modals
  const [showStartChatModal, setShowStartChatModal] = useState(false)
  const [editTitleObj, setEditTitleObj] = useState(null)
  const [deleteChatObj, setDeleteChatObj] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  // New Chat Form
  const [newChatChannel, setNewChatChannel] = useState('')
  const [newChatMessage, setNewChatMessage] = useState('')
  const [newChatPhone, setNewChatPhone] = useState('')

  const contactMap = useMemo(() => {
    const map = {}
    contacts.forEach(c => { map[c.guid] = c })
    return map
  }, [contacts])

  const teamMap = useMemo(() => {
    const map = {}
    team.forEach(t => { map[t.guid] = `${t.firstname} ${t.lastname}` })
    return map
  }, [team])

  const selectedUserObj = useMemo(() =>
    users.find(u => u.guid === selectedUserGuid),
    [users, selectedUserGuid]
  )

  const availableSources = useMemo(() => {
    const set = new Set(chats.map(c => c.source).filter(Boolean))
    const list = Array.from(set)
    if (!list.includes('whatsapp')) list.push('whatsapp')
    if (!list.includes('instagram')) list.push('instagram')
    if (!list.includes('facebook')) list.push('facebook')
    return list
  }, [chats])

  const activeChatsPool = useMemo(() => {
    if (!selectedUserGuid) return chats
    const exported = userExportMap[selectedUserGuid]
    if (exported && exported.length > 0) return exported
    return chats.filter(c =>
      c.started_by === selectedUserGuid ||
      c.assigned_to === selectedUserGuid
    )
  }, [selectedUserGuid, chats, userExportMap])

  const sortedChatsPool = useMemo(() => {
    return [...activeChatsPool].sort((a, b) => {
      const timeA = a.last_message_at || a.updated_at || a.created_at || 0
      const timeB = b.last_message_at || b.updated_at || b.created_at || 0
      return timeB - timeA
    })
  }, [activeChatsPool])

  const selectedChat = useMemo(() =>
    sortedChatsPool.find(c => c.guid === selectedChatGuid),
    [sortedChatsPool, selectedChatGuid]
  )

  const filteredChats = useMemo(() => {
    let list = sortedChatsPool
    if (selectedSource) {
      list = list.filter(c => (c.source || '').toLowerCase() === selectedSource.toLowerCase())
    }
    if (searchQ) {
      const s = searchQ.toLowerCase()
      list = list.filter(c => {
        const ct = c.contact ? contactMap[c.contact] : null
        return (c.title || '').toLowerCase().includes(s) ||
          (ct?.name || '').toLowerCase().includes(s) ||
          (ct?.phone || '').toLowerCase().includes(s) ||
          (c.source_id || '').toLowerCase().includes(s) ||
          (c.guid || '').toLowerCase().includes(s)
      })
    }
    return list
  }, [sortedChatsPool, selectedSource, searchQ, contactMap])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

  // AUTOMATIC REAL-TIME DEEPSEEK EXTRACTION TO SHEET WHEN NEW MESSAGE ARRIVES
  const triggerAutoSheetSync = useCallback(async (targetChatGuid, chatMsgs) => {
    const keyToUse = deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY
    if (!autoSyncEnabled || !keyToUse || !chatMsgs || !chatMsgs.length) return

    const lastMsg = chatMsgs[chatMsgs.length - 1]
    const cacheKey = `${targetChatGuid}_${lastMsg.id}_${chatMsgs.length}`

    if (extractedHistoryRef.current.has(cacheKey)) return
    extractedHistoryRef.current.set(cacheKey, true)

    const targetChat = chats.find(c => c.guid === targetChatGuid) || { guid: targetChatGuid }
    const ct = targetChat.contact ? contactMap[targetChat.contact] : null
    const chatTitle = targetChat.title || ct?.name || targetChat.source_id || targetChat.guid.slice(0, 8)
    const contactPhone = ct?.phone || targetChat.source_id || ''

    try {
      const storedColsStr = localStorage.getItem('CONFIGURED_SHEET_COLUMNS')
      const configuredCols = storedColsStr ? JSON.parse(storedColsStr) : []

      const res = await extractDataWithDeepSeek(keyToUse, chatMsgs, configuredCols)

      const newRow = {
        id: targetChatGuid,
        chat_title: chatTitle,
        phone: contactPhone,
        phone_number: contactPhone,
        timestamp: new Date().toLocaleString(),
        extracted_at: new Date().toLocaleString(),
        sentiment: res.sentiment,
        summary: res.summary,
        ...res.extractedData
      }

      setExtractedRows(prev => {
        const filtered = prev.filter(r => r.id !== targetChatGuid)
        return [newRow, ...filtered]
      })

      addToast(`⚡ Sheet Auto-Updated: Extracted new message from ${chatTitle}`, 'success')
    } catch (err) {
      console.warn('Auto-sync extraction error:', err.message)
    }
  }, [autoSyncEnabled, deepseekApiKey, chats, contactMap, setExtractedRows, addToast])

  // Load chat messages with SMART DIFFING & REAL-TIME AUTO-SYNC
  const loadMessages = useCallback(async (guid, silent = false) => {
    if (!guid) return
    if (!silent) setLoadingMessages(true)
    try {
      const list = await fetchChatMessages(guid, true)
      const uniqueMap = new Map()
      list.forEach(m => uniqueMap.set(m.id, m))
      const sortedMsgs = Array.from(uniqueMap.values()).sort((a, b) => (a.created_at || a.id) - (b.created_at || b.id))

      let isNewMessageDiscovered = false

      setMessages(prev => {
        if (prev.length === sortedMsgs.length) {
          const lastP = prev[prev.length - 1]
          const lastN = sortedMsgs[sortedMsgs.length - 1]
          if (lastP?.id === lastN?.id && lastP?.message === lastN?.message) {
            return prev
          }
        }
        isNewMessageDiscovered = true
        return sortedMsgs
      })

      if (isNewMessageDiscovered && sortedMsgs.length > 0) {
        triggerAutoSheetSync(guid, sortedMsgs)
      }
    } catch (e) {
      if (!silent) addToast(`Error loading chat messages: ${e.message}`, 'error')
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }, [addToast, triggerAutoSheetSync])

  useEffect(() => {
    if (selectedChatGuid) {
      loadMessages(selectedChatGuid, false)
    } else {
      setMessages([])
    }
  }, [selectedChatGuid, loadMessages])

  // 1-SECOND POLLING TIMER
  useEffect(() => {
    const timer = setInterval(async () => {
      if (isPollingRef.current || globalSearching) return
      isPollingRef.current = true
      try {
        await loadChatsPage(chatsPage, false, true)
        if (selectedChatGuid) {
          await loadMessages(selectedChatGuid, true)
        }
      } catch (_) {
      } finally {
        isPollingRef.current = false
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [chatsPage, selectedChatGuid, loadChatsPage, loadMessages, isPollingRef, globalSearching])

  // Global Search
  const handleGlobalSearch = async (queryToSearch) => {
    const query = (queryToSearch || searchQ).trim().toLowerCase()
    if (!query) return
    setGlobalSearching(true)
    addToast(`Searching all 13,800+ chats across pages for "${query}"...`, 'success')

    try {
      let page = 1
      let foundMatches = []
      let totalPagesFound = 1

      do {
        const res = await fetchAllChats(page, 100, false)
        totalPagesFound = res.pages || 1
        const pageItems = res.data || []

        for (const c of pageItems) {
          const ct = c.contact ? contactMap[c.contact] : null
          if (
            (c.source_id && c.source_id.toLowerCase().includes(query)) ||
            (c.title && c.title.toLowerCase().includes(query)) ||
            (c.guid && c.guid.toLowerCase().includes(query)) ||
            (ct?.phone && ct.phone.toLowerCase().includes(query)) ||
            (ct?.name && ct.name.toLowerCase().includes(query))
          ) {
            foundMatches.push(c)
          }
        }
        page++
      } while (page <= totalPagesFound && foundMatches.length < 20)

      if (foundMatches.length > 0) {
        setChats(prev => {
          const map = new Map()
          prev.forEach(item => map.set(item.guid, item))
          foundMatches.forEach(item => map.set(item.guid, item))
          return Array.from(map.values())
        })
        setSelectedChatGuid(foundMatches[0].guid)
        addToast(`Found ${foundMatches.length} matching conversation(s)!`, 'success')
      } else {
        addToast(`No chat found matching "${query}" across all pages.`, 'error')
      }
    } catch (err) {
      addToast(`Global search failed: ${err.message}`, 'error')
    } finally {
      setGlobalSearching(false)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!msgInput.trim() || !selectedChatGuid || sending) return
    setSending(true)
    try {
      const agentGuid = team[0]?.guid || undefined
      const sentMsg = await sendChatMessage(selectedChatGuid, {
        message: msgInput.trim(),
        agent: agentGuid
      })
      const updatedList = [...messages, sentMsg]
      setMessages(updatedList)
      setMsgInput('')
      addToast('Message sent!', 'success')
      triggerAutoSheetSync(selectedChatGuid, updatedList)
      loadChatsPage(chatsPage, false, true)
    } catch (err) {
      addToast(`Failed to send message: ${err.message}`, 'error')
    } finally {
      setSending(false)
    }
  }

  const handleStartChat = async (e) => {
    e.preventDefault()
    if (!newChatChannel || !newChatMessage) return
    try {
      const payload = {
        channel: newChatChannel,
        message: newChatMessage
      }
      if (newChatPhone) payload.phone = newChatPhone

      const created = await startNewChat(payload)
      addToast('Chat initiated!', 'success')
      setShowStartChatModal(false)
      loadChatsPage(1, false, false)
      if (created.thread_guid || created.guid) {
        setSelectedChatGuid(created.thread_guid || created.guid)
      }
    } catch (err) {
      addToast(`Start chat failed: ${err.message}`, 'error')
    }
  }

  const handleUpdateTitle = async (e) => {
    e.preventDefault()
    if (!editTitleObj) return
    try {
      const updated = await updateChatTitle(editTitleObj.guid, newTitle.trim() || null)
      setChats(prev => prev.map(c => c.guid === editTitleObj.guid ? { ...c, title: updated.title } : c))
      addToast('Chat title updated!', 'success')
      setEditTitleObj(null)
    } catch (err) {
      addToast(`Failed to update title: ${err.message}`, 'error')
    }
  }

  const handleDeleteChat = async () => {
    if (!deleteChatObj) return
    try {
      await deleteChat(deleteChatObj.guid)
      setChats(prev => prev.filter(c => c.guid !== deleteChatObj.guid))
      if (selectedChatGuid === deleteChatObj.guid) setSelectedChatGuid(null)
      addToast('Chat deleted!', 'success')
      setDeleteChatObj(null)
    } catch (err) {
      addToast(`Failed to delete chat: ${err.message}`, 'error')
    }
  }

  const getSourceBadgeInfo = (src) => {
    const s = (src || '').toLowerCase()
    if (s.includes('whatsapp')) return { label: 'WhatsApp', class: 'badge-whatsapp', icon: '💬' }
    if (s.includes('instagram')) return { label: 'Instagram', class: 'badge-instagram', icon: '📸' }
    if (s.includes('facebook')) return { label: 'Facebook', class: 'badge-facebook', icon: '📘' }
    return { label: src || 'Chat', class: 'badge-blue', icon: '🌐' }
  }

  return (
    <div className="chat-split-container" id="chats-section">
      {/* Threads Sidebar (Hidden on mobile when a chat is selected) */}
      <div className={`chat-threads-sidebar ${selectedChatGuid ? 'mobile-hidden' : ''}`}>
        <div className="chat-threads-header">
          {/* Channel Source Filter Dropdown Bar */}
          <div style={{ marginBottom: 10 }}>
            <label className="form-label" htmlFor="chat-source-filter-select" style={{ fontSize: 11 }}>
              Filter Chats by Channel Source:
            </label>
            <select
              id="chat-source-filter-select"
              className="form-control"
              style={{ fontSize: 13, padding: '6px 10px', background: '#0f172a', color: '#f8fafc', borderColor: selectedSource ? '#8b5cf6' : '#334155' }}
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
            >
              <option value="">🌐 All Channel Sources ({chats.length})</option>
              {availableSources.map(src => {
                const count = chats.filter(c => (c.source || '').toLowerCase() === src.toLowerCase()).length
                const icon = src === 'whatsapp' ? '🟢' : src === 'instagram' ? '📸' : src === 'facebook' ? '📘' : '💻'
                return (
                  <option key={src} value={src}>
                    {icon} {src.toUpperCase()} ({count})
                  </option>
                )
              })}
            </select>
          </div>

          {/* User Selector Dropdown Bar */}
          {users.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label className="form-label" htmlFor="chat-user-filter-select" style={{ fontSize: 11 }}>
                Filter Chats by Client / User:
              </label>
              <select
                id="chat-user-filter-select"
                className="form-control"
                style={{ fontSize: 13, padding: '6px 10px', background: '#0f172a', color: '#f8fafc', borderColor: selectedUserGuid ? '#6366f1' : '#334155' }}
                value={selectedUserGuid || ''}
                onChange={e => {
                  setSelectedUserGuid(e.target.value || null)
                  setSelectedChatGuid(null)
                }}
              >
                <option value="">All Agency Clients</option>
                {users.map(u => (
                  <option key={u.guid} value={u.guid}>
                    👤 {u.firstname} {u.lastname} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedUserObj && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.4)', padding: '6px 10px', borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <strong style={{ color: '#a5b4fc' }}>{selectedUserObj.firstname} {selectedUserObj.lastname}</strong>
              </div>
              <button
                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 14, cursor: 'pointer', marginLeft: 8 }}
                title="Reset User Filter"
                onClick={() => {
                  setSelectedUserGuid(null)
                  setSelectedChatGuid(null)
                }}
              >
                &times;
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Conversations ({filteredChats.length})</strong>
            <button className="btn btn-sm" id="btn-start-new-chat" onClick={() => {
              setNewChatChannel(workspace?.channels?.[0]?.guid || '')
              setNewChatMessage('')
              setNewChatPhone('')
              setShowStartChatModal(true)
            }}>+ New Chat</button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              id="input-search-chats"
              className="form-control"
              style={{ fontSize: 13, padding: '6px 12px' }}
              placeholder="Search phone or name..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && searchQ.trim()) {
                  handleGlobalSearch(searchQ.trim())
                }
              }}
            />
            {searchQ.trim().length > 0 && (
              <button
                className="btn btn-sm btn-deepseek"
                style={{ padding: '6px 10px', fontSize: 11, whiteSpace: 'nowrap' }}
                disabled={globalSearching}
                title="Search all 13,800+ chats across pages"
                onClick={() => handleGlobalSearch(searchQ.trim())}
              >
                {globalSearching ? 'Searching...' : '🔍 Search All'}
              </button>
            )}
          </div>

          {searchQ.trim().length > 0 && filteredChats.length === 0 && !globalSearching && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: 6, fontSize: 11, color: '#a5b4fc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Not on current page (Page {chatsPage})</span>
              <button
                style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
                onClick={() => handleGlobalSearch(searchQ.trim())}
              >
                Search All Pages &rarr;
              </button>
            </div>
          )}

          {/* Pagination Controls Bar */}
          {!selectedUserGuid && chatsTotalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid #334155', fontSize: 12 }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px', fontSize: 11 }}
                disabled={chatsPage <= 1 || loadingChats}
                onClick={() => loadChatsPage(chatsPage - 1, false, false)}
              >
                &larr; Prev
              </button>
              <span style={{ color: '#a5b4fc', fontSize: 11 }}>
                Page {chatsPage} of {chatsTotalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px', fontSize: 11 }}
                disabled={chatsPage >= chatsTotalPages || loadingChats}
                onClick={() => loadChatsPage(chatsPage + 1, false, false)}
              >
                Next &rarr;
              </button>
              <button
                className="btn btn-sm"
                style={{ padding: '4px 8px', fontSize: 11, background: '#8b5cf6' }}
                disabled={loadingChats}
                title="Fetch all 139 pages of chats"
                onClick={() => loadChatsPage(1, true, false)}
              >
                Fetch All
              </button>
            </div>
          )}
        </div>

        <div className="chat-thread-list" id="chat-threads-list">
          {(loadingExport || loadingChats || globalSearching) && (
            <div style={{ padding: 20, textAlign: 'center', color: '#a5b4fc', fontSize: 13 }}>
              {globalSearching ? 'Searching all 13,800+ chats across pages...' : 'Loading conversation threads...'}
            </div>
          )}
          {!loadingExport && !loadingChats && !globalSearching && filteredChats.map((c, idx) => {
            const ct = c.contact ? contactMap[c.contact] : null
            const displayTitle = c.title || ct?.name || (c.source_id ? c.source_id.split('@')[0] : c.guid.slice(0, 8))
            const timeStr = c.last_message_at_iso ? c.last_message_at_iso.split(',')[0] : (c.updated_at_iso ? c.updated_at_iso.split(',')[0] : '')
            const srcInfo = getSourceBadgeInfo(c.source)

            return (
              <div
                key={`chat-item-${c.guid}-${idx}`}
                id={`chat-item-${c.guid}`}
                className={`chat-thread-item ${selectedChatGuid === c.guid ? 'active' : ''}`}
                onClick={() => setSelectedChatGuid(c.guid)}
              >
                <div className="chat-thread-title">
                  <span>{displayTitle}</span>
                  <span className={`badge ${srcInfo.class}`} style={{ fontSize: 10 }}>
                    {srcInfo.icon} {srcInfo.label}
                  </span>
                </div>
                <div className="chat-thread-meta">
                  <span>{c.source_id ? c.source_id.split('@')[0] : timeStr}</span>
                  <span>&bull;</span>
                  <span>{c.is_closed ? 'Closed' : 'Open'}</span>
                </div>
              </div>
            )
          })}
          {!loadingExport && !loadingChats && !globalSearching && !filteredChats.length && (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No chat threads found {selectedSource ? `for source "${selectedSource}"` : 'on this page'}.
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-sm btn-deepseek" onClick={() => handleGlobalSearch(searchQ.trim() || selectedSource)}>
                  🔍 Search All 13,800+ Chats
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Conversation Panel (Sticky Header with Contact Name & Back Button) */}
      <div className={`chat-main-area ${!selectedChatGuid ? 'mobile-hidden' : ''}`} id="chat-active-panel">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Mobile & Desktop Sticky Back Button */}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 12px', fontSize: 13, background: '#334155', fontWeight: 600 }}
                  onClick={() => setSelectedChatGuid(null)}
                  title="Back to Conversations List"
                >
                  &larr; Back
                </button>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }} id="active-chat-title">
                      {selectedChat.title || (selectedChat.contact ? contactMap[selectedChat.contact]?.name : null) || selectedChat.source_id || selectedChat.guid}
                    </strong>
                    <span className={`badge ${getSourceBadgeInfo(selectedChat.source).class}`}>
                      {getSourceBadgeInfo(selectedChat.source).icon} {getSourceBadgeInfo(selectedChat.source).label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    Identifier: <code id="active-chat-guid" style={{ color: '#a5b4fc' }}>{selectedChat.source_id || selectedChat.guid}</code>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" id="btn-edit-chat-title" onClick={() => {
                  setEditTitleObj(selectedChat)
                  setNewTitle(selectedChat.title || '')
                }}>Title</button>
                <button className="btn btn-danger btn-sm" id="btn-delete-chat" onClick={() => setDeleteChatObj(selectedChat)}>Delete</button>
              </div>
            </div>

            <div className="chat-messages-area" id="chat-messages-list">
              {loadingMessages ? (
                <div style={{ margin: 'auto', color: '#94a3b8', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>🔄</div>
                  <div>Loading message history...</div>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isCustomerMessage = Boolean(m.from_contact || (selectedChat.contact && m.from_guid === selectedChat.contact))
                  const isOutgoing = !isCustomerMessage || m.from_agent || m.from_bot

                  const contactName = selectedChat.contact ? contactMap[selectedChat.contact]?.name : null
                  const agentName = teamMap[m.from_guid] || 'Refine Clinic Agent'

                  const senderName = isOutgoing ? agentName : (contactName || 'Customer')
                  return (
                    <div
                      key={`msg-${m.id}-${idx}`}
                      className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}
                    >
                      <div className="message-sender">{senderName}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
                      <div className="message-meta">
                        {m.created_at_iso || (m.created_at ? new Date(m.created_at * 1000).toLocaleString() : '')}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
              {!loadingMessages && !messages.length && (
                <div style={{ margin: 'auto', color: '#94a3b8', fontSize: 13 }}>No messages in this chat yet</div>
              )}
            </div>

            <form className="chat-input-bar" id="send-msg-form" onSubmit={handleSendMessage}>
              <input
                id="input-chat-message"
                className="form-control"
                placeholder="Type a message to send via API..."
                value={msgInput}
                onChange={e => setMsgInput(e.target.value)}
              />
              <button className="btn" id="btn-send-message" type="submit" disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
            </form>
          </>
        ) : (
          <div style={{ margin: 'auto', color: '#94a3b8', textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div>Select a conversation thread on the left to inspect messages or send replies</div>
          </div>
        )}
      </div>

      {/* Start Chat Modal */}
      {showStartChatModal && (
        <div className="modal-overlay" id="start-chat-modal">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">POST /chat — Start New Chat</div>
              <button className="modal-close" id="close-start-chat-modal" onClick={() => setShowStartChatModal(false)}>&times;</button>
            </div>
            <form onSubmit={handleStartChat} id="start-chat-form">
              <div className="form-group">
                <label className="form-label" htmlFor="new-chat-channel-select">Channel *</label>
                <select id="new-chat-channel-select" name="channel" className="form-control" required value={newChatChannel} onChange={e => setNewChatChannel(e.target.value)}>
                  {(workspace?.channels || []).map(ch => (
                    <option key={ch.guid} value={ch.guid}>{ch.name} ({ch.class_name})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="new-chat-message-text">Initial Message *</label>
                <textarea id="new-chat-message-text" name="message" className="form-control" rows={3} required value={newChatMessage} onChange={e => setNewChatMessage(e.target.value)} placeholder="Hello! How can I help you today?" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="new-chat-phone-input">Phone Number (WhatsApp only)</label>
                <input id="new-chat-phone-input" name="phone" className="form-control" value={newChatPhone} onChange={e => setNewChatPhone(e.target.value)} placeholder="e.g. +919648165493 or 9648165493" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" id="btn-cancel-start-chat" onClick={() => setShowStartChatModal(false)}>Cancel</button>
                <button type="submit" className="btn" id="btn-submit-start-chat">Start Chat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Title Modal */}
      {editTitleObj && (
        <div className="modal-overlay" id="edit-title-modal">
          <div className="modal-content" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">PUT /chat/&#123;chatID&#125; — Update Title</div>
              <button className="modal-close" id="close-edit-title-modal" onClick={() => setEditTitleObj(null)}>&times;</button>
            </div>
            <form onSubmit={handleUpdateTitle} id="edit-title-form">
              <div className="form-group">
                <label className="form-label" htmlFor="input-edit-chat-title">Chat Title</label>
                <input id="input-edit-chat-title" name="title" className="form-control" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Leave blank to reset to Contact name" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" id="btn-cancel-edit-title" onClick={() => setEditTitleObj(null)}>Cancel</button>
                <button type="submit" className="btn" id="btn-submit-edit-title">Save Title</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Chat Confirmation */}
      {deleteChatObj && (
        <div className="modal-overlay" id="delete-chat-modal">
          <div className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">DELETE /chat/&#123;chatID&#125;</div>
              <button className="modal-close" id="close-delete-chat-modal" onClick={() => setDeleteChatObj(null)}>&times;</button>
            </div>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>
              Are you sure you want to delete this chat thread? This will remove all associated messages.
            </p>
            <div className="modal-footer">
              <button className="btn btn-secondary" id="btn-cancel-delete-chat" onClick={() => setDeleteChatObj(null)}>Cancel</button>
              <button className="btn btn-danger" id="btn-submit-delete-chat" onClick={handleDeleteChat}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====================================================
// DATA EXTRACTION VIEW (Lead Status & Sheet)
// ====================================================
function DataExtractionView({
  chats,
  contacts,
  deepseekApiKey,
  extractedRows,
  setExtractedRows,
  autoSyncEnabled,
  setAutoSyncEnabled,
  addToast
}) {
  const [sheetUrl, setSheetUrl] = useState(localStorage.getItem('GOOGLE_SHEET_URL') || '')
  const [fetchingSheet, setFetchingSheet] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // System Locked Fields (ALWAYS forced to be Column #1 and Column #2 at the START of the sheet)
  const lockedPhoneCol = { key: 'phone', header: 'Phone Number', prompt: "Sender Phone Number or WhatsApp JID (Auto-Recorded)", isLocked: true }
  const lockedTimestampCol = { key: 'timestamp', header: 'Last Updated', prompt: "Auto-recorded timestamp when data was extracted", isLocked: true }

  const [sheetColumns, setSheetColumns] = useState(() => {
    try {
      const saved = localStorage.getItem('CONFIGURED_SHEET_COLUMNS')
      if (saved) {
        const parsed = JSON.parse(saved)
        const clean = parsed.filter(c => c.key !== 'phone' && c.key !== 'timestamp' && !c.header.toLowerCase().includes('phone') && !c.header.toLowerCase().includes('timestamp') && !c.header.toLowerCase().includes('last updated'))
        return [lockedPhoneCol, lockedTimestampCol, ...clean]
      }
    } catch (_) {}
    return [
      lockedPhoneCol,
      lockedTimestampCol,
      { key: 'name', header: 'Name', prompt: "The customer's self-declared name or full name", isLocked: false },
      { key: 'email', header: 'Email', prompt: "Customer's email address if mentioned", isLocked: false },
      { key: 'requirement', header: 'Requirement', prompt: "Primary service, product, or treatment requested", isLocked: false },
      { key: 'budget', header: 'Budget', prompt: "Budget, pricing, or financial details mentioned", isLocked: false },
      { key: 'lead_status', header: 'Lead Status', prompt: "Qualified, Interested, Hot, Warm, Cold", isLocked: false },
      { key: 'summary', header: 'Summary', prompt: "Short 1-sentence summary of the conversation", isLocked: false }
    ]
  })

  // Save configured columns to localStorage
  useEffect(() => {
    localStorage.setItem('CONFIGURED_SHEET_COLUMNS', JSON.stringify(sheetColumns))
  }, [sheetColumns])

  // Fetch columns automatically from Google Sheet URL — ALWAYS PREPENDS LOCKED SYSTEM FIELDS AT THE START
  const handleFetchSheetColumns = async (e) => {
    e.preventDefault()
    if (!sheetUrl.trim()) {
      addToast('Please enter a Google Sheet URL first.', 'error')
      return
    }
    setFetchingSheet(true)
    try {
      const fetchedCols = await fetchColumnsFromGoogleSheet(sheetUrl.trim())

      const cleanFetched = fetchedCols.filter(c =>
        c.key !== 'phone' &&
        c.key !== 'timestamp' &&
        !c.header.toLowerCase().includes('phone') &&
        !c.header.toLowerCase().includes('timestamp') &&
        !c.header.toLowerCase().includes('last updated')
      )

      const cols = [lockedPhoneCol, lockedTimestampCol, ...cleanFetched]

      setSheetColumns(cols)
      localStorage.setItem('GOOGLE_SHEET_URL', sheetUrl.trim())
      addToast(`Fetched ${cols.length} columns from Google Sheet with Locked System Fields at the start!`, 'success')
    } catch (err) {
      addToast(`Sheet fetch failed: ${err.message}`, 'error')
    } finally {
      setFetchingSheet(false)
    }
  }

  const handleUpdateColumnPrompt = (index, newPrompt) => {
    setSheetColumns(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], prompt: newPrompt }
      return updated
    })
  }

  const handleAddColumn = () => {
    const headerName = prompt('Enter new column header name (e.g. "Location" or "Insurance"):')
    if (!headerName || !headerName.trim()) return
    const keyName = headerName.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
    const customPrompt = prompt(`Enter DeepSeek extraction prompt for column "${headerName}":`, `Extract ${headerName} from conversation history`) || `Extract ${headerName}`

    setSheetColumns(prev => [
      ...prev,
      { key: keyName, header: headerName.trim(), prompt: customPrompt, isLocked: false }
    ])
    addToast(`Added column "${headerName}"!`, 'success')
  }

  const handleRemoveColumn = (index) => {
    const target = sheetColumns[index]
    if (target && target.isLocked) {
      addToast(`"${target.header}" is a locked system field at the start of the sheet and cannot be deleted.`, 'error')
      return
    }
    setSheetColumns(prev => prev.filter((_, i) => i !== index))
  }

  // Display Columns: FORCED ORDER — Column 1: Phone Number (Locked), Column 2: Last Updated (Locked), Column 3: Chat Title, Column 4: Sentiment
  const displayColumns = useMemo(() => {
    const fixedStart = ['phone', 'timestamp', 'chat_title', 'sentiment']

    const configuredHeaders = sheetColumns
      .map(c => c.header || c.key)
      .filter(h => {
        const l = h.toLowerCase()
        return l !== 'phone' && l !== 'timestamp' && l !== 'phone number' && l !== 'last updated' && l !== 'chat_title' && l !== 'sentiment'
      })

    const dynamicSet = new Set(configuredHeaders)

    extractedRows.forEach(row => {
      Object.keys(row).forEach(k => {
        if (k !== 'id' && !fixedStart.includes(k)) {
          dynamicSet.add(k)
        }
      })
    })

    return [...fixedStart, ...Array.from(dynamicSet)]
  }, [sheetColumns, extractedRows])

  const filteredRows = useMemo(() => {
    if (!searchQ) return extractedRows
    const s = searchQ.toLowerCase()
    return extractedRows.filter(r =>
      Object.values(r).some(val => String(val || '').toLowerCase().includes(s))
    )
  }, [extractedRows, searchQ])

  const exportCSV = () => {
    if (!extractedRows.length) return
    const headers = displayColumns.join(',')
    const rows = extractedRows.map(r =>
      displayColumns.map(col => {
        const val = String(r[col] || '').replace(/"/g, '""')
        return `"${val}"`
      }).join(',')
    )
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `RefineClinic_Leads_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    addToast('CSV Sheet downloaded!', 'success')
  }

  const exportJSON = () => {
    if (!extractedRows.length) return
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(extractedRows, null, 2))
    const link = document.createElement('a')
    link.setAttribute('href', dataStr)
    link.setAttribute('download', `RefineClinic_Leads_${Date.now()}.json`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    addToast('JSON Sheet exported!', 'success')
  }

  return (
    <div id="data-extraction-section">
      {/* Live Auto-Sync Status & Google Sheet Link Bar */}
      <div className="extraction-config-card" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderColor: autoSyncEnabled ? '#10b981' : '#334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚡</span>
            <div>
              <strong style={{ fontSize: 16, color: '#f8fafc' }}>Refine Clinic Real-Time Lead Auto-Sync Engine</strong>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Automatically parses patient inquiries & lead statuses into your sheet as WhatsApp messages arrive
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className={`btn ${autoSyncEnabled ? 'btn-deepseek' : 'btn-secondary'}`}
              onClick={() => {
                setAutoSyncEnabled(!autoSyncEnabled)
                addToast(autoSyncEnabled ? 'Auto-Sync Paused' : 'Auto-Sync Enabled!', 'success')
              }}
            >
              {autoSyncEnabled ? '⚡ Auto-Sync Active' : '⏸️ Auto-Sync Paused'}
            </button>
          </div>
        </div>
      </div>

      {/* Google Sheet Link Sync Bar */}
      <div className="extraction-config-card">
        <form onSubmit={handleFetchSheetColumns} className="extraction-toolbar">
          <div className="key-input-wrapper">
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <strong style={{ fontSize: 14 }}>Google Sheet Link</strong>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Fetch column structure from your sheet (Locked fields automatically placed at start)</div>
            </div>
            <input
              type="url"
              className="form-control"
              style={{ width: 360, marginLeft: 12, fontSize: 13 }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-secondary" disabled={fetchingSheet}>
              {fetchingSheet ? 'Fetching...' : '📋 Fetch Columns'}
            </button>
          </div>
          <span style={{ fontSize: 12, color: '#a5b4fc' }}>{sheetColumns.length} Active Columns</span>
        </form>
      </div>

      {/* Column Prompt Matrix Configurator */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">⚙️ Configure Extraction Prompts per Column</div>
            <div className="card-subtitle">Locked System Fields (Phone Number & Last Updated) are always fixed at the START of the sheet</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleAddColumn}>+ Add Custom Column</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
          {sheetColumns.map((col, idx) => (
            <div
              key={`${col.key}-${idx}`}
              style={{
                background: col.isLocked ? '#0b141a' : '#0f172a',
                padding: 14,
                borderRadius: 10,
                border: col.isLocked ? '1px solid #10b981' : '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: col.isLocked ? '#34d399' : '#a5b4fc', fontSize: 13 }}>
                  {col.isLocked ? `🔒 Column #${idx + 1}` : `📌 Column #${idx + 1}`}: {col.header || col.key}
                </strong>
                {col.isLocked ? (
                  <span className="badge badge-green" style={{ fontSize: 10 }}>🔒 System Field at Start</span>
                ) : (
                  <button
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                    title="Remove Column"
                    onClick={() => handleRemoveColumn(idx)}
                  >
                    &times;
                  </button>
                )}
              </div>
              <label className="form-label" style={{ fontSize: 10, margin: 0 }}>
                {col.isLocked ? 'System Locked Instruction:' : 'DeepSeek Extraction Prompt:'}
              </label>
              <input
                className="form-control"
                style={{ fontSize: 12, padding: '6px 10px', background: '#1e293b', opacity: col.isLocked ? 0.8 : 1 }}
                disabled={col.isLocked}
                value={col.prompt || ''}
                onChange={e => handleUpdateColumnPrompt(idx, e.target.value)}
                placeholder={`Prompt instruction for ${col.header || col.key}...`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Live Auto-Populated Sheet Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">📊 Live Clinic Lead Status Sheet ({extractedRows.length} Leads)</div>
            <div className="card-subtitle">Real-time patient lead streaming automatically as incoming & outgoing WhatsApp messages are received</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportCSV} disabled={!extractedRows.length}>📥 Download CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={exportJSON} disabled={!extractedRows.length}>📄 Export JSON</button>
            <button className="btn btn-danger btn-sm" onClick={() => setExtractedRows([])} disabled={!extractedRows.length}>🗑️ Clear Sheet</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <input
            className="search-input"
            style={{ width: 280 }}
            placeholder="Search leads sheet..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Active Sheet Columns ({displayColumns.length}): <span style={{ color: '#a5b4fc' }}>{displayColumns.join(', ')}</span>
          </div>
        </div>

        <div className="data-table-wrap">
          <table className="data-table" id="extracted-sheet-table">
            <thead>
              <tr>
                <th style={{ minWidth: 40 }}>#</th>
                {displayColumns.map(col => (
                  <th key={col} style={{ textTransform: 'capitalize' }}>
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr key={row.id || idx}>
                  <td><span style={{ color: '#94a3b8', fontSize: 11 }}>{idx + 1}</span></td>
                  {displayColumns.map(col => {
                    const val = row[col] || row[col.toLowerCase()] || row[col.replace(/_/g, ' ').toLowerCase()]
                    if (col === 'sentiment') {
                      const colorClass = val === 'positive' ? 'badge-green' : val === 'negative' ? 'badge-gray' : 'badge-blue'
                      return <td key={col}><span className={`badge ${colorClass}`}>{val || 'neutral'}</span></td>
                    }
                    return <td key={col}>{val !== undefined && val !== null ? String(val) : '-'}</td>
                  })}
                </tr>
              ))}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={displayColumns.length + 1} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Waiting for patient messages to arrive...</div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#64748b' }}>
                      Real-time Auto-Sync is active. As soon as a patient message is received or sent, lead details will automatically populate here!
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
