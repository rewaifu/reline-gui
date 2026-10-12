// A plugin for the sandboxed tier: it runs in a Web Worker, sees nothing of the
// editor and is handed one thing — the config of a run, just before it is sent.
// Written by hand as a plain ES module: no build step, no imports, nothing to
// bundle (the worker has no Solid and no DOM to share).
//
// What it does: appends "-sandboxed" to the output folder of every writer, so a
// run launched with this plugin never writes over the plain output.

const SUFFIX = "-sandboxed";

export default {
  activate(api) {
    api.log(`ready (v${api.version})`);
    api.pipeline.beforeRun((config) => ({
      ...config,
      nodes: config.nodes.map((node) => {
        if (
          node.type !== "folder_writer" ||
          typeof node.options.path !== "string"
        )
          return node;
        const path = node.options.path.replace(/\/+$/, "");
        return path.endsWith(SUFFIX)
          ? node
          : { ...node, options: { ...node.options, path: path + SUFFIX } };
      }),
    }));
  },
};
