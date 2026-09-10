import { fireEvent, render } from "@solidjs/testing-library";
import { createStore } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodesContext, NodesDispatchContext } from "~/context/contexts";
import { createNodesDispatch } from "~/context/reducer";
import { NodeStack } from "~/components/node-card/node-card";
import { createDefaultNodes } from "~/constants";
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

const PATH_INPUT = "input[placeholder='/content/drive/MyDrive/raws']";

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
    const { container } = mount();
    const input = container.querySelector<HTMLInputElement>(PATH_INPUT);
    expect(input).not.toBe(null);
    const before = input!;
    before.focus();
    expect(document.activeElement).toBe(before);

    fireEvent.input(before, { target: { value: "raws" } });
    await vi.waitFor(() => expect(readerPath()).toBe("raws"));

    const after = container.querySelector<HTMLInputElement>(PATH_INPUT);
    // a remounted input would be a different node, unfocused, with the caret
    // parked at the end — the shape the bug report describes
    expect(after).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.value).toBe("raws");
  });

  it("accepts an insertion at the start of the value", async () => {
    const { container } = mount();
    const input = container.querySelector<HTMLInputElement>(PATH_INPUT)!;
    fireEvent.input(input, { target: { value: "src" } });
    await vi.waitFor(() => expect(readerPath()).toBe("src"));

    // the state the caret sits in when the user types at the beginning
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.input(input, { target: { value: "./src" } });
    await vi.waitFor(() => expect(readerPath()).toBe("./src"));

    expect(container.querySelector(PATH_INPUT)).toBe(input);
    expect(input.value).toBe("./src");
    expect(document.activeElement).toBe(input);
  });
});
