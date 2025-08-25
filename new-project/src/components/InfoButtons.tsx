'use client';

import {
  FaUtensils,
  FaClipboardCheck,
  FaInfoCircle,
  FaBalanceScale,
} from 'react-icons/fa';

const data = [
  { icon: FaUtensils, text: 'Ingresás que querés comer' },
  { icon: FaClipboardCheck, text: 'Obtenés feedback nutricional rápido' },
  { icon: FaInfoCircle, text: 'Te informás íntegramente con facilidad' },
  { icon: FaBalanceScale, text: 'Te ayudamos a tomar una decisión' },
];

export default function InfoButtons() {
  return (
    <div className="info-buttons">
      {data.map(({ icon: Icon, text }, i) => (
        <div className="info-button" key={i}>
          <Icon size={32} />
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}

