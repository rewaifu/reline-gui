import { nodeRegistry } from "~/lib/nodes";
import { NodeType } from "~/types/enums";
import { FolderReaderForm } from "~/components/nodes/forms/folder-reader";
import { FolderWriterForm } from "~/components/nodes/forms/folder-writer";
import { UpscaleForm } from "~/components/nodes/forms/upscale";
import { SharpForm } from "~/components/nodes/forms/sharp";
import { ResizeForm } from "~/components/nodes/forms/resize";
import { ScreentoneForm } from "~/components/nodes/forms/screentone";
import { LevelForm } from "~/components/nodes/forms/level";
import { HystNormForm } from "~/components/nodes/forms/hyst-norm";
import { NoiseForm } from "~/components/nodes/forms/noise";
import { CvtColorForm } from "~/components/nodes/forms/cvt-color";

/**
 * The hand-crafted forms of the built-in nodes, attached to their definitions.
 * Kept apart from `builtin.ts` so the data layer (and its tests) does not drag
 * Kobalte and the stylesheets in; `NodeOptionsForm` imports this file, so any
 * screen that renders a node body has the forms.
 */
const FORMS = {
  [NodeType.FOLDER_READER]: FolderReaderForm,
  [NodeType.FOLDER_WRITER]: FolderWriterForm,
  [NodeType.UPSCALE]: UpscaleForm,
  [NodeType.SHARP]: SharpForm,
  [NodeType.RESIZE]: ResizeForm,
  [NodeType.SCREENTONE]: ScreentoneForm,
  [NodeType.LEVEL]: LevelForm,
  [NodeType.CVT_COLOR]: CvtColorForm,
  [NodeType.HYST_NORM]: HystNormForm,
  [NodeType.NOISE]: NoiseForm,
};

for (const [type, Form] of Object.entries(FORMS))
  nodeRegistry.patch(type, { Form });
