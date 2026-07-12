interface CategoryFilterTabsProps {
  categories: string[];
  activeCategory: string;
  setActiveCategory: (category: string) => void;
}

export default function CategoryFilterTabs({
  categories,
  activeCategory,
  setActiveCategory,
}: CategoryFilterTabsProps) {
  return (
    <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 space-x-2 scrollbar-thin scrollbar-thumb-zinc-300">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => setActiveCategory(cat)}
          className={`px-4 py-2 rounded-none text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 shrink-0 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)] ${
            activeCategory === cat
              ? 'bg-brand text-black border-black font-black'
              : 'bg-white text-zinc-500 hover:text-black border-black hover:bg-zinc-50'
          }`}
        >
          {cat.replace('&', '/')}
        </button>
      ))}
    </div>
  );
}
