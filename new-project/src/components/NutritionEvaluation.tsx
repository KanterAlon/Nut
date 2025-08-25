'use client';

import { FaRegImage, FaHamburger, FaFire, FaDrumstickBite } from 'react-icons/fa';

export default function NutritionEvaluation() {
  return (
    <section className="sec-nutrition-evaluation">
      <div className="nutrition-evaluation-inner">
        <div className="product-info">
          <div className="img-rating">
            <FaRegImage className="product-image" size={80} />
            <div className="rating">
              <div className="circle red"></div>
              <h3>Muy Malo</h3>
            </div>
          </div>
          <div className="nutrition-details">
            <div className="nutrition-detail">
              <FaHamburger />
              <span>Alto en Grasas</span>
            </div>
            <div className="nutrition-detail">
              <FaFire />
              <span>Alto en Calorías</span>
            </div>
            <div className="nutrition-detail">
              <FaDrumstickBite />
              <span>Bajas Proteínas</span>
            </div>
          </div>
        </div>
        <div className="nutritional-info">
          <h2>Conocé cual es la calidad nutricional de tus comidas y bebidas</h2>
          <p>
            ¿Sabés realmente lo que estás comprando? ¡Nosotros sí! Nut escanea y analiza las etiquetas en un abrir y cerrar de ojos para que puedas saber de un vistazo qué productos son buenos para ti y cuáles debes evitar.
          </p>
        </div>
      </div>
    </section>
  );
}

