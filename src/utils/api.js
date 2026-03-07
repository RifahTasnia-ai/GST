const ADMIN_API_KEY_STORAGE = 'teacher_admin_api_key'
const ADMIN_API_KEY_ENV = import.meta.env.VITE_ADMIN_API_KEY || ''

function getAdminApiKey() {
  return localStorage.getItem(ADMIN_API_KEY_STORAGE) || ADMIN_API_KEY_ENV
}

async function extractApiErrorMessage(res, fallbackMessage) {
  try {
    const data = await res.json()
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error
    }
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message
    }
  } catch (_) {
    // ignore JSON parse failures and try text fallback below
  }

  try {
    const text = await res.text()
    if (text) {
      return text
    }
  } catch (_) {
    // ignore text read failures
  }

  return fallbackMessage
}

function withAdminHeaders(baseHeaders = {}) {
  const adminKey = getAdminApiKey()
  if (!adminKey) return baseHeaders
  return {
    ...baseHeaders,
    'x-admin-key': adminKey,
  }
}

export async function saveSubmission(payload) {
  let res;
  try {
    res = await fetch('/api/save-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to save submission')
  }

  const result = await res.json()
  return result
}

export async function deleteSubmission(studentName, timestamp) {
  let res;
  try {
    res = await fetch('/api/delete-answer', {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ studentName, timestamp })
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, 'Failed to delete submission'))
  }

  return res.json()
}

export async function deleteStudent(studentName) {
  let res;
  try {
    res = await fetch('/api/delete-student', {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ studentName })
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, 'Failed to delete student'))
  }

  return res.json()
}

export async function loadSubmissions() {
  let res;
  try {
    res = await fetch('/api/get-answers', {
      cache: 'no-store'
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Could not read error')
    throw new Error(`Failed to load submissions: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data
}

export async function savePendingStudent(studentName, timestamp = null, progressData = {}) {
  let res;
  try {
    res = await fetch('/api/save-pending-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName,
        // timestamp is now generated server-side to avoid client clock-skew
        ...progressData
      })
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to save pending student')
  }

  return res.json()
}

export async function removePendingStudent(studentName) {
  let res;
  try {
    res = await fetch('/api/remove-pending-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName })
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to remove pending student')
  }

  return res.json()
}

export async function loadPendingStudents() {
  let res;
  try {
    res = await fetch('/api/get-pending-students', {
      cache: 'no-store'
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    if (res.status === 404) {
      return []
    }
    const text = await res.text().catch(() => 'Could not read error')
    throw new Error(`Failed to load pending students: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data
}

// Question File Management APIs
export async function loadQuestionFiles() {
  let res;
  try {
    res = await fetch('/api/list-question-files', {
      cache: 'no-store'
    })
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Could not read error')
    throw new Error(`Failed to load question files: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  return data.files
}

export async function getActiveQuestionFile() {
  let res;
  try {
    res = await fetch('/api/active-question', {
      cache: 'no-store'
    })
  } catch (fetchErr) {
    try {
      const configRes = await fetch('/exam-config.json', { cache: 'no-store' })
      if (configRes.ok) {
        const config = await configRes.json()
        if (config?.activeQuestionFile) {
          return { activeFile: config.activeQuestionFile, source: 'exam-config' }
        }
      }
    } catch (_) {
      // ignore and use default below
    }
    return { activeFile: 'questions.json', source: 'default' }
  }

  if (!res.ok) {
    return { activeFile: 'questions.json' }
  }

  try {
    const data = await res.json()
    return data
  } catch (e) {
    return { activeFile: 'questions.json', source: 'default' }
  }
}

export async function setActiveQuestionFile(fileName) {
  let res;
  try {
    res = await fetch('/api/active-question', {
      method: 'POST',
      headers: withAdminHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ fileName })
    });
  } catch (fetchErr) {
    throw fetchErr;
  }

  if (!res.ok) {
    throw new Error(await extractApiErrorMessage(res, 'Failed to set active question file'))
  }

  return res.json()
}

export function setAdminApiKey(apiKey) {
  if (!apiKey) {
    localStorage.removeItem(ADMIN_API_KEY_STORAGE)
    return
  }
  localStorage.setItem(ADMIN_API_KEY_STORAGE, apiKey)
}

export function getStoredAdminApiKey() {
  return getAdminApiKey()
}


