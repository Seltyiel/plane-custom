/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.07 (no-op rispetto a v1.06, solo tag bump):
 *  - Il logger categorizzato e inline di v1.06 e' gia' adeguato. Questo
 *    file e' incluso nella v1.07 solo per coerenza del build.bat.
 *
 * PATCH (plane-custom) v1.06 (builds on v1.05):
 *  - Stampa inline i campi dell'oggetto errore (decoded/message/stack/
 *    componentStack) cosi' vedi subito cosa ha sbagliato senza espandere
 *    l'Object collapsed in console.
 *
 * PATCH (plane-custom) v1.05:
 *  - Global error loggers con LIMIT SEPARATO PER CATEGORIA cosi' gli errori
 *    di hydration (sempre sugli <link> in <head>, e' rumore inevitabile
 *    quando si usa hydrateRoot(document) con Vite SPA mode) non mangiano il
 *    budget degli errori VERI delle layout views.
 *  - De-duplicazione: stesso decoded+firstStackFrame viene loggato una sola
 *    volta, e i successivi vengono solo contati.
 *  - Filtro "isHydrationLinkNoise": gli onRecoverableError che hanno
 *    componentStack che inizia con "at link\n    at ... at body\n    at
 *    html" sono hydration mismatch dei <link> in <head>. Sono RECOVERABLE:
 *    React switcha a client rendering e continua, non bloccano niente. Li
 *    aggreghiamo in un unico log finale.
 */

import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

const REACT_ERROR_CODES: Record<string, string> = {
  "418":
    "Hydration failed because the initial UI does not match what was rendered on the server.",
  "419":
    "The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering.",
  "421":
    "This Suspense boundary received an update before it finished hydrating. This will cause the boundary to switch to client rendering. The usual way to fix this is to wrap the original update in startTransition.",
  "422":
    "There was an error while hydrating this Suspense boundary. Switched to client rendering.",
  "423":
    "There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.",
  "425":
    "Text content does not match server-rendered HTML.",
};

function describeReactError(value: unknown): string | null {
  if (!value) return null;
  const str = typeof value === "string" ? value : (value as Error)?.message;
  if (!str) return null;
  const match = str.match(/Minified React error #(\d+)/);
  if (!match) return null;
  const code = match[1];
  const desc = REACT_ERROR_CODES[code];
  return desc ? `React #${code}: ${desc}` : `React #${code}: (unknown code)`;
}

/**
 * Riconosce il rumore di hydration sui <link> in <head>. Questo errore e'
 * innocuo (React lo recupera) e si verifica ad OGNI page load con il setup
 * hydrateRoot(document) + Vite SPA. Lo aggreghiamo.
 */
function isHydrationLinkNoise(componentStack: string | undefined): boolean {
  if (!componentStack) return false;
  // Firma tipica: " at link\n    at jl (...)\n    at body\n    at html\n    at ge (root-..."
  return /\bat link\b[\s\S]{0,300}\bat html\b/.test(componentStack);
}

// Categorie di log, ognuna con il suo budget
type LogCategory = "hydrationNoise" | "recoverable" | "windowError" | "unhandledRejection";
const CATEGORY_LIMITS: Record<LogCategory, number> = {
  hydrationNoise: 1, // stampiamo solo il primo, gli altri li contiamo
  recoverable: 10,
  windowError: 15,
  unhandledRejection: 15,
};
const categoryCounts: Record<LogCategory, number> = {
  hydrationNoise: 0,
  recoverable: 0,
  windowError: 0,
  unhandledRejection: 0,
};
// De-dup tra gli stessi fingerprint (evita ripetizioni testuali)
const seenFingerprints = new Set<string>();

function logCategorized(category: LogCategory, fingerprint: string, payload: any) {
  categoryCounts[category] += 1;
  const limit = CATEGORY_LIMITS[category];
  const count = categoryCounts[category];
  if (count > limit) return;
  if (seenFingerprints.has(fingerprint)) return;
  seenFingerprints.add(fingerprint);
  // PATCH v1.06: stampiamo i campi INLINE invece di passare l'Object collapsed
  // al console.error. Cosi' in console si vede il testo subito, non serve
  // espandere la freccia.
  const decoded = payload?.decoded ?? "";
  const msg = payload?.message ?? "";
  // eslint-disable-next-line no-console
  console.error(
    `[plane-custom][boot][${category}] ${decoded} | msg="${msg}"`
  );
  if (payload?.componentStack) {
    // eslint-disable-next-line no-console
    console.error(
      `[plane-custom][boot][${category}] componentStack:\n${String(payload.componentStack).slice(0, 2000)}`
    );
  }
  if (payload?.stack) {
    // eslint-disable-next-line no-console
    console.error(
      `[plane-custom][boot][${category}] stack:\n${String(payload.stack).slice(0, 2000)}`
    );
  }
  if (payload?.note) {
    // eslint-disable-next-line no-console
    console.error(`[plane-custom][boot][${category}] note: ${payload.note}`);
  }
  // E manteniamo anche l'oggetto completo per ispezione manuale se serve
  // eslint-disable-next-line no-console
  console.error(`[plane-custom][boot][${category}] full payload:`, payload);
  if (count === limit) {
    // eslint-disable-next-line no-console
    console.error(
      `[plane-custom][boot] category "${category}" budget (${limit}) reached; further same-category errors suppressed`
    );
  }
}

// Esponiamo su window un comando manuale per stampare i contatori finali
if (typeof window !== "undefined") {
  (window as any).__planeCustomErrorSummary = () => {
    // eslint-disable-next-line no-console
    console.table(categoryCounts);
  };

  window.addEventListener("error", (event) => {
    const err = event.error ?? event.message;
    const decoded = describeReactError(err);
    const message = (err as Error)?.message ?? String(err);
    const firstFrame = ((err as Error)?.stack || "").split("\n")[1] || "";
    logCategorized("windowError", `${decoded ?? message}|${firstFrame}`, {
      message,
      decoded,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: (err as Error)?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const decoded = describeReactError(reason);
    const message = (reason as Error)?.message;
    const firstFrame = ((reason as Error)?.stack || "").split("\n")[1] || "";
    const fp = reason === undefined ? "undefined-rejection" : `${decoded ?? message}|${firstFrame}`;
    logCategorized("unhandledRejection", fp, {
      reasonType: typeof reason,
      reasonIsUndefined: reason === undefined,
      reasonIsNull: reason === null,
      message,
      decoded,
      stack: (reason as Error)?.stack,
      raw: reason,
    });
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError: (error: unknown, errorInfo: { componentStack?: string }) => {
        const decoded = describeReactError(error);
        const componentStack = errorInfo?.componentStack;
        const firstFrame = (componentStack || "").split("\n")[1] || "";
        const fp = `${decoded ?? (error as Error)?.message}|${firstFrame}`;

        const category: LogCategory = isHydrationLinkNoise(componentStack)
          ? "hydrationNoise"
          : "recoverable";

        logCategorized(category, fp, {
          name: (error as Error)?.name,
          message: (error as Error)?.message,
          decoded,
          stack: (error as Error)?.stack,
          componentStack,
          note:
            category === "hydrationNoise"
              ? "<head>/<link> hydration mismatch. Innocuo, React recupera switch-ando a client rendering."
              : undefined,
        });
      },
    }
  );
});
