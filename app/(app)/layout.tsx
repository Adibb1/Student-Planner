"use client";

import { Box } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { LoadingScreen } from "@/components/Shared";
import { Navbar } from "@/components/Navbar";
import { PushListener } from "@/components/PushListener";
import { SetupNotice } from "@/components/SetupNotice";
import { useAuth } from "@/context/AuthContext";
import { PlannerProvider } from "@/context/PlannerContext";

// Every page inside the (app) folder needs you to be signed in.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (configured && !loading && !user) router.replace("/");
  }, [configured, loading, user, router]);

  if (!configured) return <SetupNotice />;
  if (loading || !user) return <LoadingScreen label="Opening your planner..." />;

  return (
    <PlannerProvider user={user}>
      <Navbar />
      <PushListener />
      <Box as="main">{children}</Box>
    </PlannerProvider>
  );
}
