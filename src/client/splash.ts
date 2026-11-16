// The animation that plays when a page opens, then fades away. Each page picks
// its own look in its HTML: the dashboard has the "paper tornado" (papers swirl
// while Canvas answers, then land in a stack), and the login page has a
// rubber stamp that thunks "DUE" onto a sheet, played entirely by CSS.
// Refresh never plays it.

// Canvas often answers in well under a second, so the animation runs at least
// this long; otherwise it would just flash.
export const MIN_SPLASH_MS = 1500;
const JOKE_EVERY_MS = 1300;
const SETTLE_MS = 550;
const CHECK_MS = 450;
const FADE_MS = 350;

export const LOADING_JOKES = [
  "Asking Canvas nicely…",
  "Bribing Canvas with snacks…",
  "Finding that one quiz you forgot…",
  "Herding your deadlines…",
  "Untangling the syllabus…",
  "Counting down to the weekend…",
  "Waking up the TAs…",
  "Sharpening pencils…",
];

// How much longer the animation should keep going once the page is ready.
export function remainingSplashTime(elapsedMs: number, minimumMs = MIN_SPLASH_MS): number {
  return Math.max(0, minimumMs - elapsedMs);
}

// Jokes in a shuffled order, so each visit starts with a different one.
export function shuffledJokes(random: () => number = Math.random): string[] {
  const jokes = [...LOADING_JOKES];
  for (let index = jokes.length - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1));
    [jokes[index], jokes[swapWith]] = [jokes[swapWith], jokes[index]];
  }
  return jokes;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

// Each look keeps itself moving until settle(), which brings it to rest.
interface Animation {
  settle(): Promise<void>;
}

function paperTornado(splash: HTMLElement, settleMs: number): Animation {
  const papers = [...splash.querySelectorAll<HTMLElement>(".paper")];
  return {
    async settle() {
      // Freeze each paper where it is mid-swirl, then glide it into the stack.
      for (const paper of papers) {
        paper.style.transform = getComputedStyle(paper).transform;
        paper.style.animation = "none";
      }
      void splash.offsetWidth; // apply the frozen positions before transitioning
      papers.forEach((paper, index) => {
        const tilt = (index % 2 === 0 ? -1 : 1) * (2 + index);
        paper.style.transform = `translate(-50%, calc(-50% - ${index * 4}px)) rotate(${tilt}deg)`;
      });
      await wait(settleMs);
    },
  };
}

// Looks drawn entirely by CSS keyframes, like the stamp, have nothing to stop.
const cssOnly: Animation = { settle: async () => undefined };

export interface SplashOptions {
  // What the splash says as it finishes, e.g. "Got it!".
  doneText?: string;
  // The shortest time the animation runs before it settles.
  minimumMs?: number;
  // How long the settle and check-mark steps take; shorter feels snappier.
  settleMs?: number;
}

export interface Splash {
  // Brings the animation to rest and fades it away. Safe to call more than once.
  finish(): Promise<void>;
}

export function startSplash(
  splash: HTMLElement,
  { doneText = "Got it!", minimumMs = MIN_SPLASH_MS, settleMs = SETTLE_MS }: SplashOptions = {},
): Splash {
  const startedAt = performance.now();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const jokeLine = splash.querySelector<HTMLElement>(".splash-joke")!;
  const animation = splash.querySelector(".paper") ? paperTornado(splash, settleMs) : cssOnly;

  const jokes = shuffledJokes();
  let jokeIndex = 0;
  jokeLine.textContent = jokes[0];
  const jokeTimer = window.setInterval(() => {
    jokeIndex = (jokeIndex + 1) % jokes.length;
    jokeLine.classList.add("swap");
    window.setTimeout(() => {
      jokeLine.textContent = jokes[jokeIndex];
      jokeLine.classList.remove("swap");
    }, 200);
  }, JOKE_EVERY_MS);

  async function finish(): Promise<void> {
    await wait(remainingSplashTime(performance.now() - startedAt, minimumMs));
    window.clearInterval(jokeTimer);
    if (!reducedMotion) {
      await animation.settle();
      splash.classList.add("checked");
      jokeLine.textContent = doneText;
      await wait(Math.min(CHECK_MS, settleMs));
    }
    splash.classList.add("leaving");
    await wait(FADE_MS);
    splash.remove();
  }

  let finishing: Promise<void> | null = null;
  return {
    finish() {
      finishing ??= finish();
      return finishing;
    },
  };
}
