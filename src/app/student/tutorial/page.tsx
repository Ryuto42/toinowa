import { ChatWorkspace } from '@/components/student/chat-workspace';
import { TutorialLauncher } from '@/components/student/tutorial-launcher';
import { requireRole } from '@/lib/auth/guard';
import { TUTORIAL_TITLE } from '@/lib/tutorial/content';
export default async function TutorialPage() {
  await requireRole('student');
  return <ChatWorkspace title={TUTORIAL_TITLE} tutorial><TutorialLauncher /></ChatWorkspace>;
}
