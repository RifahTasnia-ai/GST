const LOCAL_ACTIVE_FILE_KEY = 'local_active_question_file'
const ADMIN_API_KEY_STORAGE = 'teacher_admin_api_key'
const ADMIN_API_KEY_ENV = import.meta.env.VITE_ADMIN_API_KEY || ''

function getAdminApiKey() {
  return localStorage.getItem(ADMIN_API_KEY_STORAGE) || ADMIN_API_KEY_ENV
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
    const text = await res.text()
    throw new Error(text || 'Failed to delete submission')
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
    const text = await res.text()
    throw new Error(text || 'Failed to delete student')
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

export async function loadLatestQuestions() {
  for (let version = 100; version >= 1; version--) {
    const fileName = `questions-${version}.json`
    try {
      const res = await fetch(`/${fileName}`)
      if (res.ok) {
        const text = await res.text()
        JSON.parse(text)
        return { file: fileName, version }
      }
    } catch (error) {
      continue
    }
  }

  return { file: 'questions.json', version: 0 }
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
  const localOverride = localStorage.getItem(LOCAL_ACTIVE_FILE_KEY)
  if (localOverride) {
    return { activeFile: localOverride, source: 'local-override' }
  }

  let res;
  try {
    res = await fetch('/api/get-active-question-file', {
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
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  let res;
  try {
    res = await fetch('/api/set-active-question-file', {
      method: 'POST',
      headers: withAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ fileName })
    })
  } catch (fetchErr) {
    if (isLocalhost) {
      localStorage.setItem(LOCAL_ACTIVE_FILE_KEY, fileName)
      return { success: true, activeFile: fileName, localOnly: true }
    }
    throw fetchErr;
  }

  if (!res.ok) {
    if (isLocalhost) {
      localStorage.setItem(LOCAL_ACTIVE_FILE_KEY, fileName)
      return { success: true, activeFile: fileName, localOnly: true }
    }
    const text = await res.text()
    throw new Error(text || 'Failed to set active question file')
  }

  localStorage.setItem(LOCAL_ACTIVE_FILE_KEY, fileName)
  return res.json()
}

export function setAdminApiKey(apiKey) {
  if (!apiKey) {
    localStorage.removeItem(ADMIN_API_KEY_STORAGE)
    return
  }
  localStorage.setItem(ADMIN_API_KEY_STORAGE, apiKey)
}


