import type { NextConfig } from "next";

/**
 * Every photo in this app is uploaded through a Server Action, and Next.js
 * caps a Server Action body at 1MB by default — a limit no phone photo has
 * ever been under. Note photos, meal photos, progress photos and the school
 * AI's photos were all rejected with a 413 before they reached the app's own
 * 10MB check, which is the limit the UI actually tells you about.
 *
 * So this is the app's upload limit plus room for the multipart envelope. It
 * must stay at or above MAX_UPLOAD_BYTES in lib/uploads/save-image.ts —
 * a test asserts exactly that, because the failure is a 413 the app cannot
 * explain and a photo the student thinks they saved.
 */
export const SERVER_ACTION_BODY_LIMIT = "12mb";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: SERVER_ACTION_BODY_LIMIT },
  },
};

export default nextConfig;
