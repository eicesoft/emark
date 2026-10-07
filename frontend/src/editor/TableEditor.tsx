import { useEffect, useLayoutEffect, useRef } from 'react'
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import { buildTable, parseTable } from './markdown'
import type { TableData } from './markdown'

/** Cell position: r = 0 is the header row, r >= 1 is body row r - 1. */
type Cell = { r: number; c: number }

type MenuNav = (action: 'up' | 'down' | 'pick' | 'close', index?: number) => void

/** min column width in px, and width of the row-ops column */
const MIN_COL = 56
const OPS_COL = 44

interface Props {
  text: string
  menuActive: boolean
  onMenuNav: MenuNav
  onChange: (text: string) => void
  /** manual column widths in px, 0 or missing = auto */
  widths?: number[]
  onWidths: (widths: number[]) => void
  onBlurBlock: () => void
}

export function TableEditor({
  text,
  menuActive,
  onMenuNav,
  onChange,
  widths,
  onWidths,
  onBlurBlock,
}: Props) {
  const data = parseTable(text)
  const cols = data.header.length
  const inputs = useRef<(HTMLInputElement | null)[][]>([])
  const want = useRef<Cell | null>(null)
  const last = useRef<Cell>({ r: 0, c: 0 })
  const stopResize = useRef<(() => void) | null>(null)
  const onWidthsRef = useRef(onWidths)
  onWidthsRef.current = onWidths

  const ws: number[] = Array.from({ length: cols }, (_, i) => widths?.[i] ?? 0)
  const hasFixed = ws.some((w) => w > 0)
  const minWidth = hasFixed
    ? ws.reduce((s, w) => s + (w > 0 ? w : 90), 0) + OPS_COL
    : cols * 110 + OPS_COL

  const nodeAt = (r: number, c: number) => inputs.current[r]?.[c] ?? null

  const focusCell = (r: number, c: number, atEnd = true) => {
    const node = nodeAt(r, c)
    if (!node) return
    node.focus()
    const p = atEnd ? node.value.length : 0
    node.setSelectionRange(p, p)
    last.current = { r, c }
  }

  const setRef = (r: number, c: number) => (node: HTMLInputElement | null) => {
    const row = inputs.current[r] ?? (inputs.current[r] = [])
    row[c] = node
  }

  const commit = (next: TableData, focus?: Cell) => {
    want.current = focus ?? null
    onChange(buildTable(next))
  }

  const startResize = (e: ReactPointerEvent<HTMLElement>, c: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const row = e.currentTarget.closest('tr')
    if (!row) return
    const ths = Array.from(row.querySelectorAll('th')) as HTMLElement[]
    const base = ths.slice(0, cols).map((el) => el.offsetWidth)
    if (base.length !== cols) return

    const x0 = e.clientX
    const move = (ev: PointerEvent) => {
      const next = [...base]
      next[c] = Math.max(MIN_COL, base[c] + (ev.clientX - x0))
      onWidthsRef.current(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      stopResize.current = null
    }
    stopResize.current = up
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const resetCol = (c: number) => {
    const next = Array.from({ length: cols }, (_, i) => widths?.[i] ?? 0)
    next[c] = 0
    onWidths(next)
  }

  /* focus first cell when the editor opens */
  useLayoutEffect(() => {
    focusCell(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* apply focus requested by a structural change (row/column added or removed) */
  useLayoutEffect(() => {
    const f = want.current
    if (!f) return
    want.current = null
    focusCell(Math.min(f.r, data.rows.length), Math.min(f.c, cols - 1))
  })

  /* release a running column drag if the editor unmounts */
  useEffect(() => () => stopResize.current?.(), [])

  const setCell = (r: number, c: number, v: string) => {
    if (r === 0) {
      onChange(
        buildTable({ ...data, header: data.header.map((x, i) => (i === c ? v : x)) }),
      )
      return
    }
    onChange(
      buildTable({
        ...data,
        rows: data.rows.map((row, i) =>
          i === r - 1 ? row.map((x, j) => (j === c ? v : x)) : row,
        ),
      }),
    )
  }

  const addRow = (focus: Cell) => {
    const rows = [...data.rows, Array.from({ length: cols }, () => '')]
    commit({ ...data, rows }, focus)
  }

  const delRow = (i: number) => {
    const rows = data.rows.filter((_, k) => k !== i)
    const c = Math.min(last.current.c, cols - 1)
    const r = rows.length === 0 ? 0 : Math.min(i + 1, rows.length)
    commit({ ...data, rows }, { r, c })
  }

  const addCol = (after: number) => {
    const at = after + 1
    const grow = (arr: string[]) => {
      const n = [...arr]
      n.splice(at, 0, '')
      return n
    }
    if (widths) {
      const w = [...widths]
      w.splice(at, 0, 0)
      onWidths(w)
    }
    commit({ header: grow(data.header), rows: data.rows.map(grow) }, { r: last.current.r, c: at })
  }

  const delCol = (c: number) => {
    if (cols <= 1) return
    const cut = (arr: string[]) => arr.filter((_, i) => i !== c)
    if (widths) onWidths(widths.filter((_, i) => i !== c))
    commit(
      { header: cut(data.header), rows: data.rows.map(cut) },
      { r: last.current.r, c: Math.min(c, cols - 2) },
    )
  }

  const cellKeyDown = (r: number, c: number) => (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const node = e.currentTarget

    if (menuActive) {
      if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        onMenuNav(e.key === 'Escape' ? 'close' : e.key === 'ArrowUp' ? 'up' : 'down')
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        onMenuNav('pick')
        return
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      node.blur()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (r + 1 <= data.rows.length) focusCell(r + 1, c)
      else addRow({ r: data.rows.length + 1, c })
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusCell(Math.min(r + 1, data.rows.length), c)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusCell(Math.max(r - 1, 0), c)
      return
    }

    if (e.key === 'ArrowLeft') {
      if (node.selectionStart === 0 && node.selectionEnd === 0 && c > 0) {
        e.preventDefault()
        focusCell(r, c - 1)
      }
      return
    }

    if (e.key === 'ArrowRight') {
      const atEnd = node.selectionStart === node.value.length && node.selectionEnd === node.value.length
      if (atEnd && c < cols - 1) {
        e.preventDefault()
        focusCell(r, c + 1, false)
      }
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const total = (data.rows.length + 1) * cols
      const next = r * cols + c + (e.shiftKey ? -1 : 1)
      if (next >= total) {
        addRow({ r: data.rows.length + 1, c: 0 })
        return
      }
      if (next < 0) {
        focusCell(0, 0)
        return
      }
      focusCell(Math.floor(next / cols), next % cols, e.shiftKey)
    }
  }

  const handleBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Node | null
    if (to && e.currentTarget.contains(to)) return
    onBlurBlock()
  }

  const cell = (r: number, c: number, value: string, header: boolean) => (
    <input
      ref={setRef(r, c)}
      value={value}
      onFocus={() => {
        last.current = { r, c }
      }}
      onChange={(e) => setCell(r, c, e.target.value)}
      onKeyDown={cellKeyDown(r, c)}
      aria-label={header ? `表头第 ${c + 1} 列` : `第 ${r} 行第 ${c + 1} 列`}
    />
  )

  const stopFocusSteal = (e: ReactMouseEvent) => e.preventDefault()

  return (
    <div className="tedit" onBlur={handleBlur}>
      <div className="tedit-scroll">
        <table className="tedit-table" style={{ minWidth: `${minWidth}px` }}>
          <colgroup>
            {ws.map((w, c) => (
              <col key={c} style={w > 0 ? { width: `${w}px` } : undefined} />
            ))}
            <col style={{ width: `${OPS_COL}px` }} />
          </colgroup>
          <thead>
            <tr>
              {data.header.map((v, c) => (
                <th key={c}>
                  {cell(0, c, v, true)}
                  <span className="tedit-colops">
                    <button
                      type="button"
                      title="右侧插入列"
                      onMouseDown={stopFocusSteal}
                      onClick={() => addCol(c)}
                    >
                      ＋
                    </button>
                    {cols > 1 && (
                      <button
                        type="button"
                        title="删除此列"
                        onMouseDown={stopFocusSteal}
                        onClick={() => delCol(c)}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                  {c < cols - 1 && (
                    <span
                      className="tedit-grip"
                      title="拖动调整列宽，双击还原"
                      onPointerDown={(e) => startResize(e, c)}
                      onDoubleClick={() => resetCol(c)}
                    />
                  )}
                </th>
              ))}
              <th className="tedit-ops" />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>
                {row.map((v, c) => (
                  <td key={c}>{cell(i + 1, c, v, false)}</td>
                ))}
                <td className="tedit-ops">
                  <button
                    type="button"
                    title="删除此行"
                    onMouseDown={stopFocusSteal}
                    onClick={() => delRow(i)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tedit-foot" onMouseDown={stopFocusSteal}>
        <button
          type="button"
          onMouseDown={stopFocusSteal}
          onClick={() => addRow({ r: data.rows.length + 1, c: 0 })}
        >
          + 行
        </button>
        <button type="button" onMouseDown={stopFocusSteal} onClick={() => addCol(cols - 1)}>
          + 列
        </button>
        <span className="tedit-hint">Tab 换格 · 回车下移 · Esc 退出</span>
      </div>
    </div>
  )
}
