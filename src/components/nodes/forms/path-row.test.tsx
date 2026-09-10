import { fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Reported: typing a folder name at the very start of a path field (no `/`
 * yet) showed no suggestions, while `./raws` or `raws/` did. The runner splits
 * the resolved path into directory and prefix; for a bare name the directory is
 * empty, and a build that does not fall back to "." lists nothing at all — a
 * silent empty answer, not an error. The field therefore asks for `./raws`,
 * which names the same folder on every build. */

interface LsSpy {
  (
    path: string,
    opts?: unknown,
  ): Promise<{ entries: string[]; dirs: string[] }>;
}

const ls = vi.fn<LsSpy>();

vi.mock("~/lib/ls-client", () => ({
  lsClient: { ls: (path: string, opts?: unknown) => ls(path, opts) },
}));

const { PathRow } = await import("~/components/nodes/forms/shared");

const FOLDER = ["raws", "raws_extra", "other"];

const Harness = () => {
  const [value, setValue] = createSignal("");
  return (
    <PathRow
      label="Path to folder"
      value={value()}
      onInput={setValue}
      source="dirs"
    />
  );
};

const mount = () => render(() => <Harness />);

const combobox = (view: ReturnType<typeof mount>) =>
  view.getByRole("combobox") as HTMLInputElement;

describe("path completion", () => {
  beforeEach(() => {
    ls.mockReset();
    ls.mockResolvedValue({
      entries: FOLDER.filter((name) => name.startsWith("raws")),
      dirs: FOLDER.filter((name) => name === "raws"),
    });
  });

  it("asks about a bare folder name", async () => {
    const view = mount();
    const input = combobox(view);
    fireEvent.input(input, { target: { value: "raws" } });
    await vi.waitFor(() => expect(ls).toHaveBeenCalledWith("./raws", {}));
    // the field itself keeps what was typed — the `./` is a wire detail
    expect(input.value).toBe("raws");
  });

  it("leaves a value that already has a slash alone", async () => {
    const view = mount();
    fireEvent.input(combobox(view), { target: { value: "/content/raw" } });
    await vi.waitFor(() => expect(ls).toHaveBeenCalledWith("/content/raw", {}));
  });

  it("opens the menu on a bare name and completes it with a slash", async () => {
    const view = mount();
    const input = combobox(view);
    fireEvent.input(input, { target: { value: "raws" } });
    const list = await view.findByRole("listbox");
    // `source="dirs"` keeps folders only — the file match must not appear
    expect(list.textContent).toBe("raws/");
    fireEvent.click(list.querySelector("button") as HTMLButtonElement);
    await vi.waitFor(() => expect(input.value).toBe("raws/"));
  });

  it("asks with the folder in place once it is complete", async () => {
    const view = mount();
    fireEvent.input(combobox(view), { target: { value: "raws/" } });
    await vi.waitFor(() => expect(ls).toHaveBeenCalledWith("raws/", {}));
  });
});
