import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/play/quick-pick')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/play/quick-pick"!</div>
}
