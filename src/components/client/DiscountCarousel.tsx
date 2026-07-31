import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, Percent } from 'lucide-react';
import { Product } from '../../types';
import { calculateSavingsFor5Days } from '../../pricing';
import bilboIcon from '../../assets/bilbo-icon.png';
import bilboLogoWide from '../../assets/bilbo-logo-wide.png';
import ImagePreviewModal from '../ImagePreviewModal';

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
// categories with no discounted products get no slide at all. Items within a
// category are ranked highest-discount-first (same sort as the equipment grid
// in ClientPortal.tsx) so the best deals surface first if a category has more
// items than comfortably fit in the fixed-height slide below.
function buildSlides(products: Product[], categoryOrder: string[]): Slide[] {
  const discounted = products.filter(p => calculateSavingsFor5Days(p.rates) > 0);
  const categorySlides: CategorySlide[] = categoryOrder
    .map(category => ({
      kind: 'category' as const,
      category,
      items: discounted
        .filter(p => p.category === category)
        .sort((a, b) => calculateSavingsFor5Days(b.rates) - calculateSavingsFor5Days(a.rates)),
    }))
    .filter(s => s.items.length > 0);
  return [{ kind: 'static' }, ...categorySlides];
}

export default function DiscountCarousel({ products, categoryOrder }: DiscountCarouselProps) {
  const slides = useMemo(() => buildSlides(products, categoryOrder), [products, categoryOrder]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
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
    // Fixed height (not min-height) so the box never resizes as slides cycle -
    // taller category slides scroll their item list internally instead of
    // growing the box (see the flex-1 min-h-0 wrappers below). Width cap lifted
    // at md:+ so desktop uses the full hero-box width; mobile is unaffected
    // since it's already at/under max-w-xl in practice.
    <div className="bg-brand/10 border-2 border-black p-4 rounded-none relative z-10 max-w-xl md:max-w-none h-64 shadow-[3px_3px_0px_rgba(0,0,0,1)] overflow-hidden">
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slideIndex}
              className="h-full flex flex-col"
              initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: -16 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.15, ease: 'easeOut' }}
            >
              {currentSlide.kind === 'static' ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-xs text-black">
                  <img src={bilboLogoWide} alt="Bilbo Outdoors" width={240} height={131} className="h-8 w-auto" />
                  <div className="flex items-start space-x-3 text-left">
                    <Info className="w-4.5 h-4.5 text-black shrink-0 mt-0.5 stroke-[3]" />
                    <p className="leading-normal font-bold uppercase tracking-wide text-[11px]">
                      <strong>SEWA LEBIH HEMAT:</strong> SEWA ALAT UNTUK <strong>5 HARI BERTURUT-TURUT</strong> DAN DAPATKAN HARGA TOTAL LEBIH HEMAT DIBANDING TARIF HARIAN — CEK LABEL HEMAT DI TIAP ALAT!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  <div className="shrink-0 flex items-start space-x-3 text-xs text-black">
                    <Percent className="w-4.5 h-4.5 text-black shrink-0 mt-0.5 stroke-[3]" />
                    <p className="font-black uppercase tracking-wide text-[11px] mb-2">
                      {currentSlide.category} — ALAT LEBIH HEMAT UNTUK 5 HARI:
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto pl-7">
                    <div className="space-y-1.5">
                      {currentSlide.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          {item.image ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImage({ url: item.image!, alt: item.name })}
                              aria-label={`Lihat foto ${item.name}`}
                              className="shrink-0 cursor-pointer hover:ring-2 hover:ring-black transition-all"
                            >
                              <img
                                src={item.image}
                                alt={item.name}
                                width={24}
                                height={24}
                                className="w-6 h-6 object-cover border border-black"
                              />
                            </button>
                          ) : (
                            <div className="w-6 h-6 border border-black/40 bg-white shrink-0 flex items-center justify-center">
                              <img src={bilboIcon} alt="" width={16} height={16} className="w-4 h-4 opacity-40" />
                            </div>
                          )}
                          <span className="flex-1 min-w-0 text-[11px] font-bold uppercase truncate">
                            {item.name}
                          </span>
                          <span className="text-[9px] font-black bg-black text-brand px-1.5 py-0.5 border border-black uppercase shrink-0">
                            {`HEMAT ${Math.round(calculateSavingsFor5Days(item.rates) / 1000)}K / 5 HARI`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {slides.length > 1 && (
          <div className="shrink-0 flex gap-1.5 justify-center mt-3 relative z-10">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlideIndex(i)}
                aria-label={`Slide ${i + 1} dari ${slides.length}`}
                aria-current={i === slideIndex}
                className="p-2.5 flex items-center justify-center cursor-pointer"
              >
                <span
                  className={`block w-2 h-2 rounded-full border border-black transition-colors ${
                    i === slideIndex ? 'bg-black' : 'bg-white'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage.url}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
