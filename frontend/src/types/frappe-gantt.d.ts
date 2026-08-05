declare module 'frappe-gantt' {
  export interface GanttTask {
    id: string
    name: string
    start: string
    end: string
    progress: number
    dependencies?: string
    custom_class?: string
  }

  export interface GanttOptions {
    view_mode?: 'Hour' | 'Quarter Day' | 'Half Day' | 'Day' | 'Week' | 'Month' | 'Year'
    readonly?: boolean
    readonly_dates?: boolean
    readonly_progress?: boolean
    today_button?: boolean
    view_mode_select?: boolean
    language?: string
    popup_on?: 'click' | 'hover'
    bar_height?: number
    padding?: number
    container_height?: number | 'auto'
    infinite_padding?: boolean
    lines?: 'both' | 'vertical' | 'horizontal' | 'none'
    on_click?: (task: GanttTask) => void
  }

  export default class Gantt {
    constructor(wrapper: string | HTMLElement | SVGElement, tasks: GanttTask[], options?: GanttOptions)
    change_view_mode(mode: string): void
    refresh(tasks: GanttTask[]): void
  }
}

declare module 'frappe-gantt/dist/frappe-gantt.css'
