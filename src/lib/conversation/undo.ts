/** 保存済みの最後の1往復から、再表示時の取り消し可否を復元する。 */
export function canUndoSavedExchange(
  messages: ReadonlyArray<{ id: string; actor: string; seq: number }>,
  completed: boolean,
  blockedMessageId?: string | null,
): boolean {
  if (completed) return false;
  const latestStudent = messages.filter(message => message.actor === 'student')
    .reduce<{ id: string; seq: number } | undefined>((latest, message) => !latest || message.seq > latest.seq ? message : latest, undefined);
  return Boolean(latestStudent && latestStudent.id !== blockedMessageId
    && messages.some(message => message.actor === 'agent' && message.seq > latestStudent.seq));
}
