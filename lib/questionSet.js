const DEFAULT_MARK_PER_QUESTION = 1
const DEFAULT_NEGATIVE_MARKING = 0.25
const DEFAULT_PASS_RATIO = 0.6
const DEFAULT_SECONDS_PER_QUESTION = 36

function roundTo(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function toFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toPositiveNumber(value) {
  const parsed = toFiniteNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatNumber(value) {
  const rounded = roundTo(value, 2)

  if (Number.isInteger(rounded)) {
    return String(rounded)
  }

  if (Number.isInteger(rounded * 10)) {
    return rounded.toFixed(1)
  }

  return rounded.toFixed(2)
}

function formatDurationLabel(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (seconds === 0) {
    return `${minutes} মিনিট`
  }

  return `${minutes} মিনিট ${seconds} সেকেন্ড`
}

function slugifyStorageFragment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.json$/i, '')
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'questions'
}

export function extractQuestionSetPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      meta: {},
      questions: payload,
    }
  }

  if (isPlainObject(payload) && Array.isArray(payload.questions)) {
    return {
      meta: isPlainObject(payload.meta) ? payload.meta : {},
      questions: payload.questions,
    }
  }

  return {
    meta: {},
    questions: [],
  }
}

function normalizeOptions(options) {
  if (Array.isArray(options)) {
    return options
      .filter((option) => isPlainObject(option) && option.id !== undefined)
      .map((option) => ({
        id: String(option.id),
        text: option.text ?? '',
      }))
  }

  if (!isPlainObject(options)) {
    return []
  }

  return Object.entries(options).map(([id, text]) => ({
    id: String(id),
    text: text ?? '',
  }))
}

export function normalizeQuestion(question, index = 0) {
  const options = normalizeOptions(question?.options)
  const optionsMap = Object.fromEntries(options.map((option) => [option.id, option.text]))
  const correctOptionId = String(question?.correctOptionId ?? question?.correctAnswer ?? '')
  const id = question?.id ?? index + 1

  return {
    ...question,
    id,
    question: question?.question ?? '',
    options,
    optionsMap,
    correctOptionId,
    correctAnswer: correctOptionId,
    explanation: question?.explanation || `সঠিক উত্তর: ${correctOptionId}.`,
    hasDiagram: Boolean(question?.hasDiagram),
    svg_code: question?.svg_code || null,
    questionImage: question?.questionImage ?? question?.image ?? null,
    explanationImage: question?.explanationImage ?? null,
    subject: question?.subject || '',
    topic: question?.topic || '',
  }
}

export function resolveExamConfig({ totalQuestions, meta = {}, questionFile = 'questions.json' } = {}) {
  const safeMeta = isPlainObject(meta) ? meta : {}
  const resolvedTotalQuestions = Math.max(0, Number(totalQuestions) || 0)
  const explicitMarkPerQuestion = toPositiveNumber(safeMeta.markPerQuestion)
  const explicitTotalMarks = toPositiveNumber(safeMeta.totalMarks)

  const markPerQuestion = explicitMarkPerQuestion
    ?? (explicitTotalMarks && resolvedTotalQuestions > 0
      ? explicitTotalMarks / resolvedTotalQuestions
      : DEFAULT_MARK_PER_QUESTION)

  const totalMarks = roundTo(markPerQuestion * resolvedTotalQuestions, 2)
  const durationSeconds = Math.max(
    0,
    Math.round(
      toPositiveNumber(safeMeta.durationSeconds)
      ?? ((toPositiveNumber(safeMeta.durationMinutes) ?? (resolvedTotalQuestions * DEFAULT_SECONDS_PER_QUESTION / 60)) * 60)
    )
  )
  const negativeMarking = roundTo(
    Math.abs(toFiniteNumber(safeMeta.negativeMarking) ?? DEFAULT_NEGATIVE_MARKING),
    2
  )
  const passMark = roundTo(
    toPositiveNumber(safeMeta.passMark) ?? (totalMarks * DEFAULT_PASS_RATIO),
    2
  )
  const title = String(safeMeta.title || `GST ${resolvedTotalQuestions} MCQ`)
  const storageKey = `mcq_state_${slugifyStorageFragment(questionFile)}_${resolvedTotalQuestions}`
  const legacyStorageKeys = []

  if (resolvedTotalQuestions === 100 && markPerQuestion === 1) {
    legacyStorageKeys.push('mcq_state_v100')
  }

  if (resolvedTotalQuestions === 50 && markPerQuestion === 1) {
    legacyStorageKeys.push('mcq_state_v50')
  }

  return {
    title,
    totalQuestions: resolvedTotalQuestions,
    totalMarks,
    durationSeconds,
    durationMinutes: roundTo(durationSeconds / 60, 2),
    markPerQuestion: roundTo(markPerQuestion, 4),
    negativeMarking,
    passMark,
    storageKey,
    legacyStorageKeys,
    displayText: `সময়: ${formatDurationLabel(durationSeconds)} | মোট নম্বর: ${formatNumber(totalMarks)} | প্রশ্ন: ${resolvedTotalQuestions}`,
    markingText: `সঠিক: +${formatNumber(markPerQuestion)} | ভুল: -${formatNumber(negativeMarking)} | পাস মার্ক: ${formatNumber(passMark)}`,
  }
}

export function parseQuestionSetPayload(payload, options = {}) {
  const extracted = extractQuestionSetPayload(payload)
  const questions = extracted.questions.map((question, index) => normalizeQuestion(question, index))
  const examConfig = resolveExamConfig({
    totalQuestions: questions.length,
    meta: extracted.meta,
    questionFile: options.questionFile,
  })

  return {
    meta: extracted.meta,
    questions,
    examConfig,
  }
}
