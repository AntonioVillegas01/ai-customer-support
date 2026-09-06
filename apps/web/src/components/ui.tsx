import { clsx } from 'clsx';
import { Badge as ShadBadge } from '@/components/ui/badge';
import { Button as ShadButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatStatus } from '@/lib/i18n';

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const { className, variant = 'primary', ...rest } = props;
  const mapped = variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : 'outline';
  return <ShadButton variant={mapped} className={className} {...rest} />;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <Textarea {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30', props.className)} {...props} />;
}

export function Field({ label, error, children }: Readonly<{ label: string; error?: string | undefined; children: React.ReactNode }>) {
  return <Label className="grid content-start gap-1.5"><span>{label}</span>{children}{error === undefined ? null : <span role="alert" className="text-xs font-normal text-destructive">{error}</span>}</Label>;
}

export function Card({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <section className={cn('rounded-xl bg-card p-5 text-sm text-card-foreground ring-1 ring-foreground/10', className)}>{children}</section>;
}

export function Badge({ value, tone = 'neutral' }: Readonly<{ value: string; tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'ai' }>) {
  return (
    <ShadBadge
      variant={tone === 'danger' ? 'destructive' : tone === 'neutral' ? 'secondary' : 'secondary'}
      className={clsx(
        tone === 'good' && 'bg-success/15 text-success',
        tone === 'warn' && 'bg-warning/15 text-warning',
        tone === 'ai' && 'bg-ai/12 text-ai',
      )}
    >
      {formatStatus(value)}
    </ShadBadge>
  );
}

export function ErrorState({ message, code }: Readonly<{ message: string; code?: string }>) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{code === undefined ? message : `${code}: ${message}`}</div>;
}

export function EmptyState({ message }: Readonly<{ message: string }>) {
  return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{message}</p>;
}

export function LoadingState({ message }: Readonly<{ message: string }>) {
  return <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p>;
}
