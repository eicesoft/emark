export type ItemType =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'code'
  | 'divider'
  | 'table'

export type Cut = { from: number; to: number } | null

export interface MenuItem {
  type: ItemType
  label: string
  hint: string
  kw: string
}

export const MENU_ITEMS: MenuItem[] = [
  { type: 'text', label: '文本', hint: 'T', kw: 'text plain body 文本 正文' },
  { type: 'h1', label: '标题 1', hint: 'H1', kw: 'h1 heading title 标题 大标题' },
  { type: 'h2', label: '标题 2', hint: 'H2', kw: 'h2 heading title 标题 中标题' },
  { type: 'h3', label: '标题 3', hint: 'H3', kw: 'h3 heading title 标题 小标题' },
  { type: 'bullet', label: '无序列表', hint: '•', kw: 'ul bullet list 列表 无序' },
  { type: 'ordered', label: '有序列表', hint: '1.', kw: 'ol ordered number list 列表 有序 数字' },
  { type: 'quote', label: '引用', hint: '❝', kw: 'quote blockquote 引用' },
  { type: 'code', label: '代码块', hint: '</>', kw: 'code block fence 代码' },
  { type: 'divider', label: '分隔线', hint: '—', kw: 'divider hr separator 分隔线' },
  { type: 'table', label: '表格', hint: '⊞', kw: 'table grid 表格 单元格' },
]

export function filterItems(query: string): MenuItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return MENU_ITEMS
  return MENU_ITEMS.filter(
    (it) => it.label.toLowerCase().includes(q) || it.kw.toLowerCase().includes(q),
  )
}

export function prefixFor(type: ItemType): string {
  switch (type) {
    case 'h1':
      return '# '
    case 'h2':
      return '## '
    case 'h3':
      return '### '
    case 'bullet':
      return '- '
    case 'ordered':
      return '1. '
    case 'quote':
      return '> '
    default:
      return ''
  }
}

/** Remove an existing block-type prefix so a new one can be applied. */
export function stripPrefix(t: string): string {
  let s = t
  s = s.replace(/^#{1,6} /, '')
  s = s.replace(/^([-*+]|\d+\.) /, '')
  s = s.replace(/^>\s?/, '')
  s = s.replace(/^(```|~~~)[^\n]*(\n|$)/, '')
  s = s.replace(/\n(```|~~~)[^\n]*$/, '')
  s = s.replace(/^(-{3,}|\*{3,}|_{3,})$/, '')
  return s
}
