import fs from 'fs/promises'
import path from 'path'
import { getFirebaseDb, isFirebaseConfigured } from './firebaseAdmin.js'

const ANSWERS_FILE = 'answers.json'
const PENDING_FILE = 'pending-students.json'
const EXAM_CONFIG_FILE = 'exam-config.json'
const LIVE_COLLECTION = 'liveSessions'
const SUBMISSIONS_COLLECTION = 'submissions'
const CONFIG_COLLECTION = 'config'
const EXAM_CONFIG_DOC = 'exam'
const LIVE_TIMEOUT_MS = 61 * 60 * 1000

function resolvePath(fileName) {
  return path.join(process.cwd(), fileName)
}

async function readJsonFile(fileName, fallback) {
  try {
    const content = await fs.readFile(resolvePath(fileName), 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

async function writeJsonFile(fileName, value) {
  await fs.writeFile(resolvePath(fileName), JSON.stringify(value, null, 2), 'utf-8')
}

function slugifyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'student'
}

function buildLiveSessionKey(session) {
  return slugifyKey(session.studentId || session.studentName)
}

function normalizeIso(value, fallback = null) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toISOString()
}

function serializeDoc(doc) {
  const data = doc.data()
  return {
    id: doc.id,
    ...data,
  }
}

export function hasFirebaseRuntime() {
  return isFirebaseConfigured()
}

export async function listSubmissions() {
  const db = getFirebaseDb()
  if (!db) {
    const data = await readJsonFile(ANSWERS_FILE, [])
    return Array.isArray(data) ? data : []
  }

  const snapshot = await db.collection(SUBMISSIONS_COLLECTION).orderBy('timestamp', 'desc').get()
  return snapshot.docs.map(serializeDoc)
}

export async function saveSubmission(payload) {
  const now = new Date().toISOString()
  const submission = {
    ...payload,
    studentName: String(payload.studentName || '').trim(),
    timestamp: normalizeIso(payload.timestamp, now),
    submittedAt: now,
  }

  const db = getFirebaseDb()
  if (!db) {
    const current = await readJsonFile(ANSWERS_FILE, [])
    const next = Array.isArray(current) ? current : []
    next.push(submission)
    await writeJsonFile(ANSWERS_FILE, next)
    await removeLiveSession(submission.studentName)
    return submission
  }

  const docRef = await db.collection(SUBMISSIONS_COLLECTION).add(submission)
  await removeLiveSession(submission.studentName)
  return { id: docRef.id, ...submission }
}

export async function deleteSubmission(studentName, timestamp) {
  const db = getFirebaseDb()
  if (!db) {
    const current = await readJsonFile(ANSWERS_FILE, [])
    const filtered = current.filter(
      (item) => !(item.studentName === studentName && item.timestamp === timestamp)
    )
    if (filtered.length === current.length) {
      return false
    }
    await writeJsonFile(ANSWERS_FILE, filtered)
    return true
  }

  const snapshot = await db
    .collection(SUBMISSIONS_COLLECTION)
    .where('studentName', '==', studentName)
    .where('timestamp', '==', timestamp)
    .get()

  if (snapshot.empty) {
    return false
  }

  const batch = db.batch()
  snapshot.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
  return true
}

export async function deleteStudentSubmissions(studentName) {
  const db = getFirebaseDb()
  if (!db) {
    const current = await readJsonFile(ANSWERS_FILE, [])
    const filtered = current.filter((item) => item.studentName !== studentName)
    if (filtered.length === current.length) {
      return false
    }
    await writeJsonFile(ANSWERS_FILE, filtered)
    return true
  }

  const snapshot = await db
    .collection(SUBMISSIONS_COLLECTION)
    .where('studentName', '==', studentName)
    .get()

  if (snapshot.empty) {
    return false
  }

  const batch = db.batch()
  snapshot.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
  return true
}

export async function upsertLiveSession(payload) {
  const now = new Date().toISOString()
  const session = {
    studentName: String(payload.studentName || '').trim(),
    studentId: payload.studentId || null,
    answers: payload.answers || {},
    currentQuestion: Number(payload.currentQuestion || 1),
    answeredCount: Number(payload.answeredCount || 0),
    totalQuestions: Number(payload.totalQuestions || 0),
    questionFile: payload.questionFile || 'questions.json',
    status: 'Pending',
    lastHeartbeatAt: now,
  }

  const db = getFirebaseDb()
  if (!db) {
    const list = await readJsonFile(PENDING_FILE, [])
    const records = Array.isArray(list) ? list : []
    const existingIndex = records.findIndex((item) => item.studentName === session.studentName)
    if (existingIndex === -1) {
      records.push({
        ...session,
        timestamp: now,
        startedAt: now,
      })
    } else {
      records[existingIndex] = {
        ...records[existingIndex],
        ...session,
        timestamp: records[existingIndex].timestamp || now,
        startedAt: records[existingIndex].startedAt || records[existingIndex].timestamp || now,
      }
    }
    await writeJsonFile(PENDING_FILE, records)
    return {
      success: true,
      serverTimestamp: now,
    }
  }

  const docId = buildLiveSessionKey(payload)
  const ref = db.collection(LIVE_COLLECTION).doc(docId)
  const existing = await ref.get()
  const current = existing.exists ? existing.data() : {}
  const next = {
    ...current,
    ...session,
    timestamp: current?.timestamp || now,
    startedAt: current?.startedAt || current?.timestamp || now,
  }
  await ref.set(next)

  return {
    success: true,
    serverTimestamp: now,
  }
}

export async function listLiveSessions() {
  const cutoff = Date.now() - LIVE_TIMEOUT_MS
  const db = getFirebaseDb()

  if (!db) {
    const list = await readJsonFile(PENDING_FILE, [])
    const records = Array.isArray(list) ? list : []
    const active = records.filter((item) => {
      const ts = new Date(item.lastHeartbeatAt || item.timestamp || item.startedAt || 0).getTime()
      return ts > cutoff
    })
    if (active.length !== records.length) {
      await writeJsonFile(PENDING_FILE, active)
    }
    return active
  }

  const snapshot = await db.collection(LIVE_COLLECTION).get()
  const batch = db.batch()
  const active = []

  snapshot.docs.forEach((doc) => {
    const data = serializeDoc(doc)
    const ts = new Date(data.lastHeartbeatAt || data.timestamp || data.startedAt || 0).getTime()
    if (ts > cutoff) {
      active.push(data)
      return
    }
    batch.delete(doc.ref)
  })

  if (!snapshot.empty) {
    await batch.commit()
  }

  return active.sort((a, b) => new Date(b.lastHeartbeatAt || b.timestamp) - new Date(a.lastHeartbeatAt || a.timestamp))
}

export async function removeLiveSession(studentName) {
  const db = getFirebaseDb()
  if (!db) {
    const list = await readJsonFile(PENDING_FILE, [])
    const records = Array.isArray(list) ? list : []
    const filtered = records.filter((item) => item.studentName !== studentName)
    if (filtered.length !== records.length) {
      await writeJsonFile(PENDING_FILE, filtered)
    }
    return { success: true }
  }

  const snapshot = await db.collection(LIVE_COLLECTION).where('studentName', '==', studentName).get()
  if (snapshot.empty) {
    return { success: true }
  }
  const batch = db.batch()
  snapshot.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
  return { success: true }
}

export async function getExamConfig() {
  const db = getFirebaseDb()
  if (!db) {
    const config = await readJsonFile(EXAM_CONFIG_FILE, {})
    return {
      questionSetHistory: [],
      ...(config || {}),
    }
  }

  const doc = await db.collection(CONFIG_COLLECTION).doc(EXAM_CONFIG_DOC).get()
  return {
    questionSetHistory: [],
    ...(doc.exists ? doc.data() : {}),
  }
}

export async function setExamConfig(update) {
  const db = getFirebaseDb()
  const current = await getExamConfig()
  const next = {
    ...current,
    ...update,
  }

  if (!db) {
    await writeJsonFile(EXAM_CONFIG_FILE, next)
    return next
  }

  await db.collection(CONFIG_COLLECTION).doc(EXAM_CONFIG_DOC).set(next, { merge: true })
  return next
}

// Question File Storage Methods
export async function saveQuestionFile(fileName, payload) {
  const db = getFirebaseDb()
  const safeName = fileName.replace('.json', '')
  
  if (!db) {
    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, fileName);
    // write to both in case we're dev
    await fs.mkdir(publicDir, { recursive: true }).catch(() => {});
    await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf-8");
    return;
  }

  // To prevent 1MB limit issues, we store the config with stringified payload 
  // (Usually questions JSON text is ~50-100KB which fits well within 1MB).
  await db.collection('questionSets').doc(safeName).set({
    fileName,
    updatedAt: new Date().toISOString(),
    content: JSON.stringify(payload)
  });
}

export async function loadQuestionFile(fileName) {
  const db = getFirebaseDb()
  const safeName = fileName.replace('.json', '')
  
  if (!db) {
    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, fileName);
    const content = await fs.readFile(jsonPath, "utf-8");
    return JSON.parse(content);
  }

  const doc = await db.collection('questionSets').doc(safeName).get();
  if (doc.exists) {
    const data = doc.data();
    if (data.content) {
      return JSON.parse(data.content);
    }
    // Fallback if saved securely as object
    const { fileName: _, updatedAt: __, ...rest } = data;
    if (Object.keys(rest).length > 0) return rest;
  }

  // Fallback to local if not found in db (like default questions.json deployed with Vercel)
  try {
    const publicDir = path.join(process.cwd(), "public");
    const jsonPath = path.join(publicDir, fileName);
    const content = await fs.readFile(jsonPath, "utf-8");
    return JSON.parse(content);
  } catch(e) {
    return null;
  }
}

export async function listQuestionFilesFromDb() {
  const db = getFirebaseDb()
  if (!db) return [];
  
  const snapshot = await db.collection('questionSets').select('fileName', 'updatedAt').get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      name: data.fileName || `${doc.id}.json`,
      lastModified: data.updatedAt || new Date().toISOString(),
      // approximate size as 0 for db entries just so it doesn't break UI
      size: 0, 
      type: 'file'
    };
  });
}
