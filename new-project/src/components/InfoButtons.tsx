'use client';

const data = [
  { img: 'https://via.placeholder.com/40', text: 'Ingresás que querés comer' },
  { img: 'https://via.placeholder.com/40', text: 'Obtenés feedback nutricional rápido' },
  { img: 'https://via.placeholder.com/40', text: 'Te informás íntegramente con facilidad' },
  { img: 'https://via.placeholder.com/40', text: 'Te ayudamos a tomar una decisión' },
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

