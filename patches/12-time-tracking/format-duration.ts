/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.33c:
 *  Helper per la formattazione delle durate del Time Tracking.
 *  Singolo punto di verita' cosi' la UI sidebar, il timer banner,
 *  e il timesheet report mostrano sempre lo stesso formato.
 */

/**
 * Formatta secondi in "Xh Ym" leggibile.
 * - 0 -> "0m"
 * - 60 -> "1m"
 * - 3600 -> "1h"
 * - 5400 -> "1h 30m"
 * - 90061 -> "25h 1m"  (anche se >24h non andiamo a giorni: utenti
 *                       vogliono vedere "il totale di ore", non "1d 1h 1m")
 *
 * Per durate < 60s ritorniamo "<1m" cosi' nessun valore "0m" inganna.
 */
export function formatDurationHM(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return "0m";
  if (seconds < 60) return seconds <= 0 ? "0m" : "<1m";
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formatta secondi come "HH:MM:SS" per display tipo cronometro.
 * Usato dal banner timer attivo (v1.33d).
 */
export function formatDurationHMS(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Parse di "HH:MM" o "Xh Ym" in secondi.
 * - "1:30" -> 5400
 * - "1h 30m" -> 5400
 * - "30m" -> 1800
 * - "2h" -> 7200
 * - "" / null -> null (caller gestisce errore)
 *
 * Ritorna null su input invalido (caller gestisce con messaggio errore UX).
 */
export function parseDurationToSeconds(input: string | null | undefined): number | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Format "HH:MM" o "H:MM"
  const colonMatch = /^(\d{1,3}):(\d{1,2})$/.exec(trimmed);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    if (m >= 60) return null;
    return h * 3600 + m * 60;
  }

  // Format "1h 30m" / "1h" / "30m" / "1h30m"
  const hmMatch = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(trimmed.replace(/\s+/g, ""));
  if (hmMatch && (hmMatch[1] || hmMatch[2])) {
    const h = hmMatch[1] ? parseInt(hmMatch[1], 10) : 0;
    const m = hmMatch[2] ? parseInt(hmMatch[2], 10) : 0;
    if (m >= 60) return null;
    return h * 3600 + m * 60;
  }

  return null;
}
