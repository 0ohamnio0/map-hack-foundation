import { useCallback } from 'react';
import { Howl } from 'howler';

const BASE = `${import.meta.env.BASE_URL ?? '/'}assets/audio/`;

const SOUND_MAP: Record<string, string | null> = {
  intro_ambient: null,
  door_creak: 'ch1/door_creak.mp3',
  dog_bark: 'ch1/dog_bark.mp3',
  tape_rewind: 'ch1/tape_rewind.mp3',
  paper_flip: 'ch2/paper_flip.mp3',
  gulp_red: 'ch3/gulp_red.mp3',
  gulp_blue: 'ch3/gulp_blue.mp3',
  gulp_yellow: 'ch3/gulp_yellow.mp3',
  gulp_green: 'ch3/gulp_green.mp3',
  gulp_white: 'ch3/gulp_white.mp3',
  mart_bgm: 'ch3/mart_bgm.mp3',
  elevator_room: 'ch3/elevator_room.mp3',
  elevator_ding: 'ch3/elevator_ding.mp3',
  elevator_door: 'ch3/elevator_door.mp3',
  phone_ring: 'ch4/phone_ring.mp3',
  boot_sound: 'ch5/boot_sound.mp3',
  screen_off: 'ch5/screen_off.mp3',
  pc_fan: 'ch5/pc_fan.mp3',
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
