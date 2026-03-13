import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Unicode math characters used in plain-text duplicate copies.
 * These appear alongside proper LaTeX as garbled duplicates and should be stripped.
 */
const UNICODE_MATH_STRIP = /[⁡⇒⇐∴∵∞≥≤≠≈√∑∏∫²³⁴⁻⁺½₁₂₃₄₅₆₇₈₉₀𝑥𝑦𝑧𝑎𝑏𝑐𝑑𝑒𝑓𝑔𝑘𝑚𝑛𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑃𝑉𝑇𝑀𝐿𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾]/g

/**
 * Check if text contains LaTeX commands (bare, without $ delimiters)
 */
function hasBareLaTeX(text) {
    return /\\(?:frac|sqrt|sin|cos|tan|sec|csc|cot|cosec|log|ln|lim|sum|prod|int|alpha|beta|gamma|delta|theta|pi|omega|mu|sigma|lambda|phi|epsilon|Rightarrow|rightarrow|Leftarrow|leftarrow|therefore|because|infty|pm|mp|times|div|cdot|cdots|left|right|begin|end|mathrm|text|quad|qquad|overline|underline|hat|bar|vec|underset|overset|operatorname|not|to|gets|geq|leq|neq|approx)\b/.test(text) ||
        /\\begin\{/.test(text) ||
        /\^\{[^}]+\}/.test(text) ||
        /_\{[^}]+\}/.test(text)
}

/**
 * Try to render a LaTeX string with KaTeX, return HTML or null on failure
 */
function tryRender(latex, displayMode = false) {
    try {
        return katex.renderToString(latex.trim(), {
            displayMode,
            throwOnError: false,
            trust: true
        })
    } catch (e) {
        return null
    }
}

/**
 * Strip plain-text math duplicate fragments from text that also has proper LaTeX.
 * The data often contains: [plain_copy1] [LaTeX] [plain_copy2]
 * This removes the plain copies by stripping runs of ASCII math chars
 * that appear right before/after LaTeX commands.
 */
function stripPlainDuplicates(text) {
    if (!UNICODE_MATH_STRIP.test(text)) return text

    // Remove Unicode math italic letters and symbols (these are the duplicates)
    let cleaned = text.replace(UNICODE_MATH_STRIP, '')

    // Remove orphaned plain-text math runs that sit between LaTeX sections
    // Pattern: sequences like "x2+3x" or "dxdy" that aren't inside LaTeX commands
    // These appear as residual plain-text after Unicode chars are stripped
    cleaned = cleaned
        .replace(/\s{2,}/g, ' ')
        .trim()

    return cleaned
}

/**
 * Segment text into Bengali text and LaTeX math portions.
 * Returns an array of { type: 'text'|'math', content: string }
 */
function segmentText(text) {
    const segments = []
    // Match LaTeX environments: \begin{...}...\end{...}
    // And LaTeX command sequences: \frac{...}{...}, \sin{...}, etc.
    const latexPattern = /(?:\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})|(?:(?:[_^]\{[^}]*\}|\\[a-zA-Z]+(?:\{[^}]*\})*|[a-zA-Z0-9=+\-*/.,;:!?()[\] \n\r\t|<>{}^_\\])+)/g

    let lastIndex = 0
    let match

    while ((match = latexPattern.exec(text)) !== null) {
        const chunk = match[0]
        // Only treat as LaTeX if it actually has LaTeX commands
        if (!hasBareLaTeX(chunk)) continue

        // Add text before this LaTeX chunk
        if (match.index > lastIndex) {
            const before = text.substring(lastIndex, match.index)
            if (before.trim()) segments.push({ type: 'text', content: before })
        }

        segments.push({ type: 'math', content: chunk })
        lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < text.length) {
        const remaining = text.substring(lastIndex)
        if (remaining.trim()) segments.push({ type: 'text', content: remaining })
    }

    return segments
}

/**
 * Renders LaTeX formulas in text content.
 * 
 * Handles three cases:
 * 1. Standard $...$ and $$...$$ delimited math
 * 2. Bare LaTeX commands without delimiters (auto-detected)
 * 3. Mixed Bengali text + LaTeX (segmented and rendered separately)
 * 
 * @param {string} html - Text content with LaTeX formulas
 * @returns {string} HTML with rendered LaTeX
 */
export function renderLatex(html) {
    if (!html) return ''

    try {
        let result = html

        // Step 1: Handle $$ ... $$ (display math)
        result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
            return tryRender(latex, true) || match
        })

        // Step 2: Handle $ ... $ (inline math)
        result = result.replace(/\$((?:[^$\\]|\\.)+)\$/g, (match, latex) => {
            return tryRender(latex, false) || match
        })

        // Step 3: Handle bare LaTeX commands (no $ delimiters)
        if (hasBareLaTeX(result) && !result.includes('class="katex"')) {
            // Strip plain-text math duplicates first
            result = stripPlainDuplicates(result)

            // Segment into text vs math
            const segments = segmentText(result)

            if (segments.some(s => s.type === 'math')) {
                result = segments.map(seg => {
                    if (seg.type === 'math') {
                        // Clean up residual plain-text fragments within the LaTeX
                        let mathContent = seg.content
                        mathContent = stripPlainDuplicates(mathContent)
                        const rendered = tryRender(mathContent, false)
                        return rendered || `<span class="math-fallback">${escapeHtml(mathContent)}</span>`
                    }
                    // For text segments, strip any remaining Unicode math junk
                    let textContent = seg.content.replace(UNICODE_MATH_STRIP, '').replace(/\s{2,}/g, ' ').trim()
                    return textContent ? `<span>${escapeHtml(textContent)}</span>` : ''
                }).filter(Boolean).join(' ')
            }
        }

        return result
    } catch (e) {
        console.error('LaTeX rendering error:', e)
        return html
    }
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
