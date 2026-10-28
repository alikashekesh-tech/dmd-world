/* What the video shows, in order. Each chapter is one page (or a page plus an open menu/drawer).
   A stop scrolls to `y` ('top', a target key from the capture manifest, or 'bottom') and holds while its notes play.
   A note circles `target` and explains it; `image` swaps to an alternate capture of the same page for that note. */
export const CHAPTERS = [
  {
    id: 'home', title: 'Home', path: '/', blurb: 'The “Press Start” landing page',
    shots: [{
      img: 'home', seq: 'home-seq',
      stops: [
        { y: 'top', lead: 0.6, notes: [
          { target: 'scene', title: 'A desk that draws itself', text: 'The hand-drawn scene sketches in line by line, then the monitor boots into a tiny game.' },
          { target: ['console', 'tip'], image: 'home-hover', title: 'Everything on it is a link', text: 'Point at any object: it lights up, the rest dims, and its real starting price appears.' },
          { target: 'cta', title: 'One clear first step', text: '“Pick your platform” leads to a single question instead of 100+ categories.' },
        ] },
        { y: 'secPlatform', offset: -70, notes: [
          { target: 'tabs', title: 'What do you play on?', text: 'Four platforms, one tap. The choice is remembered for the next visit.' },
          { target: 'ppArt', image: 'home-switch', title: 'Every console has a drawing', text: 'Switching re-draws the console, recolours the section and swaps the products.' },
        ] },
        { y: 'secOffers', offset: -70, notes: [
          { target: 'offerCard', title: 'Prices that drop', text: 'Each price counts down from the old one. Under $100 the badge shows %, above it dollars.' },
        ] },
        { y: 'secBudget', offset: -70, notes: [
          { target: 'budgetControls', title: 'Shop by budget', text: 'Slide to a number: a coin drops in for every step and the count updates live.' },
          { target: 'budgetPicks', image: 'home-budget', title: 'The most for your money', text: 'Picks closest to your budget, one per brand, all in stock.' },
        ] },
        { y: 'secWorld', offset: -70, notes: [
          { target: 'figure', title: 'Beyond the console', text: 'Every other category gets its own animated drawing and its real product count.' },
        ] },
        { y: 'secAsk', offset: -70, notes: [
          { target: 'askPhone', title: 'Ask a person', text: 'Real questions shoppers have, with the store’s phone and email one tap away.' },
        ] },
        { y: 'secCont', offset: 0, notes: [
          { target: 'cont', title: 'CONTINUE?', text: 'Brands roll past like arcade credits, then the page ends on a pixel countdown.' },
        ] },
      ],
    }],
  },
  {
    id: 'shop', title: 'Shop', path: '/shop', blurb: 'All products, filters and the menu',
    shots: [{
      img: 'shop',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'heroArt', title: 'Every page opens on a stage', text: 'The same dark band, HUD label and line drawing as the home page.' },
          { target: 'megaFeature', image: 'shop-mega', title: 'The categories menu', text: 'Hovering a category shows its drawing, product count and quick links.' },
        ] },
        { y: 'toolbar', offset: 40, notes: [
          { target: 'filters', title: 'Filters live in the link', text: 'Every filter is part of the URL, so any view can be shared.' },
          { target: 'card', title: 'One product card, everywhere', text: 'Brand in mono, a stock light, the discount badge and one-tap add to cart.' },
        ] },
        { y: 'loadMore', align: 'center', notes: [
          { target: 'loadMore', title: 'Load more', text: 'A segmented bar shows how much of the catalog you’ve seen.' },
        ] },
      ],
    }],
  },
  {
    id: 'category', title: 'Category page', path: '/product-category/playstation', blurb: 'PlayStation, with its sub-categories',
    shots: [{
      img: 'category',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'heroArt', title: 'Colour follows the platform', text: 'PlayStation stays blue, Switch red, Xbox green, PC violet, like the home page picker.' },
          { target: 'chips', title: 'Jump between sub-categories', text: 'Parents list their children; the deepest pages list their siblings.' },
        ] },
      ],
    }],
  },
  {
    id: 'product', title: 'Product page', path: '/product/34198', blurb: 'Price drop, actions, details',
    shots: [{
      img: 'product',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'price', title: 'Watch the price drop', text: 'Reduced items count down from the old price to the new one.' },
          { target: 'ask', title: 'Ask before you buy', text: 'Compatibility, condition or stock: call or email the store directly.' },
        ] },
        { y: 'tabs', offset: 60, notes: [
          { target: 'tabs', title: 'Details, then related gear', text: 'HUD-style tabs and spec tables, followed by products that share a category or brand.' },
        ] },
      ],
    }],
  },
  {
    id: 'categories', title: 'All categories', path: '/categories', blurb: 'The store map',
    shots: [{
      img: 'categories',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'stats', title: 'The store map', text: 'Live counts for categories, brands and PlayStation products.' },
        ] },
        { y: 'card', offset: 150, notes: [
          { target: 'card', title: 'A drawing per category', text: 'Console art for platforms and every sub-category one tap away.' },
        ] },
      ],
    }],
  },
  {
    id: 'brands', title: 'Brands', path: '/brands', blurb: 'Every gear maker in store',
    shots: [{
      img: 'brands',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'credits', title: 'Names like credits', text: 'Outlined brand names roll past; pointing at one fills it in.' },
        ] },
        { y: 'grid', offset: 260, notes: [
          { target: 'card', title: 'Straight to the range', text: 'Each card shows the brand’s product count and its kind of gear.' },
        ] },
      ],
    }],
  },
  {
    id: 'cart', title: 'Cart', path: '/cart', blurb: 'Slide-out drawer and the cart page',
    shots: [{
      img: 'cart',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'drawer', image: 'cart-drawer', title: 'Slide-out cart', text: 'Adding a product opens the drawer with quantities and a quick checkout.' },
        ] },
        { y: 'lines', offset: 60, notes: [
          { target: 'summary', title: 'A receipt, not a table', text: 'A dark order summary with mono line items and one clear total.' },
          { target: 'line', title: 'Easy edits', text: 'Quantity steppers, stock status and remove, for every item.' },
        ] },
      ],
    }],
  },
  {
    id: 'checkout', title: 'Checkout', path: '/checkout', blurb: 'Three levels to the finish',
    shots: [{
      img: 'checkout',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'levels', title: 'Checkout in levels', text: 'Cart, details, done: progress reads like a game.' },
          { target: 'step', title: 'Four short steps', text: 'Numbered cards; the one you’re typing in lights up.' },
        ] },
      ],
    }],
  },
  {
    id: 'order', title: 'Order complete', path: '/order/LD-482913', blurb: 'The finish line',
    shots: [{
      img: 'order', seq: 'order-seq',
      stops: [
        { y: 'top', lead: 2.2, notes: [
          { target: 'word', title: 'Level complete', text: 'The confirmation materialises in pixel letters under a trophy.' },
        ] },
        { y: 'card', offset: 120, notes: [
          { target: 'card', title: 'Then the facts', text: 'Order number, items and total, with a way back to the shop.' },
        ] },
      ],
    }],
  },
  {
    id: 'account', title: 'Account', path: '/account', blurb: 'Player login and profile',
    shots: [
      { img: 'account-login', stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'press', title: 'Player login', text: 'Signing in starts on a PRESS START panel.' },
        ] },
      ] },
      { img: 'account', stops: [
        { y: 'top', lead: 0.6, notes: [
          { target: 'player', title: 'Player card', text: 'Name, orders and saved items at a glance.' },
          { target: 'orders', title: 'Order history', text: 'Status lights, totals and a link to every order.' },
        ] },
      ] },
    ],
  },
  {
    id: 'wishlist', title: 'Wishlist', path: '/wishlist', blurb: 'Saved for later',
    shots: [{
      img: 'wishlist',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'heroArt', title: 'Saved for later', text: 'A beating pixel heart, and everything you hearted kept in this browser below it.' },
        ] },
      ],
    }],
  },
  {
    id: 'contact', title: 'Contact', path: '/contact', blurb: 'Talk to a person',
    shots: [{
      img: 'contact',
      stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'call', title: 'Talk to a person', text: 'Call, WhatsApp or email the store.' },
          { target: 'ready', title: 'Have this ready', text: 'A short list that makes the call quicker.' },
        ] },
      ],
    }],
  },
  {
    id: 'notfound', title: '404 page', path: '/this-page-does-not-exist', blurb: 'Game over, continue?',
    shots: [{
      img: 'notfound', seq: 'notfound-seq',
      stops: [
        { y: 'top', lead: 2.6, notes: [
          { target: 'word', title: 'A lost life, not a dead end', text: 'A missing page shows GAME OVER in pixels.' },
          { target: 'cont', title: 'CONTINUE?', text: 'The same countdown as the home page, with a way home and back to the shop.' },
        ] },
      ],
    }],
  },
  {
    id: 'mobile', title: 'On mobile', path: '/', blurb: 'Every page reflows for phones', device: 'phone',
    shots: [
      { img: 'mobile-home', stops: [
        { y: 'top', lead: 2.8, notes: [
          { target: 'title', title: 'Fully responsive', text: 'The hero stacks, and the desk scene sits under the headline.' },
        ] },
        { y: 'chips', align: 'center', notes: [
          { target: 'chips', title: 'Made for thumbs', text: 'The desk’s links become a swipeable row of chips.' },
        ] },
        { y: 'secPlatform', offset: 20, notes: [
          { target: 'tabs', title: 'Platforms in a 2×2 grid', text: 'Big tap targets, same remembered choice.' },
        ] },
      ] },
      { img: 'mobile-product', stops: [
        { y: 'top', lead: 0.6, notes: [
          { target: 'price', title: 'Product pages too', text: 'The price drop, stock light and buttons, sized for a phone.' },
        ] },
      ] },
    ],
  },
];
