'use client';

const cards = [
  {
    img: '/img/imgCard1.png',
    title: 'Comparador de alimentos y bebidas',
    desc: 'Compara de manera visual y rápida el valor nutricional...',
    href: '/index',
    btn: 'Pruébalo Ahora',
  },
  {
    img: '/img/imgCard2.png',
    title: 'Interactuá con usuarios de intereses similares',
    desc: 'Conectate con personas que comparten tus metas...',
    href: '/community',
    btn: 'Ir a comunidad',
  },
  {
    img: '/img/imgCard3.png',
    title: 'Aprendé sobre diversos temas de nutrición',
    desc: 'Explorá artículos creados por nuestro equipo...',
    href: '/blog',
    btn: 'Ir al Blog',
  },
];

export default function Functionalities() {
  return (
    <section className="sec-funcionalidades">
      <div className="funcionalidades-inner">
        <h2>Otras cosas que podés disfrutar de la plataforma Nut</h2>
        <div className="cards-container">
          {cards.map(({ img, title, desc, href, btn }, i) => (
            <div className="card-funcionalidad" key={i}>
              <div className="contenedor-imagen-card-funcionalidad">
                <img src={img} alt="" />
              </div>
              <h3 className="titulo-card-funcionalidad">{title}</h3>
              <p className="descripcion-card-funcionalidad">{desc}</p>
              <a className="button-card" href={href}>{btn}</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

