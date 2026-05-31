/**
 * Drop-in replacement for react-toastify's `toast` — uses sonner under the hood.
 * All existing `toast.success/error/info/warning` calls work unchanged.
 */
import { toast as sonner } from 'sonner';

type ToastOptions = {
  autoClose?: number | false;
  duration?: number;
  description?: string;
  id?: string;
  toastId?: string;
};

const toMs = (opt?: ToastOptions): number | typeof Infinity => {
  if (opt?.autoClose === false) return Infinity;
  return opt?.duration ?? (opt?.autoClose !== undefined ? (opt.autoClose as number) : 4000);
};

const toId = (opt?: ToastOptions) => opt?.id ?? opt?.toastId;

function success(msg: string, opts?: ToastOptions) {
  return sonner.success(msg, { duration: toMs(opts), description: opts?.description, id: toId(opts) });
}

function error(msg: string, opts?: ToastOptions) {
  return sonner.error(msg, { duration: toMs(opts), description: opts?.description, id: toId(opts) });
}

function info(msg: string, opts?: ToastOptions) {
  return sonner.info(msg, { duration: toMs(opts), description: opts?.description, id: toId(opts) });
}

function warning(msg: string, opts?: ToastOptions) {
  return sonner.warning(msg, { duration: toMs(opts), description: opts?.description, id: toId(opts) });
}

function loading(msg: string, opts?: ToastOptions) {
  return sonner.loading(msg, { duration: Infinity, description: opts?.description, id: toId(opts) });
}

function base(msg: string, opts?: ToastOptions) {
  return sonner(msg, { duration: toMs(opts), description: opts?.description, id: toId(opts) });
}

export const toast = Object.assign(base, { success, error, info, warning, loading, dismiss: sonner.dismiss });
