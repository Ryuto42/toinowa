import { z } from 'zod';

export const documentImagesSchema = z.object({
  purpose: z.enum(['exam', 'lesson']),
  images: z.array(z.string().max(1_200_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)).min(1).max(8),
}).refine(value => value.images.reduce((sum, item) => sum + item.length, 0) <= 3_500_000, '画像の合計が大きすぎます。ページを分けてください');

export function hasImageSignature(dataUrl: string): boolean {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (dataUrl.startsWith('data:image/jpeg;')) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (dataUrl.startsWith('data:image/png;')) return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
