import * as v from "valibot";
import { storage } from "~/lib/storage";
import { PluginManifestSchema, type PluginManifest } from "./manifest";

/** Why a plugin could not be fetched or accepted. `kind` is for the UI to pick
 * a message; `message` is for the log. */
export class PluginLoadError extends Error {
  readonly kind: "network" | "manifest" | "integrity" | "policy" | "size";
  constructor(kind: PluginLoadError["kind"], message: string) {
    super(message);
    this.name = "PluginLoadError";
    this.kind = kind;
  }
}

export const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;
const ALLOWED_ORIGINS_KEY = "reline-web:plugins:allow";

/** A development server on this machine: the one place plain `http:` and a
 * missing integrity are accepted. */
export const isLoopback = (url: URL): boolean =>
  url.hostname === "localhost" ||
  url.hostname === "127.0.0.1" ||
  url.hostname === "[::1]";

/** Origins plugins may be installed from. Empty = any origin the other rules
 * allow. A user (or an organisation, through a pre-seeded storage) who wants to
 * restrict installs to a vetted source sets it. */
export const allowedOrigins = (): string[] => {
  const stored = storage.getJson(ALLOWED_ORIGINS_KEY);
  return Array.isArray(stored)
    ? stored.filter((o): o is string => typeof o === "string")
    : [];
};

export const setAllowedOrigins = (origins: readonly string[]): void => {
  storage.setJson(ALLOWED_ORIGINS_KEY, [...origins]);
};

/** Throws unless the URL may be fetched as plugin material. */
export const checkUrl = (url: URL): void => {
  const secure = url.protocol === "https:";
  if (!secure && !(url.protocol === "http:" && isLoopback(url)))
    throw new PluginLoadError(
      "policy",
      `only https: URLs are accepted (got ${url.protocol})`,
    );
  const allowed = allowedOrigins();
  if (allowed.length > 0 && !allowed.includes(url.origin))
    throw new PluginLoadError(
      "policy",
      `${url.origin} is not in the allowed origins`,
    );
};

/** `sha384-<base64>` of the text, the format of an SRI attribute. */
export const sha384 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-384",
    new TextEncoder().encode(text),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest))
    binary += String.fromCharCode(byte);
  return `sha384-${btoa(binary)}`;
};

/** Fetch a text file with the size limit and without cookies or cache. */
export const fetchText = async (url: URL, limit: number): Promise<string> => {
  let response: Response;
  try {
    // no cookies, no cache: a plugin URL is public material, and a stale copy
    // under a pinned hash would only fail the pin
    response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
    });
  } catch (error) {
    throw new PluginLoadError(
      "network",
      `${url.href}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok)
    throw new PluginLoadError(
      "network",
      `${url.href}: HTTP ${response.status}`,
    );
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit)
    throw new PluginLoadError(
      "size",
      `${url.href}: larger than ${limit} bytes`,
    );
  const text = await response.text();
  if (text.length > limit)
    throw new PluginLoadError(
      "size",
      `${url.href}: larger than ${limit} bytes`,
    );
  return text;
};

/** A manifest that was fetched and parsed, with the entry URL resolved. */
export interface ManifestCandidate {
  manifest: PluginManifest;
  manifestUrl: string;
  entryUrl: string;
}

/** Fetch and check a manifest. `input` may be relative to the page. Nothing of
 * the plugin runs, and the entry is not fetched yet. */
export const fetchManifest = async (
  input: string,
  base: string = window.location.href,
): Promise<ManifestCandidate> => {
  let manifestUrl: URL;
  try {
    manifestUrl = new URL(input.trim(), base);
  } catch {
    throw new PluginLoadError("manifest", "not a URL");
  }
  checkUrl(manifestUrl);
  const text = await fetchText(manifestUrl, MAX_MANIFEST_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PluginLoadError("manifest", "the manifest is not JSON");
  }
  const parsed = v.safeParse(PluginManifestSchema, json);
  if (!parsed.success) {
    const issue = parsed.issues[0];
    throw new PluginLoadError(
      "manifest",
      `${issue.path?.map((p) => String(p.key)).join(".") ?? "manifest"}: ${issue.message}`,
    );
  }
  const manifest = parsed.output;
  let entryUrl: URL;
  try {
    entryUrl = new URL(manifest.entry, manifestUrl);
  } catch {
    throw new PluginLoadError("manifest", "entry is not a URL");
  }
  checkUrl(entryUrl);
  // the origin is what the user is asked to trust: code from somewhere else is
  // accepted only when the manifest pins exactly its bytes
  if (
    entryUrl.origin !== manifestUrl.origin &&
    manifest.integrity === undefined
  )
    throw new PluginLoadError(
      "policy",
      "an entry on another origin must be pinned with integrity",
    );
  if (manifest.integrity === undefined && !isLoopback(manifestUrl))
    throw new PluginLoadError(
      "policy",
      "the manifest must pin the entry with integrity",
    );
  return {
    manifest,
    manifestUrl: manifestUrl.href,
    entryUrl: entryUrl.href,
  };
};

/** Fetch the entry and check it against the manifest's pin. Returns the code
 * with the hash of exactly those bytes — what the host will store and run. */
export const fetchEntry = async (
  candidate: Pick<ManifestCandidate, "manifest" | "entryUrl">,
): Promise<{ code: string; integrity: string }> => {
  const code = await fetchText(new URL(candidate.entryUrl), MAX_ENTRY_BYTES);
  const integrity = await sha384(code);
  const pinned = candidate.manifest.integrity;
  if (pinned !== undefined && pinned !== integrity)
    throw new PluginLoadError(
      "integrity",
      `the code does not match the manifest's integrity (got ${integrity})`,
    );
  return { code, integrity };
};
