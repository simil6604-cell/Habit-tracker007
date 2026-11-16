/**
 * Limits both chats share.
 *
 * In their own module because the AI Coach and the school AI now both let a
 * message be edited, and a limit that lives in one of them would quietly be
 * a different limit in the other.
 */

/**
 * How much an edited message may hold.
 *
 * Here rather than beside the actions that use it: a "use server" file may
 * export nothing but async functions, and a constant there fails the build
 * with an error that names the line and not the rule.
 */
export const MAX_EDIT_CHARS = 4_000;
