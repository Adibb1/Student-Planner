"use client";

import {
  Badge,
  Box,
  Card,
  Center,
  Container,
  Field,
  Flex,
  Heading,
  HStack,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { Subject } from "@/lib/types";

/** Page wrapper used by every page after sign-in. */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <Container maxW="6xl" px={{ base: 4, md: 8 }} py={{ base: 6, md: 10 }}>
      {children}
    </Container>
  );
}

/** Page title with the teal underline bar (same look as your portfolio's sections). */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <Flex
      direction={{ base: "column", md: "row" }}
      justify="space-between"
      align={{ base: "flex-start", md: "flex-end" }}
      gap={4}
      mb={{ base: 6, md: 8 }}
    >
      <Box minW={0}>
        <Heading as="h1" size={{ base: "2xl", md: "3xl" }} letterSpacing="-0.02em" mb={2}>
          {title}
        </Heading>
        <Box w="12" h="1" bg="teal.500" borderRadius="full" mb={3} />
        {subtitle && (
          <Text color="fg.muted" maxW="2xl">
            {subtitle}
          </Text>
        )}
      </Box>
      {actions && (
        <HStack gap={2} wrap="wrap">
          {actions}
        </HStack>
      )}
    </Flex>
  );
}

/** A card with a title row, used to group things on a page. */
export function SectionCard({
  title,
  icon,
  action,
  children,
  hoverable = false,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  hoverable?: boolean;
}) {
  return (
    <Card.Root
      variant="outline"
      transition="all 0.2s"
      _hover={hoverable ? { borderColor: "teal.500", transform: "translateY(-3px)" } : undefined}
    >
      {(title || action) && (
        <Card.Header pb={0}>
          <Flex justify="space-between" align="center" gap={3}>
            <HStack gap={2} color="fg" minW={0}>
              {icon && (
                <Box color="teal.500" fontSize="lg">
                  {icon}
                </Box>
              )}
              <Card.Title fontSize="lg">{title}</Card.Title>
            </HStack>
            {action}
          </Flex>
        </Card.Header>
      )}
      <Card.Body gap={3}>{children}</Card.Body>
    </Card.Root>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <Stack
      align="center"
      textAlign="center"
      gap={3}
      py={{ base: 8, md: 12 }}
      px={4}
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="border"
      rounded="xl"
    >
      {icon && (
        <Box fontSize="3xl" color="teal.500">
          {icon}
        </Box>
      )}
      <Heading size="md">{title}</Heading>
      {text && (
        <Text color="fg.muted" maxW="md">
          {text}
        </Text>
      )}
      {action}
    </Stack>
  );
}

export function StatCard({
  label,
  value,
  hint,
  color = "teal",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  color?: string;
  icon?: ReactNode;
}) {
  return (
    <Card.Root variant="outline" colorPalette={color}>
      <Card.Body gap={1} p={4}>
        <HStack justify="space-between" color="fg.muted">
          <Text fontSize="sm">{label}</Text>
          {icon && <Box color="colorPalette.fg">{icon}</Box>}
        </HStack>
        <Text fontSize="2xl" fontWeight="bold" lineHeight="1.1">
          {value}
        </Text>
        {hint && (
          <Text fontSize="xs" color="fg.muted">
            {hint}
          </Text>
        )}
      </Card.Body>
    </Card.Root>
  );
}

export function SubjectBadge({ subject }: { subject?: Subject | null }) {
  if (!subject) return null;
  return (
    <Badge colorPalette={subject.color} variant="subtle" rounded="full" px={2}>
      {subject.code || subject.name}
    </Badge>
  );
}

export function ColorDot({ color, size = 3 }: { color: string; size?: number }) {
  return <Box colorPalette={color} bg="colorPalette.solid" boxSize={size} rounded="full" flexShrink={0} />;
}

export function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <Center minH="60vh">
      <Stack align="center" gap={3}>
        <Spinner size="lg" color="teal.500" />
        <Text color="fg.muted">{label}</Text>
      </Stack>
    </Center>
  );
}

/** Label + input + optional hint, used in forms. */
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      {children}
      {hint && <Field.HelperText>{hint}</Field.HelperText>}
    </Field.Root>
  );
}
