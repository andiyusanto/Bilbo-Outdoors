import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Percent } from 'lucide-react';
import { Product } from '../../types';
import bilboIcon from '../../assets/bilbo-icon.png';

interface DiscountCarouselProps {
  products: Product[];
  categoryOrder: string[];
}

interface CategorySlide {
  kind: 'category';
  category: string;
  items: Product[];
}
type Slide = { kind: 'static' } | CategorySlide;

const AUTO_ADVANCE_MS = 5000;

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setPrefers(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return prefers;
}

// Slide 1 is always the static message. Every category with at least one
// discounted product gets its own slide after that, in categoryOrder order -
// categories with no discounted products get no slide at all.
function buildSlides(products: Product[], categoryOrder: string[]): Slide[] {
  const discounted = products.filter(p => p.incrementalPriceAfter5Days > 0);
  const categorySlides: CategorySlide[] = categoryOrder
    .map(category => ({
      kind: 'category' as const,
      category,
      items: discounted.filter(p => p.category === category),
    }))
    .filter(s => s.items.length > 0);
  return [{ kind: 'static' }, ...categorySlides];
}

export default function DiscountCarousel({ products, categoryOrder }: DiscountCarouselProps) {
  const slides = useMemo(() => buildSlides(products, categoryOrder), [products, categoryOrder]);
  const [slideIndex, setSlideIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Clamp if the catalog changes underneath an open tab (e.g. admin removes
  // the last discounted product in whatever category is currently showing).
  useEffect(() => {
    if (slideIndex >= slides.length) setSlideIndex(0);
  }, [slides.length, slideIndex]);

  // Auto-advance. Depends on [slideIndex] so a manual dot click restarts the
  // countdown instead of the timer firing again right after a click.
  useEffect(() => {
    if (slides.length <= 1 || prefersReducedMotion) return;
    const id = setInterval(() => setSlideIndex(i => (i + 1) % slides.length), AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [slideIndex, slides.length, prefersReducedMotion]);

  const currentSlide = slides[slideIndex] ?? slides[0];

  return (
    <div className="bg-brand/10 border-2 border-black p-4 rounded-none relative z-10 max-w-xl shadow-[3px_3px_0px_rgba(0,0,0,1)] overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={slideIndex}
          initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, x: -16 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.15, ease: 'easeOut' }}
        >
          {currentSlide.kind === 'static' ? (
            <div className="flex items-start space-x-3 text-xs text-black">
              <Info className="w-4.5 h-4.5 text-black shrink-0 mt-0.5 stroke-[3]" />
              <p className="leading-normal font-bold uppercase tracking-wide text-[11px]">
                <strong>SISTEM DISKON OTOMATIS:</strong> SEWA ALAT YANG BERLAKU LEBIH DARI <strong>5 HARI BERTURUT-TURUT</strong> DAN DAPATKAN POTONGAN HARGA HARIAN — CEK LABEL DISKON DI TIAP ALAT!
              </p>
            </div>
          ) : (
            <div className="flex items-start space-x-3 text-xs text-black">
              <Percent className="w-4.5 h-4.5 text-black shrink-0 mt-0.5 stroke-[3]" />
              <div className="flex-1 min-w-0">
                <p className="font-black uppercase tracking-wide text-[11px] mb-2">
                  {currentSlide.category} — ALAT YANG SEDANG DISKON:
                </p>
                <div className="space-y-1.5">
                  {currentSlide.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-6 h-6 object-cover border border-black shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 border border-black/40 bg-white shrink-0 flex items-center justify-center">
                          <img src={bilboIcon} alt="" className="w-4 h-4 opacity-40" />
                        </div>
                      )}
                      <span className="flex-1 min-w-0 text-[11px] font-bold uppercase truncate">
                        {item.name}
                      </span>
                      <span className="text-[9px] font-black bg-black text-brand px-1.5 py-0.5 border border-black uppercase shrink-0">
                        {`-${Math.round(item.incrementalPriceAfter5Days / 1000)}K/HARI · >${item.discountMinDays} HARI`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="flex gap-1.5 justify-center mt-3 relative z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlideIndex(i)}
              aria-label={`Slide ${i + 1} dari ${slides.length}`}
              aria-current={i === slideIndex}
              className={`w-2 h-2 rounded-full border border-black transition-colors cursor-pointer ${
                i === slideIndex ? 'bg-black' : 'bg-white'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
