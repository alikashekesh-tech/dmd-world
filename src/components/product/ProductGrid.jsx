import ProductCard from './ProductCard.jsx';
import s from './ProductGrid.module.css';

export default function ProductGrid({ products, cols = 4, className = '' }) {
  return (
    <div className={`${s.grid} ${s[`c${cols}`]} ${className}`}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
    </div>
  );
}
