import React from 'react';

/**
 * ESC 키를 누르면 onClose 를 호출한다 (팝업/모달 닫기용).
 * 여러 모달이 겹쳐 있을 때 최상단 하나만 닫히도록 capture 단계에서 stopPropagation 한다.
 */
export function useEscClose(onClose: () => void, active = true): void {
  React.useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // capture 단계로 등록 → 나중에 열린(가장 위) 모달이 먼저 처리
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose, active]);
}
