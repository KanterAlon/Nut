import { Suspense } from 'react';
import ComparePage from '@/components/ComparePage';
import Loader from '@/components/Loader';

export default function Compare() {
  return (
    <Suspense fallback={<Loader />}>
      <ComparePage />
    </Suspense>
  );
}

