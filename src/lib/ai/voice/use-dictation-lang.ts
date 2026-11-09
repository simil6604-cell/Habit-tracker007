"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DICTATION_LANG, parseDictationLang } from "./dictation-lang";

const STORAGE_KEY = "momentum.dictation-lang";

/**
 * The dictation language, remembered on this device.
 *
 * Read after mount, not during render: the server has no idea what this
 * browser remembers, and reading it while rendering gives two different
 * first paints and a hydration mismatch. Every read and write is guarded —
 * storage throws rather than returning null in a private window.
 */
export function useDictationLang(): [string, (code: string) => void] {
  const [lang, setLang] = useState(DEFAULT_DICTATION_LANG);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Blocked or unavailable — the device language decides instead.
    }
    setLang(parseDictationLang(stored, navigator.language));
  }, []);

  const choose = (code: string) => {
    setLang(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // It still applies for this session; it just will not be remembered.
    }
  };

  return [lang, choose];
}
