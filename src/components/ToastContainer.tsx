import { CheckCircle, XCircle } from 'lucide-react';
import type { Toast } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
}

export default function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <>
      {toasts.map(toast => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle size={18} className="trust-green" />
          ) : (
            <XCircle size={18} className="trust-red" />
          )}
          <span style={{ fontSize: 14 }}>{toast.message}</span>
        </div>
      ))}
    </>
  );
}
