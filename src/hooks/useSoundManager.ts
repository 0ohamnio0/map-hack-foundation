import { useCallback } from 'react';
import { Howl } from 'howler';

const BASE = `${import.meta.env.BASE_URL ?? '/'}assets/audio/`;

const SOUND_MAP: Record<string, string | null> = {
  intro_ambient: null,
  door_creak: 'ch1/door_creak.mp3',
  dog_bark: 'ch1/dog_bark.mp3',
  tape_rewind: 'ch1/tape_rewind.mp3',
  paper_flip: 'ch2/paper_flip.mp3',
  npc_special: 'ch2/npc_special.mp3',
  vowels_bichae: 'ch2/vowels_bichae.mp3',
  vowels_entropy: 'ch2/vowels_entropy.mp3',
  'vowels_hell-salad': 'ch2/vowels_hell-salad.mp3',
  vowels_highstreamer: 'ch2/vowels_highstreamer.mp3',
  'vowels_jeju-fire': 'ch2/vowels_jeju-fire.mp3',
  vowels_termination: 'ch2/vowels_termination.mp3',
  vowels_theta: 'ch2/vowels_theta.mp3',
  gulp_red: 'ch3/gulp_red.mp3',
  gulp_blue: 'ch3/gulp_blue.mp3',
  gulp_yellow: 'ch3/gulp_yellow.mp3',
  gulp_green: 'ch3/gulp_green.mp3',
  gulp_white: 'ch3/gulp_white.mp3',
  mart_bgm: 'ch3/mart_bgm.mp3',
  space: 'ch3/space.mp3',
  npc_super: 'ch3/npc_super.mp3',
  elevator_room: 'ch3/elevator_room.mp3',
  elevator_ding: 'ch3/elevator_ding.mp3',
  elevator_door: 'ch3/elevator_door.mp3',
  elevator_btn_0: 'ch3/buttons/0.wav',
  elevator_btn_1: 'ch3/buttons/1.wav',
  elevator_btn_2: 'ch3/buttons/2.wav',
  elevator_btn_3: 'ch3/buttons/3.wav',
  elevator_btn_4: 'ch3/buttons/4.wav',
  elevator_btn_5: 'ch3/buttons/5.wav',
  elevator_btn_6: 'ch3/buttons/6.wav',
  elevator_btn_7: 'ch3/buttons/7.wav',
  elevator_btn_8: 'ch3/buttons/8.wav',
  elevator_btn_9: 'ch3/buttons/9.wav',
  elevator_btn_close: 'ch3/buttons/10.wav',
  elevator_btn_open: 'ch3/buttons/11.wav',
  phone_ring: 'ch4/phone_ring.mp3',
  ding_0: 'ch4/ding_0.mp3',
  ding_1: 'ch4/ding_1.mp3',
  ding_2: 'ch4/ding_2.mp3',
  ding_3: 'ch4/ding_3.mp3',
  ding_4: 'ch4/ding_4.mp3',
  boot_sound: 'ch5/boot_sound.mp3',
  screen_off: 'ch5/screen_off.mp3',
  pc_fan: 'ch5/pc_fan.mp3',
  popup_1: 'ch5/cough_1.mp3',
  popup_2: 'ch5/cough_7.mp3',
  popup_3: 'ch5/spit.wav',
  transition: 'transition.mp3',
};

const howls: Record<string, Howl> = {};
for (const [slot, path] of Object.entries(SOUND_MAP)) {
  if (!path) continue;
  const src = `${BASE}${path}`;
  howls[slot] = new Howl({
    src: [src],
    preload: true,
    onloaderror: (_id, err) => console.error(`[Sound] load error: ${slot} (${src})`, err),
    onplayerror: (_id, err) => console.error(`[Sound] play error: ${slot}`, err),
  });
}

export function useSoundManager() {
  const play = useCallback((name: string) => {
    const h = howls[name];
    if (h) h.play();
    else if (!(name in SOUND_MAP)) console.warn(`[Sound] unknown slot: ${name}`);
  }, []);

  const stop = useCallback((name: string) => {
    howls[name]?.stop();
  }, []);

  const loop = useCallback((name: string, shouldLoop: boolean) => {
    const h = howls[name];
    if (!h) return;
    h.loop(shouldLoop);
    if (shouldLoop) {
      if (!h.playing()) h.play();
    } else {
      h.stop();
    }
  }, []);

  return { play, stop, loop };
}
