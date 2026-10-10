export enum ReaderNodeMode {
  RGB = "rgb",
  GRAY = "gray",
  DYNAMIC = "dynamic",
}

export enum WriterNodeFormat {
  PNG = "png",
  JPEG = "jpeg",
}

export enum NodeType {
  FOLDER_READER = "folder_reader",
  FOLDER_WRITER = "folder_writer",
  UPSCALE = "upscale",
  SHARP = "sharp",
  RESIZE = "resize",
  SCREENTONE = "screentone",
  LEVEL = "level",
  CVT_COLOR = "cvt_color",
  HYST_NORM = "hyst_norm",
  NOISE = "noise",
}

export enum PureNodeType {
  LEVEL = "level",
  FOLDER_READER = "folder_reader",
  FOLDER_WRITER = "folder_writer",
  SHARP = "sharp",
  CVT_COLOR = "cvt_color",
  UPSCALE = "upscale",
  RESIZE = "resize",
  HALFTONE = "halftone",
  HYST_NORM = "hyst_norm",
  NOISE = "noise",
  DOWNLOAD = "download",
  UNARCHIVE = "unarchive",
  CLEANDIR = "cleandir",
  PSD_POSTPROCESS = "psd_postprocess",
}

export enum CvtType {
  RGB2Gray = "RGB2Gray",
  RGB2Gray709 = "RGB2Gray709",
  RGB2Gray2020 = "RGB2Gray2020",
  Gray2RGB = "Gray2RGB",
}

export enum TilerType {
  EXACT = "exact",
  NO_TILING = "no_tiling",
}

export enum ResizeType {
  BY_WIDTH = "width",
  BY_HEIGHT = "height",
  ABSOLUTE = "absolute",
  PERCENT = "percent",
}

export enum FilterType {
  NEAREST = "nearest",
  BOX = "box",
  SBOX4 = "sbox4",
  SBOX8 = "sbox8",
  IBOX = "ibox",
  LINEAR = "linear",
  SLINEAR4 = "slinear4",
  SLINEAR8 = "slinear8",
  ILINEAR = "ilinear",
  HAMMING = "hamming",
  SHAMMING4 = "shamming4",
  SHAMMING8 = "shamming8",
  IHAMMING = "ihamming",
  CATMULLROM = "catmullrom",
  SCATMULLROM4 = "scatmullrom4",
  SCATMULLROM8 = "scatmullrom8",
  ICATMULLROM = "icatmullrom",
  MITCHELL = "mitchell",
  SMITCHELL4 = "smitchell4",
  SMITCHELL8 = "smitchell8",
  IMITCHELL = "imitchell",
  LANCZOS = "lanczos",
  SLANCZOS4 = "slanczos4",
  SLANCZOS8 = "slanczos8",
  ILANCZOS = "ilanczos",
  GAUSS = "gauss",
  SGAUSS4 = "sgauss4",
  SGAUSS8 = "sgauss8",
  IGAUSS = "igauss",
  DPID025 = "dpid_0.25",
  DPID05 = "dpid_0.5",
  DPID075 = "dpid_0.75",
  DPID1 = "dpid_1",
}

export enum CannyType {
  NORMAL = "normal",
  INVERT = "invert",
  UNSHARP = "unsharp",
}

export enum DotType {
  CIRCLE = "circle",
  LINE = "line",
  // named for the wire value: the old INVERT name read as an inversion but
  // serialized "cross" (a real INVLINE lives right below)
  CROSS = "cross",
  ELLIPSE = "ellipse",
  INVLINE = "invline",
}

export enum DType {
  F32 = "F32",
  F16 = "F16",
  BF16 = "BF16",
}

export enum HalftoneMode {
  GRAY = "gray",
  RGB = "rgb",
  HSV = "hsv",
  CMYK = "cmyk",
}

/** Foreground fit inside the PSD canvas (pepecore OverlayFit). */
export enum PsdFit {
  ORIGINAL = "original",
  FIT = "fit",
  COVER = "cover",
  STRETCH = "stretch",
}
