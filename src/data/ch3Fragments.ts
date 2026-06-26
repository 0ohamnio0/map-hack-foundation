/**
 * CH.3 — 떠다니는/벽에 붙은 시 조각 (《패닉어택 슈퍼스타》수록)
 *
 * CH.2(ch2Notes.ts)와 동일한 PoemNote 구조 → 같은 NoteReader로 렌더(폰트·한영 토글·스타일 통일).
 * 본문(ko)은 PDF 텍스트 레이어에서 추출. en은 클로드 초안 번역(해민 검수 필요) — 시의 날것/욕설 그대로 옮김.
 *
 * 두 묶음:
 *  - NPC(고스트) 등장 시 공중에 뜨는 5조각: ckshp(3) + 맹점(2)  → ckshp1..3, maengjeom1..2
 *  - 빈 네모 finale 벽 갤러리 9조각: 전략적 행성 전투          → battle1..9
 *
 * position은 CH.3에선 미사용(배치는 POSTER_PLACEMENTS / ghostPos). 타입 충족용 [0,0].
 */
import type { PoemNote } from './ch2Notes'

// NPC 고스트 스폰 순서(약 순서) → 조각 id 매핑
export const NPC_FRAGMENT_IDS = ['ckshp1', 'ckshp2', 'ckshp3', 'maengjeom1', 'maengjeom2'] as const
// finale 빈 네모 벽 갤러리 순서
export const BATTLE_FRAGMENT_IDS = ['battle1', 'battle2', 'battle3', 'battle4', 'battle5', 'battle6', 'battle7', 'battle8', 'battle9'] as const
// 갤럭틱레버리하트브로큰스토어 — finale 빈 네모 우상단, 형광핑크. 상품 리스트 1~57을 PDF 페이지대로 3조각
export const GALACTIC_FRAGMENT_IDS = ['galactic1', 'galactic2', 'galactic3', 'galactic4'] as const

export const CH3_FRAGMENTS: PoemNote[] = [
  // ───────────────────────── ckshp (NPC 1~3) ─────────────────────────
  {
    id: 'ckshp1',
    position: [0, 0],
    title: 'ckshp*',
    titleEn: 'ckshp*',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `일 년 반 만에 땅 속으로 들어갔다
줄에 서서 기다리며 줄에 서서 기다리는 것에 대한 농담을 했다
사람을 넣기는커녕 한숨조차 놓아 둘 자리가 없을 만큼
꽉 차서 몸을 어찌어찌 구겨 넣으려고 애를 썼다 아무리 해도 정말 들어갈 수 없었지만
우리는 거기서 춤을 췄다
밖으로 나와
잠시 아무렇게 기대어 서서 영원히 줄지 않는 줄을 보았다`,
            en: `For the first time in a year and a half I went underground
Standing in line, waiting, we made jokes about standing in line and waiting
So packed there wasn't room to set down a single sigh, let alone a body
I kept trying to cram myself in somehow, no matter how I tried I really couldn't get in, but
we danced there anyway
Came back out
leaned against a wall for a while and watched the line that never got shorter`,
          },
          { type: 'rule' },
          {
            type: 'text',
            ko: `* 서울 용산구 이태원로 134`,
            en: `* 134 Itaewon-ro, Yongsan-gu, Seoul`,
            size: 'small',
          },
        ],
      },
    ],
  },
  {
    id: 'ckshp2',
    position: [0, 0],
    title: 'ckshp*',
    titleEn: 'ckshp*',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `물을 마시고 조금 울고 다시 땅 속으로 들어간다. 낯선 사람들의 살과 계속 닿으면서 동시에 좋아하는 사람들의 눈을 찾아 마주친다. 가만히 빠져나가는 손을 잡으면 신나는 음악 신나는 음악 신나는 음악 . . .`,
            en: `Drink some water, cry a little, go back underground. Skin of strangers brushing me the whole time while I hunt for the eyes of the ones I love. Catch a hand quietly slipping away and the music's good music's good music's good. . .`,
          },
          {
            type: 'text',
            ko: `새벽 네 시에
목이 셋 달린 조각상을 파는 상점이 걸어도 걸어도 계속 나왔다
어두운 쇼윈도우 안으로 주황빛 가로등 불빛이 비쳐 드러나는 개의 흉상을 구경하면서 우리는
여기로 가면 길이 끝날 것 같은데요.
그러면 길이 끝나지 않는 방향으로 가죠.
단정하고 아무도 없는 강가처럼
계속 걸을 수도 있었을 것이다
계속 걷기를 택한 쪽의 우리들을 상상한다`,
            en: `At four in the morning
shop selling three-headed statues kept appearing no matter how far we walked
We looked at a dog's bust lit orange by the streetlamp through the dark show window, and we said
If we go this way the road seems like it'll end.
Then let's go the way the road doesn't end.
Like a tidy, empty riverbank
we could have just kept walking
I imagine the version of us that chose to keep walking`,
          },
        ],
      },
    ],
  },
  {
    id: 'ckshp3',
    position: [0, 0],
    title: 'ckshp*',
    titleEn: 'ckshp*',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `멈춰 서서 바라봤었던 / 언덕 뒤에 있는 / 아무것도 없는 거리를
우리는 걸었을 것이다`,
            en: `The street we'd stopped and stared at / behind the hill / where there was nothing
we would have walked it`,
          },
          {
            type: 'text',
            ko: `생채기도 머지 않아 완치될 줄 믿소.
생채기도 머지 않아 완치될 줄 믿소.*
그러나 믿은 적이 없어서 낫질 않는다`,
            en: `I trust scratches will soon be healed.
I trust scratches will soon be healed.*
But I've never trusted it, so they never heal`,
          },
          { type: 'rule' },
          {
            type: 'text',
            ko: `* 이상, 〈날개〉`,
            en: `* Yi Sang, "Wings"`,
            size: 'small',
          },
        ],
      },
    ],
  },
  // ───────────────────────── 맹점 (NPC 4~5) ─────────────────────────
  {
    id: 'maengjeom1',
    position: [0, 0],
    title: '맹점',
    titleEn: 'Blind Spot',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `그림자가 태어난 날 나는 머리를 위아래로 세차게 내리쳤다
비로소 시력을 잃은 시체처럼 보일 것이다
진정한 찢어짐이란 완벽한 기대와 기다림 그리고 모든 것을
지워버림
만져져?
눈알 뒤에 손을 넣으면 신경이 끊어져 있는 틈새
빛이 닿아도 느끼지 못한다고 했다
그곳으로 네가 파고들어왔을 때
너무 화들짝 놀란 바람에 엉망으로 토했고
토사물 속에서 허우적대며 웃고 흐느꼈고
이번 한 번만 살아보면 안 될까 애원하고 빌었다`,
            en: `The day the shade was born I struck my head down hard, up and down
Only now will I look like a corpse lost its sight
True tearing is perfect expectation and waiting and the erasing
of everything
Can you feel it?
Slide a hand behind the eyeball and there's the gap where the nerve is severed
Even when light lands on it you feel nothing
When you burrowed in through that place
I startled so badly I threw up all over
flailed in the vomit and laughed and wept
and begged, pleaded; couldn't I live just this once`,
          },
        ],
      },
    ],
  },
  {
    id: 'maengjeom2',
    position: [0, 0],
    title: '맹점',
    titleEn: 'Blind Spot',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `이것은 비로소 그렇게 보일 것이다
그러자 위에서 아래에서 온통 나를 흘겨보았다
빛들이 우르르 달려들어서 낱낱이 찢어놓았다
이래도? 이래도? 싱그럽게 웃는 소리만 들려왔다
그렇게 사라질 줄만 알았는데
조용히 흰과 빛과 흰 빛이 내렸고
그때부터 생각하고 있다
빛이 더 많이 쏟아져 내렸으면 좋겠다
살아온 죄와 치욕
더이상 세상을 이해할 수 없을 거라는 기쁨
빛이 모든 걸 지워버린 거리에서 너와 춤추고 싶다고
기다리고 있어
그림자가 태어난 날로부터`,
            en: `Only now will it look like this
And then from above, from below, everyone glared at me
The lights rushed in all at once and tore me apart piece by piece
Even now? Even now? Only the sound of crisp, fresh laughter came
I thought I'd just vanish like that
But quietly white and light and white light came down
And since then I've been thinking
I wish the light would pour down even more
The sin and disgrace of having lived
The joy of knowing I'll never understand the world again
That I want to dance with you on a street the light has erased everything clean
I'm waiting
Ever since the day the shade was born`,
          },
        ],
      },
    ],
  },
  // ───────────────── 전략적 행성 전투 (finale 1~9) ─────────────────
  {
    id: 'battle1',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `온 우주의 행성들을 겨냥하고 쏜다
피융 피융
필요한 것은 내 안에 있다
하하 하!
시 게임
게임 시`,
            en: `Take aim at every planet in the universe and fire
pew pew
Everything I need is inside me
haha ha!
poem game
game poem`,
          },
          { type: 'text', ko: `게임 시작`, en: `game start` },
          {
            type: 'text',
            ko: `적색지구의 군주 A
우주를 한 번 구했으나 아무도 믿지 않는다
외로운 별에서 자리를 지켰지만 천년 동안 아무도 오지 않았다
결국 악당이 되어 우주를 파괴할 게임을 제작한다`,
            en: `Lord A of the Red Earth
saved the universe once, but nobody believes it
held their post on a lonely star, but for a thousand years no one came
In the end they turn villain and build a game to destroy the universe`,
          },
          { type: 'text', ko: `「전략적 행성 전투」`, en: `"Strategic Planetary Battle"` },
        ],
      },
    ],
  },
  {
    id: 'battle2',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          { type: 'text', ko: `시작`, en: `start` },
          {
            type: 'text',
            ko: `주인공 J
서울에서 오토바이 배달부로 일한다
빠르게 달릴 때면 노래를 부른다
꼭 너같이 생겼어
기분이 좋지 않은 날 집에 있는 여자친구를 팬다`,
            en: `The main character, J
works as a delivery rider in Seoul
sings whenever he rides fast
looks just like you
On the days he's in a bad mood he beats the girlfriend waiting at home`,
          },
          { type: 'text', ko: `시작`, en: `start` },
          { type: 'text', ko: `게임 시작`, en: `game start` },
          {
            type: 'text',
            ko: `살인 전염병이 퍼지고 십 년째
야생이 된 여의도
거리에는 배달 오토바이들만 다닌다
높은 생명 수당
배달비는 한 건당 십오만 원
J 는 건물 사이를 누비며 오늘의 건수를 채우고 있다`,
            en: `Tenth year of the pandemic
Yeouido gone feral
only delivery bikes move through the streets
High hazard pay
a hundred fifty thousand won per drop
J weaves between the buildings, filling today's quota`,
          },
        ],
      },
    ],
  },
  {
    id: 'battle3',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `이 씨발련아 대답안해?
여자친구에게 간간이 문자를 보내면서`,
            en: `you fucking cunt you not gonna answer?
texting the girlfriend now and then`,
          },
          {
            type: 'text',
            ko: `시작
석촌호수 중앙에 벤타블랙보다 더 짙은 점이
블랙홀처럼
점점 급속히 커지다가
삼킨다 J 를
전략적 행성 전투의 영웅으로 초대하기 위해`,
            en: `start
In the middle of Seokchon Lake a dot darker than Vantablack
like a black hole
swells faster and faster
and swallows J
to invite him as a hero of the Strategic Planetary Battle`,
          },
          {
            type: 'text',
            ko: `작아져서 없어지는 검은 점
거리에는 쓰러진 오토바이만 남아 있다
지구에서 사라진다 J 라는 인물은`,
            en: `the black dot shrinks and disappears
only a toppled bike left in the street
the figure called J vanishes from earth`,
          },
          {
            type: 'text',
            ko: `시작
지구에서 사라진다 J 라는 인물은
시작 시작
시작`,
            en: `start
the figure called J vanishes from earth
start start
start`,
          },
        ],
      },
    ],
  },
  {
    id: 'battle4',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `어라 시작이 안되네
흐른다
잠시만
렉걸렸나?
안내문을 띄워야겠다`,
            en: `huh, it won't start
it's lagging
hang on
did it freeze?
better put up a notice`,
          },
          { type: 'text', ko: `LOADING...`, en: `LOADING...` },
          { type: 'text', ko: `다시 다시`, en: `again again` },
          { type: 'text', ko: `게임 시작`, en: `game start` },
          {
            type: 'text',
            ko: `배틀필드 화성에 도착한 J
외계 행성에서 불려 온 각양각색의 우주 전설 영웅들
법사 사수 탱커 힐러 전략가
팀 내부의 시너지를 맞추어서 전략적 행성 전투에 나가야 한다
같은 능력치를 가진 영웅끼리는 유닛을 합칠 수 있다`,
            en: `J arrives on the battlefield, Mars
legendary heroes of the cosmos summoned from alien worlds, every kind
mage marksman tank healer strategist
You have to match the synergy inside the team and head into the Strategic Planetary Battle
Heroes with the same stats can merge into one unit`,
          },
        ],
      },
    ],
  },
  {
    id: 'battle5',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `다른 영웅을 흡수한 영웅은 레벨 업한다
공격력은 조합된 아이템 하나당 50 씩 증가한다
재료 아이템은 상점에서 사거나 다른 행성과의 무역을 통해 얻는다
영웅끼리의 조합에 따라 증강체를 선택해서 승리로의 길을 터 나간다
라운드별 기본 피해량과 생존 영웅마다의 피해량을 합산해서 판별
레벨 업 할때마다 피해량 증가`,
            en: `A hero that absorbs another hero levels up
Attack power rises by 50 per combined item
Component items are bought at the shop or gained by trading with other planets
Depending on how heroes combine, you pick augments and carve a path to victory
Judged by summing each round's base damage with the damage of every surviving hero
Damage rises with every level up`,
          },
          {
            type: 'text',
            ko: `예를 들어 번개를 사용하는 자운*의 영웅이라면:
연쇄 번개 피해량 65% / 65% / 100%
처형 기준값 8% + 4% AP
연쇄 번개 대상 3 / 3 / 5
그러니까
그런 게 있거든…`,
            en: `For instance, a hero from Zaun* who wields lightning:
Chain Lightning damage 65% / 65% / 100%
Execute threshold 8% + 4% AP
Chain Lightning targets 3 / 3 / 5
so anyway
there's stuff like that…`,
          },
          { type: 'rule' },
          {
            type: 'text',
            ko: `* 게임 〈리그 오브 레전드〉 유니버스에 등장하는 오염된 지하도시의 이름에서 차용`,
            en: `* borrowed from the name of the polluted undercity in the League of Legends universe`,
            size: 'small',
          },
        ],
      },
    ],
  },
  {
    id: 'battle6',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `이 게임은 전략적으로 팀원을 배치하고 점점 몸집을 불려나가는 것이 핵심이다
이긴 행성 팀은 토너먼트를 통해 절대 군주와의 마지막 전투를 향한다
군주와 싸워 이기면 우주의 지배자가 될 수 있다
J 는 그걸 참 잘할 자신이 있었다`,
            en: `The heart of this game is placing your team strategically and growing bigger and bigger
The winning planet's team moves through the tournament toward the final battle with the Absolute Lord
Beat the Lord and you can become ruler of the universe
J was quite sure he'd be good at that`,
          },
          {
            type: 'text',
            ko: `네가 매일 밤 붙잡고 있는 게임이랑 똑같아
질 리 없지
고작 인간인데…`,
            en: `It's just like the game you cling to every night
no way you lose
you're only human…`,
          },
          {
            type: 'text',
            ko: `지구 팀은 인간들뿐이었지만
스피드런!
J 의 뛰어난 전략과 암약으로 온 은하계의 영웅들과 싸워 이긴다
주인공답다니까
마지막 주먹질
퍽 퍽퍽!
모든 괴물들을 쓰러뜨렸다! 하 하하!`,
            en: `Team Earth was nothing but humans, but
speedrun!
With J's brilliant strategy and scheming he fights the heroes of the whole galaxy and wins
that's our hero
the last punches
thwack thwack-thwack!
He's downed every monster! ha haha!`,
          },
        ],
      },
    ],
  },
  {
    id: 'battle7',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          { type: 'text', ko: `즐겁지?`, en: `fun, isn't it?` },
          {
            type: 'text',
            ko: `이제 마지막 전투를 앞둔 J,
저 멀리 푸른 점을 보면서 빨리 돌아가고 싶다고 소원한다`,
            en: `Now, J on the final battle
looks at the pale blue dot far away and wishes he could hurry home`,
          },
          {
            type: 'text', ko: `아니 아니
다시`, en: `no no
again` },
          {
            type: 'text',
            ko: `마지막 전투를 앞둔 J,
절대군주와 싸워 이겨 우주의 지배자가 되고 말 거라고 자신한다
절대 절대
지구로는 돌아가지 않겠다고 다짐한다`,
            en: `J on the final battle
swears he'll beat the Absolute Lord and become ruler of the universe
never, never
vows he never go back to earth`,
          },
          {
            type: 'text',
            ko: `왜?
왜냐하면 주인공으로도 만들어줬고
여태까지 큰 무리 없이 게임에서 승리하도록 해줬고`,
            en: `why?
because I made you the hero
and let you win the game without much trouble all this way`,
          },
        ],
      },
    ],
  },
  {
    id: 'battle8',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `이기면 온 우주를 주무를 수 있는 힘을 계승받을 수 있다니까?
고작 인간인데
해줘? 니가 해준게 뭔데 썅년아
이딴 것만 쓰지 말고
그런 성격은 못써 주인공인데
지구로는 돌아오지 마
차라리 A 와 싸워서 이겨
외로운 군주를 죽여줘
우주를 파괴할 만큼 큰 슬픔을 제거해 줘
그 다음 네가 몽땅 지배하면 되잖아
재밌잖아 게임이
요즘 게임은 다 그래`,
            en: `win and you inherit the power to bend the whole universe, get it?
you're only human
You let me win? what did you ever give me you bitch
Quit writing only this kind of crap
That attitude won't do, you're the hero
don't come back to earth
better to fight A and win
kill the lonely lord
take away a grief big enough to destroy a whole universe
then you just rule the whole thing, right
it's fun, isn't it, the game
games are all like this these days`,
          },
          {
            type: 'text',
            ko: `퍽퍽 퍽!
지랄하지 말고 책임감을 좀 가져봐 미친년아
경찰에 신고하면 쳐죽인다고 했지
다시 게임 시작`,
            en: `thwack thwack thwack!
Quit your bullshit and take some responsibility you crazy cunt
I told you I'd beat you to death if you call the cop
Restart the game`,
          },
        ],
      },
    ],
  },
  {
    id: 'battle9',
    position: [0, 0],
    title: '전략적 행성 전투',
    titleEn: 'Strategic Planetary Battle',
    pages: [
      {
        segments: [
          {
            type: 'text', ko: `책임감을 가지고
시작`, en: `with responsibility
start` },
          {
            type: 'text',
            ko: `J 는 드디어 A 의 숨통을 끊는다! 절대군주 A 의 입에서 흘러나온 마지막 말은
잠시만
못하겠어
그냥
지구 밖에 있어주면 안 될까`,
            en: `J finally chokes the life out of A! The last words spilling from the Absolute Lord A's mouth were
Hang on
I can't do it
just
couldn't you stay outside of earth`,
          },
          {
            type: 'text',
            ko: `게임 아니 시
시 아니 게임
안에서만이라도
시작해 그냥
개 같은 년아
숨 쉬어`,
            en: `game no, poem
poem no, game
at least inside it
just begin
you cunt
breathe`,
          },
        ],
      },
    ],
  },
  // ──────────── 갤럭틱레버리하트브로큰스토어 (finale 빈 네모 벽, 형광핑크) — 4장: 도입(이미지+주석) + 상품 1~57 ────────────
  {
    id: 'galactic1',
    position: [0, 0],
    title: '갤럭틱레버리하트브로큰스토어',
    titleEn: 'Galactic Lovely Heartbroken Store',
    pages: [
      {
        segments: [
          { type: 'image', src: 'assets/tex/poem/galactic_diagram.jpeg', widthPct: 92 },
          {
            type: 'text',
            ko: `은하계의 제일 위층 다락에서 운영하는 이 상점은 오직 고통교환으로만 거래를 한다. 상점에 들어선 고객은 거대한 전개도 형태의 상품 선반을 마주하게 된다. 전개도 상에서 각각의 부품은 상응하는 고통가치를 가진 고객의 물건과 교환 가능하다. 고객이 탁상 위에 고통을 상징하는 물건을 올려 놓고 관련된 이야기를 하면 교환 가능한 품목에 불이 켜지며, 그 후 원하는 품목의 번호를 불러 물건을 꺼내고 자신의 물건을 다시 투입하는 방식으로 거래가 이루어진다. 어떤 품목이 얼마만큼의 가치를 가지고 있는지는 전개도가 판별한다. 그러나 악명높은 우주해적 버글러 비클럭서스의 말에 의하면 수많은 살상피해를 가져온 5098년식 우주선 GPx-39 모델을 가져와도 45번부터는 불이 아예 켜지지 않았다고 한다.`,
            size: 'small',
          },
        ],
      },
    ],
  },
  {
    id: 'galactic2',
    position: [0, 0],
    title: '갤럭틱레버리하트브로큰스토어',
    titleEn: 'Galactic Lovely Heartbroken Store',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `1. 투명 당근
2. 타키온 입자
3. 휘포케이메논
4. 바후차라마타의 외출용 가운
5. 라키 라쿤의 방에 있던 기디언 성경책
6. 숫티퐁 응우옌 씨의 엉덩이에 난 꼬리
7. 간만에 나온 종각이의 수도꼭지
8. 마녀들의 블루스 LP판
9. 비타 노바 댄스 강습권
10. 카진스키가 가르친 기하학 교재
11. 세인트 바보 교회 스테인드글라스
12. 위악적인 사람의 겨드랑이 패치
13. 한국정치철학연구회 총서
14. 개버 댄서의 젖꼭지 피어싱
15. 레즈비언 클럽 ‘PINK’의 화장실 키
16. 악마 특급 아로마 테라피 10회권
17. 콘웨이 진동자 비행선
18. 페요틀과 사랑 1그램
19. 역배변훈련자가 똥을 싼 기저귀`,
          },
        ],
      },
    ],
  },
  {
    id: 'galactic3',
    position: [0, 0],
    title: '갤럭틱레버리하트브로큰스토어',
    titleEn: 'Galactic Lovely Heartbroken Store',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `20. 픽시스의 <헤이>를 스물 세번 들은 날의 통장 잔액
21. 인디고 칠드런의 눈알
22. MTF 비수술 성기
23. 수족관 돌고래들의 아르 브뤼
24. 고급두뇌를 위한 네트워크—하이브레인넷 아이디
25. 시체애호가의 딜도
26. 하얀 개가 찍힌 MPB 앨범 표지
27. 인터내셔널UFO연구협회 단체사진
28. 가로로 오는 제주도 빗물
29. <미니마 모랄리아>가 처음 쓰인 공책
30. 용암 다이빙용 물안경
31. 미래의 비생산적인 각도
32. 비문증 천사의 안약
33. BIID 환자가 다리를 잘라낼 때 쓴 톱
34. 하를렘에 서식하는 투구벌레의 일기장
35. 모든 관점 볼텍스
36. 제5인터내셔널 깃발
37. 육체적인 킨츠기
38. 너무 진지한 귀신 추출액`,
          },
        ],
      },
    ],
  },
  {
    id: 'galactic4',
    position: [0, 0],
    title: '갤럭틱레버리하트브로큰스토어',
    titleEn: 'Galactic Lovely Heartbroken Store',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `39. 게르뉴 드래곤의 부러진 척추뼈 엑스레이
40. 탑당구장 와이파이 비밀번호
41. <디스코 엘리시움> DLC
42. 백프로파게이션 알고리즘
43. SHINGO라는 이름을 가진 컴퓨터
44. 벡사시옹 초회 악보
45. 나사들
46. 나사들
47. 복합적 완충 클러스터
48. 나사들
49. 캘리퍼
50. 후인마이가 쓴 편지
51. 나사들
52. 나사들
53. 토글스위치
54. 나사들
55. 나사들
56. 내장들
57. 매주 목요일 10시 이레성폭력상담소 투어권`,
          },
        ],
      },
    ],
  },
]

// CH.3 조각은 전부 미니 카드. 시의 마지막 장이 아니면 오버레이 하단에 "계속... →"
const LAST_OF_POEM = new Set(['ckshp3', 'maengjeom2', 'battle9', 'galactic4'])
for (const f of CH3_FRAGMENTS) {
  f.compact = true
  f.continues = !LAST_OF_POEM.has(f.id)
}
