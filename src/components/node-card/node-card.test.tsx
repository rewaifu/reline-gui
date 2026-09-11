import { fireEvent, render } from "@solidjs/testing-library";
import { createStore } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { createNodesDispatch } from "~/context/reducer";
import { NodeStack } from "~/components/node-card/node-card";
import { createDefaultNodes } from "~/constants";
import { nodeLabel } from "~/components/nodes/registry";
import { NodeType } from "~/types/enums";
import { t } from "~/lib/i18n";
import type { FolderReaderNodeOptions } from "~/types/options";

/** Reported: typing at the start of a path field did nothing until the value
 * already held `/` or `./`. Behind that: an option change that recreates the
 * input drops the caret, the focus and (for a keystroke landing mid-word) the
 * text itself — the field only *looks* alive when typing at the end, where a
 * value restored from the store plus a caret at the end are indistinguishable
 * from the real thing. jsdom cannot type characters, so the invariant checked
 * here is the element identity: same input node, same focus, and the store,
 * not the DOM, owns the text. */

vi.mock("~/lib/ls-client", () => ({
  lsClient: {
    ls: () =>
      Promise.resolve({ entries: ["raws", "raws_extra"], dirs: ["raws"] }),
  },
}));

/** The four sites below query the path field by its label rather than its
 * placeholder: the placeholder is an example of a wire value and may be
 * reworded, while the label is the very string the field renders — the same
 * dictionary key, so the query follows a language switch too. */
const pathField = () => t("form.folder_reader.path");

const makeStore = () => createStore(createDefaultNodes());

describe("path field under the node store", () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    // the folder reader is the first node; its form only renders expanded
    store[1]((state) => {
      state[0].collapsed = false;
    });
  });

  const readerPath = () =>
    (store[0][0].options as FolderReaderNodeOptions).path;

  const mount = () => {
    const dispatch = createNodesDispatch(store[1]);
    const [selected, setSelected] = createStore<Record<string, boolean>>({});
    setSelected((state) => {
      state[store[0][0].uid] = true;
    });
    return render(() => (
      <NodesContext value={store[0]}>
        <NodesDispatchContext value={dispatch}>
          <NodeStack
            selectedUid={() => store[0][0].uid}
            isSelected={selected}
            onSelect={() => {}}
            phone={false}
          />
        </NodesDispatchContext>
      </NodesContext>
    ));
  };

  it("keeps the same input element while its options change", async () => {
    const view = mount();
    const input = view.getByLabelText(pathField()) as HTMLInputElement;
    const before = input;
    before.focus();
    expect(document.activeElement).toBe(before);

    fireEvent.input(before, { target: { value: "raws" } });
    await vi.waitFor(() => expect(readerPath()).toBe("raws"));

    const after = view.getByLabelText(pathField()) as HTMLInputElement;
    // a remounted input would be a different node, unfocused, with the caret
    // parked at the end — the shape the bug report describes
    expect(after).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.value).toBe("raws");
  });

  it("accepts an insertion at the start of the value", async () => {
    const view = mount();
    const input = view.getByLabelText(pathField()) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "src" } });
    await vi.waitFor(() => expect(readerPath()).toBe("src"));

    // the state the caret sits in when the user types at the beginning
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.input(input, { target: { value: "./src" } });
    await vi.waitFor(() => expect(readerPath()).toBe("./src"));

    expect(view.getByLabelText(pathField())).toBe(input);
    expect(input.value).toBe("./src");
    expect(document.activeElement).toBe(input);
  });

  /** The title carried its own click handler (select) *and* stopped the event,
   * so the header's fold never ran for a click on the name or on the wide empty
   * stretch beside it (the title is `flex: 1`): the card took two clicks to
   * open. Double-click-to-rename was the other half of that history, and the
   * pencil button never needed a gesture beside it. */
  it("folds on the first click on the title, and leaves renaming to the pencil", async () => {
    const view = mount();
    const upscale = () => store[0][1];

    // the upscale node starts collapsed: one click selects *and* folds
    fireEvent.click(view.getByText(nodeLabel(NodeType.UPSCALE)));
    await vi.waitFor(() => expect(upscale().collapsed).toBe(false));
    expect(view.queryAllByLabelText(t("chrome.nodeName"))).toHaveLength(0);

    // and one more click folds it back — the first click always acts
    fireEvent.click(view.getByText(nodeLabel(NodeType.UPSCALE)));
    await vi.waitFor(() => expect(upscale().collapsed).toBe(true));

    // the grip is a drag surface: a tap on it selects, but must not fold —
    // otherwise dropping a dragged card would fold the card that was dropped
    const grips = view.getAllByLabelText(t("chrome.reorder"));
    fireEvent.click(grips[1] as HTMLElement);
    await vi.waitFor(() => expect(upscale().collapsed).toBe(true));

    // the pencil is the one way into renaming, and it still works
    const pencils = view.getAllByLabelText(t("chrome.rename"));
    fireEvent.click(pencils[1] as HTMLElement);
    await vi.waitFor(() =>
      expect(view.getAllByLabelText(t("chrome.nodeName"))).toHaveLength(1),
    );
  });
});
