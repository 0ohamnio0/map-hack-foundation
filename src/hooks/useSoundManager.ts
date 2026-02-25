import { useCallback, useRef } from 'react';

// Placeholder sound manager - actual Howler integration when sound files are available
type SoundSlot = {
  name: string;
  playing: boolean;
  looping: boolean;
};

const soundSlots: Record<string, SoundSlot> = {};

const SLOTS = [
  'intro_ambient', 'door_creak', 'gulp_red', 'gulp_blue',
  'gulp_yellow', 'gulp_green', 'gulp_white', 'phone_ring',
  'screen_on', 'boot_sound', 'pc_fan',
];

SLOTS.forEach(name => {
  soundSlots[name] = { name, playing: false, looping: false };
});

export function useSoundManager() {
  const play = useCallback((name: string) => {
    if (soundSlots[name]) {
      soundSlots[name].playing = true;
      console.log(`[Sound] Play: ${name}`);
    }
  }, []);

  const stop = useCallback((name: string) => {
    if (soundSlots[name]) {
      soundSlots[name].playing = false;
      console.log(`[Sound] Stop: ${name}`);
    }
  }, []);

  const loop = useCallback((name: string, shouldLoop: boolean) => {
    if (soundSlots[name]) {
      soundSlots[name].looping = shouldLoop;
      soundSlots[name].playing = shouldLoop;
      console.log(`[Sound] Loop ${shouldLoop ? 'on' : 'off'}: ${name}`);
    }
  }, []);

  return { play, stop, loop };
}
