import { saveSubmission, removePendingStudent } from './api'

const QUEUE_KEY = 'exam_submission_queue'
const MAX_RETRIES = 10
const INITIAL_BACKOFF = 2000 // 2 seconds

/**
 * Save a submission to the local queue for persistent retry
 */
export function queueSubmission(payload) {
    const queue = getPendingSubmissions()
    const id = `${payload.studentName}_${Date.now()}`

    const queueItem = {
        id,
        payload,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        status: 'pending'
    }

    queue.push(queueItem)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))

    console.log('📝 Queued submission:', id)
    return id
}

/**
 * Get all pending submissions from localStorage
 */
export function getPendingSubmissions() {
    try {
        const data = localStorage.getItem(QUEUE_KEY)
        return data ? JSON.parse(data) : []
    } catch (e) {
        console.error('Failed to load submission queue:', e)
        return []
    }
}

/**
 * Remove a submission from the queue after successful save
 */
export function clearSubmission(id) {
    const queue = getPendingSubmissions()
    const filtered = queue.filter(item => item.id !== id)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered))
    console.log('✅ Cleared submission from queue:', id)
}

/**
 * Update submission status in queue
 */
function updateSubmissionStatus(id, updates) {
    const queue = getPendingSubmissions()
    const updated = queue.map(item =>
        item.id === id ? { ...item, ...updates } : item
    )
    localStorage.setItem(QUEUE_KEY, JSON.stringify(updated))
}

/**
 * Calculate backoff delay based on retry count
 */
function getBackoffDelay(retryCount) {
    return Math.min(INITIAL_BACKOFF * Math.pow(2, retryCount), 60000) // Max 60 seconds
}

/**
 * Process a single submission with retry logic
 */
export async function processSubmission(queueItem, onProgress) {
    const { id, payload, retryCount = 0 } = queueItem

    if (retryCount >= MAX_RETRIES) {
        console.error('❌ Max retries reached for:', id)
        updateSubmissionStatus(id, { status: 'failed', lastError: 'Max retries exceeded' })
        onProgress?.({ status: 'failed', retryCount, error: 'Max retries exceeded' })
        return { success: false, error: 'Max retries exceeded' }
    }

    try {
        onProgress?.({ status: 'submitting', retryCount })

        // Submit the exam results FIRST
        const result = await saveSubmission(payload)

        // Success! Clear from queue
        clearSubmission(id)

        // NOW remove from pending list (only after save confirmed)
        try {
            await removePendingStudent(payload.studentName)
            console.log('✓ Removed from pending list:', payload.studentName)
        } catch (removeErr) {
            console.warn('Could not remove from pending list (non-critical):', removeErr.message)
        }

        onProgress?.({ status: 'success', retryCount })

        console.log('✅ Submission successful:', id)
        return { success: true, result }

    } catch (error) {
        console.warn(`⚠️ Submission failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error.message)

        const newRetryCount = retryCount + 1
        updateSubmissionStatus(id, {
            retryCount: newRetryCount,
            lastError: error.message,
            lastAttempt: new Date().toISOString()
        })

        if (newRetryCount < MAX_RETRIES) {
            const delay = getBackoffDelay(newRetryCount)
            onProgress?.({ status: 'retrying', retryCount: newRetryCount, nextRetryIn: delay })

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, delay))

            // Recursive retry
            return processSubmission(
                { ...queueItem, retryCount: newRetryCount },
                onProgress
            )
        } else {
            updateSubmissionStatus(id, { status: 'failed' })
            onProgress?.({ status: 'failed', retryCount: newRetryCount, error: error.message })
            return { success: false, error: error.message }
        }
    }
}

/**
 * Process all pending submissions in the queue
 */
export async function processQueue(onProgress) {
    const queue = getPendingSubmissions()

    if (queue.length === 0) {
        console.log('No pending submissions in queue')
        return []
    }

    console.log(`📤 Processing ${queue.length} pending submission(s)...`)

    const results = []
    for (const item of queue) {
        const result = await processSubmission(item, onProgress)
        results.push({ id: item.id, ...result })
    }

    return results
}

/**
 * Start background processing with network listener
 */
export function startBackgroundSync(onProgress) {
    let processing = false

    const tryProcess = async () => {
        if (processing) return
        processing = true

        try {
            await processQueue(onProgress)
        } catch (e) {
            console.error('Background sync error:', e)
        } finally {
            processing = false
        }
    }

    // Listen for online event
    const handleOnline = () => {
        console.log('🌐 Network reconnected, attempting to sync...')
        tryProcess()
    }

    window.addEventListener('online', handleOnline)

    // Also try processing immediately
    tryProcess()

    // Return cleanup function
    return () => {
        window.removeEventListener('online', handleOnline)
    }
}
