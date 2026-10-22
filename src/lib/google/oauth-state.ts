/**
 * The name of the cookie holding the one-time OAuth state.
 *
 * In its own module because a Next route file may only export route handlers
 * — exporting it from the start route failed the build with "STATE_COOKIE is
 * not a valid Route export field".
 */
export const GOOGLE_STATE_COOKIE = "momentum_google_state";
