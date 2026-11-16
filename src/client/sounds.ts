import { alarmMessage, type DueAlert, soundFor } from "./alerts.js";
import { loadSwitchedOn, saveSwitchedOn } from "./switchSetting.js";

const SOUND_OFF_STORAGE_KEY = "whats-due-sound-off";
const VOLUME = 0.35;
const FADE_SECONDS = 0.01;

interface Tone {
  frequency: number;
  startSeconds: number;
  lengthSeconds: number;
}

interface Sound {
  tones: Tone[];
  totalSeconds: number;
}

const CHIME: Sound = {
  tones: [
    { frequency: 880, startSeconds: 0, lengthSeconds: 0.35 },
    { frequency: 1175, startSeconds: 0.18, lengthSeconds: 0.5 },
  ],
  totalSeconds: 0.8,
};

const ALARM: Sound = {
  tones: [
    { frequency: 988, startSeconds: 0, lengthSeconds: 0.16 },
    { frequency: 988, startSeconds: 0.24, lengthSeconds: 0.16 },
    { frequency: 988, startSeconds: 0.48, lengthSeconds: 0.16 },
  ],
  totalSeconds: 1.2,
};

export interface SoundControls {
  toggle: HTMLInputElement;
  testChimeButton: HTMLButtonElement;
  testAlarmButton: HTMLButtonElement;
  clickNeededBanner: HTMLParagraphElement;
  alarmBar: HTMLDivElement;
  alarmMessageLine: HTMLSpanElement;
  alarmStopButton: HTMLButtonElement;
}

export interface SoundSystem {
  announce(alerts: DueAlert[]): void;
}

function renderSound(context: AudioContext, sound: Sound): AudioBuffer {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(sound.totalSeconds * rate), rate);
  const samples = buffer.getChannelData(0);
  const fadeSamples = FADE_SECONDS * rate;
  for (const tone of sound.tones) {
    const first = Math.round(tone.startSeconds * rate);
    const count = Math.round(tone.lengthSeconds * rate);
    for (let index = 0; index < count; index++) {
      // Fading each end stops the tone from clicking.
      const fade = Math.min(1, index / fadeSamples, (count - index) / fadeSamples);
      samples[first + index] +=
        VOLUME * fade * Math.sin((2 * Math.PI * tone.frequency * index) / rate);
    }
  }
  return buffer;
}

export function setUpSound(controls: SoundControls): SoundSystem {
  const {
    toggle,
    testChimeButton,
    testAlarmButton,
    clickNeededBanner,
    alarmBar,
    alarmMessageLine,
    alarmStopButton,
  } = controls;
  let switchedOn = loadSwitchedOn(SOUND_OFF_STORAGE_KEY);
  // Browsers keep a page silent until it's clicked, so this waits for that click.
  let context: AudioContext | null = null;
  let chimeWaiting = false;
  let alarmSource: AudioBufferSourceNode | null = null;

  function showState(): void {
    toggle.checked = switchedOn;
    // Greyed out rather than hidden, so the switch doesn't move under the cursor.
    testChimeButton.disabled = !switchedOn;
    testAlarmButton.disabled = !switchedOn;
    clickNeededBanner.hidden = !switchedOn || context !== null;
  }

  function play(sound: Sound, loop: boolean): AudioBufferSourceNode | null {
    if (!context) {
      return null;
    }
    const source = context.createBufferSource();
    source.buffer = renderSound(context, sound);
    // Looping runs in the audio system, so a background tab's slowed timers can't delay it.
    source.loop = loop;
    source.connect(context.destination);
    source.start();
    return source;
  }

  function playChime(): void {
    chimeWaiting = !context;
    play(CHIME, false);
  }

  function startAlarm(message: string): void {
    alarmMessageLine.textContent = message;
    alarmBar.hidden = false;
    alarmSource ??= play(ALARM, true);
  }

  function stopAlarm(): void {
    alarmSource?.stop();
    alarmSource = null;
    alarmBar.hidden = true;
  }

  document.addEventListener(
    "click",
    () => {
      context = new AudioContext();
      void context.resume();
      if (!alarmBar.hidden) {
        alarmSource = play(ALARM, true);
      } else if (chimeWaiting) {
        playChime();
      }
      // Only the banner: redrawing the switch here would undo a click on it.
      clickNeededBanner.hidden = true;
    },
    { capture: true, once: true },
  );

  toggle.addEventListener("change", () => {
    switchedOn = toggle.checked;
    saveSwitchedOn(SOUND_OFF_STORAGE_KEY, switchedOn);
    if (!switchedOn) {
      chimeWaiting = false;
      stopAlarm();
    }
    showState();
  });
  testChimeButton.addEventListener("click", playChime);
  testAlarmButton.addEventListener("click", () => startAlarm("Test alarm"));
  alarmStopButton.addEventListener("click", stopAlarm);

  showState();

  return {
    announce(alerts) {
      if (!switchedOn) {
        return;
      }
      const sound = soundFor(alerts);
      if (sound === "alarm") {
        startAlarm(alarmMessage(alerts));
      } else if (sound === "chime") {
        playChime();
      }
    },
  };
}
