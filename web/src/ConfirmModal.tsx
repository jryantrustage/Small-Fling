/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import {
  X, Check, AlertTriangle, AlertCircle, Info, Trash2, type LucideIcon
} from 'lucide-react';

export type ModalVariant = 'default' | 'danger' | 'warning' | 'info' | 'success';

export interface ModalProps {
  isOpen?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon | ReactNode;
  variant?: ModalVariant;
  danger?: boolean; // backwards compatibility
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

/**
 * Standard Uniform Modal Component
 * Incorporates glassmorphic styling, animated entrance, variant glows, and keyboard shortcuts.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen = true,
  title,
  subtitle,
  icon: IconProp,
  variant,
  danger,
  onClose,
  onConfirm,
  confirmText = 'Save',
  cancelText = onConfirm ? 'Cancel' : 'Close',
  confirmIcon: ConfirmIconProp = Check,
  cancelIcon: CancelIconProp,
  disabled = false,
  loading = false,
  width,
  maxWidth,
  showCloseButton = true,
  autoFocus = 'confirm',
  children,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Compute effective variant
  const effectiveVariant: ModalVariant = variant || (danger ? 'danger' : 'default');

  useEffect(() => {
    if (!isOpen) return;

    // Focus requested button on open
    const timer = setTimeout(() => {
      if (autoFocus === 'confirm' && confirmBtnRef.current) {
        confirmBtnRef.current.focus();
      } else if (autoFocus === 'cancel' && cancelBtnRef.current) {
        cancelBtnRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && onConfirm && !disabled && !loading) {
        // Only trigger confirm on Enter if target is not a textarea or another button
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, onConfirm, disabled, loading, autoFocus]);

  if (!isOpen) return null;

  // Resolve header icon
  let HeaderIcon: ReactNode = null;
  if (IconProp) {
    if (typeof IconProp === 'function') {
      const LucideComp = IconProp as LucideIcon;
      HeaderIcon = <LucideComp size={18} />;
    } else {
      HeaderIcon = IconProp;
    }
  } else if (effectiveVariant === 'danger') {
    HeaderIcon = <AlertTriangle size={18} />;
  } else if (effectiveVariant === 'warning') {
    HeaderIcon = <AlertCircle size={18} />;
  } else if (effectiveVariant === 'info' || effectiveVariant === 'success') {
    HeaderIcon = <Info size={18} />;
  }

  const variantClass = `modal-variant-${effectiveVariant}`;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`modal-card ${variantClass}`}
        onClick={e => e.stopPropagation()}
        style={{
          ...(width ? { width } : {}),
          ...(maxWidth ? { maxWidth } : {})
        }}
      >
        {/* Glow accent bar */}
        <div className={`modal-glow-bar modal-glow-${effectiveVariant}`} />

        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-title-wrap">
            {HeaderIcon && (
              <div className={`modal-header-icon-badge modal-badge-${effectiveVariant}`}>
                {HeaderIcon}
              </div>
            )}
            <div className="modal-header-text">
              <span className="modal-title-text">{title}</span>
              {subtitle && <span className="modal-subtitle-text">{subtitle}</span>}
            </div>
          </div>
          {showCloseButton && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="modal-body">{children}</div>

        {/* Modal Footer */}
        <div className="modal-footer">
          {cancelText && (
            <button
              ref={cancelBtnRef}
              type="button"
              className="btn btn-outline modal-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              {CancelIconProp && <CancelIconProp size={14} style={{ marginRight: '6px' }} />}
              {cancelText}
            </button>
          )}
          {onConfirm && (
            <button
              ref={confirmBtnRef}
              type="button"
              className={`btn modal-btn-confirm modal-btn-${effectiveVariant}`}
              onClick={onConfirm}
              disabled={disabled || loading}
            >
              {loading ? (
                <span className="modal-spinner" />
              ) : ConfirmIconProp ? (
                <ConfirmIconProp size={14} style={{ marginRight: '6px' }} />
              ) : null}
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
  isAlert?: boolean; // When true, behaves like an alert box (only OK button)
  children?: ReactNode;
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: Omit<ConfirmOptions, 'isAlert'> | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

/**
 * Hook to trigger standard uniform confirmation / alert dialogs cleanly and DRY.
 * Returns a promise resolving to `true` (if confirmed / proceed) or `false` (if cancelled).
 */
export const useConfirm = (): ConfirmContextType => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

/**
 * Provider wrapping the application to supply confirmation dialogs without boilerplate.
 */
export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string'
      ? {
          title: 'Confirm Action',
          message: options,
          variant: options.toLowerCase().includes('delete') ? 'danger' : 'default',
        }
      : options;

    return new Promise(resolve => {
      setDialogState({
        isOpen: true,
        options: opts,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: Omit<ConfirmOptions, 'isAlert'> | string): Promise<boolean> => {
    const opts: ConfirmOptions = typeof options === 'string'
      ? {
          title: 'Notice',
          message: options,
          isAlert: true,
          confirmText: 'OK',
        }
      : {
          ...options,
          isAlert: true,
          confirmText: options.confirmText || 'OK',
        };

    return new Promise(resolve => {
      setDialogState({
        isOpen: true,
        options: opts,
        resolve,
      });
    });
  }, []);

  const handleClose = () => {
    if (dialogState) {
      dialogState.resolve(false);
      setDialogState(null);
    }
  };

  const handleConfirm = () => {
    if (dialogState) {
      dialogState.resolve(true);
      setDialogState(null);
    }
  };

  const opts = dialogState?.options;
  const isAlert = opts?.isAlert || false;
  const variant = opts?.variant || 'default';

  // Default icons according to variant
  let DefaultIcon: LucideIcon = Check;
  if (variant === 'danger') DefaultIcon = Trash2;
  else if (variant === 'warning') DefaultIcon = AlertTriangle;
  else if (variant === 'info' || variant === 'success') DefaultIcon = Info;

  const ConfirmIcon = opts?.confirmIcon !== undefined ? opts.confirmIcon : DefaultIcon;

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {dialogState && (
        <Modal
          isOpen={dialogState.isOpen}
          title={opts?.title || (isAlert ? 'Notice' : 'Please Confirm')}
          subtitle={opts?.subtitle}
          variant={variant}
          onClose={handleClose}
          onConfirm={handleConfirm}
          confirmText={opts?.confirmText || (isAlert ? 'OK' : 'Proceed')}
          cancelText={isAlert ? '' : (opts?.cancelText || 'Cancel')}
          confirmIcon={ConfirmIcon}
          cancelIcon={opts?.cancelIcon}
          width={opts?.width || '480px'}
          autoFocus={opts?.autoFocus || (variant === 'danger' ? 'cancel' : 'confirm')}
        >
          <div className="confirm-modal-content">
            {opts?.message && (
              <div className="confirm-modal-message">
                {opts.message}
              </div>
            )}
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
