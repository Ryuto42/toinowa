/**
 * ポップアップの外側（バックドロップ）がクリックされたか。
 *
 * <dialog> のクリックは中身でも dialog 要素に届くので、
 * イベントの発生位置がダイアログの矩形の外かどうかで判定する。
 */
export function isBackdropClick(event: React.MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom;
}
