'use client';

import { FiMail } from 'react-icons/fi';

export default function ContactSection() {
  return (
    <section className="contact-section">
      <div className="contact-inner">
        <div className="contact-image">
          <FiMail size={120} />
        </div>
        <div className="contact-content">
          <h2 style={{ color: 'var(--primary-color)' }}>¿Te quedó alguna inquietud?</h2>
          <h3>Escribinos que a la brevedad te contestamos.</h3>
          <a href="/contact" className="contact-button">
            <span>Ir a contacto</span>
          </a>
        </div>
      </div>
    </section>
  );
}

