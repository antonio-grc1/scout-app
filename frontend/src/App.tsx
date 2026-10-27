import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { Login } from './pages/Login';
import { CambiarClave } from './pages/CambiarClave';
import { AutogestionPage } from './pages/autogestion/AutogestionPage';
import { UnidadPage } from './pages/unidad/UnidadPage';
import { GlobalPage } from './pages/global/GlobalPage';
import { PadronPage } from './pages/padron/PadronPage';
import { PerfilPage } from './pages/perfil/PerfilPage';

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
  const { token, tieneGlobal, tieneUnidad, requiereCambioClave } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Si el usuario requiere cambio obligatorio de clave y navega a otra sección
  if (requiereCambioClave && !permitirCambioClave) {
    return <Navigate to="/cambiar-clave" replace />;
  }

  if (requiereAlcance === 'GLOBAL' && !tieneGlobal()) {
    return <Navigate to="/autogestion" replace />;
  }

  if (requiereAlcance === 'UNIDAD' && !tieneUnidad() && !tieneGlobal()) {
    return <Navigate to="/autogestion" replace />;
  }

  return <>{children}</>;
};

export function App() {
  const { token, tieneGlobal, tieneUnidad, requiereCambioClave } = useAuthStore();

  const rutaDefault = () => {
    if (!token) return '/login';
    if (requiereCambioClave) return '/cambiar-clave';
    if (tieneGlobal() || tieneUnidad()) return '/rama';
    return '/autogestion';
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
          <Route
            path="/padron"
            element={
              <RutaProtegida requiereAlcance="UNIDAD">
                <PadronPage />
              </RutaProtegida>
            }
          />
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
