/** Estado de revisão humana da pauta (conveniência por visitante, guardado no navegador). */
import { useCallback, useEffect, useState } from 'react';

export type ReviewStatus = 'pendente' | 'revisada' | 'confirmar' | 'descartada';
export type Review = { status: ReviewStatus; nota: string };

function read(key: string): Record<string, Review> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
export function useReviews(scope: string) {
  const key = `mcm.review.${scope}`;
  const [map, setMap] = useState<Record<string, Review>>(() => read(key));
  useEffect(() => setMap(read(key)), [key]);
  const update = useCallback((id: string, patch: Partial<Review>) => {
    setMap((m) => {
      const prev: Review = m[id] ?? { status: 'pendente', nota: '' };
      const next = { ...m, [id]: { ...prev, ...patch } };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* armazenamento indisponível: segue em memória */ }
      return next;
    });
  }, [key]);
  return { reviews: map, update };
}
