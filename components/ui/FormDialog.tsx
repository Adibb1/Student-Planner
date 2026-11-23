"use client";

import { Button, CloseButton, Dialog, HStack, Portal } from "@chakra-ui/react";
import type { FormEvent, ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Shown on the left of the footer (e.g. a Delete button). */
  footerLeft?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

/** A pop-up form with Cancel / Save buttons. Pressing Enter saves. */
export function FormDialog({
  open,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel = "Save",
  submitDisabled,
  footerLeft,
  size = "md",
}: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      placement="center"
      scrollBehavior="inside"
      size={size}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            as="form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!submitDisabled) onSubmit();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>{children}</Dialog.Body>
            <Dialog.Footer justifyContent={footerLeft ? "space-between" : "flex-end"}>
              {footerLeft}
              <HStack gap={2}>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" colorPalette="teal" disabled={submitDisabled}>
                  {submitLabel}
                </Button>
              </HStack>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
