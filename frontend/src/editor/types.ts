export type BlockKind = 'text' | 'heading' | 'list' | 'quote' | 'code' | 'hr' | 'table'

export interface Block {
  id: string
  text: string
  kind: BlockKind
  /** true when this block was split off from the previous one (merge without newline) */
  /** true when this block was split off from the previous one (merge without newline) */
  joined?: boolean
  /** manual column widths in px for table blocks, 0 = auto */
  widths?: number[]
}
