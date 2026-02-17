'use client';

import { useCallback, useEffect, useRef } from 'react';

type ForwardedKeyboardType = 'keydown' | 'keyup';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export default function SynthwaveEmbed() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const focusFrame = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      frame.focus();
    } catch {
      // Ignore focus failures from browser policy quirks.
    }
  }, []);

  const forwardKeyboard = useCallback((type: ForwardedKeyboardType, event: KeyboardEvent) => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(
      {
        source: 'synthwave-host',
        kind: 'keyboard',
        type,
        code: event.code,
        key: event.key,
        repeat: event.repeat,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      },
      window.location.origin
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      forwardKeyboard('keydown', event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      forwardKeyboard('keyup', event);
    };

    const onPointerDown = () => {
      focusFrame();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('pointerdown', onPointerDown, true);

    const initialFocus = window.setTimeout(focusFrame, 60);

    return () => {
      window.clearTimeout(initialFocus);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [focusFrame, forwardKeyboard]);

  return (
    <iframe
      ref={frameRef}
      src="/synthwave.html"
      title="Synthwave Beats"
      allow="autoplay"
      tabIndex={0}
      onLoad={focusFrame}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
      }}
    />
  );
}

