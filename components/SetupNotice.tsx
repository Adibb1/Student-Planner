"use client";

import { Box, Code, Container, Heading, List, Stack, Text } from "@chakra-ui/react";

/** Shown when the Firebase keys have not been added yet. */
export function SetupNotice() {
  return (
    <Container maxW="2xl" py={16}>
      <Stack gap={4} borderWidth="1px" borderColor="border" rounded="xl" p={{ base: 5, md: 8 }}>
        <Heading size="xl">Almost there: connect Firebase</Heading>
        <Text color="fg.muted">
          The planner needs your Firebase project to sign you in and save your data. This takes about 5 minutes.
        </Text>
        <List.Root as="ol" gap={2} ps={5}>
          <List.Item>Create a project at the Firebase console and add a Web app.</List.Item>
          <List.Item>
            Copy <Code>.env.example</Code> to <Code>.env.local</Code> and paste your keys.
          </List.Item>
          <List.Item>Restart the dev server (<Code>npm run dev</Code>).</List.Item>
        </List.Root>
        <Box>
          <Text fontSize="sm" color="fg.muted">
            The README has the full step-by-step guide with pictures of where to click.
          </Text>
        </Box>
      </Stack>
    </Container>
  );
}
