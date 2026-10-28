import { createElement } from 'react';
import type { ComponentPropsWithRef } from 'react';

function baseClass(base: string, className?: string): string {
  return className?.split(/\s+/).includes(base) ? className : [base, className].filter(Boolean).join(' ');
}

// Native props (including refs and an omitted button type) pass through unchanged.
export function Button({ className, ...props }: ComponentPropsWithRef<'button'>) {
  return <button className={baseClass('wf-btn', className)} {...props} />;
}

export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return <input className={baseClass('wf-input', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentPropsWithRef<'select'>) {
  return <select className={baseClass('wf-input', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={baseClass('wf-input', className)} {...props} />;
}

type PanelElement = 'div' | 'section' | 'article' | 'aside' | 'p';
type PanelProps<T extends PanelElement = 'div'> = ComponentPropsWithRef<T> & { as?: T };

// Keep the caller's semantic element without adding a layout wrapper.
export function Panel<T extends PanelElement = 'div'>({ as, className, ...props }: PanelProps<T>) {
  return createElement(as ?? 'div', { ...props, className: baseClass('wf-panel', className) });
}

export function StatusBadge({ className, ...props }: ComponentPropsWithRef<'span'>) {
  return <span className={baseClass('wf-status', className)} {...props} />;
}

export function PageTitle({ className, ...props }: ComponentPropsWithRef<'h1'>) {
  return <h1 className={baseClass('wf-title', className)} {...props} />;
}

export function PageHeading({ className, ...props }: ComponentPropsWithRef<'header'>) {
  return <header className={baseClass('wf-page-heading', className)} {...props} />;
}
