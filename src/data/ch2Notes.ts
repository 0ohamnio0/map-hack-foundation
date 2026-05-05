/**
 * CH.2 — 떨어진 쪽지 5편 (《패닉어택 슈퍼스타》수록)
 *
 * 좌표 [x, z]는 base 단위. Ch2Scene에서 SCALE_X / SCALE_Z를 곱해 사용.
 * S커브 길의 NPC 배치 사이 빈 자리에 분포.
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
    id: 'jeju-fire',
    position: [4, -5],
    title: '제주들불축제',
    images: ['poems/01-jeju-fire.jpg'],
  },
  {
    id: 'bichae',
    position: [-4, -32],
    title: '비체(卑體)',
    images: ['poems/02-bichae.jpg'],
  },
  {
    id: 'theta',
    position: [22, -42],
    title: '혼동가중치 θ',
    images: ['poems/03-theta-1.jpg', 'poems/03-theta-2.jpg'],
  },
  {
    id: 'hell-salad',
    position: [20, -58],
    title: '지옥 샐러드',
    images: ['poems/04-hell-salad-1.jpg', 'poems/04-hell-salad-2.jpg'],
  },
  {
    id: 'termination',
    position: [2, -85],
    title: '터미네이션',
    images: ['poems/05-termination.jpg'],
  },
];
