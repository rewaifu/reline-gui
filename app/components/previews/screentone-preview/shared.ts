export const SMALL_IMAGE_HEIGHT = 3000

export const AMBER_STYLE = { borderColor: "#f59e0b", color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.1)" }

export type Stage = "select" | "editor"

export interface SelectedImage {
  path: string
  name: string
  url: string
  height: number
}
