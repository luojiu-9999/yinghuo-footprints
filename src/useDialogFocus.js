import { useEffect, useRef } from 'react';
export function useDialogFocus(ref, onEscape, blocked = false) {
  const state = useRef({ onEscape, blocked }); state.current = { onEscape, blocked };
  useEffect(() => {
    const previous = document.activeElement, oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; ref.current?.querySelector('button,input,select')?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!state.current.blocked) state.current.onEscape(); return; }
      if (e.key !== 'Tab') return;
      const controls = [...ref.current.querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled && el.offsetParent !== null);
      if (!controls.length) return;
      if (!ref.current.contains(document.activeElement)) { e.preventDefault(); controls[0].focus(); }
      else if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0].focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); else document.querySelector('[aria-label="我的设置"]')?.focus(); };
  }, []);
}
