const PROXY = '/api/proxy'
const KEY = import.meta.env.VITE_API_KEY || 'aORIThWI-WFaXiCOZLy_a-GnK3CWnwTOaupHyhbSW-9ONUIud-DXhBNCrCdEVeOa'

async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${PROXY}${endpoint}`
  const options = {
    method,
    headers: {
      'x-api-key': KEY,
      'Content-Type': 'application/json'
    }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  if (!res.ok) {
    let errMsg = `HTTP ${res.status} ${res.statusText}`
    try {
      const errJson = await res.json()
      if (errJson.errors) {
        errMsg = typeof errJson.errors === 'string' ? errJson.errors : JSON.stringify(errJson.errors)
      } else if (errJson.message) {
        errMsg = errJson.message
      }
    } catch (_) {}
    throw new Error(errMsg)
  }

  // 204 No Content or empty responses
  const text = await res.text()
  if (!text) return { success: true }
  try {
    const data = JSON.parse(text)
    return data
  } catch (_) {
    return text
  }
}

function cleanObject(o) {
  if (!o || typeof o !== 'object') return o
  if (o.created_at && typeof o.created_at === 'number') {
    o.created_at_iso = new Date(o.created_at * 1000).toLocaleString()
  }
  if (o.updated_at && typeof o.updated_at === 'number') {
    o.updated_at_iso = new Date(o.updated_at * 1000).toLocaleString()
  }
  if (o.last_message_at && typeof o.last_message_at === 'number') {
    o.last_message_at_iso = new Date(o.last_message_at * 1000).toLocaleString()
  }
  return o
}

// Generic paginated fetcher across all pages
async function fetchAllPages(baseEndpoint, maxPages = 50) {
  let page = 1
  let allItems = []
  let totalPages = 1

  do {
    const sep = baseEndpoint.includes('?') ? '&' : '?'
    const res = await apiRequest(`${baseEndpoint}${sep}page=${page}&limit=100`)
    const items = res.data || res || []
    if (Array.isArray(items)) {
      allItems.push(...items)
    }
    totalPages = res.pages || 1
    page++
  } while (page <= totalPages && page <= maxPages)

  return allItems.map(cleanObject)
}

// ----------------------------------------------------
// WORKSPACE ENDPOINTS
// ----------------------------------------------------
export async function fetchWorkspace() {
  const data = await apiRequest('/workspace')
  return cleanObject(data)
}

export async function fetchWorkspaceMe() {
  const data = await apiRequest('/workspace/me')
  return cleanObject(data)
}

// ----------------------------------------------------
// TEAM ENDPOINTS
// ----------------------------------------------------
export async function fetchTeamMembers() {
  const res = await apiRequest('/team')
  const list = res.data || res || []
  return Array.isArray(list) ? list.map(cleanObject) : []
}

export async function fetchTeamMember(memberID) {
  try {
    const data = await apiRequest(`/team/${memberID}`)
    if (data && data.guid) return cleanObject(data)
  } catch (_) {}
  const members = await fetchTeamMembers()
  const found = members.find(m => m.guid === memberID)
  if (!found) throw new Error(`Team member ${memberID} not found`)
  return found
}

// ----------------------------------------------------
// USER ENDPOINTS (AGENCY CLIENTS)
// ----------------------------------------------------
export async function fetchAllUsers(page = 1, limit = 100, fetchAll = true) {
  if (fetchAll) {
    return fetchAllPages('/user')
  }
  const res = await apiRequest(`/user?page=${page}&limit=${limit}`)
  const list = res.data || res || []
  return {
    data: Array.isArray(list) ? list.map(cleanObject) : [],
    page: res.page || 1,
    pages: res.pages || 1,
    total: res.total || (Array.isArray(list) ? list.length : 0)
  }
}

export async function fetchUser(userID) {
  const res = await apiRequest(`/user/${userID}`)
  const user = res.data || res
  return cleanObject(user)
}

export async function searchUsers(email) {
  const res = await apiRequest(`/user/search?email=${encodeURIComponent(email)}`)
  const list = res.data || res || []
  return Array.isArray(list) ? list.map(cleanObject) : []
}

export async function createUser(userData) {
  const payload = {
    email: userData.email,
    firstname: userData.firstname,
    lastname: userData.lastname
  }
  if (userData.password) payload.password = userData.password
  if (userData.plan) payload.plan = userData.plan

  const res = await apiRequest('/user', 'POST', payload)
  return cleanObject(res.data || res)
}

export async function updateUser(userID, userData) {
  const res = await apiRequest(`/user/${userID}`, 'PUT', userData)
  return cleanObject(res.data || res)
}

export async function deleteUser(userID) {
  return await apiRequest(`/user/${userID}`, 'DELETE')
}

// ----------------------------------------------------
// CONTACT ENDPOINTS
// ----------------------------------------------------
export async function fetchAllContacts(page = 1, limit = 100, fetchAll = true) {
  if (fetchAll) {
    return fetchAllPages('/contact')
  }
  const res = await apiRequest(`/contact?page=${page}&limit=${limit}`)
  const list = res.data || res || []
  return {
    data: Array.isArray(list) ? list.map(cleanObject) : [],
    page: res.page || 1,
    pages: res.pages || 1,
    total: res.total || (Array.isArray(list) ? list.length : 0)
  }
}

export async function fetchContact(contactID) {
  const res = await apiRequest(`/contact/${contactID}`)
  return cleanObject(res.data || res)
}

export async function searchContacts(email) {
  const res = await apiRequest(`/contact/search?email=${encodeURIComponent(email)}`)
  const list = res.data || res || []
  return Array.isArray(list) ? list.map(cleanObject) : []
}

export async function createContact(contactData) {
  const res = await apiRequest('/contact', 'POST', contactData)
  return cleanObject(res.data || res)
}

export async function updateContact(contactID, contactData) {
  const res = await apiRequest(`/contact/${contactID}`, 'PUT', contactData)
  return cleanObject(res.data || res)
}

export async function deleteContact(contactID) {
  return await apiRequest(`/contact/${contactID}`, 'DELETE')
}

// ----------------------------------------------------
// CHAT ENDPOINTS
// ----------------------------------------------------
export async function fetchAllChats(page = 1, limit = 100, fetchAll = false) {
  if (fetchAll) {
    return fetchAllPages('/chat')
  }
  const res = await apiRequest(`/chat?page=${page}&limit=${limit}`)
  const list = res.data || res || []
  return {
    data: Array.isArray(list) ? list.map(cleanObject) : [],
    page: res.page || 1,
    pages: res.pages || 1,
    total: res.total || (Array.isArray(list) ? list.length : 0)
  }
}

export async function fetchChat(chatID) {
  const res = await apiRequest(`/chat/${chatID}`)
  return cleanObject(res.data || res)
}

// Auto-paginate through all message pages for a chat thread
export async function fetchChatMessages(chatID, fetchAll = true) {
  if (fetchAll) {
    return fetchAllPages(`/chat/${chatID}/message`)
  }
  const res = await apiRequest(`/chat/${chatID}/message?limit=100`)
  const list = res.data || res || []
  return Array.isArray(list) ? list.map(cleanObject) : []
}

export async function fetchChatMessage(chatID, messageID) {
  const res = await apiRequest(`/chat/${chatID}/message/${messageID}`)
  return cleanObject(res.data || res)
}

export async function startNewChat(chatData) {
  const res = await apiRequest('/chat', 'POST', chatData)
  return cleanObject(res.data || res)
}

export async function sendChatMessage(chatID, messageData) {
  const res = await apiRequest(`/chat/${chatID}/message`, 'POST', messageData)
  return cleanObject(res.data || res)
}

export async function updateChatTitle(chatID, title) {
  const res = await apiRequest(`/chat/${chatID}`, 'PUT', { title })
  return cleanObject(res.data || res)
}

export async function deleteChat(chatID) {
  return await apiRequest(`/chat/${chatID}`, 'DELETE')
}

export async function fetchUserChatsExport(userGuid) {
  const body = {
    workspace: userGuid,
    dateFrom: '2020-01-01',
    dateTo: '2026-12-31'
  }
  const res = await apiRequest('/chat/export', 'POST', body)
  if (!res.url) throw new Error('No export URL returned')
  const proxyUrl = res.url.replace('https://api.anychat.one/storage', '/api/storage')
  const dataRes = await fetch(proxyUrl)
  if (!dataRes.ok) throw new Error(`Export data HTTP ${dataRes.status}`)
  const data = await dataRes.json()
  return (data.threads || []).map(cleanObject)
}
