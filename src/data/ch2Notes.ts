/**
 * CH.2 — 떨어진 쪽지 7편 (《패닉어택 슈퍼스타》수록)
 *
 * 좌표 [x, z]는 base 단위. Ch2Scene에서 SCALE_X / SCALE_Z를 곱해 사용.
 * 플레이어가 S커브를 따라 진행하는 순서(z 단조 감소)와 시 순서가 일치.
 *
 * 페이지는 segments 배열 — text / image / rule 혼합.
 * - text: { type: 'text', ko, en?, preserveSpacing? }  (en 있으면 한·영 글리치 토글)
 * - image: { type: 'image', src, widthPct? }
 * - rule: { type: 'rule' } — 가로 구분선 (각주 위 등)
 */

export type PageSegment =
  | { type: 'text'; ko: string; en?: string; preserveSpacing?: boolean; size?: 'normal' | 'small'; align?: 'left' | 'center' }
  | { type: 'image'; src: string; widthPct?: number }
  | { type: 'rule' };

export interface PoemPage {
  segments: PageSegment[];
}

export interface PoemNote {
  id: string;
  position: [number, number]; // [x, z] base coords
  title: string;
  titleEn?: string;
  pages: PoemPage[];
}

export const CH2_NOTES: PoemNote[] = [
  {
    id: 'theta',
    position: [0, -12],
    title: '혼동가중치 θ',
    titleEn: 'Confusion Weight θ',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `광화문 앞에서 잃은 적 있다`,
            en: `I lost it once in front of Gwanghwamun.`,
          },
          {
            type: 'text',
            ko: `(들려요?…들리시나요…들려요?…들리시나요…)`,
            en: `(Can you hear me?…Are you listening…Can you hear me?…Are you listening…)`,
            size: 'small',
          },
          {
            type: 'text',
            ko: `석방하라! 석방하라! 석방하라!
퇴진하라! 퇴진하라! 퇴진하라!`,
            en: `Release them! Release them! Release them!
Step down! Step down! Step down!`,
          },
          { type: 'image', src: 'poems/01-theta-formula.webp', widthPct: 95 },
          {
            type: 'text',
            ko: `상당히 거대한 수학 공식
아니면 복지 좋은 스웨덴 감옥
텔레비전은 잘 나오고 사람들은 빙글빙글 돌아서
랜덤 노이즈에서 만들어지는 가짜 이미지들
강제입원 폐쇄병동도 별 다를 바 없었다

잃어버린 거 찾으러 왔다고 했더니
남자가 내 머리를 쓰다듬으며 이런 영매년 같으니라고
한 번 더 백일몽 속으로 조현하느라 바빠
망가진 피아노라도 되는 것처럼

책은 가톨릭 다이제스트 정도만 있었다
'흠씬 두드려 맞은 날의 편지' 중
"아버지, 저는 너무너무 기뻤어요."라는 문장에 토하듯 웃었다

발목에 전자발찌를 차고 있는 검은 강아지
린치당해서 앞니가 부러졌길래 인권위에 구제신청서를 제출했는데
제발 취소해달라고 병원이 처음으로 말 걸어 왔다
생성자 네트워크와 판별자 네트워크가 적대적 신경망을 이룸으로써…`,
            en: `A pretty huge mathematical formula
Or maybe a Swedish prison with great welfare
The TV worked fine and the people kept spinning around
Fake images conjured up from random noise
The locked psych ward was no different

When I said I'd come looking for what I'd lost
the man patted my head and called me a real little oracle
busy hallucinating my way through one more daydream
as if a broken piano could even pull it off

The only book around was the Catholic Digest
In "Letter from a Day I Was Beaten Half to Death,"
the line "Father, I was so, so happy" — I laughed like I might throw up

A black puppy wearing an ankle monitor
got lynched, lost a front tooth, so I filed a petition with the human rights commission
and for the first time the hospital begged me to withdraw it
as the generator network and the discriminator network formed an adversarial net…`,
          },
        ],
      },
    ],
  },
  {
    id: 'entropy',
    position: [-4, -20],
    title: '엔트로피 하우스',
    titleEn: 'Entropy House',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `나는 비행 전문가
비행기 안에서만 운다
음울한 진공

제주도에서 서울 그리고 제주도로
내려가면
젓가락을 밥 위에 세로로 꽂는다
몇명이나 죽었던 건지 기억도 나지 않는다
너무 사랑해서 죽은 이는 웃으면서 물구나무를 선다

할머니부터 엄마로… 그리고 엄마로부터 나는… 눈에 띌 만큼의 차이가
…
조상의 초상 앞에서 발 하나를 떼어 무너진 천장에 붙였다
올라가면
층간 소음 주의

할머니의 엄마도 나처럼
수없이 반복되는 이터레이션 위에서
불타는 집의 몸짓을 배웠겠지`,
            en: `I'm a flight specialist
I only cry inside airplanes
A gloomy vacuum

From Jeju to Seoul and back to Jeju
Going down,
I jam chopsticks vertically into the rice
I can't even remember how many of them died
The one who died from too much love smiles and stands on his hands

From grandmother to mother… and from mother to me… a difference visible to the eye
…
In front of the ancestor's portrait I peeled off one foot and stuck it to the collapsed ceiling
Going up,
Mind the inter-floor noise

My grandmother's mother, like me,
across countless iterations
must have learned the choreography of a burning house`,
          },
          { type: 'image', src: 'poems/02-entropy-graph.webp', widthPct: 54 },
        ],
      },
      {
        segments: [
          {
            type: 'text',
            ko: `앞으로 너에게 주고 싶은 몸짓은 아직 데이터 최적화가 덜 되었다
다들 코딩을 게으르게 했다고 한다
진짜인지 마지막으로 다시 물어볼까

//엄마와의 대화
[나]   99:99:99  엄마는 C#이 좋아 파이썬이 좋아?
[엄마] 00:00:00  양도소득세? 넌 알 필요 없단다


비행기 안에서
나는 향 냄새
공중에 떠 있는 발을 안쪽으로 캄캄히 숨기면
얼굴들이 두 손 내밀고 들어온다


우리는 곧장 비상문 밖으로 걸어나간다

그렇게 하면 e=x=t=r=o=p=y!
오직 진공 안에서만 추는 춤`,
            en: `The choreography I want to give you next still isn't data-optimized enough
They say everyone got lazy with the code
Maybe I'll ask one last time if it's real

//Conversation with mother
[me]   99:99:99  Mom, do you prefer C# or Python?
[mom]  00:00:00  Capital gains tax? You don't need to know.


Inside the airplane
I'm the smell of incense
When I tuck my feet, suspended midair, dark and inward,
faces step in with both hands held out


We walk straight out the emergency door

Doing it that way — e=x=t=r=o=p=y!
A dance only performed inside vacuum`,
          },
        ],
      },
    ],
  },
  {
    id: 'jeju-fire',
    position: [5, -32],
    title: '제주들불축제',
    titleEn: 'Jeju Field-Fire Festival',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `검하난 거짓말을 했던 거연.

들불축제에 가고 싶다고 했는데 제발 엄마는 절대 안된다고 했다
제발 들불 보고 지금보다 더 미쳐버릴까봐 제발 그래서 이 세상 온갖
집에 다 불을 지를까봐 제발로

축제는 성황이었겠다 내가 없어도 산에는 불이 잘 붙었겠고 사람들은
환호성을 질렀겠다 불이 점차 붙어가면서 글씨가 생겼겠다 근데 엄마
나는 거기 없어도 볼 수 있다? 화르륵 파르르 타오르는 참을 수 없는
불이 파고들어서 영원히 꺼지지 않을 불산이 이미 있다? 여기에

갱 진짜 모르는 거주게.

화염병 만드는 법 꿩이었던 엄마가 나보다 더 잘 알잖아 소주 진탕
마신 다음 빈 병에 기름 가득 채우고 젖은 목숨으로 입구를 적셔서
저기로 던지면 된다며 나한테 붙은 불 옮기려면 역시 그 방법밖엔
없지? 내가 죽어도 꺼지지 않게 여기저기

                불
              불불불불불
            불불불불불불불불
          불불불불불불불불불불불불
                불
              불        불
            불        불
                불

불이 옮겨붙으면 보이겠다 내가 뭐라고 썼는지`,
            en: `Turns out it was a goddamn lie.

I said I wanted to go to the field-fire festival but mom said
please absolutely not, please, what if I lost it even more
after seeing the fires, please, what if I set fire to every
house in the world, please don't

The festival must've been packed even without me,
the fires caught well on the mountain, people cheered,
the flames spelled out letters as they spread, but mom —
can I see it even from here? The unbearable fire that
crackles and tears through, isn't there already a mountain
of fire that will never go out? Right here?

You really don't know.

You used to know how to make Molotovs better than I do —
drink soju till you're wrecked, fill the empty bottle
with oil, wet the mouth with your young life, hurl it
over there, you said — to pass the fire to me there's
no other way, right? So it won't go out even after
I die, here and there

                F
              I R E F I
            R E F I R E F I
          R E F I R E F I R E F I
                F
              I        E
            R        I
                F

Once the fire spreads you'll see what I wrote`,
            preserveSpacing: true,
          },
        ],
      },
    ],
  },
  {
    id: 'bichae',
    position: [24, -42],
    title: '비체(卑體)',
    titleEn: 'Abject (卑體)',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `# 의사에게 지겹다고 대답했다. 동시에 지겹다는 감정이
무엇이었는지 놓친다. 지겨움의 추상을 심상으로 옮겨보면 그건
발작일까 부전일까. 울부짖음은 독특하다. 일반중력으로 끌리는 게
어떤 건지 이제 알았어. 치열처럼 모둠지어진 행성들. 블랙홀이 삼킨
사람들. 검고 깊은 내가 너무 싫었을 뿐이다. 롯은 소금이 된 아내를
뒤로 하고 느리게 춤춘다 도망칠 수 없는 끝을 향해서. 긴 통화 끝에
친구와 흑흑 울고, 하하 웃고, 손목을 긋는 마음은 아직도 알 수
없다고 거짓말했다. 내가 죽은 사람일 때 아무도 그립지 않게 된다.
그러니까

class Abject:
    def __init__(self, dead, emotion):
        self.dead = dead
        self.emotion = emotion

a = Abject(True, False)
if a.dead:
    a.emotion = False`,
            en: `# I told the doctor I was bored. At the same time
I lose what the feeling of "bored" even was. If I translate boredom's
abstraction into a mental image, was it a seizure or a paralysis?
The howling is peculiar. I just learned what it's like to be pulled
by ordinary gravity. Planets clustered together like teeth. People
swallowed by black holes. I just hated the dark, deep me. Lot
dances slowly with his salt-pillar wife behind him, toward an end
he can't run from. After a long phone call I cried hh-hh, laughed
ha-ha, and lied that I still don't understand what makes someone cut
their wrists. When I'm a dead person, no one ends up missing me.
So then.

class Abject:
    def __init__(self, dead, emotion):
        self.dead = dead
        self.emotion = emotion

a = Abject(True, False)
if a.dead:
    a.emotion = False`,
            preserveSpacing: true,
          },
        ],
      },
    ],
  },
  {
    id: 'hell-salad',
    position: [20, -67],
    title: '지옥 샐러드',
    titleEn: 'Hell Salad',
    pages: [
      {
        segments: [
          { type: 'text', ko: 'I', en: 'I', align: 'center' },
          {
            type: 'text',
            ko: `멍청한 대형마트 귀신
작은 캔 하나만 훔쳤다
탁 튀기는 깡통반지

나는 사후에 남자이고
내가 사랑한 남자는 여자가 되었는데

아뿔싸! 그렇게 예쁘지는 않았다

신사복과 숙녀복 코너
조금은 넥타이 쪽으로 치우쳐

거울 앞에 쭈그려 앉아 있을 때
마녀가 물어보자 지금 입은 가죽 정도면 알맞다고 대답했다

아이를 밴 것처럼 몸에 박혀 있는 얼굴
미쳤다고 미워해도 기다리고 싶었어
지하실에서 기어온 악마와 아빠

나? 살아있는 척하고 있지
이후로 말야

눈멀기 전까지 해를 바라본 후 보이는 네온 그린 행성에서
지옥 사장님이 보내주는 가장 잘생긴 셔츠룸 캐셔
사랑은 악을 향해 꿰뚫려 있었다`,
            en: `A dumb hypermarket ghost
Stole just one little can
The pull-tab ring snapping open

I'm a man in the afterlife
and the man I loved became a woman

Goddamn — she wasn't all that pretty

Men's wear and women's wear sections
leaning slightly toward the necktie aisle

Crouched in front of the mirror,
when the witch asked, I said the leather I have on now should be just right

A face lodged in my body like a pregnancy
Even called crazy and hated, I wanted to wait for him
Devil and dad crawled up from the basement

Me? I'm pretending to be alive
ever since

On the neon green planet visible after staring at the sun until you go blind
the best-looking shirt-room cashier the boss of hell ever sent —
love had been pierced clean through, aimed at evil`,
          },
        ],
      },
      {
        segments: [
          { type: 'text', ko: 'II', en: 'II', align: 'center' },
          {
            type: 'text',
            ko: `어떤 코스가 더 긴지
남자는 물었다

그 다음
백록담에서 미끄러지기

애애헤헤

모든 짐들이 위에 있었다

아래에는 배가
언제나 승선을 환영합니다

"아니. 이제는 다른 삶을 산단다.
 미안하지만 커피를 마실 순 없어."

죽은 줄도 모르고

콩 커피
맛있었다

액체는 셀 수 없어
WATER를 소문자로 고쳐 써 보라고 했더니
mafer라고 쓰는 아이와

삶에서 도망치고
죽음 껴안기`,
            en: `Which course is longer
the man asked

Next:
slipping at Baengnokdam

eh-eh hee-hee

All the loads were on top

Below was a boat
Boarding always welcome

"No. I'm living a different life now.
 Sorry but I can't drink the coffee."

Without even knowing he was dead

Bean coffee
tasted good

Liquid can't be counted
When I told him to rewrite WATER in lowercase
the kid wrote mafer

Run from life
hold death close`,
          },
        ],
      },
    ],
  },
  {
    id: 'termination',
    position: [2, -77],
    title: '터미네이션',
    titleEn: 'Termination',
    pages: [
      {
        segments: [
          {
            type: 'text',
            ko: `내 몸에서 내가 자라나던 날
태몽을 구겨서 주머니에 쑤셔 박았다
그런 뒤에는 침을 뱉어 그걸 쉽게 만들었다

퉤
별것 아니군
별일 아니야
그렇게 외쳐지고 싶었다 안으로 더 안쪽으로

그러나 말라붙은 침이 초파리처럼 들끓는 정오에
철 지난 입덧은 흔들린 초음파 사진을 게운다
노른자만 벅벅 긁어내 먹어치운 에그 인 헬
브런치
같은
튼살이 가렵다 벅벅

내가 나를 낳는 모습은 주로

출구가 어디더라
기념품 가게를 지나서…`,
            en: `The day I grew myself out of my own body
I crumpled the prophetic dream into my pocket and shoved it in
Then I spat on it to make the whole thing easier

Pweh
No big deal
Nothing at all
That's what I wanted shouted — inward, deeper inward

But by noon, when the dried-up spit teemed like fruit flies,
my late morning sickness retched up a shaky ultrasound photo
Yolks scraped clean and devoured — egg in hell
brunch
sort of
my stretch marks itch — scratch scratch

The way I give birth to myself is mostly

where was the exit again
past the souvenir shop…`,
          },
        ],
      },
    ],
  },
  {
    id: 'highstreamer',
    position: [-3, -88],
    title: '하이스트리머',
    titleEn: 'High Streamer',
    pages: [
      {
        segments: [
          { type: 'image', src: 'poems/07-highstreamer-img.webp', widthPct: 75 },
          {
            type: 'text',
            ko: `「分かりにくい話で申し訳ありませんでした。」`,
            en: `「分かりにくい話で申し訳ありませんでした。」`,
          },
          { type: 'rule' },
          {
            type: 'text',
            ko: `＊ 건담 시리즈의 제작사 토미노 요시유키는 2017년 〈기동전사 건담: 역습의 샤아〉 재상영회 GV에서 "이해하기 어려운 이야기라서 죄송했습니다."라고 관객들에게 사과했다.`,
            en: `* Tomino Yoshiyuki, the director of the Gundam series, apologized to the audience at the 2017 GV screening of Mobile Suit Gundam: Char's Counterattack, saying "I'm sorry the story was hard to understand."`,
            size: 'small',
          },
        ],
      },
    ],
  },
];
