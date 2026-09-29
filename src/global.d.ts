import type { BotMakerApi } from "./types";

declare global {
  interface Window {
    botmaker: BotMakerApi;
  }
}

export {};
