import { useEffect } from 'react';

const BASE_TITLE = 'Crew Dock — APA Crew Rate Calculator';

export function usePageTitle(pageTitle: string) {
  useEffect(() => {
    document.title = `${pageTitle} — Crew Dock`;
    return () => { document.title = BASE_TITLE; };
  }, [pageTitle]);
}
