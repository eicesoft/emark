import type { Block, BlockKind } from './types'

let seq = 0

export function newId(): string {
  seq += 1
  return `b${Date.now().toString(36)}${seq.toString(36)}`
}

const FENCE_RE = /^(```|~~~)/

const TABLE_LINE_RE = /^\s*\|/
const TABLE_SEP_RE = /^\s*\|(?:\s*:?-{1,}:?\s*\|)+\s*$/

const DEFAULT_TABLE = ['| 列 1 | 列 2 |', '| --- | --- |', '|  |  |'].join('\n')

function splitRow(line: string): string[] {
  const s = line.trim()
  let cells = s.split('|').map((c) => c.trim())
  if (s.startsWith('|')) cells = cells.slice(1)
  if (s.endsWith('|')) cells = cells.slice(0, -1)
  return cells
}

/** True when the text is a GFM table: header row plus separator row. */
export function isTableText(t: string): boolean {
  const lines = t.split('\n').filter((l) => l.trim() !== '')
  if (lines.length < 2) return false
  return TABLE_LINE_RE.test(lines[0]) && TABLE_SEP_RE.test(lines[1])
}

/** Build table markdown from plain text. Empty text gives a 2 column default table. */
export function toTableText(base: string): string {
  const lines = base
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  if (lines.length === 0) return DEFAULT_TABLE
  if (isTableText(base)) return base
  const rows = lines.map(splitRow)
  const cols = Math.max(2, ...rows.map((r) => r.length))
  const pad = (cells: string[]): string[] => {
    const out = [...cells]
    while (out.length < cols) out.push('')
    return out
  }
  const fmt = (cells: string[]) => `| ${cells.join(' | ')} |`
  const head = pad(rows[0]).map((c, i) => (c === '' ? `列 ${i + 1}` : c))
  const body = rows.slice(1).map(pad)
  if (body.length === 0) body.push(Array(cols).fill(''))
  const sep = `| ${Array(cols).fill('---').join(' | ')} |`
  return [fmt(head), sep, ...body.map(fmt)].join('\n')
}

/** Drop table syntax and keep cell values as plain lines. */
export function unwrapTable(t: string): string {
  const out: string[] = []
  for (const raw of t.split('\n')) {
    const line = raw.trim()
    if (line === '' || TABLE_SEP_RE.test(line)) continue
    out.push(TABLE_LINE_RE.test(line) ? splitRow(line).join(' | ') : line)
  }
  return out.join('\n')
}

export interface TableData {
  header: string[]
  rows: string[][]
}

function padTo(cells: string[], cols: number): string[] {
  const out = [...cells]
  while (out.length < cols) out.push('')
  return out
}

/** Parse table markdown into header + body cells. Column count is kept, min 1. */
export function parseTable(md: string): TableData {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && TABLE_LINE_RE.test(l) && !TABLE_SEP_RE.test(l))
  const parsed = lines.map(splitRow)
  const header = parsed.length > 0 ? parsed[0] : ['']
  const rows = parsed.slice(1)
  const cols = Math.max(1, header.length, ...rows.map((r) => r.length))
  return { header: padTo(header, cols), rows: rows.map((r) => padTo(r, cols)) }
}

/** Serialize header + body cells into GFM table markdown. */
export function buildTable(data: TableData): string {
  const cols = Math.max(1, data.header.length, ...data.rows.map((r) => r.length))
  const fmt = (cells: string[]) => `| ${padTo(cells, cols).join(' | ')} |`
  const sep = `| ${Array(cols).fill('---').join(' | ')} |`
  return [fmt(data.header), sep, ...data.rows.map(fmt)].join('\n')
}

/**
 * Recompute block kinds from text.
 * A block whose text starts with a fence is one whole code block (multi-line).
 */
export function rekind(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    const t = b.text
    let kind: BlockKind
    if (t.startsWith('```') || t.startsWith('~~~')) kind = 'code'
    else if (isTableText(t)) kind = 'table'
    else if (/^#{1,6} /.test(t)) kind = 'heading'
    else if (/^\s*([-*+]|\d+\.) /.test(t)) kind = 'list'
    else if (/^\s*>/.test(t)) kind = 'quote'
    else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) kind = 'hr'
    else kind = 'text'
    return kind === b.kind ? b : { ...b, kind }
  })
}

/** Markdown -> blocks. Lines between code fences group into one multi-line block. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.length > 0 ? md.split('\n') : ['']
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      const fence = line.slice(0, 3)
      const chunk = [line]
      i += 1
      while (i < lines.length && !lines[i].startsWith(fence)) {
        chunk.push(lines[i])
        i += 1
      }
      if (i < lines.length) {
        chunk.push(lines[i])
        i += 1
      }
      blocks.push({ id: newId(), text: chunk.join('\n'), kind: 'code' })
    } else if (TABLE_LINE_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const chunk = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && TABLE_LINE_RE.test(lines[i])) {
        chunk.push(lines[i])
        i += 1
      }
      blocks.push({ id: newId(), text: chunk.join('\n'), kind: 'table' })
    } else {
      blocks.push({ id: newId(), text: line, kind: 'text' })
      i += 1
    }
  }
  return rekind(blocks)
}

export function serialize(blocks: Block[]): string {
  return blocks.map((b) => b.text).join('\n')
}
