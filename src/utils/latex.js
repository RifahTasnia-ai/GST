import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders LaTeX formulas in HTML content
 * Converts $$ ... $$ and $ ... $ delimiters to rendered math
 * @param {string} html - HTML content with LaTeX formulas
 * @returns {string} HTML with rendered LaTeX
 */
export function renderLatex(html) {
    if (!html) return ''

    try {
        // Replace display math $$ ... $$
        let result = html.replace(/\$\$(.*?)\$\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), {
                    displayMode: false,
                    throwOnError: false,
                    trust: true
                })
            } catch (e) {
                console.warn('KaTeX display math error:', e)
                return match
            }
        })

        // Replace inline math $ ... $
        result = result.replace(/\$(.*?)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), {
                    displayMode: false,
                    throwOnError: false,
                    trust: true
                })
            } catch (e) {
                console.warn('KaTeX inline math error:', e)
                return match
            }
        })

        return result
    } catch (e) {
        console.error('LaTeX rendering error:', e)
        return html
    }
}
