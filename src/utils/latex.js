import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders LaTeX in mixed Bengali + math text.
 *
 * Handles:
 *   1. $$...$$  — display math
 *   2. $...$    — inline math
 *   3. Bare LaTeX (\frac, \begin etc. without $) — auto-detects and renders
 *
 * @param {string} text
 * @returns {string} HTML string with KaTeX-rendered math
 */
export function renderLatex(text) {
  if (!text) return ''

  try {
    // Already has $ delimiters — standard processing
    if (text.includes('$')) {
      return processDollarDelimited(text)
    }

    // Bare LaTeX: has \commands but no $ delimiters
    if (hasBareLatex(text)) {
      return processBareLaTeX(text)
    }

    // Plain text — escape and return
    return escapeHtml(text)
  } catch (e) {
    console.warn('renderLatex error:', e)
    return escapeHtml(text)
  }
}

// ── Dollar-delimited math ────────────────────────────────────────

function processDollarDelimited(text) {
  let result = ''
  let i = 0

  while (i < text.length) {
    // $$ display math
    if (text[i] === '$' && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2)
      if (end !== -1) {
        result += renderKatex(text.slice(i + 2, end), true)
        i = end + 2
        continue
      }
    }

    // $ inline math
    if (text[i] === '$') {
      const end = findClosingDollar(text, i + 1)
      if (end !== -1) {
        result += renderKatex(text.slice(i + 1, end), false)
        i = end + 1
        continue
      }
    }

    result += escapeHtml(text[i])
    i++
  }

  return result
}

function findClosingDollar(text, from) {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '$' && text[j - 1] !== '\\') return j
  }
  return -1
}

// ── Bare LaTeX auto-detection ────────────────────────────────────

const LATEX_CMD_RE = /\\(?:frac|sqrt|sin|cos|tan|sec|csc|cot|cosec|log|ln|lim|sum|prod|int|alpha|beta|gamma|delta|theta|pi|omega|mu|sigma|lambda|phi|epsilon|Rightarrow|rightarrow|Leftarrow|leftarrow|therefore|because|infty|pm|mp|times|div|cdot|cdots|left|right|begin|end|mathrm|text|quad|qquad|overline|underline|hat|bar|vec|geq|leq|neq|approx|to|gets|partial|nabla|in|subset|cup|cap|pmatrix|bmatrix|vmatrix|aligned|cases|equiv|perp|angle|dots|ldots|displaystyle|tfrac|dfrac|binom)\b|[_^]\{/

function hasBareLatex(text) {
  return LATEX_CMD_RE.test(text)
}

/**
 * For text with bare LaTeX (no $ delimiters):
 * Split into Bengali text segments and LaTeX math segments,
 * render each math segment with KaTeX.
 */
function processBareLaTeX(text) {
  // Strategy: try rendering the entire thing as LaTeX first
  // If it fails, fall back to mixed-mode segmentation

  // Try full-text render (works when text is purely or mostly math)
  const fullRender = renderKatex(text, false)
  if (fullRender && !fullRender.includes('katex-error')) {
    return fullRender
  }

  // Fall back: segment by Bengali script boundaries
  return segmentAndRender(text)
}

/**
 * Split text into Bengali prose and LaTeX math at word boundaries.
 * Bengali script: U+0980–U+09FF
 */
function segmentAndRender(text) {
  // Split on transitions between: Bengali chars AND \commands
  // Keep segments together
  const segments = []
  let i = 0
  let buf = ''
  let inLatex = false

  while (i < text.length) {
    const code = text.charCodeAt(i)
    const isBengali = code >= 0x0980 && code <= 0x09FF

    if (isBengali) {
      if (inLatex && buf.trim()) {
        segments.push({ type: 'latex', text: buf })
        buf = ''
      }
      inLatex = false
      buf += text[i]
    } else if (text[i] === '\\' && /[a-zA-Z]/.test(text[i + 1] || '')) {
      if (!inLatex && buf.trim()) {
        segments.push({ type: 'bengali', text: buf })
        buf = ''
      }
      inLatex = true
      buf += text[i]
    } else {
      buf += text[i]
    }
    i++
  }

  if (buf.trim()) {
    segments.push({ type: inLatex ? 'latex' : 'bengali', text: buf })
  }

  return segments.map(seg => {
    if (seg.type === 'latex') return renderKatex(seg.text.trim(), false)
    return '<span class="bengali">' + escapeHtml(seg.text.trim()) + '</span>'
  }).join(' ')
}

// ── KaTeX rendering ──────────────────────────────────────────────

function renderKatex(latex, displayMode) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: true,
      strict: false,
    })
  } catch (e) {
    return '<span class="katex-error">' + escapeHtml(latex) + '</span>'
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
