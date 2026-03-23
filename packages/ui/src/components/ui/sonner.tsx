import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      offset={32}
      toastOptions={{
        className:
          'bg-[var(--layer-elevated)] text-[var(--text-primary)] border-[var(--border-default)] shadow-[var(--shadow-overlay)]',
        style: {
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-ui)',
        },
      }}
      style={{ zIndex: 'var(--z-toast)' } as React.CSSProperties}
      {...props}
    />
  );
}

export { Toaster };
