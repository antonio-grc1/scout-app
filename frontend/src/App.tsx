import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setOnAuthError, setOnRequirePasswordChange } from './api/client';
import { useAuthStore } from './store/authStore';
import { Login } from './pages/Login';
import { CambiarClave } from './pages/CambiarClave';
import { ToastGlobal } from './components/ui/ToastGlobal';
import { ThemeCustomizerModal } from './components/ThemeCustomizerModal';
import { BannerOffline } from './components/BannerOffline';
import { ErrorBoundary } from './components/ErrorBoundary';
import { obtenerRutaInicialUsuario } from './lib/permisos';

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
      staleTime: 1000 * 60 * 3, // 3 minutos de caché en memoria
      refetchOnWindowFocus: false, // Evita re-disparar queries en cada cambio de pestaña
      retry: 1,
    },
  },
});

// Guard de ruta protegida
const RutaProtegida: React.FC<{
  children: React.ReactNode;
  requiereAlcance?: 'UNIDAD' | 'GLOBAL';
  permitirCambioClave?: boolean;
}> = ({ children, requiereAlcance, permitirCambioClave }) => {
  const { token, puedeVerPadron, puedeAccederPanelGestion, requiereCambioClave } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Si el usuario requiere cambio obligatorio de clave y navega a otra sección
  if (requiereCambioClave && !permitirCambioClave) {
    return <Navigate to="/cambiar-clave" replace />;
  }

  if (requiereAlcance === 'GLOBAL' && !puedeAccederPanelGestion()) {
    return <Navigate to={puedeVerPadron() ? '/rama' : '/autogestion'} replace />;
  }

  if (requiereAlcance === 'UNIDAD' && !puedeVerPadron()) {
    return <Navigate to={puedeAccederPanelGestion() ? '/global' : '/autogestion'} replace />;
  }

  return <>{children}</>;
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
    puedeVerPadron,
    puedeAccederPanelGestion,
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
      puedeVerPadron,
      puedeAccederPanelGestion,
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
              <Route
                path="/autogestion"
                element={
                  <RutaProtegida>
                    <AutogestionPage />
                  </RutaProtegida>
                }
              />
              <Route
                path="/perfil"
                element={
                  <RutaProtegida>
                    <PerfilPage />
                  </RutaProtegida>
                }
              />
              <Route
                path="/rama"
                element={
                  <RutaProtegida requiereAlcance="UNIDAD">
                    <UnidadPage />
                  </RutaProtegida>
                }
              />
              <Route path="/unidad" element={<Navigate to="/rama" replace />} />
              <Route path="/padron" element={<Navigate to="/rama" replace />} />
              <Route
                path="/global"
                element={
                  <RutaProtegida requiereAlcance="GLOBAL">
                    <GlobalPage />
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
