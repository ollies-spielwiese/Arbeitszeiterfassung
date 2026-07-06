// Ambient globale Deklarationen fuer tsc --noEmit.
// Vendor-Bibliotheken werden ueber <script src=".../vendor/..."> ins Window geladen
// und sind zur Laufzeit als Globals verfuegbar. Nur was der Code auch wirklich
// referenziert, wird hier deklariert.

declare const docx: any;
declare const jspdf: any;
declare const mammoth: any;
declare const pdfjsLib: any;

// Chrome-only Property, in lib.dom.d.ts (Stand TS 5.4) noch nicht enthalten.
interface Navigator {
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    brands?: Array<{ brand: string; version: string }>;
  };
}

// Vendor-Globals und Debug-Hooks auf window.
interface Window {
  state?: any;
  jspdf?: any;
  docx?: any;
  mammoth?: any;
  pdfjsLib?: any;
}
