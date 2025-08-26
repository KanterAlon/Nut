/* eslint-disable @next/next/no-img-element */
'use client';

const data = [
  { img: '/img/icon_food.svg', text: 'Ingresás que querés comer' },
  { img: '/img/icon_highlight.svg', text: 'Obtenés feedback nutricional rápido' },
  { img: '/img/icon_healthy-eating.svg', text: 'Te informás íntegramente con facilidad' },
  { img: '/img/icon_order-completed.svg', text: 'Te ayudamos a tomar una decisión' },
];

export default function InfoButtons() {
  return (
    <div className="info-buttons">
      {data.map((item, i) => (
        <div className="info-button" key={i}>
          <img src={item.img} alt={`icon-${i}`} />
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

