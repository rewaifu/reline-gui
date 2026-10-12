import { wsHub } from "~/lib/ws";

export interface LsOptions {
  ext?: string[];
  /** Only files, no directories — for callers that complete a file rather
   * than walk the tree (`files_only` on the wire). */
  filesOnly?: boolean;
}

export interface LsResult {
  entries: string[];
  dirs: string[];
}

/** Path completion: one lookup, answered by the shared connection. */
export const lsClient = {
  ls: (path: string, options: LsOptions = {}): Promise<LsResult> => {
    const data: Record<string, unknown> = { path };
    if (options.ext !== undefined) data.ext = options.ext;
    if (options.filesOnly === true) data.files_only = true;
    return wsHub.call("ls", data) as Promise<LsResult>;
  },
};
