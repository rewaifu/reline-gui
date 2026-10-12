import { type Component, createMemo, Show, useContext } from "solid-js";
import { marked } from "marked";
import { NodesContext } from "~/context/contexts";
import { NodeType } from "~/types/enums";
import { nodeLabel, nodeRegistry } from "~/lib/nodes";
import { NodeSwap } from "~/components/node-swap/node-swap";
import { locale, t } from "~/lib/i18n";
import { BetaChart } from "~/components/noise-chart/beta-chart";
import type { StackNode } from "~/types/node";
import type { NoiseNodeOptions } from "~/types/options/noise";
import styles from "../config-panel.module.scss";

/** Per-node instructions, authored as Markdown in src/instructions/<locale>/.
 * Keyed "locale/type", so the rendered document follows the switcher. */
export const INSTRUCTION_DOCS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob("../../../instructions/*/*.md", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, src]) => [
    path
      .match(/instructions\/([^/]+)\/([^/]+)\.md$/)!
      .slice(1)
      .join("/"),
    src as string,
  ]),
);
/** Live Beta(a, b) density for the selected noise node, rendered above its
 * guide: the chart follows the form's a/b, so the doc always pictures the
 * actual noise. Other nodes render nothing. */
const NoiseBetaChart: Component<{ node: StackNode | undefined }> = (props) => (
  <Show when={props.node?.type === NodeType.NOISE}>
    <BetaChart options={props.node!.options as NoiseNodeOptions} />
  </Show>
);

export interface InstructionsTabProps {
  selectedUid: () => string | null;
}

export const InstructionsTab: Component<InstructionsTabProps> = (props) => {
  const nodes = useContext(NodesContext);
  const node = () => nodes.find((n) => n.uid === props.selectedUid());
  const def = () => {
    const current = node();
    return current ? nodeRegistry.get(current.type) : undefined;
  };
  const docHtml = createMemo(() => {
    const d = def();
    // a definition's own guide (a plugin's) wins over the bundled file
    const md = d
      ? (d.doc?.[locale()] ?? INSTRUCTION_DOCS[`${locale()}/${d.type}`])
      : undefined;
    return md ? marked.parse(md, { async: false }) : "";
  });

  return (
    <div class={styles.instructions}>
      <Show when={node()}>
        {(n) => (
          <div class={styles.instructionsHeader}>
            <span class={styles.instructionsTitle}>
              {n().name ?? nodeLabel(n().type)}
            </span>
            <NodeSwap node={n()} />
          </div>
        )}
      </Show>
      <Show
        when={def()}
        fallback={<p class={styles.empty}>{t("panel.instructions.empty")}</p>}
      >
        <NoiseBetaChart node={node()} />
        {
          // Instructions are trusted local files authored by the user, so
          // rendering the compiled HTML directly is safe here. The callback
          // binding is dropped on purpose: the body needs only docHtml().
          // oxlint-disable-next-line solid/no-innerhtml -- trusted local content
          <div class={styles.doc} innerHTML={docHtml()} />
        }
      </Show>
    </div>
  );
};
