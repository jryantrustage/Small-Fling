/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { X, Check, AlertTriangle, AlertCircle, Info, Trash2, type LucideIcon } from 'lucide-react';

export type ModalVariant = 'default' | 'danger' | 'warning' | 'info' | 'success';

export interface ModalProps {
  isOpen?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon | ReactNode;
  variant?: ModalVariant;
  danger?: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmText?: string;
  cancelText?: string;
  confirmIcon?: LucideIcon;
  cancelIcon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  width?: string;
  maxWidth?: string;
  showCloseButton?: boolean;
  autoFocus?: 'confirm' | 'cancel';
  children: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen = true, title, subtitle, icon: IconProp, variant, danger, onClose, onConfirm,
  confirmText = 'Save', cancelText = onConfirm ? 'Cancel' : 'Close', confirmIcon: ConfirmIcon = Check,
  cancelIcon: CancelIcon, disabled = false, loading = false, width, maxWidth, showCloseButton = true,
  autoFocus, children,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const effectiveVariant: ModalVariant = variant || (danger ? 'danger' : 'default');

  useEffect(() => {
    if (!isOpen || !autoFocus) return;
    const t = setTimeout(() => (autoFocus === 'confirm' ? confirmBtnRef : cancelBtnRef).current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen, autoFocus]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Enter' && onConfirm && !disabled && !loading) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'TEXTAREA' && tag !== 'BUTTON') { e.preventDefault(); onConfirm(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, onConfirm, disabled, loading]);

  if (!isOpen) return null;

  const HeaderIcon = IconProp ? (typeof IconProp === 'function' ? React.createElement(IconProp as LucideIcon, { size: 18 }) : IconProp)
    : effectiveVariant === 'danger' ? <AlertTriangle size={18} />
    : effectiveVariant === 'warning' ? <AlertCircle size={18} />
    : ['info', 'success'].includes(effectiveVariant) ? <Info size={18} /> : null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`modal-card modal-variant-${effectiveVariant}`} onClick={e => e.stopPropagation()} style={{ ...(width && { width }), ...(maxWidth && { maxWidth }) }}>
        <div className={`modal-glow-bar modal-glow-${effectiveVariant}`} />
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            {HeaderIcon && <div className={`modal-header-icon-badge modal-badge-${effectiveVariant}`}>{HeaderIcon}</div>}
            <div className="modal-header-text">
              <span className="modal-title-text">{title}</span>
              {subtitle && <span className="modal-subtitle-text">{subtitle}</span>}
            </div>
          </div>
          {showCloseButton && (
            <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          {cancelText && (
            <button ref={cancelBtnRef} type="button" className="btn btn-outline modal-btn-cancel" onClick={onClose} disabled={loading}>
              {CancelIcon && <CancelIcon size={14} style={{ marginRight: '6px' }} />}
              {cancelText}
            </button>
          )}
          {onConfirm && (
            <button ref={confirmBtnRef} type="button" className={`btn modal-btn-confirm modal-btn-${effectiveVariant}`} onClick={onConfirm} disabled={disabled || loading}>
              {loading ? <span className="modal-spinner" /> : ConfirmIcon ? <ConfirmIcon size={14} style={{ marginRight: '6px' }} /> : null}
              <span>{confirmText}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export interface ConfirmOptions {
  title: ReactNode;
  subtitle?: ReactNode;
  message?: ReactNode;
  details?: ReactNode;
  variant?: ModalVariant;
  confirmText?: string;
  cancelText?: string;
  confirmIcon?: LucideIcon;
  cancelIcon?: LucideIcon;
  width?: string;
  autoFocus?: 'confirm' | 'cancel';
  isAlert?: boolean;
  children?: ReactNode;
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: Omit<ConfirmOptions, 'isAlert'> | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = (): ConfirmContextType => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
};

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string'
      ? { title: 'Confirm Action', message: options, variant: options.toLowerCase().includes('delete') ? 'danger' : 'default' }
      : options;
    return new Promise(resolve => setDialog({ opts, resolve }));
  }, []);

  const alert = useCallback((options: Omit<ConfirmOptions, 'isAlert'> | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string'
      ? { title: 'Notice', message: options, isAlert: true, confirmText: 'OK' }
      : { ...options, isAlert: true, confirmText: options.confirmText || 'OK' };
    return new Promise(resolve => setDialog({ opts, resolve }));
  }, []);

  const closeWith = (val: boolean) => {
    dialog?.resolve(val);
    setDialog(null);
  };

  const opts = dialog?.opts;
  const isAlert = opts?.isAlert || false;
  const variant = opts?.variant || 'default';
  const DefaultIcon = variant === 'danger' ? Trash2 : variant === 'warning' ? AlertTriangle : ['info', 'success'].includes(variant) ? Info : Check;

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <Modal
          isOpen={true}
          title={opts?.title || (isAlert ? 'Notice' : 'Please Confirm')}
          subtitle={opts?.subtitle}
          variant={variant}
          onClose={() => closeWith(false)}
          onConfirm={() => closeWith(true)}
          confirmText={opts?.confirmText || (isAlert ? 'OK' : 'Proceed')}
          cancelText={isAlert ? '' : (opts?.cancelText || 'Cancel')}
          confirmIcon={opts?.confirmIcon ?? DefaultIcon}
          cancelIcon={opts?.cancelIcon}
          width={opts?.width || '480px'}
          autoFocus={opts?.autoFocus || (variant === 'danger' ? 'cancel' : 'confirm')}
        >
          <div className="confirm-modal-content">
            {opts?.message && <div className="confirm-modal-message">{opts.message}</div>}
            {opts?.details && (
              <div className="confirm-modal-details">
                <span className="confirm-details-label">CONTEXT:</span>
                <span className="confirm-details-value">{opts.details}</span>
              </div>
            )}
            {opts?.children}
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
};
