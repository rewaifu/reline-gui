import { defineConfig } from "oxlint";
import solidV2 from "eslint-plugin-solid/configs/v2";

export default defineConfig({
  jsPlugins: ["eslint-plugin-solid"],
  ignorePatterns: ["**/*.gen.*", "dist"],
  settings: solidV2.settings,
  rules: {
    ...solidV2.rules,
    // Solid refs assign `let el` from JSX (`ref={el}`) — invisible to a
    // static assignment check, so the rule misfires on the standard idiom.
    "no-unassigned-vars": "off",
    // DOM JSX types (JSX, ComponentProps<"tag">) only exist on
    // @solidjs/web in 2.0 — solid-js's ComponentProps takes a component,
    // not a tag string, so the rule's preference does not typecheck.
    "solid/imports": "off",
  },
});
