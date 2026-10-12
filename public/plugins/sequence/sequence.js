//#region \0reline-host:@solidjs/web
var e = globalThis.__RELINE__?.web;
if (e === void 0) throw Error("Reline host not found: this plugin must be loaded by Reline");
e.ChildProperties, e.DOMElements, e.DOMWithState, e.DelegatedEvents, e.Dynamic, e.Errored, e.For, e.HREF, e.Hydration, e.HydrationScript, e.Loading, e.Match, e.MathMLElements, e.NULL_BODY_STATUSES, e.Namespaces, e.NoHydration, e.Portal, e.RESPONSE_HEADER_VALUE_LIMIT, e.REVALIDATE_HEADER, e.RawTextElements, e.Repeat, e.RequestContext, e.ResponseEnvelope, e.Reveal, e.SAFE_ERROR, e.SVGElements, e.Show, e.Switch, e.VoidElements, e.acquireAsset, e.addEvent, e.applyRef, e.assign, e.claimElement, e.claimElementTree, e.className, e.clearFlashCookie, e.clientOnly, e.commitEventResponse, e.composeMiddleware;
var t = e.createComponent;
e.createRequestEvent, e.createResponseStub, e.createSSRResponse;
var n = e.delegateEvents;
e.driveList, e.dynamic, e.dynamicProperty;
var r = e.effect;
e.escape, e.generateHydrationScript, e.getDelegatedRoot, e.getExpectedRedirectStatus, e.getFirstChild, e.getHydrationKey, e.getInsertionParent, e.getNextElement, e.getNextMarker, e.getNextMatch, e.getNextSibling, e.getOwner, e.getRequestEvent, e.getServerFunctionMetadata, e.getServerFunctionRPC, e.hasFlashCookie, e.httpHeader, e.httpStatus, e.hydrate;
var i = e.insert;
e.installHydrationRuntime, e.installListDriver, e.isDev, e.isHref, e.isResponseEnvelope, e.isSafeError, e.isServer, e.isServerFunction, e.listDriver, e.markSafeError;
var a = e.memo;
e.mergeProps, e.parseCookieHeader, e.patchDriver, e.redirect;
var o = e.ref;
e.registerDelegatedContainer, e.registerDelegatedRoot, e.registerElementClaim, e.reload, e.render, e.renderToStream, e.renderToString, e.resolveSSRNode, e.respond, e.rowProof, e.runHydrationEvents, e.scope, e.serializeCookie;
var s = e.setAttribute;
e.setAttributeNS, e.setProperty, e.setStyleProperty, e.spread, e.ssr, e.ssrAttribute, e.ssrClassName, e.ssrElement, e.ssrGroup, e.ssrHydrationKey, e.ssrStyle, e.ssrStyleProperty, e.style;
var c = e.template;
e.unregisterDelegatedContainer, e.unregisterDelegatedRoot, e.untrack, e.useHead, e.waitAsset, e.warmAsset;
//#endregion
//#region \0reline-host:solid-js
var l = globalThis.__RELINE__?.solid;
if (l === void 0) throw Error("Reline host not found: this plugin must be loaded by Reline");
l.$DEVCOMP, l.$PROXY, l.$REFRESH, l.$TRACK, l.DEV, l.Errored;
var u = l.For;
l.Hydration, l.Loading, l.Match, l.NoHydrateContext, l.NoHydration, l.NotReadyError, l.Repeat, l.Reveal;
var d = l.Show;
l.Switch, l.TimeoutError, l.action, l.affects, l.children, l.createComponent, l.createContext;
var f = l.createEffect;
l.createErrorBoundary, l.createLoadingBoundary;
var p = l.createMemo;
l.createOptimistic, l.createOptimisticStore, l.createOwner, l.createProjection, l.createReaction, l.createRenderEffect, l.createRevealOrder, l.createRoot;
var m = l.createSignal, h = l.createStore;
l.createTrackedEffect, l.createUniqueId, l.creationStamp, l.deep, l.enableExternalSource, l.enableHydration, l.enforceLoadingBoundary, l.flatten, l.flush, l.getNextChildId, l.getObserver, l.getOwner, l.getProjectionTrace, l.inServerComponentScope, l.isDisposed, l.isEqual, l.isPending, l.isWrappable, l.latest, l.lazy, l.mapArray, l.materializeContainerTrace, l.merge, l.omit, l.onCleanup, l.onSettled, l.patchableRaw, l.reconcile, l.refresh, l.registerPatch, l.registerRowOps, l.registerSlotPatch, l.repeat, l.resetErrorHalt, l.resolve, l.runInServerComponentScope, l.runWithOwner, l.sharedConfig, l.snapshot, l.ssrHandleError, l.ssrScope, l.storeHasFamily, l.storeHasOptimisticFamily, l.storeIsShallow, l.storePath, l.until;
var g = l.untrack;
l.useContext;
//#endregion
//#region sdk/index.ts
var _ = (e) => e, v = /* @__PURE__ */ c("<p class=rsq-note>"), y = /* @__PURE__ */ c("<li class=rsq-step><div class=rsq-head><!><span class=rsq-status></span></div><div class=rsq-tools><p class=rsq-meta><!><!></p><div class=rsq-buttons><!><!><!><!><!>"), b = /* @__PURE__ */ c("<ul class=rsq-list>"), x = /* @__PURE__ */ c("<p class=rsq-progress role=status>"), S = /* @__PURE__ */ c("<p class=rsq-err role=alert>"), C = /* @__PURE__ */ c("<div class=rsq><div class=rsq-actions><!><input type=file accept=.json,application/json multiple hidden></div><!><div class=rsq-actions><!><!></div><!><!>"), w = /* @__PURE__ */ c("<p class=rsq-muted>"), T = /* @__PURE__ */ c("<span class=rsq-badge role=status>"), E = "state", D = {
	en: {
		tab: "Sequence",
		empty: "No steps yet. Add the current stack, or import config files.",
		addCurrent: "Add current stack",
		importFiles: "Import configs…",
		stopOnError: "Stop at the first failure",
		run: "Run sequence",
		stop: "Stop",
		stepOf: "Step {n} of {total}: {name}",
		nodes: "{count} nodes",
		errors: "{count} errors",
		enable: "Include {name} in the sequence",
		name: "Step name",
		up: "Move up",
		down: "Move down",
		load: "Load into the editor",
		update: "Replace with the current stack",
		remove: "Remove step",
		status: {
			pending: "waiting",
			running: "running",
			ok: "done",
			failed: "failed",
			cancelled: "stopped"
		},
		invalid: "The config is invalid: {detail}",
		badFile: "{file}: {detail}",
		stepName: "Step {n}",
		badge: "Sequence {done}/{total}",
		done: "Sequence finished: {ok} of {total} steps done",
		nothing: "Nothing to run: no step is switched on"
	},
	ru: {
		tab: "Последовательность",
		empty: "Шагов пока нет. Добавьте текущий стек или импортируйте файлы конфигов.",
		addCurrent: "Добавить текущий стек",
		importFiles: "Импорт конфигов…",
		stopOnError: "Остановиться на первой ошибке",
		run: "Запустить по очереди",
		stop: "Стоп",
		stepOf: "Шаг {n} из {total}: {name}",
		nodes: "нод: {count}",
		errors: "ошибок: {count}",
		enable: "Включить {name} в последовательность",
		name: "Название шага",
		up: "Выше",
		down: "Ниже",
		load: "Загрузить в редактор",
		update: "Заменить текущим стеком",
		remove: "Убрать шаг",
		status: {
			pending: "ждёт",
			running: "идёт",
			ok: "готово",
			failed: "ошибка",
			cancelled: "остановлен"
		},
		invalid: "Конфиг некорректен: {detail}",
		badFile: "{file}: {detail}",
		stepName: "Шаг {n}",
		badge: "Последовательность {done}/{total}",
		done: "Последовательность завершена: готово шагов — {ok} из {total}",
		nothing: "Запускать нечего: ни один шаг не включён"
	}
}, O = (e, t = "") => Object.entries(e).reduce((e, [n, r]) => {
	let i = t === "" ? n : `${t}.${n}`;
	return typeof r == "string" ? {
		...e,
		[i]: r
	} : {
		...e,
		...O(r, i)
	};
}, {}), k = "\n.rsq { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }\n.rsq-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }\n.rsq-list { display: flex; flex-direction: column; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }\n.rsq-step { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding: var(--space-2) var(--space-3); background: var(--color-surface-strong); border: 1px solid var(--color-border); border-radius: var(--radius-md); }\n.rsq-step[data-status=\"running\"] { border-color: var(--color-primary); }\n.rsq-step[data-status=\"ok\"] { border-color: color-mix(in srgb, var(--color-success) 55%, var(--color-border)); }\n.rsq-step[data-status=\"failed\"] { border-color: var(--color-danger); }\n.rsq-step[data-off] { opacity: .55; }\n.rsq-head, .rsq-tools { display: flex; align-items: center; min-width: 0; gap: var(--space-2); }\n.rsq-head > .rsq-name { flex: 1; }\n.rsq-tools { flex-wrap: wrap; row-gap: var(--space-2); }\n.rsq-buttons { display: flex; flex: none; gap: var(--space-1); margin-left: auto; }\n.rsq-status { flex: none; color: var(--color-text-muted); font-size: var(--font-size-sm); }\n.rsq-step[data-status=\"failed\"] .rsq-status { color: var(--color-danger); }\n.rsq-meta { flex: none; margin: 0; white-space: nowrap; color: var(--color-text-muted); font-size: var(--font-size-sm); }\n.rsq-meta[data-bad] { color: var(--color-danger); }\n.rsq-note, .rsq-err { margin: 0; color: var(--color-danger); font-size: var(--font-size-sm); overflow-wrap: anywhere; }\n.rsq-muted, .rsq-progress { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }\n.rsq-badge { display: inline-flex; align-items: center; height: 24px; padding: 0 var(--space-2); color: var(--color-text); font-size: var(--font-size-sm); background: color-mix(in srgb, var(--color-primary) 40%, transparent); border-radius: var(--radius-sm); white-space: nowrap; }\n", A = _({ activate(e) {
	e.i18n.add("en", O(D.en)), e.i18n.add("ru", O(D.ru)), e.ui.styles(k);
	let { Button: n, IconButton: c, Switch: l, Input: _, Icon: A } = e.ui.kit, j = (t, n) => e.i18n.t(t, n), [M, N] = h((() => {
		let t = e.storage.getJson(E);
		return {
			steps: (Array.isArray(t?.steps) ? t.steps : []).map((e) => ({
				...e,
				status: e.status === "running" ? "pending" : e.status
			})),
			stopOnError: t?.stopOnError ?? !0
		};
	})()), [P, F] = m(""), [I, L] = m(!1), [R, z] = m({
		at: 0,
		total: 0,
		name: ""
	}), B = !1, [V, H] = m(0), U = (e) => {
		N(e), H((e) => e + 1);
	};
	f(V, () => {
		e.storage.set(E, g(() => JSON.stringify(M)));
	});
	let W = (e) => M.steps.findIndex((t) => t.id === e), G = (e, t) => U((n) => {
		let r = n.steps.findIndex((t) => t.id === e);
		r !== -1 && Object.assign(n.steps[r], t);
	}), K = () => typeof crypto < "u" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, q = () => JSON.parse(JSON.stringify(e.config.toPure(e.store.nodes()))), J = (e, t) => U((n) => {
		n.steps.push({
			id: K(),
			name: e,
			enabled: !0,
			config: t,
			status: "pending",
			note: ""
		});
	}), Y = () => {
		F(""), J(j("stepName", { n: M.steps.length + 1 }), q());
	}, X = async (t) => {
		F("");
		for (let n of Array.from(t)) try {
			let t = e.config.parse(await n.text()), r = JSON.parse(JSON.stringify(e.config.toPure(t)));
			J(n.name.replace(/\.json$/i, ""), r);
		} catch (e) {
			F(j("badFile", {
				file: n.name,
				detail: e instanceof Error ? e.message : String(e)
			}));
		}
	}, Z = (e, t) => U((n) => {
		let r = n.steps.findIndex((t) => t.id === e), i = r + t;
		if (r === -1 || i < 0 || i >= n.steps.length) return;
		let [a] = n.steps.splice(r, 1);
		n.steps.splice(i, 0, a);
	}), Q = (e) => U((t) => {
		t.steps = t.steps.filter((t) => t.id !== e);
	}), $ = (t) => {
		let n = M.steps[W(t)];
		if (n !== void 0) {
			F("");
			try {
				e.config.replaceStack(e.config.fromPure(n.config));
			} catch (e) {
				F(j("invalid", { detail: e instanceof Error ? e.message : String(e) }));
			}
		}
	}, ee = async () => {
		if (I()) return;
		let t = M.steps.filter((e) => e.enabled).map((e) => e.id);
		if (t.length === 0) {
			F(j("nothing"));
			return;
		}
		F(""), B = !1, L(!0);
		for (let e of t) G(e, {
			status: "pending",
			note: ""
		});
		let n = 0;
		try {
			for (let [r, i] of t.entries()) {
				if (B) break;
				let a = M.steps[W(i)];
				if (a === void 0) continue;
				z({
					at: r + 1,
					total: t.length,
					name: a.name
				}), G(i, { status: "running" });
				let o;
				try {
					let t = e.config.analyze(e.config.fromPure(a.config));
					if (t.errors > 0) {
						let e = t.diagnostics.find((e) => e.severity === "error");
						throw Error(e === void 0 ? "invalid" : j("errors", { count: t.errors }));
					}
					o = t.config;
				} catch (e) {
					if (G(i, {
						status: "failed",
						note: j("invalid", { detail: e instanceof Error ? e.message : String(e) })
					}), M.stopOnError) break;
					continue;
				}
				try {
					let t = await e.run.start(o);
					if (t.cancelled) {
						G(i, { status: "cancelled" });
						break;
					}
					if (t.ok) n += 1, G(i, { status: "ok" });
					else if (G(i, {
						status: "failed",
						note: e.i18n.t("status.failed")
					}), M.stopOnError) break;
				} catch (e) {
					G(i, {
						status: "failed",
						note: e instanceof Error ? e.message : String(e)
					});
					break;
				}
			}
		} finally {
			L(!1), F(j("done", {
				ok: n,
				total: t.length
			}));
		}
	}, te = () => {
		B = !0, e.run.stop();
	}, ne = (t) => {
		try {
			let n = e.config.analyze(e.config.fromPure(t));
			return {
				nodes: t.nodes.length,
				errors: n.errors
			};
		} catch {
			return {
				nodes: t.nodes.length,
				errors: 1
			};
		}
	}, re = (e) => {
		let n = p(() => ne(e.step.config));
		var o = y(), u = o.firstChild, f = u.firstChild, m = f.nextSibling, h = u.nextSibling.firstChild, g = h.firstChild, b = g.nextSibling, x = h.nextSibling, S = x.firstChild, C = S.nextSibling, w = C.nextSibling, T = w.nextSibling, E = T.nextSibling;
		return i(u, t(l, {
			get checked() {
				return e.step.enabled;
			},
			onChange: (t) => G(e.step.id, { enabled: t }),
			get ariaLabel() {
				return j("enable", { name: e.step.name });
			}
		}), f), i(u, t(_, {
			class: "rsq-name",
			get value() {
				return e.step.name;
			},
			get "aria-label"() {
				return j("name");
			},
			get disabled() {
				return I();
			},
			onInput: (t) => G(e.step.id, { name: t.currentTarget.value })
		}), m), i(m, () => j(`status.${e.step.status}`)), i(h, () => j("nodes", { count: n().nodes }), g), i(h, t(d, {
			get when() {
				return n().errors > 0;
			},
			get children() {
				return [" · ", a(() => j("errors", { count: n().errors }))];
			}
		}), b), i(x, t(c, {
			icon: "arrow-up",
			get label() {
				return j("up");
			},
			get disabled() {
				return I() || e.index === 0;
			},
			onClick: () => Z(e.step.id, -1)
		}), S), i(x, t(c, {
			icon: "arrow-down",
			get label() {
				return j("down");
			},
			get disabled() {
				return I() || e.index === M.steps.length - 1;
			},
			onClick: () => Z(e.step.id, 1)
		}), C), i(x, t(c, {
			icon: "pencil",
			get label() {
				return j("load");
			},
			get disabled() {
				return I();
			},
			onClick: () => $(e.step.id)
		}), w), i(x, t(c, {
			icon: "refresh",
			get label() {
				return j("update");
			},
			get disabled() {
				return I();
			},
			onClick: () => G(e.step.id, { config: q() })
		}), T), i(x, t(c, {
			icon: "trash",
			get label() {
				return j("remove");
			},
			get disabled() {
				return I();
			},
			onClick: () => Q(e.step.id)
		}), E), i(o, t(d, {
			get when() {
				return e.step.note !== "";
			},
			get children() {
				var t = v();
				return i(t, () => e.step.note), t;
			}
		}), null), r(() => ({
			e: e.step.status,
			t: e.step.enabled ? void 0 : "",
			a: n().errors > 0 ? "" : void 0
		}), ({ e, t, a: n }, r) => {
			e !== r?.e && s(o, "data-status", e), t !== r?.t && s(o, "data-off", t), n !== r?.a && s(h, "data-bad", n);
		}), o;
	};
	e.ui.panelTab({
		id: "sequence",
		label: e.i18n.text("tab"),
		Component: () => {
			let e;
			var r = C(), s = r.firstChild, c = s.firstChild, f = c.nextSibling, p = s.nextSibling, m = p.nextSibling, h = m.firstChild, g = h.nextSibling, _ = m.nextSibling, v = _.nextSibling;
			i(s, t(n, {
				get disabled() {
					return I();
				},
				onClick: Y,
				get children() {
					return [t(A, {
						name: "plus",
						size: 14
					}), a(() => j("addCurrent"))];
				}
			}), c), i(s, t(n, {
				get disabled() {
					return I();
				},
				onClick: () => e?.click(),
				get children() {
					return [t(A, {
						name: "upload",
						size: 14
					}), a(() => j("importFiles"))];
				}
			}), f), f.$$input = (e) => {
				let t = e.currentTarget.files;
				t !== null && t.length > 0 && X(t), e.currentTarget.value = "";
			};
			var y = e;
			return typeof y == "function" || Array.isArray(y) ? o(() => y, f) : e = f, i(r, t(d, {
				get when() {
					return M.steps.length > 0;
				},
				get fallback() {
					var e = w();
					return i(e, () => j("empty")), e;
				},
				get children() {
					var e = b();
					return i(e, t(u, {
						get each() {
							return M.steps;
						},
						children: (e, n) => t(re, {
							step: e,
							get index() {
								return n();
							}
						})
					})), e;
				}
			}), p), i(r, t(l, {
				get checked() {
					return M.stopOnError;
				},
				onChange: (e) => U((t) => {
					t.stopOnError = e;
				}),
				get label() {
					return j("stopOnError");
				}
			}), m), i(m, t(n, {
				variant: "primary",
				get disabled() {
					return I() || M.steps.length === 0;
				},
				onClick: () => void ee(),
				get children() {
					return [t(A, {
						name: "play",
						size: 14
					}), a(() => j("run"))];
				}
			}), h), i(m, t(n, {
				get disabled() {
					return !I();
				},
				onClick: te,
				get children() {
					return [t(A, {
						name: "stop",
						size: 14
					}), a(() => j("stop"))];
				}
			}), g), i(r, t(d, {
				get when() {
					return I();
				},
				get children() {
					var e = x();
					return i(e, () => j("stepOf", {
						n: R().at,
						total: R().total,
						name: R().name
					})), e;
				}
			}), _), i(r, t(d, {
				get when() {
					return P() !== "";
				},
				get children() {
					var e = S();
					return i(e, P), e;
				}
			}), v), r;
		},
		order: 45
	}), e.ui.slot("topbar", () => t(d, {
		get when() {
			return I();
		},
		get children() {
			var e = T();
			return i(e, () => j("badge", {
				done: R().at,
				total: R().total
			})), e;
		}
	}));
} });
n(["input"]);
//#endregion
export { A as default };
