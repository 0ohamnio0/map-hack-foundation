import { useEffect, useState } from 'react';

// 터치 주력 + 호버 불가 = 실제 모바일/태블릿 기기.
// 뷰포트 폭(max-width)이 아니라 입력장치 기준이라, 데스크탑 창을 좁혀도 오탐하지 않는다.
const QUERY = '(pointer: coarse) and (hover: none)';

export function useIsMobileDevice(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}
