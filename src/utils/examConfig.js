import { parseQuestionSetPayload, resolveExamConfig } from '../../lib/questionSet.js'

export function getExamConfig(totalQuestions, options = {}) {
  return resolveExamConfig({
    totalQuestions,
    meta: options.meta,
    questionFile: options.questionFile,
  })
}

export { parseQuestionSetPayload }
