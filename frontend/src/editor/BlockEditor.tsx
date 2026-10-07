import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { filterItems } from './menu'
import { TypeIcon } from './icons'
import { renderMarkdown } from './renderMarkdown'
import { TableEditor } from './TableEditor'
import type { Cut, ItemType } from './menu'
import type { Block } from './types'

export type PendingFocus = { id: string; caret: number } | null

type MenuState = {
  blockId: string
  mode: 'slash' | 'type'
  slashAt: number
  query: string
  sel: number
}

type MenuAction = 'up' | 'down' | 'pick' | 'close'

interface Props {
  blocks: Block[]
  pendingFocus: MutableRefObject<PendingFocus>
  onText: (id: string, text: string) => void
  onWidths: (id: string, widths: number[]) => void
  onSplit: (id: string, caret: number) => void
  onMergePrev: (id: string) => void
  onDelete: (id: string) => void
  onMove: (from: string, to: string, side: 'above' | 'below') => void
  onConvert: (id: string, type: ItemType, cut: Cut) => void
  onAddBlock: () => void
}

interface RowProps {
  block: Block
  prevId: string | null
  nextId: string | null
  prevLen: number
  register: (id: string) => (el: HTMLTextAreaElement | null) => void
  focusBlock: (id: string, caret: number) => void
  pendingFocus: MutableRefObject<PendingFocus>
  onChange: (text: string, caret: number, typedSlash: boolean) => void
  onWidths: (widths: number[]) => void
  onSplit: Props['onSplit']
  onMergePrev: Props['onMergePrev']
  onDelete: Props['onDelete']
  menu: MenuState | null
  onMenuNav: (action: MenuAction, index?: number) => void
  onMenuHover: (index: number) => void
  editing: boolean
  onBlurBlock: (id: string) => void
  dragId: string | null
  over: { id: string; side: 'above' | 'below' } | null
  settled: boolean
  onHandlePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onHandlePointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onHandlePointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onHandlePointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onHandleKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void
}

interface MenuProps {
  items: ReturnType<typeof filterItems>
  sel: number
  mode: MenuState['mode']
  onHover: (index: number) => void
  onPick: (index: number) => void
}

function BlockMenu({ items, sel, mode, onHover, onPick }: MenuProps) {
  return (
    <div className="menu" role="listbox">
      <div className="menu-title">{mode === 'slash' ? '转换为' : '块类型'}</div>
      {items.length === 0 && <div className="menu-empty">无匹配项</div>}
      {items.map((it, i) => (
        <div
          key={it.type}
          className={`menu-item${i === sel ? ' active' : ''}`}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(i)}
        >
          <span className="menu-icon">
            <TypeIcon type={it.type} />
          </span>
          <span className="menu-label">{it.label}</span>
          <span className="menu-hint">{it.hint}</span>
        </div>
      ))}
    </div>
  )
}

function BlockRow(props: RowProps) {
  const {
    block,
    prevId,
    nextId,
    prevLen,
    register,
    focusBlock,
    pendingFocus,
    onChange,
    onWidths,
    onSplit,
    onMergePrev,
    onDelete,
    menu,
    onMenuNav,
    onMenuHover,
    dragId,
    over,
    settled,
    editing,
    onBlurBlock,
  } = props
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [block.text, editing])

  const setRef = (el: HTMLTextAreaElement | null) => {
    taRef.current = el
    register(block.id)(el)
  }

  const items = menu ? filterItems(menu.query) : []

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const ss = el.selectionStart
    const se = el.selectionEnd

    if (menu) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onMenuNav('close')
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        onMenuNav('up')
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        onMenuNav('down')
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        if (items.length > 0) onMenuNav('pick')
        else onMenuNav('close')
        return
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      el.blur()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (block.kind === 'code' || block.kind === 'table') return
      e.preventDefault()
      onSplit(block.id, ss)
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const nv = el.value.slice(0, ss) + '  ' + el.value.slice(se)
      pendingFocus.current = { id: block.id, caret: ss + 2 }
      onChange(nv, ss + 2, false)
      return
    }

    if (e.key === 'Backspace' && ss === 0 && se === 0 && block.text !== '') {
      if (prevId) {
        e.preventDefault()
        onMergePrev(block.id)
      }
      return
    }

    if (e.key === 'Backspace' && ss === 0 && se === 0 && block.text === '') {
      e.preventDefault()
      onDelete(block.id)
      return
    }

    if (e.key === 'ArrowUp' && ss === se && prevId && ss === 0) {
      e.preventDefault()
      focusBlock(prevId, prevLen)
      return
    }

    if (e.key === 'ArrowDown' && ss === se && nextId) {
      const nextBreak = block.text.indexOf('\n', ss)
      if (nextBreak === -1) {
        e.preventDefault()
        focusBlock(nextId, 0)
      }
    }
  }

  const handleChange = (e: ReactChangeEvent<HTMLTextAreaElement>) => {
    const caret = e.target.selectionStart
    const native = e.nativeEvent as InputEvent
    const typedSlash = native.data === '/'
    onChange(e.target.value, caret, typedSlash)
  }

  const overClass = over && over.id === block.id ? ` over-${over.side}` : ''
  const dragging = dragId === block.id ? ' dragging' : ''
  const settledCls = settled ? ' settled' : ''

  return (
    <div
      className={`row kind-${block.kind}${overClass}${dragging}${settledCls}`}
      data-id={block.id}
    >
      <div className="gutter">
        <button
          className="handle"
          title="拖动排序，点击改块类型"
          onPointerDown={(e) => props.onHandlePointerDown(e)}
          onPointerMove={(e) => props.onHandlePointerMove(e)}
          onPointerUp={(e) => props.onHandlePointerUp(e)}
          onPointerCancel={(e) => props.onHandlePointerCancel(e)}
          onKeyDown={(e) => props.onHandleKeyDown(e)}
        >
          ⠿
        </button>
      </div>
      {editing ? (
        block.kind === 'table' ? (
          <TableEditor
            text={block.text}
            menuActive={!!menu}
            onMenuNav={onMenuNav}
            onChange={(v) => onChange(v, 0, false)}
            widths={block.widths}
            onWidths={onWidths}
            onBlurBlock={() => onBlurBlock(block.id)}
          />
        ) : (
          <textarea
            ref={setRef}
            className="block"
            rows={1}
            value={block.text}
            spellCheck={false}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            onBlur={() => onBlurBlock(block.id)}
          />
        )
      ) : (
        <RenderedBlock
          text={block.text}
          widths={block.widths}
          onFocusActivate={() => focusBlock(block.id, block.text.length)}
          onActivate={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const caret = e.clientX < rect.left + rect.width / 2 ? 0 : block.text.length
            focusBlock(block.id, caret)
          }}
        />
      )}
      {menu && (
        <BlockMenu
          items={items}
          sel={menu.sel}
          mode={menu.mode}
          onHover={onMenuHover}
          onPick={(i) => onMenuNav('pick', i)}
        />
      )}
    </div>
  )
}

function RenderedBlock({
  onFocusActivate,
  text,
  widths,
  onActivate,
}: {
  text: string
  widths?: number[]
  onActivate: (e: ReactMouseEvent<HTMLDivElement>) => void
  onFocusActivate: () => void
}) {
  const html = useMemo(() => {
    if (!text) return ''
    const out = renderMarkdown(text)
    if (!widths) return out
    const fixed = widths.some((w) => w > 0)
    const i = fixed ? out.indexOf('<table>') : -1
    if (i < 0) return out
    const cols = widths.map((w) => (w > 0 ? `<col style="width:${w}px">` : '<col>')).join('')
    const min = widths.reduce((s, w) => s + Math.max(w, 0), 0)
    const head =
      '<table style="table-layout:fixed;width:100%;min-width:' +
      `${min}px` +
      '"><colgroup>' +
      cols +
      '</colgroup>'
    return out.slice(0, i) + head + out.slice(i + '<table>'.length)
  }, [text, widths])
  return (
    <div
      className="rendered"
      tabIndex={0}
      onMouseDown={(e) => e.preventDefault()}
      onFocus={onFocusActivate}
      onClick={onActivate}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface DragSession {
  id: string
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

export function BlockEditor(props: Props) {
  const { blocks, pendingFocus } = props
  const refs = useRef(new Map<string, HTMLTextAreaElement>())
  const dragRef = useRef<DragSession | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; side: 'above' | 'below' } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [settled, setSettled] = useState<string | null>(null)
  const settleTimer = useRef<number | null>(null)

  const register = (id: string) => (el: HTMLTextAreaElement | null) => {
    if (el) refs.current.set(id, el)
    else refs.current.delete(id)
  }

  const focusBlock = (id: string, caret: number) => {
    const el = refs.current.get(id)
    if (el) {
      el.focus()
      el.setSelectionRange(caret, caret)
      return
    }
    pendingFocus.current = { id, caret }
    setEditing(id)
  }

  useLayoutEffect(() => {
    const p = pendingFocus.current
    if (!p) return
    const el = refs.current.get(p.id)
    if (el) {
      el.focus()
      el.setSelectionRange(p.caret, p.caret)
      pendingFocus.current = null
    } else if (editing !== p.id) {
      setEditing(p.id)
    } else {
      pendingFocus.current = null
    }
  })

  // Close menu on clicks outside menu or handle.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('.menu') || t.closest('.handle'))) return
      setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const rowText = (id: string, text: string, caret: number, typedSlash: boolean) => {
    props.onText(id, text)
    if (typedSlash) {
      const b = blocks.find((x) => x.id === id)
      if (b && (b.kind === 'code' || b.kind === 'table')) return
      setMenu({ blockId: id, mode: 'slash', slashAt: caret - 1, query: '', sel: 0 })
      return
    }
    setMenu((m) => {
      if (!m || m.blockId !== id) return m
      if (m.mode === 'type') return null
      if (caret < m.slashAt + 1 || text[m.slashAt] !== '/') return null
      const q = text.slice(m.slashAt + 1, caret)
      if (q.length > 12 || q.includes(' ') || q.includes('\n')) return null
      if (q === m.query) return m
      const next = filterItems(q)
      const sel = next.length > 0 ? Math.min(m.sel, next.length - 1) : 0
      return { ...m, query: q, sel }
    })
  }

  const menuNav = (action: MenuAction, index?: number) => {
    if (!menu) return
    if (action === 'close') {
      setMenu(null)
      return
    }
    const items = filterItems(menu.query)
    if (action === 'pick' || items.length === 0) {
      const pickIndex = index ?? menu.sel
      const item = items[pickIndex]
      const cut: Cut =
        menu.mode === 'slash'
          ? { from: menu.slashAt, to: menu.slashAt + 1 + menu.query.length }
          : null
      const id = menu.blockId
      setMenu(null)
      if (item) props.onConvert(id, item.type, cut)
      return
    }
    if (action === 'up') {
      setMenu({ ...menu, sel: (menu.sel - 1 + items.length) % items.length })
      return
    }
    setMenu({ ...menu, sel: (menu.sel + 1) % items.length })
  }

  const openTypeMenu = (id: string) => {
    setMenu((m) =>
      m && m.blockId === id && m.mode === 'type'
        ? null
        : { blockId: id, mode: 'type', slashAt: -1, query: '', sel: 0 },
    )
  }

  /* pointer-based drag (no native HTML5 DnD) */
  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* capture unsupported, move/up still reach element while pressed */
    }
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
  }

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 4) return
      d.moved = true
      setDragId(d.id)
      setMenu(null)
    }
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const rowEl = el ? (el.closest('.row') as HTMLElement | null) : null
    const tid = rowEl ? rowEl.dataset.id : null
    if (!tid || tid === d.id) {
      setOver(null)
      return
    }
    const rect = rowEl!.getBoundingClientRect()
    const side = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
    setOver((o) => (o && o.id === tid && o.side === side ? o : { id: tid, side }))
  }

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    const from = d.id
    const moved = d.moved
    const target = over
    setDragId(null)
    setOver(null)
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* already released */
    }

    if (!moved) {
      const b = blocks.find((x) => x.id === from)
      focusBlock(from, b ? b.text.length : 0)
      openTypeMenu(from)
      return
    }

    if (target && target.id !== from) {
      props.onMove(from, target.id, target.side)
      setSettled(from)
      if (settleTimer.current) window.clearTimeout(settleTimer.current)
      settleTimer.current = window.setTimeout(() => setSettled(null), 560)
    }
  }

  const cancelDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragId(null)
    setOver(null)
  }

  return (
    <div className="editor">
      {blocks.map((b, i) => (
        <BlockRow
          key={b.id}
          block={b}
          prevId={i > 0 ? blocks[i - 1].id : null}
          nextId={i < blocks.length - 1 ? blocks[i + 1].id : null}
          prevLen={i > 0 ? blocks[i - 1].text.length : 0}
          register={register}
          focusBlock={focusBlock}
          pendingFocus={pendingFocus}
          onChange={(text, caret, typedSlash) => rowText(b.id, text, caret, typedSlash)}
          onWidths={(w) => props.onWidths(b.id, w)}
          onSplit={props.onSplit}
          onMergePrev={props.onMergePrev}
          onDelete={props.onDelete}
          menu={menu && menu.blockId === b.id ? menu : null}
          onMenuNav={menuNav}
          onMenuHover={(index) => menu && setMenu({ ...menu, sel: index })}
          dragId={dragId}
          over={over}
          settled={settled === b.id}
          editing={editing === b.id}
          onBlurBlock={(id) => setEditing((cur) => (cur === id ? null : cur))}
          onHandlePointerDown={(e) => startDrag(e, b.id)}
          onHandlePointerMove={moveDrag}
          onHandlePointerUp={endDrag}
          onHandlePointerCancel={cancelDrag}
          onHandleKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              focusBlock(b.id, b.text.length)
              openTypeMenu(b.id)
            }
          }}
        />
      ))}
      {blocks.length > 0 && (
        <button className="add-row" onClick={props.onAddBlock}>
          + 新建块
        </button>
      )}
    </div>
  )
}
