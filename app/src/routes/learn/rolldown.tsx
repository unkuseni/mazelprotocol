import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/learn/rolldown')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/learn/rolldown"!</div>
}
