/* 5×7 pixel lettering, same glyphs as the site's CONTINUE? and GAME OVER. */
const G = {
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', E: '#####|#....|#....|####.|#....|#....|#####',
  P: '####.|#...#|#...#|####.|#....|#....|#....', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};

/** `reveal` 0..1 makes pixels appear in a pseudo-random order (the site's "materialise" effect). */
export default function Pixel({ text, color, width, reveal = 1 }) {
  const chars = [...text];
  const cols = chars.length * 6 - 1;
  const cells = [];
  chars.forEach((ch, g) => (G[ch] || G[' ']).split('|').forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '#') return;
    const X = g * 6 + x;
    const order = ((X * 13 + y * 29) % 23) / 23;
    if (order > reveal) return;
    cells.push(<rect key={`${g}-${x}-${y}`} x={X * 10 + 0.7} y={y * 10 + 0.7} width="8.6" height="8.6" fill={color} />);
  })));
  return <svg viewBox={`0 0 ${cols * 10 + 4} 70`} style={{ width, height: 'auto', display: 'block', overflow: 'visible' }}>{cells}</svg>;
}
