/** Minimal i18n catalog. Locale arrives with the widget branding config. */

const catalogs: Record<string, Record<string, string>> = {
  en: {
    title: 'Support',
    inputLabel: 'Type your message',
    send: 'Send',
    close: 'Close chat',
    loadOlder: 'Load older messages',
    aiLabel: 'AI',
    agentLabel: 'Agent',
    youLabel: 'You',
    sources: 'Sources',
    aiUnavailable: 'The assistant is temporarily unavailable. A human agent can help you — reply here and we will escalate your conversation.',
    escalated: 'Your conversation has been escalated to a human agent.',
    confirmTitle: 'Confirmation required',
    confirm: 'Confirm',
    cancel: 'Cancel',
    confirmExpired: 'This confirmation has expired.',
    typing: 'Assistant is typing…',
    connectionLost: 'Reconnecting…',
    genericError: 'Something went wrong. Please try again.',
  },
};

let active = 'en';

export function setLocale(locale: string): void {
  active = locale in catalogs ? locale : 'en';
}

export function t(key: string): string {
  return catalogs[active]?.[key] ?? catalogs['en']?.[key] ?? key;
}
