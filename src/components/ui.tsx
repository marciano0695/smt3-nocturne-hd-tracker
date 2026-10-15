import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { useOpenState } from '../state/disclosure';
import { useStore } from '../state/store';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  small?: boolean;
}

export function Button({
  variant = 'secondary',
  icon,
  small,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${small ? ' btn-small' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={small ? 15 : 17} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  ...rest
}: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  );
}

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';

export function Tag({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`tag tag-${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Page section with an accordion header; closed sections stay mounted so forms keep their input. */
export function Section({
  title,
  description,
  actions,
  id,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useOpenState(`section:${id ?? slug(title)}`, defaultOpen);
  return (
    <section className={`section${open ? ' is-open' : ''}`} id={id}>
      <header className="section-head">
        <div>
          <h2>
            <button
              type="button"
              className="section-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen(!open)}
            >
              <Icon name="chevron" size={18} />
              {title}
            </button>
          </h2>
          {description && open && <p className="section-desc">{description}</p>}
        </div>
        {actions && open && <div className="section-actions">{actions}</div>}
      </header>
      <div id={bodyId} className="section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/** A collapsible group inside a section, e.g. one story chapter and what opens with it. */
export function AccordionGroup({
  id,
  title,
  meta,
  defaultOpen,
  current,
  children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen: boolean;
  /** Marks the group the player is in now. */
  current?: boolean;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useOpenState(id, defaultOpen);
  return (
    <div className={`group${open ? ' is-open' : ''}${current ? ' is-current' : ''}`}>
      <button
        type="button"
        className="group-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevron" size={16} />
        <span className="group-title">{title}</span>
        {meta && <span className="group-meta">{meta}</span>}
      </button>
      <div id={bodyId} className="group-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** Chevron that shows or hides an item's notes. */
export function NotesToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`notes-toggle${open ? ' is-open' : ''}`}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} details for ${label}`}
      title={open ? 'Hide details' : 'Show details'}
      onClick={onToggle}
    >
      <Icon name="chevron" size={14} />
    </button>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <h1>{title}</h1>
      {children && <div className="page-head-extra">{children}</div>}
    </header>
  );
}

/** Native modal dialog: focus trap, Escape and the top layer come for free. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <header className="dialog-head">
            <h2 id={headingId}>{title}</h2>
            <IconButton icon="close" label="Close" onClick={onClose} />
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}

/** Asks before something that can't be taken back. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** Small "unverified" tag; clicking it explains the assumption and lets the player confirm it. */
export function Unverified({ text, onConfirm }: { text: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tag tag-warning tag-button"
        onClick={() => setOpen(true)}
        title={text}
      >
        unverified
      </button>
      <ConfirmDialog
        open={open}
        title="Unverified assumption"
        confirmLabel="Mark as verified"
        onConfirm={onConfirm}
        onClose={() => setOpen(false)}
      >
        <p>{text}</p>
        <p className="muted">Only confirm this once you have checked it in the game.</p>
      </ConfirmDialog>
    </>
  );
}

/** Unverified tag for an assumption from data/rules.json; hidden once confirmed. */
export function AssumptionTag({ id }: { id: string }) {
  const { data, isVerified, confirmAssumption } = useStore();
  const assumption = data.rules.assumptions.find((a) => a.id === id);
  if (!assumption || isVerified(id)) return null;
  return <Unverified text={assumption.text} onConfirm={() => confirmAssumption(id, true)} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Text typed into a number field: leading zeros dropped, empty or invalid input is null. */
export function cleanNumberText(raw: string): { text: string; value: number | null } {
  const text = raw.replace(/^(-?)0+(?=\d)/, '$1');
  const value = text.trim() === '' ? null : Number(text);
  return { text, value: value === null || Number.isFinite(value) ? value : null };
}

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: number | null;
  /** null while the field is empty; callers clamp and decide what an empty field means. */
  onValueChange: (value: number | null) => void;
};

/**
 * A number field that keeps what is being typed. A plain controlled number input turns a
 * cleared field into 0, and React then leaves "023" on screen because it equals 23.
 */
export function NumberInput({ value, onValueChange, onBlur, ...props }: NumberInputProps) {
  const show = (v: number | null) => (v === null ? '' : String(v));
  const [text, setText] = useState(() => show(value));
  const [shown, setShown] = useState(value);
  // Follow changes from outside (save, discard, clamping) without clobbering the typing.
  if (value !== shown) {
    setShown(value);
    if (cleanNumberText(text).value !== value) setText(show(value));
  }
  return (
    <input
      {...props}
      type="number"
      inputMode={props.inputMode ?? 'numeric'}
      value={text}
      onChange={(e) => {
        const next = cleanNumberText(e.target.value);
        setText(next.text);
        onValueChange(next.value);
      }}
      onBlur={(e) => {
        // An empty or out-of-range entry snaps back to the value actually kept.
        setText(show(value));
        onBlur?.(e);
      }}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function ToastHost() {
  const { toast, dismissToast } = useStore();
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, toast.action ? 8000 : 4000);
    return () => window.clearTimeout(t);
  }, [toast, dismissToast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.run();
            dismissToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <IconButton icon="close" label="Dismiss" onClick={dismissToast} />
    </div>
  );
}
