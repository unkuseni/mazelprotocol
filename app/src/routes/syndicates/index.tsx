import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/syndicates/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/syndicates/"!</div>
}
