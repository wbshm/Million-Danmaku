/** Pixel sprites defined as character grids; no image files. */
import { CHARS } from '../game/chars';

export function makeSprite(rows: readonly string[], palette: Record<string, string>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

// k outline, h hair, s skin, e eye, c headphones, p shirt, w shirt mark, b trousers
const UP_A = [
  '..kkkkkk..',
  '.khhhhhhk.',
  'khhhhhhhhk',
  'khsssssshk',
  'cksesseskc',
  'cksssssskc',
  '.kksssskk.',
  '.kpwppppk.',
  'kspwwpppsk',
  '.kpwppppk.',
  '.kbbkkbbk.',
  '.kkk..kkk.',
];

const UP_B = [...UP_A.slice(0, 10), '.kbbkbbkk.', '..kk.kkk..'];

function upPalette(shirt: string, hair: string, phones: string): Record<string, string> {
  // A white shirt needs a coloured mark to stay visible.
  return { k: '#14141f', h: hair, s: '#ffd9b3', e: '#14141f', c: phones, p: shirt, w: shirt === '#f4f4f4' ? '#fb7299' : '#ffffff', b: '#3a4a7a' };
}

export interface CharSprites { a: HTMLCanvasElement; b: HTMLCanvasElement }

export const charSprites: CharSprites[] = [];
export const goldSprites: CharSprites = { a: null!, b: null! };

const HEART = ['.kk.kk.', 'krrkrrk', 'krrrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'];
const COIN = ['.kkkk.', 'kyyyyk', 'kyddyk', 'kyddyk', 'kyyyyk', '.kkkk.'];
const STAR = ['..y..', '.yyy.', 'yywyy', '.yyy.', '..y..'];

export const icons = {
  heart: null! as HTMLCanvasElement,
  heartEmpty: null! as HTMLCanvasElement,
  heartPickup: null! as HTMLCanvasElement,
  coin: null! as HTMLCanvasElement,
  star: null! as HTMLCanvasElement,
};

export function buildSprites(): void {
  charSprites.length = 0;
  for (const ch of CHARS) {
    const pal = upPalette(ch.shirt, ch.hair, ch.phones);
    charSprites.push({ a: makeSprite(UP_A, pal), b: makeSprite(UP_B, pal) });
  }
  const gold = { k: '#5a3a00', h: '#ffe680', s: '#fff3c4', e: '#5a3a00', c: '#ffffff', p: '#ffd24a', w: '#ffffff', b: '#c98a1a' };
  goldSprites.a = makeSprite(UP_A, gold);
  goldSprites.b = makeSprite(UP_B, gold);
  icons.heart = makeSprite(HEART, { k: '#14141f', r: '#ff5a6e' });
  icons.heartEmpty = makeSprite(HEART, { k: '#14141f', r: '#3a3a4c' });
  icons.heartPickup = makeSprite(HEART, { k: '#ffffff', r: '#ff5a6e' });
  icons.coin = makeSprite(COIN, { k: '#7a5200', y: '#ffd24a', d: '#c98a1a' });
  icons.star = makeSprite(STAR, { y: '#ffe680', w: '#ffffff' });
}
