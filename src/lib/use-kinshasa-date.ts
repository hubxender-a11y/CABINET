import { useSyncExternalStore } from "react";
import { kinshasaDate } from "@/lib/receivables";

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

function getBrowserDate() {
  return kinshasaDate(new Date());
}

function getPrerenderDate() {
  return null;
}

export function useKinshasaDate() {
  return useSyncExternalStore(subscribe, getBrowserDate, getPrerenderDate);
}
