/**
 * The invite code the e2e server runs with.
 *
 * Shared between playwright.config.ts (which puts it in the server's
 * environment) and the suite (which types it into the form), so the two can
 * never drift apart and leave every registration failing for a reason that
 * looks like an app bug.
 *
 * The suite deliberately runs WITH a code rather than without: the production
 * build it tests against is the configuration that is closed to strangers, and
 * that is the one worth exercising.
 */
export const E2E_INVITE_CODE = "e2e-invite-code";
