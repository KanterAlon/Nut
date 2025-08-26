/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { FaHome, FaUsers, FaRegNewspaper, FaEnvelopeOpenText } from 'react-icons/fa';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import '../styles/header.css';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const toggleMenu = () => setMenuOpen(prev => !prev);
  const closeMenu = () => setMenuOpen(false);

  const toggleDevMode = () => {
    const value = !devMode;
    setDevMode(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('devMode', String(value));
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDevMode(localStorage.getItem('devMode') === 'true');
    }
  }, []);

  return (
    <header>
      <div className="logo">
        <Link href="/" onClick={closeMenu}>
          <img src="/img/Logo_Nut_Header.svg" alt="Nut Logo" />
        </Link>
      </div>

      <button
        className={`hamburger-btn ${menuOpen ? 'active' : ''}`}
        aria-label="Menú"
        onClick={toggleMenu}
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      <nav className={`nav-links ${menuOpen ? 'active' : ''}`}>
        <Link href="/" onClick={closeMenu}>
          <FaHome size={30} />
          <span>Inicio</span>
        </Link>
        <Link href="/community" onClick={closeMenu}>
          <FaUsers size={30} />
          <span>Comunidad</span>
        </Link>
        <Link href="/blog" onClick={closeMenu}>
          <FaRegNewspaper size={30} />
          <span>Blog</span>
        </Link>
        <Link href="/contact" onClick={closeMenu}>
          <FaEnvelopeOpenText size={30} />
          <span>Contacto</span>
        </Link>
        <SignedOut>
          <Link href="/login" className="login-button" onClick={closeMenu}>
            <span className="button-text">Login</span>
          </Link>
        </SignedOut>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </nav>

      <button
        type="button"
        className="dev-toggle"
        onClick={toggleDevMode}
      >
        {devMode ? 'Modo Dev: ON' : 'Modo Dev: OFF'}
      </button>

      <div className={`overlay ${menuOpen ? 'active' : ''}`} onClick={closeMenu}></div>
    </header>
  );
}

