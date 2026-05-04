import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/configuracoes')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_app/configuracoes"!</div>
}
