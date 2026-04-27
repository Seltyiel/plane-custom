/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * PATCH (plane-custom) v1.05: fallback con sfondo rosso BRILLANTE cosi' non
 * lo confondi con "schermata bianca". Se vedi questo box, la Kanban HA
 * effettivamente thrown — copiami Name/Message/Stack.
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = {
  layoutName: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
  info: ErrorInfo | null;
};

export class WorkspaceLayoutErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(
      `[plane-custom][${this.props.layoutName}] caught render error:`,
      {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        componentStack: info?.componentStack,
      }
    );
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      const { layoutName } = this.props;
      const { error, info } = this.state;
      return (
        <div
          style={{
            background: "#7f1d1d",
            color: "white",
            padding: 24,
            fontFamily: "monospace",
            fontSize: 13,
            lineHeight: 1.4,
            overflow: "auto",
            height: "100%",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            [plane-custom] Layout {layoutName} crashed during render
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>Name:</b> {error?.name || "Error"}
          </div>
          <div style={{ marginBottom: 8 }}>
            <b>Message:</b> {error?.message || "(no message)"}
          </div>
          <details style={{ marginTop: 8 }} open>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>stack</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{error?.stack || ""}</pre>
          </details>
          {info?.componentStack && (
            <details style={{ marginTop: 8 }} open>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>component stack</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{info.componentStack}</pre>
            </details>
          )}
          <div style={{ marginTop: 12, fontSize: 11, opacity: 0.85 }}>
            Boundary plane-custom v1.05 — copiami Name + Message
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
