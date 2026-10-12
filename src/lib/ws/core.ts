import * as v from "valibot";
import { wsMethods } from "./methods";

/** The `ls` method (WS_API.md): list a directory of the runner's file system.
 * `root` is not sent — the deployment sets the base it browses. A reply that
 * leaves out a list is read as an empty one. */
export const LsReply = v.object({
  entries: v.optional(v.array(v.string()), []),
  dirs: v.optional(v.array(v.string()), []),
});

wsMethods.define({
  name: "ls",
  request: v.object({
    path: v.string(),
    ext: v.optional(v.array(v.string())),
    files_only: v.optional(v.boolean()),
  }),
  response: LsReply,
});
