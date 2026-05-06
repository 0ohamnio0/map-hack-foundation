/**
 * CH.2 — 떨어진 쪽지 6편 (《패닉어택 슈퍼스타》수록)
 *
 * 좌표 [x, z]는 base 단위. Ch2Scene에서 SCALE_X / SCALE_Z를 곱해 사용.
 * 플레이어가 S커브를 따라 진행하는 순서(z 단조 감소)와 시 순서가 일치.
 *
 * images: public/poems/* 의 파일명들 (BASE_URL + 'poems/<name>'으로 로드).
 */

export interface PoemNote {
  id: string;
  position: [number, number]; // [x, z] base coords
  title: string;
  images: string[];
}

export const CH2_NOTES: PoemNote[] = [
  {
    id: 'theta',
    position: [0, -12],
    title: '혼동가중치 θ',
    images: ['poems/01-theta.png'],
  },
  {
    id: 'entropy',
    position: [-4, -20],
    title: '엔트로피 하우스',
    images: ['poems/02-entropy-1.png', 'poems/02-entropy-2.png'],
  },
  {
    id: 'jeju-fire',
    position: [5, -32],
    title: '제주들불축제',
    images: ['poems/03-jeju-fire.png'],
  },
  {
    id: 'bichae',
    position: [24, -42],
    title: '비체(卑體)',
    images: ['poems/04-bichae.png'],
  },
  {
    id: 'hell-salad',
    position: [10, -65],
    title: '지옥 샐러드',
    images: ['poems/05-hell-salad-1.png', 'poems/05-hell-salad-2.png'],
  },
  {
    id: 'termination',
    position: [2, -77],
    title: '터미네이션',
    images: ['poems/06-termination.png'],
  },
];
