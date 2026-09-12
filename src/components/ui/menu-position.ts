import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import { createEffect } from "solid-js";

export type MenuPlacement = "bottom-start" | "top-start";

/** Portaled menu positioning (replaces the Kobalte popper): fixed under the
 * anchor with a 4px gutter, flipping to the other side when there is no
 * room. The content keeps `position: fixed` from its stylesheet; coordinates
 * and `--menu-available-height` land inline. Stays hidden until the first
 * computation so no frame flashes at the origin. */
export const createMenuPosition = (
  open: () => boolean,
  anchor: () => HTMLElement | undefined,
  content: () => HTMLElement | undefined,
  placement: () => MenuPlacement,
  gutter = 4,
): void => {
  createEffect(open, (isOpen) => {
    if (!isOpen) return;
    const anchorEl = anchor();
    const contentEl = content();
    if (anchorEl === undefined || contentEl === undefined) return;
    contentEl.style.visibility = "hidden";
    const update = () => {
      void computePosition(anchorEl, contentEl, {
        placement: placement(),
        middleware: [
          offset(gutter),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          size({
            padding: 8,
            apply({ availableHeight, rects }) {
              contentEl.style.setProperty(
                "--menu-available-height",
                `${Math.floor(availableHeight)}px`,
              );
              contentEl.style.minWidth = `${Math.round(rects.reference.width)}px`;
            },
          }),
        ],
      }).then(({ x, y }) => {
        contentEl.style.left = `${Math.round(x)}px`;
        contentEl.style.top = `${Math.round(y)}px`;
        contentEl.style.visibility = "visible";
      });
    };
    update();
    return autoUpdate(anchorEl, contentEl, update);
  });
};
