import './styles.css';
import {
  ApiError,
  confirmTool,
  createConversation,
  eventsUrl,
  listMessages,
  mintToken,
  postMessage,
  type Branding,
  type WidgetMessage,
} from './api';
import { connectSse, type SseEvent } from './sse';
import { el, readableTextColor } from './dom';
import { setLocale, t } from './i18n';

interface ConversationEvent {
  type: string;
  message?: WidgetMessage;
  messageId?: string;
  delta?: string;
  errorCode?: string;
  conversation?: { status: string };
  confirmationId?: string;
  toolName?: string;
  summary?: string;
  expiresAt?: string;
}

const STORAGE_KEY = 'acs:conversationId';

function parseHash(): { widgetKey: string; hostOrigin: string | null } {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return { widgetKey: params.get('key') ?? '', hostOrigin: params.get('host') };
}

class WidgetApp {
  private token = '';
  private conversationId: string | null = null;
  private readonly rendered = new Set<string>();
  private readonly deltaNodes = new Map<string, HTMLElement>();
  private pendingSend: { content: string; idempotencyKey: string } | null = null;
  private sseAbort: AbortController | null = null;
  private typingNode: HTMLElement | null = null;
  private log!: HTMLElement;
  private status!: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private readonly hostOrigin: string | null;

  constructor(private readonly widgetKey: string, hostOrigin: string | null) {
    this.hostOrigin = hostOrigin;
  }

  async start(root: HTMLElement): Promise<void> {
    const minted = await mintToken(this.widgetKey);
    this.token = minted.token;
    this.applyBranding(minted.branding);
    this.render(root, minted.branding);
    this.postToHost('acs:ready');

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      try {
        await this.loadHistory(stored);
        this.conversationId = stored;
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    if (this.conversationId !== null) this.startStream();
  }

  private applyBranding(branding: Branding): void {
    setLocale(branding.locale.split('-')[0] ?? 'en');
    document.documentElement.style.setProperty('--acs-primary', branding.primaryColor);
    document.documentElement.style.setProperty('--acs-on-primary', readableTextColor(branding.primaryColor));
    document.title = branding.title;
  }

  private render(root: HTMLElement, branding: Branding): void {
    const container = el('div', { class: 'acs-widget' });

    const header = el('header', { class: 'acs-header' });
    header.appendChild(el('h1', {}, branding.title));
    const closeButton = el('button', { type: 'button', 'aria-label': t('close') }, '✕');
    closeButton.addEventListener('click', () => this.postToHost('acs:close'));
    header.appendChild(closeButton);

    this.log = el('div', { class: 'acs-log', role: 'log', 'aria-live': 'polite', 'aria-label': t('title') });
    this.status = el('div', { class: 'acs-status', 'aria-live': 'polite' });

    const composer = el('form', { class: 'acs-composer' });
    this.textarea = el('textarea', { 'aria-label': t('inputLabel'), maxlength: '8000', required: '' });
    this.sendButton = el('button', { type: 'submit' }, t('send'));
    composer.append(this.textarea, this.sendButton);
    composer.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.send();
    });
    this.textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.send();
      }
      if (event.key === 'Escape') this.postToHost('acs:close');
    });

    container.append(header, this.log, this.status, composer);
    root.replaceChildren(container);
    this.textarea.focus();
  }

  private async loadHistory(conversationId: string): Promise<void> {
    const page = await this.withAuthRetry(() => listMessages(this.token, conversationId));
    for (const message of page.items) this.renderMessage(message);
  }

  private async send(): Promise<void> {
    const pending = this.pendingSend;
    const content = pending !== null ? pending.content : this.textarea.value.trim();
    if (content.length === 0) return;
    // Reuse the same idempotency key when retrying a failed send.
    const idempotencyKey = pending?.idempotencyKey ?? crypto.randomUUID();
    this.pendingSend = { content, idempotencyKey };
    this.sendButton.disabled = true;
    this.status.textContent = '';
    try {
      if (this.conversationId === null) {
        const conversation = await this.withAuthRetry(() => createConversation(this.token));
        this.conversationId = conversation.id;
        sessionStorage.setItem(STORAGE_KEY, conversation.id);
        this.startStream();
      }
      const conversationId = this.conversationId;
      const result = await this.withAuthRetry(() => postMessage(this.token, conversationId, content, idempotencyKey));
      this.renderMessage(result.message);
      this.showTyping();
      this.pendingSend = null;
      this.textarea.value = '';
      this.textarea.focus();
    } catch {
      this.status.textContent = t('genericError');
    } finally {
      this.sendButton.disabled = false;
    }
  }

  /** Re-mint the widget token once on 401, then retry the request. */
  private async withAuthRetry<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const minted = await mintToken(this.widgetKey);
        this.token = minted.token;
        return run();
      }
      throw error;
    }
  }

  private startStream(): void {
    if (this.conversationId === null) return;
    this.sseAbort?.abort();
    this.sseAbort = new AbortController();
    const conversationId = this.conversationId;
    void connectSse({
      url: eventsUrl(conversationId),
      token: this.token,
      signal: this.sseAbort.signal,
      onEvent: (event) => this.handleSse(event),
      onReconnect: () => {
        this.status.textContent = '';
        // Refetch history after a gap so no events are missed.
        void this.loadHistory(conversationId);
      },
    });
  }

  private handleSse(frame: SseEvent): void {
    let event: ConversationEvent;
    try {
      event = JSON.parse(frame.data) as ConversationEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case 'message.created':
      case 'message.completed':
        if (event.message !== undefined) {
          if (event.message.role !== 'customer') this.hideTyping();
          this.renderMessage(event.message);
        }
        break;
      case 'message.delta':
        if (event.messageId !== undefined && event.delta !== undefined) {
          this.hideTyping();
          this.renderDelta(event.messageId, event.delta);
        }
        break;
      case 'message.failed':
        this.hideTyping();
        this.renderSystem(t('aiUnavailable'));
        break;
      case 'conversation.updated':
        if (event.conversation?.status === 'escalated') {
          this.hideTyping();
          this.renderSystem(t('escalated'));
        }
        break;
      case 'tool.confirmation_requested':
        this.hideTyping();
        if (event.confirmationId !== undefined) {
          this.renderConfirmation(event.confirmationId, event.toolName ?? '', event.summary ?? '', event.expiresAt ?? '');
        }
        break;
      default:
        break;
    }
  }

  private renderMessage(message: WidgetMessage): void {
    if (this.rendered.has(message.id)) {
      // A completed message may replace an in-flight delta node.
      const existing = this.deltaNodes.get(message.id);
      if (existing !== undefined) {
        const body = existing.querySelector('.acs-msg-body');
        if (body !== null) body.textContent = message.content;
        this.deltaNodes.delete(message.id);
      }
      return;
    }
    this.rendered.add(message.id);
    const roleClass = `acs-msg-${message.role}`;
    const node = el('div', { class: `acs-msg ${roleClass}` });
    const label = message.role === 'customer' ? t('youLabel') : message.aiGenerated ? t('aiLabel') : t('agentLabel');
    if (message.role !== 'system') node.appendChild(el('span', { class: 'acs-msg-label' }, label));
    node.appendChild(el('span', { class: 'acs-msg-body' }, message.content));
    if (message.citations.length > 0) {
      const citations = el('div', { class: 'acs-citations' }, t('sources'));
      const list = el('ul');
      for (const citation of message.citations) {
        const item = el('li');
        if (citation.url !== null) {
          item.appendChild(el('a', { href: citation.url, target: '_blank', rel: 'noopener noreferrer' }, citation.title));
        } else {
          item.textContent = citation.title;
        }
        list.appendChild(item);
      }
      citations.appendChild(list);
      node.appendChild(citations);
    }
    this.appendToLog(node);
  }

  private renderDelta(messageId: string, delta: string): void {
    let node = this.deltaNodes.get(messageId);
    if (node === undefined) {
      this.rendered.add(messageId);
      node = el('div', { class: 'acs-msg acs-msg-assistant' });
      node.appendChild(el('span', { class: 'acs-msg-label' }, t('aiLabel')));
      node.appendChild(el('span', { class: 'acs-msg-body' }, ''));
      this.deltaNodes.set(messageId, node);
      this.appendToLog(node);
    }
    const body = node.querySelector('.acs-msg-body');
    if (body !== null) body.textContent = (body.textContent ?? '') + delta;
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** WhatsApp-style typing bubble shown while the assistant prepares a reply. */
  private showTyping(): void {
    if (this.typingNode !== null && this.typingNode.isConnected) return;
    const node = el('div', {
      class: 'acs-msg acs-msg-assistant acs-typing',
      role: 'status',
      'aria-label': t('typing'),
    });
    for (let i = 0; i < 3; i += 1) node.appendChild(el('span', { class: 'acs-typing-dot', 'aria-hidden': 'true' }));
    this.typingNode = node;
    this.log.appendChild(node);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private hideTyping(): void {
    this.typingNode?.remove();
    this.typingNode = null;
  }

  private renderSystem(text: string): void {
    this.appendToLog(el('div', { class: 'acs-msg acs-msg-system', role: 'status' }, text));
  }

  private renderConfirmation(confirmationId: string, toolName: string, summary: string, expiresAt: string): void {
    const card = el('div', { class: 'acs-confirm', role: 'group', 'aria-label': t('confirmTitle') });
    card.appendChild(el('strong', {}, `${t('confirmTitle')}: ${toolName}`));
    card.appendChild(el('p', {}, summary));
    const actions = el('div', { class: 'acs-confirm-actions' });
    const approve = el('button', { type: 'button', class: 'acs-confirm-approve' }, t('confirm'));
    const reject = el('button', { type: 'button', class: 'acs-confirm-reject' }, t('cancel'));
    const decide = async (decision: 'approve' | 'reject'): Promise<void> => {
      approve.disabled = true;
      reject.disabled = true;
      if (this.conversationId === null) return;
      const conversationId = this.conversationId;
      try {
        await this.withAuthRetry(() => confirmTool(this.token, conversationId, confirmationId, decision));
        card.remove();
        if (decision === 'approve') this.showTyping();
      } catch {
        this.status.textContent = t('genericError');
        approve.disabled = false;
        reject.disabled = false;
      }
    };
    approve.addEventListener('click', () => void decide('approve'));
    reject.addEventListener('click', () => void decide('reject'));
    actions.append(approve, reject);
    card.appendChild(actions);
    if (expiresAt !== '') {
      const expiryMs = new Date(expiresAt).getTime() - Date.now();
      if (expiryMs > 0) {
        setTimeout(() => {
          if (card.isConnected) {
            card.replaceChildren(el('p', {}, t('confirmExpired')));
          }
        }, expiryMs);
      }
    }
    this.appendToLog(card);
  }

  private appendToLog(node: HTMLElement): void {
    // Keep the typing indicator pinned below the newest message.
    if (this.typingNode !== null && this.typingNode.isConnected) {
      this.log.insertBefore(node, this.typingNode);
    } else {
      this.log.appendChild(node);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  private postToHost(type: string): void {
    if (this.hostOrigin !== null && window.parent !== window) {
      window.parent.postMessage({ type }, this.hostOrigin);
    }
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('root');
  if (root === null) return;
  const { widgetKey, hostOrigin } = parseHash();
  if (widgetKey === '') {
    root.textContent = 'Missing widget key.';
    return;
  }
  const app = new WidgetApp(widgetKey, hostOrigin);
  try {
    await app.start(root);
  } catch (error) {
    root.textContent = error instanceof ApiError && error.code === 'ORIGIN_NOT_ALLOWED' ? 'This site is not authorized to load the widget.' : 'Unable to load support chat.';
  }
}

void boot();
