import { ConversationDetail } from '@/features/inbox/conversation-detail';

export default async function ConversationPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <ConversationDetail conversationId={id} />;
}
