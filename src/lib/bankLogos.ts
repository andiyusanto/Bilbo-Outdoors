// Client-only bank logo imports, kept out of paymentChannels.ts on purpose -
// that file is also imported server-side (db/defaultSettings.ts -> server.ts,
// which is bundled standalone via esbuild, see CLAUDE.md) and an image
// import has no business in that bundle. Logos are official current marks
// pulled from each bank's own Wikipedia infobox (Wikimedia Commons-hosted
// SVGs, rendered at 120px), used here only to identify which bank a
// transfer goes to in the payment picker - the same nominative use every
// bank-transfer checkout screen makes of these marks, not an endorsement
// claim. 2026-10-28.
import bri from '../assets/banks/002.png';
import mandiri from '../assets/banks/008.png';
import bca from '../assets/banks/014.png';
import bni from '../assets/banks/009.png';
import cimb from '../assets/banks/022.png';
import permata from '../assets/banks/013.png';
import bsi from '../assets/banks/451.png';
import danamon from '../assets/banks/011.png';

export const BANK_LOGOS: Record<string, string> = {
  '002': bri,
  '008': mandiri,
  '014': bca,
  '009': bni,
  '022': cimb,
  '013': permata,
  '451': bsi,
  '011': danamon,
};
