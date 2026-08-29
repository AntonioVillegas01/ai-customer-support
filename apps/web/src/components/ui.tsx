import { clsx } from 'clsx';
import { formatStatus } from '@/lib/i18n';

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const { className, variant = 'primary', ...rest } = props;
  return <button className={clsx('rounded-md px-4 py-2 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50', variant === 'primary' && 'bg-blue-700 text-white hover:bg-blue-800', variant === 'secondary' && 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50', variant === 'danger' && 'bg-red-700 text-white hover:bg-red-800', className)} {...rest} />;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm', props.className)} {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm', props.className)} {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm', props.className)} {...props} />;
}

export function Field({ label, error, children }: Readonly<{ label: string; error?: string | undefined; children: React.ReactNode }>) {
  return <label className="grid gap-1 text-sm font-medium text-slate-800"><span>{label}</span>{children}{error === undefined ? null : <span className="text-sm text-red-700">{error}</span>}</label>;
}

export function Card({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <section className={clsx('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</section>;
}

export function Badge({ value, tone = 'neutral' }: Readonly<{ value: string; tone?: 'neutral' | 'good' | 'warn' | 'danger' }>) {
  return <span className={clsx('inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize', tone === 'neutral' && 'bg-slate-100 text-slate-700', tone === 'good' && 'bg-green-100 text-green-800', tone === 'warn' && 'bg-amber-100 text-amber-900', tone === 'danger' && 'bg-red-100 text-red-800')}>{formatStatus(value)}</span>;
}

export function ErrorState({ message, code }: Readonly<{ message: string; code?: string }>) {
  return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{code === undefined ? message : `${code}: ${message}`}</div>;
}

export function EmptyState({ message }: Readonly<{ message: string }>) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{message}</p>;
}

export function LoadingState({ message }: Readonly<{ message: string }>) {
  return <p aria-live="polite" className="text-sm text-slate-600">{message}</p>;
}
