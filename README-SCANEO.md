# Guía de escaneo de múltiples productos

Este documento describe el flujo que sigue la API `/api/camera/upload` para detectar, recortar e identificar varios productos presentes en una misma imagen capturada por la cámara. También detalla los parámetros que intervienen en cada etapa, así como las ventajas, limitaciones y casos de uso recomendados del enfoque actual.

## Resumen del flujo

1. **Recepción de la imagen**: el endpoint recibe un archivo `image` vía `FormData` y lo transforma en un `Buffer` binario para su procesamiento posterior.
2. **Localización de objetos**: se llama a Google Cloud Vision con la característica `OBJECT_LOCALIZATION` para encontrar regiones que puedan contener productos. Se solicitan hasta `100` resultados por imagen.
3. **Normalización de regiones**: cada región se ajusta al ancho y alto reales de la foto y se expande con un *padding* del 10 % para asegurarnos de capturar etiquetas completas.
4. **Recorte por producto**: con `sharp` se extrae un recorte por cada región detectada; si no hay objetos, se analiza la imagen completa.
5. **Análisis detallado de cada recorte**: se vuelve a invocar a Vision con varias características (códigos de barras, logos, texto, etiquetas, web entities y localización de objetos) para recolectar la mayor cantidad de señales posible.
6. **Generación de término de búsqueda**: si hay una clave de OpenAI configurada, se construye un prompt con los datos recolectados y se pide a `gpt-4o-mini` que genere un término breve y útil para buscar en OpenFoodFacts.
7. **Consulta a OpenFoodFacts**: primero se intenta con cualquier código de barras detectado; si falla, se usa el término generado para realizar una búsqueda y se toma el primer resultado relevante.
8. **Respuesta incremental**: el endpoint envía mensajes NDJSON indicando la cantidad de regiones, los resultados parciales por producto y un mensaje final `done`.

## Parámetros y su papel

| Parámetro | Ubicación | Propósito |
|-----------|-----------|-----------|
| `OBJECT_LOCALIZATION` (`maxResults: 100`) | Primera llamada a Vision | Detectar múltiples objetos y obtener sus bounding boxes. |
| *Padding* `0.1` | Normalización de regiones | Amplía cada bounding box 10 % en cada eje para no cortar etiquetas. |
| `extract(region)` | `sharp` | Recortar la porción de imagen a analizar para cada producto. |
| Conjunto de `features` (BARCODE, LOGO, DOCUMENT_TEXT, WEB, LABEL, OBJECT) | Segunda llamada a Vision | Recolectar señales complementarias sobre el producto en el recorte. |
| `model: 'gpt-4o-mini'`, `temperature: 0.2`, `max_tokens: 32` | Llamada a OpenAI | Obtener un término estable y conciso a partir de las señales de Vision. |
| `search_terms`, `search_simple`, `action=process`, `json=1` | Búsqueda en OpenFoodFacts | Configurar la query para recuperar coincidencias en formato JSON. |
| `image_url` / `image_front_url` | Resultado OFF | Imagen del producto cuando está disponible. |
| Mensajes NDJSON (`count`, `product`, `done`) | Respuesta del endpoint | Permitir a la interfaz actualizarse progresivamente mientras se procesan los productos. |

## Identificación simultánea de varios productos

El algoritmo admite múltiples productos porque:

- Vision puede devolver varias cajas delimitadoras en la localización inicial.
- Cada región se procesa de forma independiente: se recorta, se analiza y genera su propio término de búsqueda.
- Los resultados se transmiten en streaming, de modo que el front-end puede mostrar cada producto a medida que llega su información.

Cuando no se detectan objetos, el sistema cae en un modo *fallback* que analiza toda la imagen como si contuviera un único producto, lo que evita perder resultados en fotos complejas.

## Puntos a favor

- **Cobertura amplia**: combinar códigos de barras, logos, OCR y web entities aumenta la probabilidad de identificar productos con etiquetas parciales o poco legibles.
- **Escalabilidad**: pedir hasta 100 objetos permite procesar escenas con muchos productos sin volver a capturar la foto.
- **Respuesta progresiva**: el streaming NDJSON mejora la UX al mostrar resultados conforme están listos.
- **Integración con OpenFoodFacts**: disponer de imagen, enlace y nombre oficial aporta contexto y verificabilidad al usuario final.

## Puntos en contra

- **Dependencia de servicios externos**: requiere Google Vision, OpenAI y OpenFoodFacts; un fallo en cualquiera impacta el flujo completo.
- **Costos y latencia**: cada recorte dispara múltiples llamadas a Vision y, opcionalmente, a OpenAI, lo que aumenta costos y tiempo de respuesta cuando hay muchos productos.
- **Sensibilidad a la calidad de imagen**: fotos borrosas, con reflejos o con envases plegados pueden impedir una detección precisa.
- **Ambigüedad en OpenFoodFacts**: las búsquedas sin código de barras pueden devolver resultados genéricos o incorrectos.

## Cuándo sirve y cuándo no

**Sirve cuando:**

- Se necesita identificar varios productos en un mismo escaneo de forma rápida, por ejemplo, al analizar el carrito de compras o la alacena.
- El entorno permite fotos claras, bien iluminadas y con etiquetas visibles.
- Se cuenta con conectividad estable para consultar servicios externos.

**No sirve o requiere ajustes cuando:**

- El entorno tiene restricciones severas de latencia o costos que impiden usar Vision/OpenAI de manera intensiva.
- Los productos no están en OpenFoodFacts o se trata de envases genéricos sin identificadores claros.
- La captura proviene de cámaras de baja resolución o en movimiento, dificultando la detección y el OCR.

## Recomendaciones

- Limitar el número de objetos procesados cuando no se necesite cubrir hasta 100 productos, para reducir costos.
- Cachear respuestas de OpenFoodFacts cuando sea posible, aprovechando códigos de barras para evitar llamadas repetidas.
- Monitorear métricas de calidad (porcentaje de coincidencias correctas, tiempos de respuesta) para ajustar parámetros como el padding o la temperatura del modelo.

