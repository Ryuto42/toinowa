'use client';

import { useEffect, useState } from 'react';

/**
 * 使い方ガイドの目次。
 *
 * いま読んでいる位置を示すため、各見出しを IntersectionObserver で監視する。
 * 画面上部に近いものを「現在地」とする（複数が同時に見えるため、
 * 交差しているかどうかだけでは決められない）。
 */
export function GuideToc({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const targets = items.map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => !!node);
    if (!targets.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-96px 0px -60% 0px', threshold: 0 });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [items]);

  return <nav aria-label="目次" className="sticky top-8">
    <p className="text-sm font-bold text-[#17233d]">目次</p>
    <ol className="mt-4 space-y-1 border-l border-[#e3eaee] pl-0">
      {items.map((item) => {
        const current = active === item.id;
        return <li key={item.id} className="relative">
          <a href={`#${item.id}`} aria-current={current ? 'true' : undefined}
            className={`block py-2 pl-5 text-sm leading-6 transition ${
              current ? 'font-bold text-[#237d75]' : 'text-[#8a9ab2] hover:text-[#52637d]'}`}>
            <span aria-hidden="true"
              className={`absolute left-0 top-[1.05rem] h-2 w-2 -translate-x-[4.5px] rounded-full transition ${
                current ? 'bg-[#237d75] ring-4 ring-[#e8f4f1]' : 'bg-[#cfdbd9]'}`} />
            {item.label}
          </a>
        </li>;
      })}
    </ol>
  </nav>;
}
