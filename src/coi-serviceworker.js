/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        } else if (ev.data.type === "notify-focus-studio") {
            // Show a click-to-open notification. The in-call Zoom tab (a separate,
            // cross-origin-isolated browsing context) cannot focus the Studio tab
            // itself — but a service worker CAN focus a WindowClient from a
            // notificationclick. This is the only sanctioned way to bring an
            // existing background tab to the front.
            ev.waitUntil(self.registration.showNotification("Prescribe ATC is ready", {
                body: "Click to open your Dynamic Studio tab on the Prescribe ATC step.",
                tag: "prescribe-atc",
                renotify: true,
                requireInteraction: false,
                data: { step: ev.data.step, url: ev.data.url }
            }));
        }
    });

    self.addEventListener("notificationclick", (ev) => {
        const step = ev.notification && ev.notification.data && ev.notification.data.step;
        const url = ev.notification && ev.notification.data && ev.notification.data.url;
        ev.notification.close();
        ev.waitUntil((async () => {
            const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            const studio = all.find((c) => (c.url || "").includes("/dynamicstudio"));
            if (studio) {
                // Tell it to switch to the step, then bring it to the front.
                try { studio.postMessage({ type: "goto-step", step: step }); } catch (e) {}
                try { await studio.focus(); } catch (e) {}
            } else if (url) {
                try { await self.clients.openWindow(url); } catch (e) {}
            }
        })());
    });

    // ----------------------------------------------------------------------
    // ORIGINAL v0.1.7 fetch handler (kept for reference — replaced below).
    // It proxied EVERY request and, on failure, ran `.catch((e) => console.error(e))`
    // which resolves respondWith() to `undefined` → "Failed to convert value to
    // 'Response'" + "network error response". See replacement handler below.
    //
    // self.addEventListener("fetch", function (event) {
    //     const r = event.request;
    //     if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
    //         return;
    //     }
    //
    //     const request = (coepCredentialless && r.mode === "no-cors")
    //         ? new Request(r, {
    //             credentials: "omit",
    //         })
    //         : r;
    //     event.respondWith(
    //         fetch(request)
    //             .then((response) => {
    //                 if (response.status === 0) {
    //                     return response;
    //                 }
    //
    //                 const newHeaders = new Headers(response.headers);
    //                 newHeaders.set("Cross-Origin-Embedder-Policy",
    //                     coepCredentialless ? "credentialless" : "require-corp"
    //                 );
    //                 if (!coepCredentialless) {
    //                     newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
    //                 }
    //                 newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    //
    //                 return new Response(response.body, {
    //                     status: response.status,
    //                     statusText: response.statusText,
    //                     headers: newHeaders,
    //                 });
    //             })
    //             .catch((e) => console.error(e))
    //     );
    // });
    // ----------------------------------------------------------------------

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        // Only proxy SAME-ORIGIN GET requests. Those are the document + local
        // assets that actually need COOP/COEP headers injected to make the page
        // crossOriginIsolated (for the Zoom SDK's SharedArrayBuffer).
        //
        // Cross-origin resources (Google Fonts, unpkg Material theme, cdnjs
        // Font Awesome, Firebase Storage) must NOT be re-fetched here: under
        // COEP they load credentialless natively, and re-fetching them through
        // this worker only risks a "Failed to fetch" that previously turned into
        // a broken response ("Failed to convert value to 'Response'"). Letting
        // the browser handle them directly is both correct and reliable.
        let sameOrigin = false;
        try { sameOrigin = new URL(r.url).origin === self.location.origin; } catch (_) { sameOrigin = false; }
        if (r.method !== "GET" || !sameOrigin) {
            return;
        }

        event.respondWith(
            fetch(r)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    if (!coepCredentialless) {
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    }
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => {
                    // NEVER resolve respondWith() to `undefined` — that throws
                    // "Failed to convert value to 'Response'". Surface the network
                    // failure as a normal error Response instead so the browser
                    // treats it like any other failed request.
                    console.error(e);
                    return new Response("coi-serviceworker fetch failed: " + e, {
                        status: 502,
                        statusText: "coi-serviceworker fetch failed",
                    });
                })
        );
    });

} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = (reloadedBySelf == "coepdegrade");

        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record the failure if the page is served by serviceWorker.
        if (controlling && !window.crossOriginIsolated) {
            window.sessionStorage.setItem("coiCoepHasFailed", "true");
        }
        const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

        if (controlling) {
            // Reload only on the first failure.
            const reloadToDegrade = coi.coepDegrade() && !(
                coepDegrading || window.crossOriginIsolated
            );
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: (reloadToDegrade || coepHasFailed && coi.coepDegrade())
                    ? false
                    : coi.coepCredentialless(),
            });
            if (reloadToDegrade) {
                !coi.quiet && console.log("Reloading page to degrade COEP.");
                window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
                coi.doReload("coepdegrade");
            }

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // If we're already coi: do nothing. Perhaps it's due to this script doing its job, or COOP/COEP are
        // already set from the origin server. Also if the browser has no notion of crossOriginIsolated, just give up here.
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        // In some environments (e.g. Firefox private mode) this won't be available
        if (!n.serviceWorker) {
            !coi.quiet && console.error("COOP/COEP Service Worker not registered, perhaps due to private mode.");
            return;
        }

        n.serviceWorker.register(window.document.currentScript.src).then(
            (registration) => {
                !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                registration.addEventListener("updatefound", () => {
                    !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
                    window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
                    coi.doReload();
                });

                // If the registration is active, but it's not controlling the page
                if (registration.active && !n.serviceWorker.controller) {
                    !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");
                    window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
                    coi.doReload();
                }
            },
            (err) => {
                !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
            }
        );
    })();
}