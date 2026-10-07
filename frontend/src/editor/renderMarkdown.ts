import { Marked } from 'marked'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github.css'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
})

marked.use({
  renderer: {
    code({ text, lang, escaped }) {
      const language = (lang ?? '').trim().split(/\s+/)[0]
      const body = escaped ? text : escapeHtml(text)
      if (language && hljs.getLanguage(language)) {
        const highlighted = hljs.highlight(text, { language }).value
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>\n`
      }
      return `<pre><code class="hljs">${body}</code></pre>\n`
    },
  },
})

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string
}
