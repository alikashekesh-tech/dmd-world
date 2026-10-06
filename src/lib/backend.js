/* Which backend this build talks to while the move from the Node server to Laravel is in progress.
   `VITE_BACKEND=laravel` (npm run dev:laravel): everything the storefront has moved so far comes from Laravel and MySQL,
   and the bundled catalog snapshot is never used. Anything else: the legacy Node server, as before. One build never
   mixes the two for the same data.
   `import.meta.env` only exists in Vite builds: the legacy Node server also imports the menu data (and through it this
   file), so the check must not assume it. */
export const LARAVEL = import.meta.env?.VITE_BACKEND === 'laravel';
