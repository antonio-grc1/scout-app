import React, { useEffect, lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
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
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import { BannerOffline } from './components/BannerOffline';
import { ErrorBoundary } from './components/ErrorBoundary';

const AutogestionPage = lazy(() =>
  import('./pages/autogestion/AutogestionPage').then((m) => ({ default: m.AutogestionPage })),
);
const UnidadPage = lazy(() =>
  import('./pages/unidad/UnidadPage').then((m) => ({ default: m.UnidadPage })),
);
const GlobalPage = lazy(() =>
  import('./pages/global/GlobalPage').then((m) => ({ default: m.GlobalPage })),
);
const PerfilPage = lazy(() =>
  import('./pages/perfil/PerfilPage').then((m) => ({ default: m.PerfilPage })),
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
  const token = useAuthStore((s) => s.token);
  const requiereCambioClave = useAuthStore((s) => s.requiereCambioClave);
  const caps = useCapabilities();

  if (!token) {
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

const MiEspacioPhase1Bridge: React.FC = () => {
  const [searchParams] = useSearchParams();
  if (searchParams.get('tab') === 'perfil') {
    return <PerfilPage />;
  }
  const vistaParam = searchParams.get('vista');
  const defaultVista =
    vistaParam === 'cuotas' || vistaParam === 'eventos' ? vistaParam : 'papeles';
  return <AutogestionPage defaultVista={defaultVista} />;
};

const EventosPhase1Bridge: React.FC = () => {
  const caps = useCapabilities();
  if (!caps.esPropio && caps.canSeeTesoreriaGestion) {
    return <GlobalPage defaultTab="tesoreria" defaultSubTab="eventos-qr" />;
  }
  return <AutogestionPage defaultVista="eventos" />;
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
  if ((tab === 'organizacion' || tab === 'roles' || tab === 'correo') && caps.canViewOrganizacion) {
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
      useAuthStore.getState().logout();
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

export function App() {
  const {
    token,
    requiereCambioClave,
    refrescarSesionDesdeServidor,
  } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    void refrescarSesionDesdeServidor();
    const onFocus = () => {
      void refrescarSesionDesdeServidor();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token, refrescarSesionDesdeServidor]);

  useEffect(() => {
    const onOnline = () => {
      void queryClient.invalidateQueries();
      if (token) {
        void refrescarSesionDesdeServidor();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [token, refrescarSesionDesdeServidor]);

  const rutaDefault = () =>
    obtenerRutaInicialUsuario({
      token,
      requiereCambioClave,
    });

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
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
                    <AppShell title="Mi Espacio">
                      <MiEspacioPhase1Bridge />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/miembros"
                element={
                  <RutaProtegida allow={(c) => c.canViewMiembros}>
                    <AppShell title="Miembros">
                      <UnidadPage />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/miembros/:id"
                element={
                  <RutaProtegida allow={(c) => c.canViewMiembros}>
                    <AppShell title="Miembro 360°">
                      <UnidadPage />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/legajos"
                element={
                  <RutaProtegida allow={(c) => c.canViewLegajosModule}>
                    <AppShell title="Legajos">
                      <GlobalPage defaultTab="plantillas" />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/legajos/completar"
                element={
                  <RutaProtegida>
                    <AppShell title="Completar Legajo">
                      <AutogestionPage defaultVista="papeles" />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/pases"
                element={
                  <RutaProtegida allow={(c) => c.canViewPases}>
                    <AppShell title="Pases">
                      <GlobalPage defaultTab="pases" />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/tesoreria"
                element={
                  <RutaProtegida allow={(c) => c.canSeeTesoreriaGestion}>
                    <AppShell title="Tesorería">
                      <GlobalPage defaultTab="tesoreria" />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/eventos"
                element={
                  <RutaProtegida allow={(c) => c.canViewEventos}>
                    <AppShell title="Eventos">
                      <EventosPhase1Bridge />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/eventos/:id"
                element={
                  <RutaProtegida allow={(c) => c.canViewEventos}>
                    <AppShell title="Evento">
                      <EventosPhase1Bridge />
                    </AppShell>
                  </RutaProtegida>
                }
              />
              <Route
                path="/organizacion"
                element={
                  <RutaProtegida allow={(c) => c.canViewOrganizacion}>
                    <AppShell title="Organización">
                      <GlobalPage defaultTab="organizacion" />
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
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
