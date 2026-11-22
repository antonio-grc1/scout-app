import React, { useEffect, lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Routes,
  Route,
  Navigate,
  useBlocker,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setOnAuthError, setOnRequirePasswordChange } from './api/client';
import { useAuthStore } from './store/authStore';
import { useCapabilities, type Capabilities } from './core/capabilities';
import { obtenerRutaInicialUsuario } from './lib/permisos';
import { Login } from './pages/Login';
import { CambiarClave } from './pages/CambiarClave';
import { InicioPage } from './pages/inicio/InicioPage';
import { AppShell } from './components/layout/AppShell';
import { ToastGlobal } from './components/ui/ToastGlobal';
import { DialogoDescartarCambios } from './components/DialogoDescartarCambios';
import { pedirConfirmacionDescarte, useCambiosSinGuardarStore } from './store/cambiosSinGuardarStore';
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import { BannerOffline } from './components/BannerOffline';
import { ErrorBoundary } from './components/ErrorBoundary';

const MiEspacioPage = lazy(() =>
  import('./pages/mi-espacio/MiEspacioPage').then((m) => ({ default: m.MiEspacioPage })),
);
const MiembrosPage = lazy(() =>
  import('./pages/miembros/MiembrosPage').then((m) => ({ default: m.MiembrosPage })),
);
const MiembroDetallePage = lazy(() =>
  import('./pages/miembros/MiembroDetallePage').then((m) => ({ default: m.MiembroDetallePage })),
);
const EventosCatalogoPage = lazy(() =>
  import('./pages/eventos/EventosCatalogoPage').then((m) => ({ default: m.EventosCatalogoPage })),
);
const EventoWorkspacePage = lazy(() =>
  import('./pages/eventos/EventoWorkspacePage').then((m) => ({ default: m.EventoWorkspacePage })),
);
const LegajosPage = lazy(() =>
  import('./pages/legajos/LegajosPage').then((m) => ({ default: m.LegajosPage })),
);
const CompletarLegajoPage = lazy(() =>
  import('./pages/legajos/CompletarLegajoPage').then((m) => ({ default: m.CompletarLegajoPage })),
);
const PasesPage = lazy(() =>
  import('./pages/pases/PasesPage').then((m) => ({ default: m.PasesPage })),
);
const TesoreriaPage = lazy(() =>
  import('./pages/tesoreria/TesoreriaPage').then((m) => ({ default: m.TesoreriaPage })),
);
const OrganizacionPage = lazy(() =>
  import('./pages/organizacion/OrganizacionPage').then((m) => ({ default: m.OrganizacionPage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RutaProtegida: React.FC<{
  children: React.ReactNode;
  allow?: (caps: Capabilities) => boolean;
  permitirCambioClave?: boolean;
}> = ({ children, allow, permitirCambioClave }) => {
  const autenticado = useAuthStore((s) => s.autenticado);
  const requiereCambioClave = useAuthStore((s) => s.requiereCambioClave);
  const caps = useCapabilities();

  if (!autenticado) {
    return <Navigate to="/login" replace />;
  }

  if (requiereCambioClave && !permitirCambioClave) {
    return <Navigate to="/cambiar-clave" replace />;
  }

  if (allow && !allow(caps)) {
    return <Navigate to="/inicio" replace />;
  }

  return <>{children}</>;
};

const GlobalLegacyRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const caps = useCapabilities();
  const tab = searchParams.get('tab');
  const sub = searchParams.get('sub');

  if (tab === 'pases' && caps.canViewPases) {
    return <Navigate to="/pases" replace />;
  }
  if ((tab === 'plantillas' || tab === 'colaboradores') && caps.canViewLegajosModule) {
    return <Navigate to={`/legajos?tab=${tab}`} replace />;
  }
  if (
    (tab === 'organizacion' || tab === 'roles' || tab === 'correo') &&
    (caps.canViewOrganizacion || caps.canViewRoles || caps.canEditCorreo)
  ) {
    return <Navigate to={`/organizacion?tab=${tab}`} replace />;
  }
  if (sub === 'eventos-qr' && caps.canViewEventos) {
    return <Navigate to="/eventos" replace />;
  }
  if (caps.canSeeTesoreriaGestion) {
    return <Navigate to={sub ? `/tesoreria?sub=${sub}` : '/tesoreria'} replace />;
  }
  return <Navigate to="/inicio" replace />;
};

const AuthNavigatorBridge: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    setOnAuthError(() => {
      useAuthStore.getState().limpiarSesionLocal();
      useCambiosSinGuardarStore.getState().setPendiente(false);
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    });
    setOnRequirePasswordChange(() => {
      useAuthStore.getState().setRequiereCambioClave(true);
      if (window.location.pathname !== '/cambiar-clave') {
        navigate('/cambiar-clave', { replace: true });
      }
    });
  }, [navigate]);

  return null;
};

/**
 * B2-21: con el router de datos, `useBlocker` frena cualquier navegación a otra página
 * (links, navigate(), botón Atrás del navegador o del celular) mientras la vista marcó cambios
 * sin guardar, y pregunta con el diálogo estándar. Los cambios de query (?tab=) no se frenan:
 * cada vista los confirma por su cuenta.
 */
const BloqueoCambiosSinGuardar: React.FC = () => {
  const pendiente = useCambiosSinGuardarStore((s) => s.pendiente);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      pendiente && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let vigente = true;
    void pedirConfirmacionDescarte().then((ok) => {
      if (!vigente) return;
      if (ok) {
        useCambiosSinGuardarStore.getState().setPendiente(false);
        blocker.proceed();
      } else {
        blocker.reset();
      }
    });
    return () => {
      vigente = false;
    };
  }, [blocker]);

  return null;
};

/** Árbol de rutas de la app (igual que antes con BrowserRouter), montado bajo el router de datos. */
const RaizApp: React.FC = () => {
  const autenticado = useAuthStore((s) => s.autenticado);
  const requiereCambioClave = useAuthStore((s) => s.requiereCambioClave);
  const rutaDefault = () =>
    obtenerRutaInicialUsuario({
      autenticado,
      requiereCambioClave,
    });

  return (
    <>
      <BloqueoCambiosSinGuardar />
      <AuthNavigatorBridge />
      <BannerOffline />
      <ThemeCustomizerModal />
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-paper text-ink-muted text-sm font-semibold">
            Cargando…
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/cambiar-clave"
            element={
              <RutaProtegida permitirCambioClave={true}>
                <CambiarClave />
              </RutaProtegida>
            }
          />

          {/* Rutas unificadas por dominio dentro de AppShell */}
          <Route
            path="/inicio"
            element={
              <RutaProtegida>
                <AppShell title="Inicio">
                  <InicioPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/mi-espacio"
            element={
              <RutaProtegida>
                <AppShell title="Mi espacio">
                  <MiEspacioPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/miembros"
            element={
              <RutaProtegida allow={(c) => c.canViewMiembros}>
                <AppShell title="Miembros">
                  <MiembrosPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/miembros/:id"
            element={
              <RutaProtegida allow={(c) => c.canViewMiembros}>
                <AppShell title="Miembro">
                  <MiembroDetallePage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/legajos"
            element={
              <RutaProtegida allow={(c) => c.canViewLegajosModule}>
                <AppShell title="Legajos">
                  <LegajosPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/legajos/completar"
            element={
              <RutaProtegida allow={(c) => c.canCompleteLegajos || c.canViewLegajosModule}>
                <AppShell title="Completar legajo">
                  <CompletarLegajoPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/pases"
            element={
              <RutaProtegida allow={(c) => c.canViewPases}>
                <AppShell title="Pases">
                  <PasesPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/tesoreria"
            element={
              <RutaProtegida allow={(c) => c.canSeeTesoreriaGestion}>
                <AppShell title="Tesorería">
                  <TesoreriaPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/eventos"
            element={
              <RutaProtegida allow={(c) => c.canViewEventos}>
                <AppShell title="Eventos">
                  <EventosCatalogoPage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/eventos/:id"
            element={
              <RutaProtegida allow={(c) => c.canViewEventos}>
                <AppShell title="Evento">
                  <EventoWorkspacePage />
                </AppShell>
              </RutaProtegida>
            }
          />
          <Route
            path="/organizacion"
            element={
              <RutaProtegida
                allow={(c) =>
                  c.canViewOrganizacion || c.canViewRoles || c.canEditCorreo
                }
              >
                <AppShell title="Organización">
                  <OrganizacionPage />
                </AppShell>
              </RutaProtegida>
            }
          />

          {/* Redirecciones temporales desde rutas legacy */}
          <Route path="/autogestion" element={<Navigate to="/mi-espacio" replace />} />
          <Route path="/perfil" element={<Navigate to="/mi-espacio?tab=perfil" replace />} />
          <Route path="/rama" element={<Navigate to="/miembros" replace />} />
          <Route path="/unidad" element={<Navigate to="/miembros" replace />} />
          <Route path="/padron" element={<Navigate to="/miembros" replace />} />
          <Route
            path="/global"
            element={
              <RutaProtegida>
                <GlobalLegacyRedirect />
              </RutaProtegida>
            }
          />

          <Route path="*" element={<Navigate to={rutaDefault()} replace />} />
        </Routes>
      </Suspense>
      <ToastGlobal />
      <DialogoDescartarCambios />
    </>
  );
};

// Router de datos (necesario para useBlocker). Una sola ruta comodín conserva el <Routes> existente.
const router = createBrowserRouter([{ path: '*', element: <RaizApp /> }]);

export function App() {
  const { autenticado, refrescarSesionDesdeServidor } = useAuthStore();

  useEffect(() => {
    if (!autenticado) return;
    void refrescarSesionDesdeServidor();
    const onFocus = () => {
      void refrescarSesionDesdeServidor();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [autenticado, refrescarSesionDesdeServidor]);

  useEffect(() => {
    const onOnline = () => {
      void queryClient.invalidateQueries();
      if (autenticado) {
        void refrescarSesionDesdeServidor();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [autenticado, refrescarSesionDesdeServidor]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
