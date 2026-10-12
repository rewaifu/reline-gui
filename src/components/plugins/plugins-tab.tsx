import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  Match,
  Switch,
  createSignal,
  onSettled,
} from "solid-js";
import { Icon, Input, UiButton, UiSwitch } from "~/components/ui";
import { locale, message, raw, render, t, type LocalText } from "~/lib/i18n";
import { pipeline } from "~/lib/pipeline/hooks";
import { PluginLoadError } from "~/lib/plugins/loader";
import {
  loadCatalog,
  searchCatalog,
  type Catalog,
  type CatalogPlugin,
} from "~/lib/plugins/catalog";
import {
  CAPABILITIES,
  compareVersions,
  pluginDescription,
  type Capability,
} from "~/lib/plugins/manifest";
import { pluginRuntime, type InstallPreview } from "~/lib/plugins/runtime";
import { pluginStore, type InstalledPlugin } from "~/lib/plugins/store";
import styles from "./plugins-tab.module.scss";

const describeError = (error: unknown): LocalText => {
  if (error instanceof PluginLoadError)
    return message(`plugins.error.${error.kind}`, { detail: error.message });
  return message("plugins.error.other", {
    detail: error instanceof Error ? error.message : String(error),
  });
};

/** What a plugin is about to be allowed to do, before it is installed. */
const Consent: Component<{
  preview: InstallPreview;
  busy: boolean;
  onConfirm: (granted: Capability[]) => void;
  onCancel: () => void;
}> = (props) => {
  // every requested permission starts granted; the user may take any away and
  // the plugin simply will not see that part of the API
  const [denied, setDenied] = createSignal<ReadonlySet<Capability>>(new Set());
  const granted = () =>
    props.preview.manifest.caps.filter((cap) => !denied().has(cap));
  const toggle = (cap: Capability) =>
    setDenied((all) => {
      const next = new Set(all);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });
  const updating = () => props.preview.existing !== undefined;
  // the card opens above a long list when it was asked for from the catalog
  // far below: bring it into view
  let root: HTMLElement | undefined;
  onSettled(() => {
    root?.scrollIntoView?.({ block: "nearest" });
  });

  return (
    <section
      ref={root}
      class={styles.consent}
      aria-label={t("plugins.consent.title")}
    >
      <h3 class={styles.consentTitle}>
        {updating()
          ? t("plugins.consent.updateTitle")
          : t("plugins.consent.title")}
      </h3>
      <p class={styles.name}>
        {props.preview.manifest.name}
        <span class={styles.id}>{props.preview.manifest.id}</span>
      </p>
      <Show when={pluginDescription(props.preview.manifest, locale())}>
        {(text) => <p class={styles.muted}>{text()}</p>}
      </Show>
      <dl class={styles.facts}>
        <dt>{t("plugins.consent.source")}</dt>
        <dd>{props.preview.origin}</dd>
        <dt>{t("plugins.consent.version")}</dt>
        <dd>
          {props.preview.existing === undefined
            ? props.preview.manifest.version
            : t("plugins.consent.fromVersion", {
                from: props.preview.existing.manifest.version,
                to: props.preview.manifest.version,
              })}
        </dd>
        <dt>{t("plugins.consent.runsIn")}</dt>
        <dd>
          {props.preview.manifest.sandbox === "worker"
            ? t("plugins.consent.inWorker")
            : t("plugins.consent.inPage")}
        </dd>
        <dt>{t("plugins.consent.hash")}</dt>
        <dd class={styles.hash}>{props.preview.integrity}</dd>
      </dl>
      <p class={styles.sectionLabel}>{t("plugins.consent.grants")}</p>
      <ul class={styles.caps}>
        <For each={props.preview.manifest.caps}>
          {(cap) => (
            <li>
              <label class={styles.cap}>
                <input
                  type="checkbox"
                  checked={!denied().has(cap)}
                  onChange={() => toggle(cap)}
                />
                <span>
                  <strong>{cap}</strong> — {t(`plugins.caps.${cap}`)}
                  <Show
                    when={props.preview.newCaps.includes(cap) && updating()}
                  >
                    <span class={styles.badge}> NEW</span>
                  </Show>
                </span>
              </label>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.preview.unpinned}>
        <p class={styles.warn}>{t("plugins.consent.unpinned")}</p>
      </Show>
      <Show when={props.preview.missing.length > 0}>
        <p class={styles.warn}>
          {t("plugins.consent.missing", {
            list: props.preview.missing.join(", "),
          })}
        </p>
      </Show>
      <p class={styles.warn}>{t("plugins.consent.warning")}</p>
      <div class={styles.actions}>
        <UiButton
          variant="primary"
          disabled={props.busy}
          onClick={() => props.onConfirm(granted())}
        >
          {updating()
            ? t("plugins.consent.update")
            : t("plugins.consent.install")}
        </UiButton>
        <UiButton onClick={() => props.onCancel()}>
          {t("plugins.consent.cancel")}
        </UiButton>
      </div>
    </section>
  );
};

const PluginRow: Component<{
  plugin: InstalledPlugin;
  onUpdate: (url: string) => void;
}> = (props) => {
  const status = () => pluginRuntime.status(props.plugin.manifest.id);
  const origin = () => {
    try {
      return new URL(props.plugin.manifestUrl).origin;
    } catch {
      return props.plugin.manifestUrl;
    }
  };
  const lines = () => pluginRuntime.log(props.plugin.manifest.id).slice(-3);
  return (
    <li class={styles.row} data-state={status().state}>
      <div class={styles.rowHead}>
        <span class={styles.name}>
          {props.plugin.manifest.name}
          <span class={styles.id}> {props.plugin.manifest.version}</span>
        </span>
        <span class={styles.state}>{t(`plugins.state.${status().state}`)}</span>
        <UiSwitch
          checked={props.plugin.enabled}
          onChange={(on) =>
            on
              ? void pluginRuntime.enable(props.plugin.manifest.id)
              : pluginRuntime.disable(props.plugin.manifest.id)
          }
          ariaLabel={t("plugins.list.enable", {
            name: props.plugin.manifest.name,
          })}
        />
        <button
          type="button"
          class={styles.iconBtn}
          aria-label={t("plugins.list.removeAria", {
            name: props.plugin.manifest.name,
          })}
          title={t("plugins.list.remove")}
          onClick={() => pluginRuntime.remove(props.plugin.manifest.id)}
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
      <p class={styles.muted}>
        {props.plugin.manifest.id} · {origin()}
      </p>
      <Show when={pluginDescription(props.plugin.manifest, locale())}>
        {(text) => <p class={styles.muted}>{text()}</p>}
      </Show>
      <Show when={props.plugin.disabledReason === "crash"}>
        <p class={styles.warn}>{t("plugins.crashDisabled")}</p>
      </Show>
      <Show when={status().error}>
        {(text) => <p class={styles.err}>{text()}</p>}
      </Show>
      <p class={styles.chips}>
        <Show when={props.plugin.manifest.sandbox === "worker"}>
          <span class={styles.chip}>worker</span>
        </Show>
        <For
          each={CAPABILITIES.filter((c) =>
            props.plugin.grantedCaps.includes(c),
          )}
        >
          {(cap) => <span class={styles.chip}>{cap}</span>}
        </For>
      </p>
      <Show when={lines().length > 0}>
        <details class={styles.log}>
          <summary>{t("plugins.list.log")}</summary>
          <For each={lines()}>{(line) => <p>{line.text}</p>}</For>
        </details>
      </Show>
      <button
        type="button"
        class={styles.link}
        onClick={() => props.onUpdate(props.plugin.manifestUrl)}
      >
        {t("plugins.list.update")}
      </button>
    </li>
  );
};

type CatalogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; catalog: Catalog }
  | { status: "failed"; reason: LocalText };

/** The plugins this build vouches for, read from the JSON beside the app. It is
 * closed until asked for — with a hundred entries it would bury the plugins the
 * user actually has — and loaded on the first opening. Choosing an entry fills
 * the link field and opens the usual consent step. */
const CatalogSection: Component<{
  onPick: (entry: CatalogPlugin) => void;
}> = (props) => {
  const [state, setState] = createSignal<CatalogState>({ status: "idle" });
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");

  const load = async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", catalog: await loadCatalog() });
    } catch (error) {
      setState({ status: "failed", reason: describeError(error) });
    }
  };
  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next && state().status === "idle") void load();
  };

  /** What the button of an entry does, given what is installed. */
  const action = (entry: CatalogPlugin) => {
    const installed = pluginStore.get(entry.id);
    if (installed === undefined) return "install" as const;
    return compareVersions(entry.version, installed.manifest.version) > 0
      ? ("update" as const)
      : ("installed" as const);
  };

  const ready = () => {
    const current = state();
    return current.status === "ready" ? current.catalog : undefined;
  };
  const failed = () => {
    const current = state();
    return current.status === "failed" ? current.reason : undefined;
  };
  const found = createMemo(() =>
    searchCatalog(ready()?.plugins ?? [], query()),
  );

  return (
    <section class={styles.catalog}>
      <button
        type="button"
        class={styles.disclosure}
        aria-expanded={open() ? "true" : "false"}
        onClick={toggle}
      >
        <Icon name={open() ? "chevron-down" : "chevron-right"} size={14} />
        {t("plugins.catalog.title")}
        <Show when={ready()}>
          {(catalog) => (
            <span class={styles.count}>{catalog().plugins.length}</span>
          )}
        </Show>
      </button>
      <Show when={open()}>
        <Switch
          fallback={<p class={styles.muted}>{t("plugins.catalog.loading")}</p>}
        >
          <Match when={failed()}>
            {(reason) => (
              <>
                <p class={styles.muted}>
                  {t("plugins.catalog.failed", { detail: render(reason()) })}
                </p>
                <button
                  type="button"
                  class={styles.link}
                  onClick={() => void load()}
                >
                  {t("plugins.catalog.retry")}
                </button>
              </>
            )}
          </Match>
          <Match when={ready()}>
            <Input
              type="search"
              value={query()}
              placeholder={t("plugins.catalog.search")}
              aria-label={t("plugins.catalog.search")}
              spellcheck={false}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <Show
              when={found().length > 0}
              fallback={
                <p class={styles.muted}>{t("plugins.catalog.empty")}</p>
              }
            >
              <ul class={[styles.list, styles.catalogList]}>
                <For each={found()}>
                  {(entry) => (
                    <li class={styles.row}>
                      <div class={styles.rowHead}>
                        <span class={styles.name}>
                          {entry.name}
                          <span class={styles.id}> {entry.version}</span>
                        </span>
                        <UiButton
                          disabled={action(entry) === "installed"}
                          onClick={() => props.onPick(entry)}
                        >
                          {t(`plugins.catalog.${action(entry)}`)}
                        </UiButton>
                      </div>
                      <Show when={pluginDescription(entry, locale())}>
                        {(text) => <p class={styles.muted}>{text()}</p>}
                      </Show>
                      <p class={styles.chips}>
                        <Show when={entry.sandbox === "worker"}>
                          <span class={styles.chip}>worker</span>
                        </Show>
                        <For each={entry.caps}>
                          {(cap) => <span class={styles.chip}>{cap}</span>}
                        </For>
                      </p>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Match>
        </Switch>
      </Show>
    </section>
  );
};

export const PluginsTab: Component = () => {
  const [url, setUrl] = createSignal("");
  const [preview, setPreview] = createSignal<InstallPreview>();
  const [busy, setBusy] = createSignal(false);
  const [problem, setProblem] = createSignal<LocalText>();

  const check = async (target: string, pin?: string) => {
    if (target.trim() === "") return;
    setBusy(true);
    setProblem(undefined);
    setPreview(undefined);
    try {
      setPreview(await pluginRuntime.preview(target, pin));
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  // a `?plugin=` link is shown here for consent, never installed on sight
  createEffect(
    () => pluginRuntime.pendingInstall(),
    (link) => {
      if (link === undefined) return;
      setUrl(link);
      pluginRuntime.clearPendingInstall();
      void check(link);
    },
  );

  const confirm = async (granted: Capability[]) => {
    const current = preview();
    if (current === undefined) return;
    setBusy(true);
    try {
      await pluginRuntime.install(current, granted);
      setPreview(undefined);
      setUrl("");
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const recent = () => pipeline.failures().slice(-5).reverse();

  return (
    <div class={styles.tab}>
      <Show when={pluginRuntime.boot().safeMode}>
        <p class={styles.warn}>{t("plugins.safeMode")}</p>
      </Show>
      <Show when={pluginRuntime.boot().crashed.length > 0}>
        <p class={styles.warn}>
          {t("plugins.crashed", {
            ids: pluginRuntime.boot().crashed.join(", "),
          })}
        </p>
      </Show>

      <form
        class={styles.install}
        onSubmit={(e) => {
          e.preventDefault();
          void check(url());
        }}
      >
        <label class={styles.sectionLabel} for="plugin-url">
          {t("plugins.install.title")}
        </label>
        <div class={styles.installRow}>
          <Input
            id="plugin-url"
            class={styles.input}
            value={url()}
            placeholder={t("plugins.install.placeholder")}
            spellcheck={false}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
          <UiButton type="submit" disabled={busy() || url().trim() === ""}>
            {busy() && preview() === undefined
              ? t("plugins.install.checking")
              : t("plugins.install.check")}
          </UiButton>
        </div>
      </form>

      <Show when={problem()}>
        {(text) => (
          <p class={styles.err} role="alert">
            {render(text())}
          </p>
        )}
      </Show>

      <Show when={preview()}>
        {(current) => (
          <Consent
            preview={current()}
            busy={busy()}
            onConfirm={(granted) => void confirm(granted)}
            onCancel={() => setPreview(undefined)}
          />
        )}
      </Show>

      <p class={styles.sectionLabel}>{t("plugins.list.title")}</p>
      <Show
        when={pluginStore.list().length > 0}
        fallback={<p class={styles.muted}>{t("plugins.list.empty")}</p>}
      >
        <ul class={styles.list}>
          <For each={pluginStore.list()}>
            {(plugin) => (
              <PluginRow
                plugin={plugin}
                onUpdate={(target) => {
                  setUrl(target);
                  void check(target);
                }}
              />
            )}
          </For>
        </ul>
      </Show>

      <CatalogSection
        onPick={(entry) => {
          setUrl(entry.manifestUrl);
          void check(entry.manifestUrl, entry.integrity);
        }}
      />

      <Show when={recent().length > 0}>
        <p class={styles.sectionLabel}>{t("plugins.failures")}</p>
        <ul class={styles.failures}>
          <For each={recent()}>
            {(failure) => (
              <li>
                <code>{failure.id}</code> · {failure.stage}
                {failure.disabled ? " ⏻" : ""}: {render(raw(failure.message))}
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
};
