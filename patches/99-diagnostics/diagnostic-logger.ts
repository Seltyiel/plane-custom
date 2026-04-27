/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.13 - Diagnostic logger.
 *
 * Invia log strutturati a http://localhost:9999/log (diagnostic-server.js
 * in esecuzione sulla macchina di Ciro). Scrive anche su console.
 * No-op silenzioso se il server non risponde.
 *
 * Uso:
 *   import { dlog } from "@/lib/diagnostic-logger";
 *   dlog("base-kanban", "render start", { storeType, viewId });
 */

const DIAG_SERVER = "http://localhost:9999/log";

// Seq globale per correlare le entry all'interno di una stessa pagina.
let seq = 0;

function safeJsonClone(value: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === "function") return "[function]";
        if (v instanceof Error) {
          return { name: v.name, message: v.message, stack: v.stack };
        }
        if (typeof v === "bigint") return String(v);
        return v;
      })
    );
  } catch (e) {
    return `[unserializable: ${(e as Error)?.message}]`;
  }
}

export function dlog(category: string, message: string, data?: unknown): void {
  const entry = {
    seq: ++seq,
    ts: Date.now(),
    category,
    message,
    data: data === undefined ? null : safeJsonClone(data),
  };

  // Console (sempre, anche se il server e' giu')
  try {
    // eslint-disable-next-line no-console
    console.info(`[diag][${category}]`, message, data ?? "");
  } catch (_e) {
    // ignore
  }

  // Fetch al server. keepalive:true fa sopravvivere la richiesta al
  // navigate/unload. catch() swallow silenzioso.
  try {
    if (typeof fetch !== "function") return;
    fetch(DIAG_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {
      // server non raggiungibile, ignora
    });
  } catch (_e) {
    // ignore
  }
}
