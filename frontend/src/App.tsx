import { useEffect, useMemo, useRef, useState } from 'react'
import { BlockEditor } from './editor/BlockEditor'
import type { PendingFocus } from './editor/BlockEditor'
import { isTableText, newId, parseMarkdown, rekind, serialize, toTableText, unwrapTable } from './editor/markdown'
import { prefixFor, stripPrefix } from './editor/menu'
import type { Cut, ItemType } from './editor/menu'
import type { Block } from './editor/types'
import { renderMarkdown } from './editor/renderMarkdown'
import { clipGet, clipSet, nativeExport, nativeSave, onMenuEvent } from './wailsBridge'

const DEMO = [
  '# emark',
  '',
  '每行一个块。悬停行首出现 ⠿ 手柄，拖动即可排序。',
  '',
  '- 回车：拆分当前块',
  '- 行首退格：与上一块合并',
  '- Shift+回车：块内换行',
  '- Tab：插入缩进',
  '- 上下方向键：跨块移动光标',
  '',
  '> 引用块也是独立的一块。',
  '',
  '```js',
  "console.log('代码块同样支持')",
  '```',
  '',
  '| 列 1 | 列 2 |',
  '| --- | --- |',
  '| 表格块 | 点击进入可视化编辑 |',
  '',
  '行首敲 / 打开菜单选块类型，点 ⠿ 手柄也能换类型。',
].join('\n')

const STORE_KEY = 'emark.doc'

function loadInitial(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? DEMO
  } catch {
    return DEMO
  }
}

export default function App() {
  const [blocks, setBlocksRaw] = useState<Block[]>(() => parseMarkdown(loadInitial()))
  const [hint, setHint] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const pendingFocus = useRef<PendingFocus>(null)
  const blocksRef = useRef<Block[]>(blocks)
  blocksRef.current = blocks
  const historyRef = useRef<Block[][]>([])
  const futureRef = useRef<Block[][]>([])
  const lastTaRef = useRef<HTMLTextAreaElement | null>(null)

  // History-aware setter: snapshots previous doc for menu undo/redo.
  const setBlocks: typeof setBlocksRaw = (next) => {
    const prev = blocksRef.current
    const val = typeof next === 'function' ? next(prev) : next
    if (val !== prev) {
      historyRef.current.push(prev)
      if (historyRef.current.length > 200) historyRef.current.shift()
      futureRef.current = []
      blocksRef.current = val
      setBlocksRaw(val)
    }
  }

  const md = useMemo(() => serialize(blocks), [blocks])
  const previewHtml = useMemo(() => renderMarkdown(md), [md])

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, serialize(blocks))
    } catch {
      /* storage unavailable, ignore */
    }
  }, [blocks])

  const onText = (id: string, text: string) => {
    setBlocks((prev) => rekind(prev.map((b) => (b.id === id ? { ...b, text } : b))))
  }

  const onWidths = (id: string, widths: number[]) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, widths } : b)))
  }

  const onSplit = (id: string, caret: number) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i < 0) return
    const cur = blocks[i]
    const nid = newId()
    const next = [...blocks]
    next[i] = { ...cur, text: cur.text.slice(0, caret) }
    next.splice(i + 1, 0, {
      id: nid,
      text: cur.text.slice(caret),
      kind: cur.kind,
      joined: true,
    })
    pendingFocus.current = { id: nid, caret: 0 }
    setBlocks(rekind(next))
  }

  const onMergePrev = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i <= 0) return
    const prev = blocks[i - 1]
    pendingFocus.current = { id: prev.id, caret: prev.text.length }
    const sep = blocks[i].joined ? '' : '\n'
    const merged = { ...prev, text: prev.text + sep + blocks[i].text }
    setBlocks(rekind([...blocks.slice(0, i - 1), merged, ...blocks.slice(i + 1)]))
  }

  const onDelete = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i < 0) return
    if (blocks.length === 1) {
      pendingFocus.current = { id, caret: 0 }
      setBlocks(rekind([{ ...blocks[0], text: '' }]))
      return
    }
    const neighbor = i > 0 ? blocks[i - 1] : blocks[i + 1]
    pendingFocus.current = { id: neighbor.id, caret: i > 0 ? neighbor.text.length : 0 }
    setBlocks(blocks.filter((_, j) => j !== i))
  }

  const onMove = (from: string, to: string, side: 'above' | 'below') => {
    const fi = blocks.findIndex((b) => b.id === from)
    if (fi < 0) return
    const moved = { ...blocks[fi], joined: false }
    const rest = blocks.filter((b) => b.id !== from)
    let ti = rest.findIndex((b) => b.id === to)
    if (ti < 0) return
    if (side === 'below') ti += 1
    const next = [...rest]
    next.splice(ti, 0, moved)
    setBlocks(next)
  }

  const onConvert = (id: string, type: ItemType, cut: Cut) => {
    const i = blocks.findIndex((b) => b.id === id)
    if (i < 0) return
    const cur = blocks[i]
    let base = cur.text
    if (cut && cut.from >= 0 && base[cut.from] === '/') {
      base = base.slice(0, cut.from) + base.slice(cut.to)
    }
    if (isTableText(base)) base = unwrapTable(base)
    base = stripPrefix(base)
    const rest = blocks.slice(i + 1)

    if (type === 'code') {
      const text = '```\n' + base + '\n```'
      pendingFocus.current = { id: cur.id, caret: 4 + base.length }
      setBlocks(rekind([...blocks.slice(0, i), { ...cur, text, kind: 'code' }, ...rest]))
      return
    }

    if (type === 'divider') {
      const div: Block = { ...cur, text: '---', kind: 'hr' }
      if (base.trim() === '') {
        pendingFocus.current = { id: cur.id, caret: 3 }
        setBlocks(rekind([...blocks.slice(0, i), div, ...rest]))
      } else {
        const nid = newId()
        pendingFocus.current = { id: nid, caret: 0 }
        setBlocks(
          rekind([...blocks.slice(0, i), div, { id: nid, text: base, kind: 'text' }, ...rest]),
        )
      }
      return
    }

    if (type === 'table') {
      const text = toTableText(base)
      pendingFocus.current = { id: cur.id, caret: text.length }
      setBlocks(rekind([...blocks.slice(0, i), { ...cur, text, kind: 'table' }, ...rest]))
      return
    }

    const prefix = prefixFor(type)
    const nb: Block = { ...cur, text: prefix + base, kind: 'text' }
    pendingFocus.current = { id: cur.id, caret: prefix.length + base.length }
    setBlocks(rekind([...blocks.slice(0, i), nb, ...rest]))
  }

  const addBlock = () => {
    const nid = newId()
    pendingFocus.current = { id: nid, caret: 0 }
    setBlocks([...blocks, { id: nid, text: '', kind: 'text' }])
  }


  // ---- native menu integration ----

  const writeTa = (ta: HTMLTextAreaElement, value: string, caret: number) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(ta, value)
    ta.setSelectionRange(caret, caret)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const runEdit = async (action: string) => {
    const ta = lastTaRef.current
    switch (action) {
      case 'undo': {
        const prev = historyRef.current.pop()
        if (!prev) return
        futureRef.current.push(blocksRef.current)
        blocksRef.current = prev
        setBlocksRaw(prev)
        return
      }
      case 'redo': {
        const next = futureRef.current.pop()
        if (!next) return
        historyRef.current.push(blocksRef.current)
        blocksRef.current = next
        setBlocksRaw(next)
        return
      }
      case 'selectall':
        ta?.select()
        return
      case 'copy': {
        if (!ta) return
        const text = ta.selectionStart !== ta.selectionEnd
          ? ta.value.slice(ta.selectionStart, ta.selectionEnd)
          : ta.value
        await clipSet(text)
        setHint('已复制')
        return
      }
      case 'cut': {
        if (!ta) return
        const ss = ta.selectionStart
        const se = ta.selectionEnd
        if (ss === se) return
        await clipSet(ta.value.slice(ss, se))
        writeTa(ta, ta.value.slice(0, ss) + ta.value.slice(se), ss)
        return
      }
      case 'paste': {
        if (!ta) return
        const text = await clipGet()
        if (!text) return
        const ss = ta.selectionStart
        const se = ta.selectionEnd
        writeTa(ta, ta.value.slice(0, ss) + text + ta.value.slice(se), ss + text.length)
        return
      }
    }
  }

  const doExportNative = async () => {
    try {
      const path = await nativeExport(serialize(blocksRef.current))
      if (path) setHint('已导出 ' + path)
    } catch {
      setHint('导出失败')
    }
  }

  const doSaveNative = async () => {
    try {
      const path = await nativeSave(serialize(blocksRef.current))
      if (path) setHint('已保存 ' + path)
    } catch {
      setHint('保存失败')
    }
  }

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLTextAreaElement) lastTaRef.current = e.target
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  useEffect(() => {
    const offs = [
      onMenuEvent('menu:new', () => {
        setBlocks(parseMarkdown(''))
        setHint('已新建文档')
      }),
      onMenuEvent('menu:open', (content: string) => {
        setBlocks(parseMarkdown(content))
        setHint('已打开')
      }),
      onMenuEvent('menu:import', (content: string) => {
        const extra = parseMarkdown(content)
        setBlocks((prev) => rekind([...prev, ...extra]))
        setHint('已导入')
      }),
      onMenuEvent('menu:export', () => {
        void doExportNative()
      }),
      onMenuEvent('menu:save', () => {
        void doSaveNative()
      }),
      onMenuEvent('menu:edit', (action: string) => {
        void runEdit(action)
      }),
      onMenuEvent('menu:preview', () => setShowPreview((v) => !v)),
    ]
    return () => {
      offs.forEach((off) => off())
    }
  }, [])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(''), 3000)
    return () => clearTimeout(t)
  }, [hint])

  return (
    <div className={`app${showPreview ? ' with-preview' : ''}`}>

      <div className="main">
        <div className="editor-col">
      <BlockEditor
        blocks={blocks}
        pendingFocus={pendingFocus}
        onText={onText}
        onWidths={onWidths}
        onSplit={onSplit}
        onMergePrev={onMergePrev}
        onDelete={onDelete}
        onMove={onMove}
        onConvert={onConvert}
        onAddBlock={addBlock}
      />
        </div>
        {showPreview && (
          <aside className="preview">
            <div className="preview-title">预览</div>
            <div className="preview-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </aside>
        )}
      </div>

      <footer className="foot">{hint || '回车新建块 · 行首退格合并 · 拖动 ⠿ 排序 · 内容自动存本地'}</footer>
    </div>
  )
}
