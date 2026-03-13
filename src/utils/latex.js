import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders LaTeX formulas in HTML content.
 * 
 * Handles:
 * 1. $$ ... $$ display math
 * 2. $ ... $ inline math  
 * 3. Bare LaTeX commands (auto-wraps in $ and renders)
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
            try {
                return katex.renderToString(latex.trim(), {
                    displayMode: true,
                    throwOnError: false,
                    trust: true
                })
            } catch (e) {
                return match
            }
        })

        // Step 2: Handle $ ... $ (inline math)
        result = result.replace(/\$((?:[^$\\]|\\.)+)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), {
                    displayMode: false,
                    throwOnError: false,
                    trust: true
                })
            } catch (e) {
                return match
            }
        })

        // Step 3: If there are still bare LaTeX commands (no $ delimiters),
        // try to render the entire string as one LaTeX block
        if (result.includes('\\') && /\\[a-zA-Z]/.test(result) && !result.includes('class="katex"')) {
            try {
                const rendered = katex.renderToString(result.trim(), {
                    displayMode: false,
                    throwOnError: false,
                    trust: true
                })
                // Only use the rendered version if KaTeX didn't just return empty
                if (rendered && rendered.includes('class="katex"')) {
                    return rendered
                }
            } catch (e) {
                // Fall through — return original
            }
        }

        return result
    } catch (e) {
        console.error('LaTeX rendering error:', e)
        return html
    }
}
