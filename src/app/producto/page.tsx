import { Suspense } from "react";
import ProductPage from "@/components/ProductPage";
import Loader from "@/components/Loader";

export default function ProductoPage() {
  return (
    <Suspense fallback={<Loader />}>
      <ProductPage />
    </Suspense>
  );
}

