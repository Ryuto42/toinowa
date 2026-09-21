'use client';

import { usePathname } from 'next/navigation';

/**
 * 画面が切り替わったことを動きで示す。
 *
 * pathname を key にして中身を作り直すので、遷移のたびに
 * フェードイン（.page-enter）が1回だけ走る。
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="page-enter">{children}</div>;
}
