import { createEffect } from "solid-js";

/**
 * Kobalte's dismissable layer does not close the listbox on outside
 * interaction under solid 2 rc — close it ourselves: any pointer down that
 * lands outside the trigger block and the portaled content, plus Escape.
 *
 * Shared by UiSelect and UiCombobox (the two listbox-style controls).
 */
export const createDismissOnOutside = (
  open: () => boolean,
  setOpen: (value: boolean) => void,
  containers: () => Array<HTMLElement | undefined>,
): void => {
  createEffect(
    () => open(),
    (isOpen) => {
      if (!isOpen) return;

      const onPointerDown = (e: PointerEvent) => {
        const target = e.target;
        if (
          target instanceof Node &&
          containers().some((el) => el?.contains(target))
        )
          return;
        setOpen(false);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown);
      };
    },
  );
};
