"use client";

import { NativeSelect } from "@chakra-ui/react";

type Option = { value: string; label: string };

/** A simple drop-down list. `placeholder` adds an empty first choice. */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  size = "md",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <NativeSelect.Root size={size}>
      <NativeSelect.Field value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}
