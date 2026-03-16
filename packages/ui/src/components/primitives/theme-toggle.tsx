import { Moon, Sun } from 'lucide-react';

import { ToolbarButton } from '@/components/primitives/toolbar-button';

interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <ToolbarButton
      tooltip={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={onToggle}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </ToolbarButton>
  );
}

export { ThemeToggle };
export type { ThemeToggleProps };
