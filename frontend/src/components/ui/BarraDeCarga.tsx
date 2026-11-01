import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsFetching } from '@tanstack/react-query';

export const BarraDeCarga: React.FC = () => {
  const isFetching = useIsFetching();
  const location = useLocation();
  const [activo, setActivo] = useState(false);
  const [progreso, setProgreso] = useState(0);

  // Animación al cambiar de ruta
  useEffect(() => {
    setActivo(true);
    setProgreso(30);

    const t1 = setTimeout(() => setProgreso(70), 80);
    const t2 = setTimeout(() => setProgreso(100), 220);
    const t3 = setTimeout(() => {
      setActivo(false);
      setProgreso(0);
    }, 420);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [location.pathname, location.search]);

  // Animación ante peticiones en segundo plano (React Query)
  useEffect(() => {
    if (isFetching > 0) {
      setActivo(true);
      setProgreso((prev) => (prev < 35 ? 35 : prev));
      const t = setTimeout(() => {
        setProgreso((prev) => (prev < 80 ? 80 : prev));
      }, 180);
      return () => clearTimeout(t);
    } else if (activo) {
      setProgreso(100);
      const t = setTimeout(() => {
        setActivo(false);
        setProgreso(0);
      }, 280);
      return () => clearTimeout(t);
    }
  }, [isFetching]);

  if (!activo && progreso === 0) return null;

  return (
    <div
      role="progressbar"
      aria-label="Cargando contenido"
      aria-valuenow={progreso}
      className="fixed top-0 left-0 right-0 h-1 z-50 pointer-events-none overflow-hidden bg-transparent"
    >
      <div
        className="h-full bg-brand transition-all duration-200 ease-out"
        style={{
          width: `${progreso}%`,
          boxShadow: '0 0 10px var(--color-brand)',
        }}
      />
    </div>
  );
};
