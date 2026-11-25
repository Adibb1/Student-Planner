"use client";

import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Flex,
  HStack,
  IconButton,
  Menu,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LuBookOpen, LuLogOut, LuMenu, LuSettings, LuTimer, LuX } from "react-icons/lu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { nav, profileNav, site } from "@/config/site";
import { useAuth } from "@/context/AuthContext";
import { formatClock, useFocus } from "@/context/FocusContext";
import { usePlanner } from "@/context/PlannerContext";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { alerts } = usePlanner();
  const focus = useFocus();
  const attention = alerts.missed.length + alerts.overdue.length;

  // Close the phone/tablet menu when the page changes, with Escape, or on a wide screen.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const badge = (href: string) =>
    href === "/dashboard" && attention > 0 ? (
      <Badge colorPalette="red" variant="solid" rounded="full" ml={1} px={1.5}>
        {attention}
      </Badge>
    ) : null;

  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="sticky"
      bg="bg/90"
      backdropFilter="blur(10px)"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <Container maxW="6xl" px={{ base: 4, md: 8 }}>
        <Flex h="14" align="center" justify="space-between" gap={2}>
          <Button
            asChild
            variant="plain"
            fontWeight="bold"
            px={0}
            _hover={{ textDecoration: "none" }}
            whiteSpace="nowrap"
          >
            <NextLink href="/dashboard">
              <Text as="span" color="teal.500">
                &lt;
              </Text>
              {site.shortName}
              <Text as="span" color="teal.500">
                /&gt;
              </Text>
            </NextLink>
          </Button>

          <HStack gap={1}>
            {/* Full menu: laptops and desktops */}
            <HStack gap={0.5} display={{ base: "none", lg: "flex" }}>
              {nav.map((n) => (
                <Button
                  key={n.href}
                  asChild
                  variant={isActive(n.href) ? "subtle" : "ghost"}
                  colorPalette={isActive(n.href) ? "teal" : undefined}
                  size="sm"
                >
                  <NextLink href={n.href}>
                    {n.label}
                    {badge(n.href)}
                  </NextLink>
                </Button>
              ))}
            </HStack>

            {/* Shows while a focus timer is running or paused, on every page */}
            {focus.active && (
              <Button asChild size="sm" variant="subtle" colorPalette={focus.mode === "focus" ? "teal" : "green"}>
                <NextLink href="/focus" aria-label="Open the focus timer">
                  <LuTimer />
                  <Text as="span" fontVariantNumeric="tabular-nums">
                    {formatClock(focus.remainingMs)}
                  </Text>
                  {!focus.running && (
                    <Text as="span" fontSize="xs" display={{ base: "none", sm: "inline" }}>
                      paused
                    </Text>
                  )}
                </NextLink>
              </Button>
            )}

            <ThemeToggle />

            {/* Profile menu: Subjects, Settings and Sign out */}
            <Menu.Root positioning={{ placement: "bottom-end" }}>
              <Menu.Trigger asChild>
                <IconButton aria-label="Open profile menu" variant="ghost" size="md" rounded="full" ml={1}>
                  <Avatar.Root size="xs">
                    <Avatar.Fallback name={user?.displayName || user?.email || "You"} />
                    {user?.photoURL && <Avatar.Image src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
                  </Avatar.Root>
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content minW="56">
                    <Box px={3} py={2} borderBottomWidth="1px" borderColor="border" mb={1}>
                      <Text fontWeight="semibold" fontSize="sm" truncate>
                        {user?.displayName || "You"}
                      </Text>
                      {user?.email && (
                        <Text fontSize="xs" color="fg.muted" truncate>
                          {user.email}
                        </Text>
                      )}
                    </Box>
                    {profileNav.map((n) => (
                      <Menu.Item key={n.href} value={n.href} asChild>
                        <NextLink href={n.href}>
                          {n.href === "/settings" ? <LuSettings /> : <LuBookOpen />}
                          {n.label}
                        </NextLink>
                      </Menu.Item>
                    ))}
                    <Menu.Separator />
                    <Menu.Item value="sign-out" color="fg.error" onClick={() => signOut()}>
                      <LuLogOut /> Sign out
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>

            {/* Menu button: phones and tablets */}
            <IconButton
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              variant="ghost"
              size="md"
              display={{ base: "inline-flex", lg: "none" }}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <LuX /> : <LuMenu />}
            </IconButton>
          </HStack>
        </Flex>

        {/* Dropdown menu: phones and tablets */}
        {open && (
          <Box display={{ base: "block", lg: "none" }} pb={3}>
            <Stack gap={1}>
              {nav.map((n) => (
                <Button
                  key={n.href}
                  asChild
                  variant={isActive(n.href) ? "subtle" : "ghost"}
                  colorPalette={isActive(n.href) ? "teal" : undefined}
                  size="lg"
                  justifyContent="flex-start"
                >
                  <NextLink href={n.href}>
                    {n.label}
                    {badge(n.href)}
                  </NextLink>
                </Button>
              ))}
            </Stack>
          </Box>
        )}
      </Container>
    </Box>
  );
}
