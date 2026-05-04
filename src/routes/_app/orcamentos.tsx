import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/orcamentos')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_app/orcamentos"!</div>
}
