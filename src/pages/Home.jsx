import HeroRoom from '../components/landing/HeroRoom.jsx';
import PlatformPicker from '../components/landing/PlatformPicker.jsx';
import PriceDrop from '../components/landing/PriceDrop.jsx';
import BudgetStack from '../components/landing/BudgetStack.jsx';
import WorldGrid from '../components/landing/WorldGrid.jsx';
import AskUs from '../components/landing/AskUs.jsx';
import Continue from '../components/landing/Continue.jsx';
import RecentlyViewed from '../components/landing/RecentlyViewed.jsx';
import PromoBanners from '../components/landing/PromoBanners.jsx';
import { useLanding } from '../components/landing/data.js';
import { HOMEPAGE } from '../data/index.js';
import { usePageMeta } from '../lib/meta.js';

const SECTIONS = {
  hero: HeroRoom, banners: PromoBanners, recently_viewed: RecentlyViewed, platforms: PlatformPicker, price_drops: PriceDrop,
  budget: BudgetStack, world: WorldGrid, ask_us: AskUs, continue: Continue,
};
const BUILT_IN = ['hero', 'recently_viewed', 'platforms', 'price_drops', 'budget', 'world', 'ask_us', 'continue'];
const NUMBERED = new Set(['platforms', 'price_drops', 'budget', 'world', 'ask_us']);

/* "Press start": the page reads like a game. You arrive at your desk, say what you play on, see what dropped,
   set a budget, look around the rest of the world, ask a person if unsure, and the credits roll into CONTINUE?.
   With Laravel the owner sets the order and hides sections; the "01 · …" labels follow what is actually shown. */
export default function Home() {
  const { OFFERS } = useLanding(); // re-renders when the catalog (and with it the home page settings) changes
  usePageMeta({ jsonLd: { '@context': 'https://schema.org', '@type': 'Store', name: 'DMD World', url: location.origin, telephone: '+96170903900', email: 'info@dmdworld.store', address: { '@type': 'PostalAddress', addressCountry: 'LB' }, potentialAction: { '@type': 'SearchAction', target: `${location.origin}/shop?q={search_term_string}`, 'query-input': 'required name=search_term_string' } } });
  const order = HOMEPAGE.sections ? HOMEPAGE.sections.filter((x) => x.visible && SECTIONS[x.key]).map((x) => x.key) : BUILT_IN;
  let n = 0;
  return (
    <>
      {order.map((key) => {
        const Section = SECTIONS[key];
        const shown = key !== 'price_drops' || OFFERS.length > 0;
        return <Section key={key} {...(NUMBERED.has(key) && shown ? { n: ++n } : {})} />;
      })}
    </>
  );
}
