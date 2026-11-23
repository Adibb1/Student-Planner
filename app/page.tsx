"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  HStack,
  Link,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FcGoogle } from "react-icons/fc";
import { LuArrowDown, LuSparkles } from "react-icons/lu";
import { SetupNotice } from "@/components/SetupNotice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { landingFeatures, site } from "@/config/site";
import { useAuth } from "@/context/AuthContext";

// A pretend "Today" list so visitors can see what the planner looks like.
const preview = [
  { time: "8:00 – 10:00", title: "Math lecture", tag: "Class", color: "teal" },
  { time: "10:30 – 11:30", title: "Study: Math assignment 3", tag: "Planned for you", color: "blue" },
  { time: "1:15 – 1:35", title: "Zohor", tag: "Prayer", color: "purple" },
  { time: "4:00 – 5:00", title: "Study: Physics lab report", tag: "Planned for you", color: "orange" },
  { time: "9:00 – 10:00", title: "Relax", tag: "Your time", color: "green" },
];

export default function Home() {
  const { user, loading, configured, error, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  return (
    <Box id="top">
      {/* Top bar (same style as the portfolio navbar) */}
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
          <Flex h="14" align="center" justify="space-between">
            <Text fontWeight="bold" whiteSpace="nowrap">
              <Text as="span" color="teal.500">
                &lt;
              </Text>
              {site.shortName}
              <Text as="span" color="teal.500">
                /&gt;
              </Text>
            </Text>
            <HStack gap={1}>
              <Button asChild variant="ghost" size="sm" display={{ base: "none", sm: "inline-flex" }}>
                <a href="#features">Features</a>
              </Button>
              <ThemeToggle />
              <Button
                colorPalette="teal"
                size="sm"
                onClick={signInWithGoogle}
                disabled={!configured || loading}
              >
                Sign in
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Hero */}
      <Box position="relative" overflow="hidden" py={{ base: 10, md: 20, lg: 28 }}>
        <Box
          position="absolute"
          top="-120px"
          right="-120px"
          w={{ base: "260px", md: "420px" }}
          h={{ base: "260px", md: "420px" }}
          borderRadius="full"
          bg="teal.500"
          opacity={0.15}
          filter="blur(90px)"
          pointerEvents="none"
        />
        <Container maxW="6xl" px={{ base: 5, md: 8 }} position="relative">
          <Flex
            direction={{ base: "column", lg: "row" }}
            align={{ base: "flex-start", lg: "center" }}
            justify="space-between"
            gap={{ base: 10, lg: 14 }}
          >
            <Stack gap={{ base: 4, md: 5 }} maxW="2xl" minW={0}>
              <Badge colorPalette="teal" variant="subtle" w="fit-content" px={3} py={1} rounded="full">
                <LuSparkles /> Made for students
              </Badge>
              <Heading
                as="h1"
                size={{ base: "3xl", sm: "4xl", md: "5xl", lg: "6xl" }}
                letterSpacing="-0.03em"
                lineHeight="1.1"
              >
                Plan your study week,{" "}
                <Text as="span" color="teal.500">
                  automatically.
                </Text>
              </Heading>
              <Text fontSize={{ base: "md", md: "lg" }} color="fg.muted">
                {site.tagline}
              </Text>

              {!configured ? (
                <SetupNotice />
              ) : (
                <Stack direction={{ base: "column", sm: "row" }} gap={3} pt={2}>
                  <Button
                    colorPalette="teal"
                    size="lg"
                    w={{ base: "full", sm: "auto" }}
                    onClick={signInWithGoogle}
                    loading={loading}
                  >
                    <FcGoogle /> Continue with Google
                  </Button>
                  <Button asChild variant="outline" size="lg" w={{ base: "full", sm: "auto" }}>
                    <a href="#features">
                      See what it does <LuArrowDown />
                    </a>
                  </Button>
                </Stack>
              )}
              {error && (
                <Text color="red.500" fontSize="sm">
                  {error}
                </Text>
              )}
              <Text fontSize="sm" color="fg.muted">
                Sign in with the same Google account on any phone or laptop to see your timetable.
              </Text>
            </Stack>

            {/* Preview card */}
            <Card.Root variant="outline" w="full" maxW={{ base: "full", lg: "md" }} flexShrink={0}>
              <Card.Header pb={0}>
                <HStack justify="space-between">
                  <Card.Title fontSize="lg">Today</Card.Title>
                  <Badge colorPalette="teal" variant="subtle">
                    Wednesday
                  </Badge>
                </HStack>
              </Card.Header>
              <Card.Body gap={2}>
                {preview.map((p) => (
                  <HStack
                    key={p.title}
                    colorPalette={p.color}
                    gap={3}
                    p={3}
                    rounded="lg"
                    bg="colorPalette.subtle"
                    borderLeftWidth="4px"
                    borderLeftColor="colorPalette.solid"
                  >
                    <Stack gap={0} flex="1" minW={0}>
                      <Text fontSize="xs" color="fg.muted">
                        {p.time}
                      </Text>
                      <Text fontWeight="medium" truncate>
                        {p.title}
                      </Text>
                    </Stack>
                    <Badge variant="surface" colorPalette={p.color}>
                      {p.tag}
                    </Badge>
                  </HStack>
                ))}
              </Card.Body>
            </Card.Root>
          </Flex>
        </Container>
      </Box>

      {/* Features */}
      <Box as="section" id="features" py={{ base: 12, md: 20 }} scrollMarginTop="56px">
        <Container maxW="6xl" px={{ base: 5, md: 8 }}>
          <Heading as="h2" size={{ base: "2xl", md: "3xl" }} mb={2} letterSpacing="-0.02em">
            What it does
          </Heading>
          <Box w="12" h="1" bg="teal.500" borderRadius="full" mb={4} />
          <Text color="fg.muted" mb={{ base: 6, md: 8 }} maxW="2xl">
            Everything a student needs to stay on top of the week, without planning it by hand.
          </Text>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
            {landingFeatures.map((f) => (
              <Card.Root
                key={f.title}
                variant="outline"
                transition="all 0.2s"
                _hover={{ borderColor: "teal.500", transform: "translateY(-3px)" }}
              >
                <Card.Body gap={2}>
                  <Card.Title fontSize="xl">{f.title}</Card.Title>
                  <Card.Description fontSize="md">{f.text}</Card.Description>
                </Card.Body>
              </Card.Root>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      <Box as="footer" py={8} borderTopWidth="1px" borderColor="border">
        <Container maxW="6xl" px={{ base: 5, md: 8 }}>
          <Text fontSize="sm" color="fg.muted">
            Built by{" "}
            <Link href={site.portfolioUrl} target="_blank" rel="noopener noreferrer" color="teal.500">
              {site.owner}
            </Link>
            . Your data is private: every account only sees its own timetable.
          </Text>
        </Container>
      </Box>
    </Box>
  );
}
