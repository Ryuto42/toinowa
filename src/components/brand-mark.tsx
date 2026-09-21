import Image from 'next/image';

/** サービス名の横に置く装飾ロゴ。名前は隣のテキストで読み上げる。 */
export function BrandMark({ size = 40 }: { size?: number }) {
  return <Image src="/brand/logo.png" alt="" width={size} height={size} className="shrink-0 object-contain" unoptimized />;
}
