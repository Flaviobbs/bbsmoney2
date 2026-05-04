/* eslint-disable */
// @ts-nocheck
// noinspection JSUnusedGlobalSymbols
import { Route as rootRouteImport } from './routes/__root'
import { Route as SignupRouteImport } from './routes/signup'
import { Route as LoginRouteImport } from './routes/login'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AppRouteImport } from './routes/_app'
import { Route as AppIndexRouteImport } from './routes/_app/index'
import { Route as AppTransacoesRouteImport } from './routes/_app/transacoes'
import { Route as AppCategoriasRouteImport } from './routes/_app/categorias'
import { Route as AppContasRouteImport } from './routes/_app/contas'
import { Route as AppOrcamentosRouteImport } from './routes/_app/orcamentos'
import { Route as AppConfiguracoesRouteImport } from './routes/_app/configuracoes'

const SignupRoute = SignupRouteImport.update({ id: '/signup', path: '/signup', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const AppRoute = AppRouteImport.update({ id: '/_app', getParentRoute: () => rootRouteImport } as any)
const AppIndexRoute = AppIndexRouteImport.update({ id: '/', path: '/app', getParentRoute: () => AppRoute } as any)
const AppTransacoesRoute = AppTransacoesRouteImport.update({ id: '/transacoes', path: '/app/transacoes', getParentRoute: () => AppRoute } as any)
const AppCategoriasRoute = AppCategoriasRouteImport.update({ id: '/categorias', path: '/app/categorias', getParentRoute: () => AppRoute } as any)
const AppContasRoute = AppContasRouteImport.update({ id: '/contas', path: '/app/contas', getParentRoute: () => AppRoute } as any)
const AppOrcamentosRoute = AppOrcamentosRouteImport.update({ id: '/orcamentos', path: '/app/orcamentos', getParentRoute: () => AppRoute } as any)
const AppConfiguracoesRoute = AppConfiguracoesRouteImport.update({ id: '/configuracoes', path: '/app/configuracoes', getParentRoute: () => AppRoute } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/signup': typeof SignupRoute
  '/app': typeof AppIndexRoute
  '/app/transacoes': typeof AppTransacoesRoute
  '/app/categorias': typeof AppCategoriasRoute
  '/app/contas': typeof AppContasRoute
  '/app/orcamentos': typeof AppOrcamentosRoute
  '/app/configuracoes': typeof AppConfiguracoesRoute
}
export interface FileRoutesByTo extends FileRoutesByFullPath {}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/signup': typeof SignupRoute
  '/_app': typeof AppRouteWithChildren
  '/_app/': typeof AppIndexRoute
  '/_app/transacoes': typeof AppTransacoesRoute
  '/_app/categorias': typeof AppCategoriasRoute
  '/_app/contas': typeof AppContasRoute
  '/_app/orcamentos': typeof AppOrcamentosRoute
  '/_app/configuracoes': typeof AppConfiguracoesRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/login' | '/signup' | '/app' | '/app/transacoes' | '/app/categorias' | '/app/contas' | '/app/orcamentos' | '/app/configuracoes'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/login' | '/signup' | '/app' | '/app/transacoes' | '/app/categorias' | '/app/contas' | '/app/orcamentos' | '/app/configuracoes'
  id: '__root__' | '/' | '/login' | '/signup' | '/_app' | '/_app/' | '/_app/transacoes' | '/_app/categorias' | '/_app/contas' | '/_app/orcamentos' | '/_app/configuracoes'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  LoginRoute: typeof LoginRoute
  SignupRoute: typeof SignupRoute
  AppRoute: typeof AppRouteWithChildren
}

interface AppRouteChildren {
  AppIndexRoute: typeof AppIndexRoute
  AppTransacoesRoute: typeof AppTransacoesRoute
  AppCategoriasRoute: typeof AppCategoriasRoute
  AppContasRoute: typeof AppContasRoute
  AppOrcamentosRoute: typeof AppOrcamentosRoute
  AppConfiguracoesRoute: typeof AppConfiguracoesRoute
}
const AppRouteChildren: AppRouteChildren = {
  AppIndexRoute,
  AppTransacoesRoute,
  AppCategoriasRoute,
  AppContasRoute,
  AppOrcamentosRoute,
  AppConfiguracoesRoute,
}
const AppRouteWithChildren = AppRoute._addFileChildren(AppRouteChildren)

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  LoginRoute,
  SignupRoute,
  AppRoute: AppRouteWithChildren,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/signup': { id: '/signup'; path: '/signup'; fullPath: '/signup'; preLoaderRoute: typeof SignupRouteImport; parentRoute: typeof rootRouteImport }
    '/_app': { id: '/_app'; path: ''; fullPath: ''; preLoaderRoute: typeof AppRouteImport; parentRoute: typeof rootRouteImport }
    '/_app/': { id: '/_app/'; path: '/app'; fullPath: '/app'; preLoaderRoute: typeof AppIndexRouteImport; parentRoute: typeof AppRoute }
    '/_app/transacoes': { id: '/_app/transacoes'; path: '/app/transacoes'; fullPath: '/app/transacoes'; preLoaderRoute: typeof AppTransacoesRouteImport; parentRoute: typeof AppRoute }
    '/_app/categorias': { id: '/_app/categorias'; path: '/app/categorias'; fullPath: '/app/categorias'; preLoaderRoute: typeof AppCategoriasRouteImport; parentRoute: typeof AppRoute }
    '/_app/contas': { id: '/_app/contas'; path: '/app/contas'; fullPath: '/app/contas'; preLoaderRoute: typeof AppContasRouteImport; parentRoute: typeof AppRoute }
    '/_app/orcamentos': { id: '/_app/orcamentos'; path: '/app/orcamentos'; fullPath: '/app/orcamentos'; preLoaderRoute: typeof AppOrcamentosRouteImport; parentRoute: typeof AppRoute }
    '/_app/configuracoes': { id: '/_app/configuracoes'; path: '/app/configuracoes'; fullPath: '/app/configuracoes'; preLoaderRoute: typeof AppConfiguracoesRouteImport; parentRoute: typeof AppRoute }
  }
}
