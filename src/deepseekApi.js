const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

export async function extractDataWithDeepSeek(apiKey, chatMessages, columnsWithPrompts = []) {
  const effectiveKey = (apiKey && apiKey.trim()) || import.meta.env.VITE_DEEPSEEK_API_KEY || localStorage.getItem('DEEPSEEK_API_KEY') || ''

  if (!effectiveKey || !effectiveKey.trim()) {
    throw new Error('DeepSeek API Key is missing. Please set VITE_DEEPSEEK_API_KEY in your .env file.')
  }

  // Build dynamic schema description based on user's sheet columns & custom prompts
  const defaultSchema = [
    { key: 'name', header: 'Name', prompt: "The customer's self-declared name or full name" },
    { key: 'email', header: 'Email', prompt: "Customer's email address if mentioned" },
    { key: 'phone', header: 'Phone Number', prompt: "Customer's phone number or contact number" },
    { key: 'company', header: 'Company', prompt: "Customer's company or organization name" },
    { key: 'location', header: 'Location', prompt: "City, state, or country mentioned by customer" },
    { key: 'requirement', header: 'Requirement', prompt: "Primary service, product, or inquiry requested by customer" },
    { key: 'budget', header: 'Budget', prompt: "Budget, pricing, or financial details mentioned" },
    { key: 'lead_status', header: 'Lead Status', prompt: "Qualified, Interested, Hot, Warm, Cold, or Spam based on conversation" },
    { key: 'summary', header: 'Summary', prompt: "Short 1-sentence summary of the conversation" },
    { key: 'next_action', header: 'Next Action', prompt: "Recommended follow-up action for sales agent" }
  ]

  const activeSchema = (columnsWithPrompts && columnsWithPrompts.length > 0) ? columnsWithPrompts : defaultSchema
  const schemaDescription = activeSchema.map(s => {
    const keyName = (s.key || s.header || '').trim()
    const promptText = (s.prompt || s.description || `Extract value for ${keyName}`).trim()
    return `"${keyName}": ${promptText}`
  }).join('\n')

  // Format message history into transcript
  const transcript = chatMessages.map(m => {
    const sender = m.from_agent ? 'Agent' : m.from_bot ? 'Bot' : 'Customer'
    return `[${sender}]: ${m.message}`
  }).join('\n')

  const systemPrompt = `You are an intelligent AI Data Extraction Engine for CRM software. Analyze the conversation history below and extract structured information matching the user's target sheet columns.

ROLES:
- 'Customer': The lead/prospect. Extract data about THIS person.
- 'Agent' / 'Bot': The business representative.

TARGET SHEET COLUMNS & EXTRACTION PROMPTS:
${schemaDescription}

CRITICAL INSTRUCTIONS:
1. Examine the ENTIRE conversation history carefully.
2. For each field listed above, follow its specific extraction prompt instruction.
3. If a value is present in the conversation, extract it cleanly and accurately.
4. If a value is NOT mentioned in the conversation, set its value to null or empty string.
5. For 'sentiment': classify as "positive", "neutral", or "negative".
6. Output MUST be strictly valid JSON matching the format below.

EXPECTED JSON OUTPUT FORMAT:
{
  "sentiment": "positive|neutral|negative",
  "summary": "Short 1-sentence summary",
  "extractedData": {
    <key_matching_each_target_column>: "extracted_value"
  }
}`

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${effectiveKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `CONVERSATION TRANSCRIPT:\n${transcript}` }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })
  })

  if (!response.ok) {
    let errText = `HTTP ${response.status} ${response.statusText}`
    try {
      const errJson = await response.json()
      if (errJson.error && errJson.error.message) errText = errJson.error.message
    } catch (_) {}
    throw new Error(`DeepSeek API Error: ${errText}`)
  }

  const resJson = await response.json()
  const rawContent = resJson.choices?.[0]?.message?.content || '{}'

  let parsed = {}
  try {
    parsed = JSON.parse(rawContent)
  } catch (e) {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    }
  }

  const extractedData = parsed.extractedData || parsed || {}
  const sentiment = parsed.sentiment || 'neutral'
  const summary = parsed.summary || extractedData.summary || 'No summary available'

  return {
    sentiment,
    summary,
    extractedData
  }
}

// Utility to parse Google Sheet URL and fetch column headers
export async function fetchColumnsFromGoogleSheet(sheetUrl) {
  if (!sheetUrl || !sheetUrl.trim()) {
    throw new Error('Please enter a valid Google Sheet URL.')
  }

  const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
  if (!match || !match[1]) {
    throw new Error('Invalid Google Sheet URL format. Could not extract Spreadsheet ID.')
  }

  const spreadsheetId = match[1]
  const csvExportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`

  const response = await fetch(csvExportUrl)
  if (!response.ok) {
    throw new Error('Failed to fetch Google Sheet headers. Please make sure the sheet link sharing is set to "Anyone with the link can view".')
  }

  const csvText = await response.text()
  const firstLine = csvText.split('\n')[0]
  if (!firstLine) {
    throw new Error('Google Sheet appears to be empty.')
  }

  const headers = firstLine.split(',').map(h => h.replace(/^["']|["']$/g, '').trim()).filter(Boolean)
  if (!headers.length) {
    throw new Error('No column headers found in Google Sheet row 1.')
  }

  return headers.map(header => {
    const lower = header.toLowerCase()
    let prompt = `Extract ${header} from conversation`
    if (lower.includes('name')) prompt = "Extract customer's full name or self-introduction"
    else if (lower.includes('phone') || lower.includes('mobile') || lower.includes('contact')) prompt = "Extract customer's phone number or WhatsApp contact"
    else if (lower.includes('email')) prompt = "Extract customer's email address"
    else if (lower.includes('company') || lower.includes('org')) prompt = "Extract company or business name"
    else if (lower.includes('service') || lower.includes('treatment') || lower.includes('require') || lower.includes('product')) prompt = "Extract requested service, product, or inquiry"
    else if (lower.includes('budget') || lower.includes('price')) prompt = "Extract budget or pricing requirements"
    else if (lower.includes('status') || lower.includes('stage')) prompt = "Extract lead status (Interested, Hot, Warm, Cold)"
    else if (lower.includes('summary')) prompt = "Extract short conversation summary"
    else if (lower.includes('action') || lower.includes('follow')) prompt = "Extract recommended follow-up action"

    return {
      key: header.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
      header: header,
      prompt: prompt
    }
  })
}
