'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDevMode } from "@/app/providers/DevModeProvider";
import Loader from "./Loader";
import AlertPopup from "./AlertPopup";
import { FaCheck, FaTimes, FaMinus } from "react-icons/fa";

interface ProductData {
  product_name?: string;
  image_url?: string;
  nutriments?: Record<string, number>;
  nutriscore_score?: number;
  nutrient_levels?: Record<string, string>;
  nova_group?: string;
}

const mapScoreToRating = (score?: number): number | null => {
  if (typeof score !== "number") return null;
  const min = -15;
  const max = 40;
  const clamped = Math.min(Math.max(score, min), max);
  const scaled = ((max - clamped) / (max - min)) * 9 + 1;
  return Math.round(scaled);
};

const getRatingColorClass = (rating: number): string => {
  if (rating >= 8) return "green";
  if (rating >= 6) return "yellow";
  if (rating >= 4) return "orange";
  return "red";
};

interface NutritionItemProps {
  type: "positive" | "moderate" | "negative";
  icon: string;
  title: string;
  description: string;
  value?: number;
}

const NutritionItem = ({ type, icon, title, description, value }: NutritionItemProps) => (
  <div className={`nutrition-item ${type}`}>
    <img src={icon} alt={title} className="nutrition-icon" />
    <div className="nutrition-description">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <div className={`nutrition-status ${type}`}>
      {type === "positive" ? (
        <FaCheck className="tick-icon" />
      ) : type === "negative" ? (
        <FaTimes className="close-icon" />
      ) : (
        <FaMinus className="minus-icon" />
      )}
      {value != null && <span>{value} g</span>}
    </div>
  </div>
);

export default function ProductPage() {
  const params = useSearchParams();
  const codeParam = params.get("code");
  const queryParam = params.get("query");
  const query = codeParam || queryParam || "";

  const [productData, setProductData] = useState<ProductData | null>(null);
  const [productName, setProductName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const { devMode } = useDevMode();

  useEffect(() => {
    if (!query) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    const start = performance.now();
    const showAlerts = devMode;
    fetch(`${apiBase}/api/product?query=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          setErrorMessage(data.error);
          setProductData(null);
        } else {
          const elapsed = (performance.now() - start).toFixed(2);
          const source = data.source === "cache" ? "la cache" : "OpenFoodFacts";
          if (showAlerts) {
            setAlertMessage(`Producto obtenido de ${source} en ${elapsed} ms`);
          }
          const { source: _SOURCE, elapsedTime: _ELAPSEDTIME, ...product } = data;
          void _SOURCE;
          void _ELAPSEDTIME;
          setProductData(product);
          setProductName(product.product_name || "Producto sin nombre");
          setErrorMessage("");
        }
      })
      .catch(() => {
        setProductData(null);
        setErrorMessage("Error al cargar el producto");
      });
  }, [query, devMode]);

  useEffect(() => {
    if (!devMode) {
      setAlertMessage("");
    }
  }, [devMode]);

  const getLevel = (key: string) => productData?.nutrient_levels?.[key];

  const hasPositives = ["fat", "saturated-fat", "sugars", "salt"].some(
    (key) => getLevel(key) === "low",
  );
  const hasModerates = ["fat", "saturated-fat", "sugars", "salt"].some(
    (key) => getLevel(key) === "moderate",
  );
  const hasNegatives =
    ["sugars", "saturated-fat", "salt"].some((key) => getLevel(key) === "high") ||
    productData?.nova_group === "4";

  const ratingValue = mapScoreToRating(productData?.nutriscore_score);
  const ratingColor =
    ratingValue !== null && ratingValue !== undefined
      ? getRatingColorClass(ratingValue)
      : null;

  return (
    <div className="product-page">
      <h1 className="product-title">{productName}</h1>

      {errorMessage ? (
        <div className="error-message">
          <p>{errorMessage}</p>
        </div>
      ) : productData ? (
        <>
          <div className="product-section">
            <div className="product-inner">
              <div className="product-details-container">
                <div className="product-image-rating">
                  <div className="product-image-wrapper">
                    <img
                      src={productData.image_url || "/img/lays-classic.svg"}
                      alt={productName}
                      className="product-image-new"
                    />
                    {ratingValue != null && (
                      <div className="product-rating">
                        <span className={`rating-circle rating-${ratingColor}`} />
                        <h3>Calidad: {`${ratingValue}/10`}</h3>
                      </div>
                    )}
                  </div>
                </div>

                <div className="product-nutrition-info">
                  <div className="nutrition-info-item">
                    <img
                      src="/img/icon_protein.svg"
                      alt="Proteínas"
                      className="nutrition-icon"
                    />
                    <span>
                      Proteínas: {productData.nutriments?.proteins_100g ?? "No disponible"} g
                    </span>
                  </div>
                  <div className="nutrition-info-item">
                    <img
                      src="/img/icon_scales.svg"
                      alt="Carbohidratos"
                      className="nutrition-icon"
                    />
                    <span>
                      Carbohidratos: {productData.nutriments?.carbohydrates_100g ?? "No disponible"} g
                    </span>
                  </div>
                  <div className="nutrition-info-item">
                    <img src="/img/icon_fat.svg" alt="Grasas" className="nutrition-icon" />
                    <span>
                      Grasas: {productData.nutriments?.fat_100g ?? "No disponible"} g
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="nutrition-evaluation">
            {hasPositives && (
              <>
                <h2>Positivas</h2>
                {getLevel("fat") === "low" && (
                  <NutritionItem
                    type="positive"
                    icon="/img/icon_fat.svg"
                    title="Bajo en Grasas"
                    description="Ideal para una dieta equilibrada en grasas."
                    value={productData.nutriments?.fat_100g}
                  />
                )}
                {getLevel("saturated-fat") === "low" && (
                  <NutritionItem
                    type="positive"
                    icon="/img/icon_fat.svg"
                    title="Bajo en Grasas Saturadas"
                    description="Ayuda a mantener niveles saludables de colesterol."
                    value={productData.nutriments?.["saturated-fat_100g"]}
                  />
                )}
                {getLevel("sugars") === "low" && (
                  <NutritionItem
                    type="positive"
                    icon="/img/icon_sugar.svg"
                    title="Bajo en Azúcares"
                    description="Bueno para controlar el azúcar diario."
                    value={productData.nutriments?.sugars_100g}
                  />
                )}
                {getLevel("salt") === "low" && (
                  <NutritionItem
                    type="positive"
                    icon="/img/icon_salt.svg"
                    title="Bajo en Sodio"
                    description="Ayuda a controlar la presión arterial."
                    value={productData.nutriments?.salt_100g}
                  />
                )}
              </>
            )}

            {hasModerates && (
              <>
                <h2>Moderados</h2>
                {getLevel("fat") === "moderate" && (
                  <NutritionItem
                    type="moderate"
                    icon="/img/icon_fat.svg"
                    title="Grasas Moderadas"
                    description="Consumir con moderación."
                    value={productData.nutriments?.fat_100g}
                  />
                )}
                {getLevel("saturated-fat") === "moderate" && (
                  <NutritionItem
                    type="moderate"
                    icon="/img/icon_fat.svg"
                    title="Grasas Saturadas Moderadas"
                    description="Consumir con moderación."
                    value={productData.nutriments?.["saturated-fat_100g"]}
                  />
                )}
                {getLevel("sugars") === "moderate" && (
                  <NutritionItem
                    type="moderate"
                    icon="/img/icon_sugar.svg"
                    title="Azúcares Moderados"
                    description="Consumir con moderación."
                    value={productData.nutriments?.sugars_100g}
                  />
                )}
                {getLevel("salt") === "moderate" && (
                  <NutritionItem
                    type="moderate"
                    icon="/img/icon_salt.svg"
                    title="Sodio Moderado"
                    description="Consumir con moderación."
                    value={productData.nutriments?.salt_100g}
                  />
                )}
              </>
            )}

            {hasNegatives && (
              <>
                <h2>Negativas</h2>
                {getLevel("sugars") === "high" && (
                  <NutritionItem
                    type="negative"
                    icon="/img/icon_sugar.svg"
                    title="Alto en Azúcares"
                    description="Puede contribuir al aumento de peso y otros problemas de salud."
                    value={productData.nutriments?.sugars_100g}
                  />
                )}
                {getLevel("saturated-fat") === "high" && (
                  <NutritionItem
                    type="negative"
                    icon="/img/icon_fat.svg"
                    title="Alto en Grasas Saturadas"
                    description="El exceso puede elevar el colesterol."
                    value={productData.nutriments?.["saturated-fat_100g"]}
                  />
                )}
                {getLevel("salt") === "high" && (
                  <NutritionItem
                    type="negative"
                    icon="/img/icon_salt.svg"
                    title="Alto en Sodio"
                    description="Puede aumentar la presión arterial."
                    value={productData.nutriments?.salt_100g}
                  />
                )}
                {productData.nova_group === "4" && (
                  <NutritionItem
                    type="negative"
                    icon="/img/icon_carbs.svg"
                    title="Ultraprocesado"
                    description="Contiene alto nivel de procesamiento."
                  />
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <Loader />
      )}

      {alertMessage && (
        <AlertPopup message={alertMessage} onClose={() => setAlertMessage("")} />
      )}
    </div>
  );
}

