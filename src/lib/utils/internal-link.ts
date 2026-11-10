/**
 * Which links a reply may turn into links.
 *
 * The tutor can make things now — an episode, cards, a plan — and a reply
 * that says "it is on your podcast page" is a reply nobody acts on. So a
 * markdown link in model output becomes a real one.
 *
 * A link is the one piece of markdown that carries an action rather than a
 * style, so the rule is narrow: somewhere inside this app, or not a link at
 * all. `javascript:`, `data:`, a protocol-relative "//host" and anything off
 * this site would turn a reply into somewhere to be sent.
 *
 * A plain module rather than part of the renderer: the renderer is JSX, and
 * the check is the part worth testing on its own.
 */
const INTERNAL_PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/?#%]*$/;

export function internalHref(raw: string): string | null {
  const href = raw.trim();
  return INTERNAL_PATH.test(href) ? href : null;
}
