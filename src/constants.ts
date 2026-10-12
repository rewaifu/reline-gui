export const STORAGE_KEY = "reline-web:config";
// v2: the node outline on the left is closed by default now — a stored v1 layout
// would keep it open for everyone who ever loaded the page
export const LAYOUT_STORAGE_KEY = "reline-web:layout:v2";

// Column sizing: side panels are resizable, the middle one keeps the rest.
export const MIN_SIDE_WIDTH = 220;
// settings panel is never narrower — its run controls must stay inside
export const MIN_RIGHT_WIDTH = 330;
export const MIN_MIDDLE_WIDTH = 320;
export const SPLITTER_WIDTH = 10;
export const MODEL_PREFIX = "/content/models/";

export const DEFAULT_COLLAPSED = true;
export const MODEL_POSTFIX = ".pth";
