import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/syndicates")({
  component: SyndicatesLayout,
});

function SyndicatesLayout() {
  return <Outlet />;
}
