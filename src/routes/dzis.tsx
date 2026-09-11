import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dzis")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
