"use client";

import React from "react";

/**
 * Keeps one broken thing from taking the page with it.
 *
 * Written after a real failure. The AI answered a question, something in
 * rendering that answer threw, and because the app had no error boundary
 * anywhere the exception reached the root — the whole site became a white
 * page reading "Application error: a client-side exception has occurred".
 *
 * The part that makes that unrecoverable rather than annoying: the message is
 * saved. Every reload renders it again, throws again, and shows the same white
 * page. There is no way back to the button that would have deleted it. One
 * unlucky reply bricks the app for good.
 *
 * So anything rendering model output is wrapped in this. A reply that cannot
 * be drawn becomes one line saying so, the rest of the conversation renders
 * normally, and the controls that clear it are still there.
 */
type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { failed: boolean };

export class SafeRender extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // The console is where someone reporting this will be asked to look, and
    // it costs nothing to make sure the real error is in it.
    console.error("Failed to render AI content:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <p className="text-sm text-muted" data-testid="render-failed">
            This reply couldn&apos;t be displayed. The rest of the conversation is fine — delete it, or ask again.
          </p>
        )
      );
    }
    return this.props.children;
  }
}
