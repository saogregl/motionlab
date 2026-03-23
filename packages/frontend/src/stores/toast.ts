import { toast } from 'sonner';
import { create } from 'zustand';

interface ToastOptions {
  variant: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
  duration?: number;
}

interface ToastState {
  /** Fire a toast notification. Safe to call from non-React code. */
  addToast: (opts: ToastOptions) => void;
}

export const useToastStore = create<ToastState>()(() => ({
  addToast: ({ variant, title, description, duration }) => {
    const opts = { description, duration };
    switch (variant) {
      case 'success':
        toast.success(title, opts);
        break;
      case 'warning':
        toast.warning(title, opts);
        break;
      case 'error':
        toast.error(title, opts);
        break;
      default:
        toast.info(title, opts);
    }
  },
}));
