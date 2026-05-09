"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="bottom-nav">
            <Link href="/dashboard" className={`nav-item ${pathname === '/dashboard' ? 'active-nav' : ''}`}>
                <span className="nav-icon">📊</span>
                <span className="nav-text">Dashboard</span>
            </Link>
            <Link href="/scanner" className={`nav-item ${pathname === '/scanner' ? 'active-nav-scanner active-nav' : ''}`}>
                <span
                    className="nav-icon"
                    style={{
                        background: "var(--primary)",
                        color: "white",
                        borderRadius: "50%",
                        width: "45px",
                        height: "45px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "-15px",
                        border: "4px solid var(--background)",
                        transform: pathname === '/scanner' ? "translateY(-13px) scale(1.05)" : "translateY(-10px)",
                        transition: "all 0.3s ease",
                        boxShadow: pathname === '/scanner' ? "0 0 20px rgba(255, 204, 0, 0.9), inset 0 0 10px rgba(255, 204, 0, 0.5)" : "none",
                        borderColor: pathname === '/scanner' ? "rgba(255, 204, 0, 0.8)" : "var(--background)"
                    }}>
                    💵
                </span>
                <span className="nav-text" style={{ marginTop: "15px" }}>Spese</span>
            </Link>
            <Link href="/tasse" className={`nav-item ${pathname === '/tasse' ? 'active-nav' : ''}`}>
                <span className="nav-icon">🧮</span>
                <span className="nav-text">Tasse</span>
            </Link>
            <Link href="/cause" className={`nav-item ${pathname === '/cause' ? 'active-nav' : ''}`}>
                <span className="nav-icon">⚖️</span>
                <span className="nav-text">Cause</span>
            </Link>
            <Link href="/impostazioni" className={`nav-item ${pathname === '/impostazioni' ? 'active-nav' : ''}`}>
                <span className="nav-icon">⚙️</span>
                <span className="nav-text">Impo.</span>
            </Link>
        </nav>
    );
}
