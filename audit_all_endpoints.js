const KEY = 'gCUkMOG-Dw_vkQzte_YUcokcdlxV7_aMTOEl3ZshEduvwEDzYtHDQCJVR9aiUV1G'
const BASE = 'https://api.anychat.one/public/v1'

async function req(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' }
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(BASE + endpoint, opts)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (_) {}
  return { status: res.status, ok: res.ok, text, json }
}

async function audit() {
  console.log('=== ANYCHAT REST API EXHAUSTIVE AUDIT ===\n')
  let passed = 0
  let total = 0

  function check(name, condition, details = '') {
    total++
    if (condition) {
      passed++
      console.log(`[PASS] ${name} ${details}`)
    } else {
      console.log(`[FAIL] ${name} ${details}`)
    }
  }

  // 1. Workspace
  const ws = await req('/workspace')
  check('GET /workspace', ws.status === 200 && ws.json?.guid, `GUID: ${ws.json?.guid || 'none'}`)

  const wsMe = await req('/workspace/me')
  check('GET /workspace/me', wsMe.status === 200 && wsMe.json?.email, `Owner: ${wsMe.json?.email || 'none'}`)

  // 2. Team
  const team = await req('/team')
  check('GET /team', team.status === 200 && Array.isArray(team.json?.data), `Count: ${team.json?.data?.length || 0}`)
  const agentGuid = team.json?.data?.[0]?.guid || wsMe.json?.guid

  // 3. User Endpoints
  const users = await req('/user')
  check('GET /user', users.status === 200 && Array.isArray(users.json?.data), `Count: ${users.json?.data?.length || 0}`)

  const userSearch = await req('/user/search?email=brandingpioneers@gmail.com')
  check('GET /user/search', userSearch.status === 200, `Results: ${userSearch.json?.data?.length || 0}`)

  // Create temporary test user
  const newClient = await req('/user', 'POST', {
    firstname: 'AuditTemp',
    lastname: 'TestUser',
    email: `audit_temp_${Date.now()}@example.com`,
    plan: 'free'
  })
  const createdUserGuid = newClient.json?.data?.guid || newClient.json?.guid
  check('POST /user (Create)', newClient.status === 200 && createdUserGuid, `Created GUID: ${createdUserGuid || 'none'}`)

  if (createdUserGuid) {
    const userDetail = await req(`/user/${createdUserGuid}`)
    check('GET /user/{userID}', userDetail.status === 200, `Email: ${userDetail.json?.email || 'none'}`)

    const userUpdate = await req(`/user/${createdUserGuid}`, 'PUT', { firstname: 'AuditUpdated' })
    check('PUT /user/{userID}', userUpdate.status === 200, `Updated Name: ${userUpdate.json?.data?.firstname || 'none'}`)

    const userDelete = await req(`/user/${createdUserGuid}`, 'DELETE')
    check('DELETE /user/{userID}', userDelete.status === 200, `Removed: ${userDelete.json?.removed || true}`)
  }

  // 4. Contact Endpoints
  const contacts = await req('/contact')
  check('GET /contact', contacts.status === 200 && Array.isArray(contacts.json?.data), `Count: ${contacts.json?.data?.length || 0}`)

  const contactSearch = await req('/contact/search?email=test@example.com')
  check('GET /contact/search', contactSearch.status === 200, `Status: ${contactSearch.status}`)

  const newContact = await req('/contact', 'POST', {
    name: 'Audit Temp Contact',
    email: `audit_contact_${Date.now()}@example.com`,
    phone: '+18005550199'
  })
  const createdContactGuid = newContact.json?.guid
  check('POST /contact (Create)', newContact.status === 200 && createdContactGuid, `Created GUID: ${createdContactGuid || 'none'}`)

  if (createdContactGuid) {
    const contactDetail = await req(`/contact/${createdContactGuid}`)
    check('GET /contact/{contactID}', contactDetail.status === 200, `Name: ${contactDetail.json?.name || 'none'}`)

    const contactUpdate = await req(`/contact/${createdContactGuid}`, 'PUT', { company: 'Audit Company Ltd' })
    check('PUT /contact/{contactID}', contactUpdate.status === 200, `Company: ${contactUpdate.json?.company || 'none'}`)

    const contactDelete = await req(`/contact/${createdContactGuid}`, 'DELETE')
    check('DELETE /contact/{contactID}', contactDelete.status === 200, `Status: ${contactDelete.status}`)
  }

  // 5. Chat Endpoints
  const chats = await req('/chat')
  check('GET /chat', chats.status === 200 && Array.isArray(chats.json?.data), `Count: ${chats.json?.data?.length || 0}`)

  const firstChatGuid = chats.json?.data?.[0]?.guid
  if (firstChatGuid) {
    const chatDetail = await req(`/chat/${firstChatGuid}`)
    check('GET /chat/{chatID}', chatDetail.status === 200, `GUID: ${firstChatGuid}`)

    const chatMsgs = await req(`/chat/${firstChatGuid}/message`)
    check('GET /chat/{chatID}/message', chatMsgs.status === 200 && Array.isArray(chatMsgs.json?.data), `Msgs: ${chatMsgs.json?.data?.length || 0}`)

    const firstMsgId = chatMsgs.json?.data?.[0]?.id
    if (firstMsgId) {
      const msgDetail = await req(`/chat/${firstChatGuid}/message/${firstMsgId}`)
      check('GET /chat/{chatID}/message/{messageID}', msgDetail.status === 200, `Msg ID: ${firstMsgId}`)
    }

    const sendMsg = await req(`/chat/${firstChatGuid}/message`, 'POST', {
      message: 'Automated REST API Audit test message',
      agent: agentGuid
    })
    check('POST /chat/{chatID}/message', sendMsg.status === 200, `Sent ID: ${sendMsg.json?.id || 'none'}`)
  }

  console.log(`\n=== AUDIT SUMMARY: ${passed}/${total} ENDPOINTS VERIFIED & WORKING ===\n`)
}

audit()
