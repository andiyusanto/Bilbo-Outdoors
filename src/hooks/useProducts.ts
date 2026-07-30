import { useState, useEffect } from 'react';
import { Product } from '../types';
import { useLoading } from '../contexts/LoadingContext';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const { withLoading } = useLoading();

  const fetchProducts = async () => {
    await withLoading(async () => {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        setProducts(data);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setLoadingProducts(false);
      }
    });
  };

  // Load products initially
  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, loadingProducts };
}
