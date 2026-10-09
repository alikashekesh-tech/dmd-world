import HeroRoom from '../components/landing/HeroRoom.jsx';
import PlatformPicker from '../components/landing/PlatformPicker.jsx';
import PriceDrop from '../components/landing/PriceDrop.jsx';
import BudgetStack from '../components/landing/BudgetStack.jsx';
import WorldGrid from '../components/landing/WorldGrid.jsx';
import AskUs from '../components/landing/AskUs.jsx';
import Continue from '../components/landing/Continue.jsx';
import RecentlyViewed from '../components/landing/RecentlyViewed.jsx';
import { usePageMeta } from '../lib/meta.js';

/* "Press start": the page reads like a game. You arrive at your desk, say what you play on, see what dropped,
   set a budget, look around the rest of the world, ask a person if unsure, and the credits roll into CONTINUE?.
   Surfaces: one ink stage at the top (hero + platform chooser) that bridges onto the light canvas, where the
   chooser's shelf and the price drops share one surface; then light bands alternating with hairlines, and the ink
   credits at the end. Recently viewed (returning visitors) is a white band after the price drops, never a light
   strip between the two ink sections. */
export default function Home() {
  usePageMeta({ jsonLd: { '@context': 'https://schema.org', '@type': 'Store', name: 'DMD World', url: location.origin, telephone: '+96170903900', email: 'info@dmdworld.store', address: { '@type': 'PostalAddress', addressCountry: 'LB' }, potentialAction: { '@type': 'SearchAction', target: `${location.origin}/shop?q={search_term_string}`, 'query-input': 'required name=search_term_string' } } });
  return (
    <>
      <HeroRoom />
      <PlatformPicker />
      <PriceDrop />
      <RecentlyViewed />
      <BudgetStack />
      <WorldGrid />
      <AskUs />
      <Continue />
    </>
  );
}
