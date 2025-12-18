// src/components/NumberInput.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
};

const formatNumber = (value: number) => (Number.isFinite(value) ? String(value) : "");

const parseNumber = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function NumberInput({
  value,
  onValueChange,
  onValueCommit,
  onBlur,
  onFocus,
  onKeyDown,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState<string>(() => formatNumber(value));
  const draftRef = useRef(draft);
  const focusedRef = useRef(false);
  const latestValueRef = useRef(value);

  const setDraftSafe = useCallback((next: string) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    latestValueRef.current = value;
    if (focusedRef.current) return;
    setDraftSafe(formatNumber(value));
  }, [value, setDraftSafe]);

  return (
    <input
      {...rest}
      type="number"
      value={draft}
      onFocus={(e) => {
        focusedRef.current = true;
        setDraftSafe(formatNumber(latestValueRef.current));
        onFocus?.(e);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraftSafe(next);
        const parsed = parseNumber(next);
        if (parsed === null) return;
        onValueChange?.(parsed);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        const parsed = parseNumber(draftRef.current);
        if (parsed === null) {
          setDraftSafe(formatNumber(latestValueRef.current));
        } else {
          onValueCommit?.(parsed);
        }
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraftSafe(formatNumber(latestValueRef.current));
          (e.currentTarget as HTMLInputElement).blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}
