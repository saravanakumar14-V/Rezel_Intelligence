import React, { useEffect, useState } from 'react';

export const RuntimeDebugger: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [clickTarget, setClickTarget] = useState<string>('');

  useEffect(() => {
    const handleLog = (e: any) => {
      if (e.detail?.msg) {
        setLogs((prev) => [...prev.slice(-10), e.detail.msg]);
      }
    };
    window.addEventListener('rezellog', handleLog);

    const handleClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      let path = '';
      let current: HTMLElement | null = el;
      let depth = 0;
      while (current && current !== document.body && depth < 5) {
        const id = current.id ? `#${current.id}` : '';
        const cls = current.className && typeof current.className === 'string' ? `.${current.className.split(' ').join('.')}` : '';
        path = `${current.tagName.toLowerCase()}${id}${cls} > ${path}`;
        current = current.parentElement;
        depth++;
      }
      
      const style = window.getComputedStyle(el);
      const info = `[CLICK] ${path} | pointer-events: ${style.pointerEvents} | z-index: ${style.zIndex}`;
      
      setClickTarget(info);
      console.log(info);
    };
    window.addEventListener('click', handleClick, true); // capture phase

    return () => {
      window.removeEventListener('rezellog', handleLog);
      window.removeEventListener('click', handleClick, true);
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      width: '100%',
      background: 'rgba(0,0,0,0.8)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '11px',
      zIndex: 99999,
      pointerEvents: 'none',
      padding: '8px',
      maxHeight: '30vh',
      overflow: 'hidden'
    }}>
      <div style={{ color: '#ff0', marginBottom: '4px' }}>{clickTarget}</div>
      {logs.map((log, i) => <div key={i}>{log}</div>)}
    </div>
  );
};

export const rlog = (msg: string) => {
  console.log(msg);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rezellog', { detail: { msg } }));
  }
};
